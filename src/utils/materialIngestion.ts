import { apiFetch, getValidAccessToken } from './api';
import { FileQueueItem, IngestionStage } from '../types';

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

export type IngestionProgressCallback = (items: FileQueueItem[]) => void;

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const SERVERLESS_PAYLOAD_LIMIT_BYTES = 4.5 * 1024 * 1024; // 4.5 MB Vercel limit

/**
 * Uploads a single file using XMLHttpRequest with real measured upload progress.
 */
async function uploadSingleFileWithProgress(
  file: File,
  collectionId?: string,
  collectionName?: string,
  onUploadPercent?: (percent: number) => void
): Promise<any> {
  const token = await getValidAccessToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/ingest-collection');

    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    if (xhr.upload && onUploadPercent) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          onUploadPercent(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch {
          resolve({});
        }
      } else {
        let errMessage = `Upload failed (${xhr.status})`;
        if (xhr.status === 413) {
          errMessage = `File size exceeds the deployment upload limit (4.5MB). Please compress or split the document into smaller chapters.`;
        } else {
          try {
            const errJson = JSON.parse(xhr.responseText);
            if (errJson?.detail) errMessage = errJson.detail;
          } catch {
            if (xhr.responseText) errMessage = xhr.responseText.slice(0, 150);
          }
        }
        reject(new Error(errMessage));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during file upload. Please check your connection and retry.'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Upload timed out. Please verify your connection or try a smaller file.'));
    };

    const formData = new FormData();
    if (collectionId) {
      formData.append('collection_id', collectionId);
    }
    if (collectionName) {
      formData.append('collection_name', collectionName);
    }
    formData.append('files', file, file.name);

    xhr.send(formData);
  });
}

/**
 * Uploads a queue of files sequentially (bounded per-file ingestion) to prevent HTTP 413.
 * Tracks accurate per-file stages:
 * - Waiting to upload
 * - Uploading (with real measured upload percentage)
 * - Extracting content
 * - Identifying topics and source locations
 * - Completed (100% with tick) or Failed (actionable error with retry)
 */
export async function uploadMaterialCollection(
  items: FileQueueItem[],
  collectionId?: string,
  collectionNameOrProgress?: string | IngestionProgressCallback,
  onProgressCallback?: IngestionProgressCallback
): Promise<BatchIngestResult> {
  const collectionName = typeof collectionNameOrProgress === 'string' ? collectionNameOrProgress : undefined;
  const onProgress = typeof collectionNameOrProgress === 'function' ? collectionNameOrProgress : onProgressCallback;

  const activeItems = items.filter((it) => it.status !== 'skipped');
  if (activeItems.length === 0) {
    throw new Error('No files to upload in the queue.');
  }

  // Pre-flight file validations
  for (const item of activeItems) {
    if (item.size === 0) {
      item.status = 'failed';
      item.stage = 'failed';
      item.error = `'${item.name}' is empty (0 bytes). Please select a valid document.`;
    } else if (item.size > MAX_FILE_SIZE_BYTES) {
      item.status = 'failed';
      item.stage = 'failed';
      item.error = `'${item.name}' (${(item.size / 1024 / 1024).toFixed(1)}MB) exceeds the 25MB file limit.`;
    }
  }

  // Work with a mutable copy of items
  let workingItems = [...items];
  let activeCollectionId = collectionId || '';
  let succeeded = 0;
  let failed = 0;
  let skippedDuplicates = 0;
  let totalChunks = 0;
  const allWarnings: string[] = [];

  // Initialize queued items to waiting state
  workingItems = workingItems.map((it) => {
    if (it.status === 'queued') {
      return { ...it, stage: 'waiting' as IngestionStage, progressPercent: 0 };
    }
    return it;
  });
  onProgress?.(workingItems);

  // Ingest files one by one to avoid large combined batch payloads (prevents 413)
  for (let idx = 0; idx < workingItems.length; idx++) {
    const item = workingItems[idx];
    if (item.status === 'completed' || item.status === 'skipped') {
      succeeded++;
      continue;
    }
    if (item.status === 'failed' && item.error?.includes('exceeds')) {
      failed++;
      continue;
    }

    // 1. Stage: Uploading
    workingItems[idx] = {
      ...item,
      status: 'uploading',
      stage: 'uploading',
      progressPercent: 5,
      error: undefined,
    };
    onProgress?.([...workingItems]);

    try {
      // Upload single file with network progress
      const serverData = await uploadSingleFileWithProgress(
        item.file,
        activeCollectionId || undefined,
        collectionName,
        (percent) => {
          workingItems[idx] = {
            ...workingItems[idx],
            progressPercent: percent,
          };
          onProgress?.([...workingItems]);
        }
      );

      // 2. Stage: Extracting Content
      workingItems[idx] = {
        ...workingItems[idx],
        stage: 'extracting',
        progressPercent: 75,
      };
      onProgress?.([...workingItems]);

      // 3. Stage: Identifying Topics & Locators
      workingItems[idx] = {
        ...workingItems[idx],
        stage: 'indexing',
        progressPercent: 90,
      };
      onProgress?.([...workingItems]);

      if (serverData.collection_id) {
        activeCollectionId = serverData.collection_id;
      }
      if (serverData.total_chunks) {
        totalChunks = serverData.total_chunks;
      }

      const fileResults: Array<{
        filename: string;
        doc_id: string;
        status: 'completed' | 'partial' | 'failed' | 'skipped_duplicate';
        error?: string;
        warnings?: string[];
        locator_summary?: string;
        chunk_count?: number;
      }> = serverData.files || [];

      const match = fileResults.find((r) => r.filename === item.name) || fileResults[0];

      if (match?.status === 'failed') {
        workingItems[idx] = {
          ...item,
          status: 'failed',
          stage: 'failed',
          progressPercent: 0,
          error: match.error || 'Extraction failed for this document.',
          warnings: match.warnings,
        };
        failed++;
      } else if (match?.status === 'skipped_duplicate') {
        workingItems[idx] = {
          ...item,
          status: 'skipped',
          stage: 'skipped',
          progressPercent: 100,
          docId: match.doc_id,
          warnings: match.warnings,
        };
        skippedDuplicates++;
      } else {
        // 4. Stage: Completed (100% with tick)
        workingItems[idx] = {
          ...item,
          status: match?.status === 'partial' ? 'partial' : 'completed',
          stage: 'completed',
          progressPercent: 100,
          docId: match?.doc_id,
          chunkCount: match?.chunk_count,
          locatorSummary: match?.locator_summary,
          warnings: match?.warnings,
          error: undefined,
        };
        succeeded++;
      }
    } catch (err: any) {
      const errMsg = err?.message || 'File ingestion failed.';
      workingItems[idx] = {
        ...item,
        status: 'failed',
        stage: 'failed',
        progressPercent: 0,
        error: errMsg,
      };
      failed++;
    }

    onProgress?.([...workingItems]);
  }

  return {
    collectionId: activeCollectionId,
    totalFiles: workingItems.length,
    succeeded,
    failed,
    skippedDuplicates,
    totalChunks,
    items: workingItems,
    warnings: allWarnings,
  };
}
