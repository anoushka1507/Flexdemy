import { apiFetch } from './api';
import { FileQueueItem } from '../types';

export interface BatchIngestResult {
  collectionId: string;
  totalFiles: number;
  succeeded: number;
  failed: number;
  skippedDuplicates: number;
  totalChunks: number;
  items: FileQueueItem[];
  warnings: string[];
}

/**
 * Uploads a queue of files to the unified batch ingestion endpoint /api/ingest-collection.
 * Updates each item in place with server-verified status, chunk counts, locator summaries, or errors.
 */
export async function uploadMaterialCollection(
  items: FileQueueItem[],
  collectionId?: string,
  collectionName?: string
): Promise<BatchIngestResult> {
  const activeItems = items.filter((it) => it.status !== 'skipped');
  if (activeItems.length === 0) {
    throw new Error('No files to upload in the queue.');
  }

  const formData = new FormData();
  if (collectionId) {
    formData.append('collection_id', collectionId);
  }
  if (collectionName) {
    formData.append('collection_name', collectionName);
  }

  activeItems.forEach((item) => {
    formData.append('files', item.file, item.name);
  });

  const response = await apiFetch('/api/ingest-collection', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = `Batch ingestion failed (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson?.detail) errorDetail = errJson.detail;
    } catch (_) {}
    throw new Error(errorDetail);
  }

  const data = await response.json();
  const fileResults: Array<{
    filename: string;
    doc_id: string;
    status: 'completed' | 'partial' | 'failed' | 'skipped_duplicate';
    error?: string;
    warnings?: string[];
    locator_summary?: string;
    chunk_count?: number;
    cached?: boolean;
  }> = data.files || [];

  // Map server per-file results back to local queue items
  const updatedItems = items.map((item) => {
    const result = fileResults.find((r) => r.filename === item.name);
    if (!result) return item;

    if (result.status === 'failed') {
      return {
        ...item,
        status: 'failed' as const,
        error: result.error || 'Extraction failed.',
        warnings: result.warnings,
      };
    }

    if (result.status === 'skipped_duplicate') {
      return {
        ...item,
        status: 'skipped' as const,
        docId: result.doc_id,
        warnings: result.warnings,
      };
    }

    return {
      ...item,
      status: result.status === 'partial' ? ('partial' as const) : ('completed' as const),
      docId: result.doc_id,
      chunkCount: result.chunk_count,
      locatorSummary: result.locator_summary,
      warnings: result.warnings,
      error: undefined,
    };
  });

  return {
    collectionId: data.collection_id,
    totalFiles: data.total_files,
    succeeded: data.succeeded,
    failed: data.failed,
    skippedDuplicates: data.skipped_duplicates,
    totalChunks: data.total_chunks,
    items: updatedItems,
    warnings: data.warnings || [],
  };
}
