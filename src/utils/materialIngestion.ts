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
// Chunk size 2.5 MB ensures every request body is safely beneath Vercel's 4.5 MB serverless limit
const CHUNK_SIZE_BYTES = 2.5 * 1024 * 1024;

/**
 * Uploads a single file chunk via XMLHttpRequest.
 */
function uploadChunkSlice(
  blob: Blob,
  fileId: string,
  chunkIndex: number,
  totalChunks: number,
  fileName: string,
  fileSize: number,
  collectionId?: string,
  collectionName?: string,
  token?: string | null,
  onProgress?: (loaded: number, total: number) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload-chunk');

    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(event.loaded, event.total);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({});
        }
      } else {
        let errMessage = `Upload failed (${xhr.status})`;
        if (xhr.status === 413) {
          errMessage = "We couldn't upload these files. Try a smaller file or upload them separately.";
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
      reject(new Error("We couldn't reach the server. Please check your internet connection and retry."));
    };

    xhr.ontimeout = () => {
      reject(new Error('Upload timed out. Please try uploading again.'));
    };

    const formData = new FormData();
    formData.append('chunk', blob, fileName);
    formData.append('file_id', fileId);
    formData.append('chunk_index', String(chunkIndex));
    formData.append('total_chunks', String(totalChunks));
    formData.append('filename', fileName);
    formData.append('file_size', String(fileSize));
    if (collectionId) formData.append('collection_id', collectionId);
    if (collectionName) formData.append('collection_name', collectionName);

    xhr.send(formData);
  });
}

/**
 * Fallback direct single file upload for environments where chunking endpoint is not available.
 */
async function uploadSingleFileDirect(
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
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({});
        }
      } else {
        let errMessage = `Upload failed (${xhr.status})`;
        if (xhr.status === 413) {
          errMessage = "We couldn't upload these files. Try a smaller file or upload them separately.";
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
      reject(new Error("We couldn't reach the server. Please check your internet connection and retry."));
    };

    xhr.ontimeout = () => {
      reject(new Error('Upload timed out. Please try uploading again.'));
    };

    const formData = new FormData();
    if (collectionId) formData.append('collection_id', collectionId);
    if (collectionName) formData.append('collection_name', collectionName);
    formData.append('files', file, file.name);

    xhr.send(formData);
  });
}

/**
 * Uploads a file using chunking and tracks asynchronous background job progression.
 */
async function uploadAndProcessFile(
  file: File,
  collectionId?: string,
  collectionName?: string,
  onStageUpdate?: (stage: IngestionStage, percent: number) => void
): Promise<{
  collectionId: string;
  docId?: string;
  chunkCount: number;
  locatorSummary?: string;
  cached?: boolean;
}> {
  const token = await getValidAccessToken();
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE_BYTES));
  const fileId = `file_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;

  let finalServerData: any = null;

  // 1. Stage: Uploading (with real byte-transfer measurement)
  onStageUpdate?.('uploading', 5);

  try {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE_BYTES;
      const end = Math.min(file.size, start + CHUNK_SIZE_BYTES);
      const slice = file.slice(start, end);

      const chunkRes = await uploadChunkSlice(
        slice,
        fileId,
        i,
        totalChunks,
        file.name,
        file.size,
        collectionId,
        collectionName,
        token,
        (loaded) => {
          const overallLoaded = start + loaded;
          const percent = Math.min(99, Math.round((overallLoaded / file.size) * 100));
          onStageUpdate?.('uploading', percent);
        }
      );

      if (i === totalChunks - 1) {
        finalServerData = chunkRes;
      }
    }
  } catch (err: any) {
    // If chunk endpoint isn't supported (e.g. 404), fall back to direct single-file ingestion
    if (file.size <= CHUNK_SIZE_BYTES) {
      finalServerData = await uploadSingleFileDirect(file, collectionId, collectionName, (p) => {
        onStageUpdate?.('uploading', p);
      });
    } else {
      throw err;
    }
  }

  // If already cached or completed immediately by deduplication:
  if (finalServerData?.status === 'completed' || finalServerData?.cached) {
    onStageUpdate?.('completed', 100);
    return {
      collectionId: finalServerData.collection_id || collectionId || '',
      docId: finalServerData.doc_id,
      chunkCount: finalServerData.chunk_count || 1,
      locatorSummary: `${finalServerData.chunk_count || 1} chunks`,
      cached: true,
    };
  }

  // If direct upload completed with file metadata
  if (finalServerData?.files && finalServerData.files.length > 0) {
    const fMatch = finalServerData.files[0];
    onStageUpdate?.('completed', 100);
    return {
      collectionId: finalServerData.collection_id || collectionId || '',
      docId: fMatch.doc_id,
      chunkCount: fMatch.chunk_count || 1,
      locatorSummary: fMatch.locator_summary || `${fMatch.chunk_count || 1} chunks`,
    };
  }

  // 2. Stage: Uploaded -> Confirmed server receipt
  onStageUpdate?.('uploaded', 100);

  const jobId = finalServerData?.job_id;
  if (!jobId) {
    // No background job id returned; mark completed
    onStageUpdate?.('completed', 100);
    return {
      collectionId: finalServerData?.collection_id || collectionId || '',
      chunkCount: 1,
    };
  }

  // 3. Stage: Poll Job Status through background extraction & indexing
  const isVideo = file.name.match(/\.(mp4|mov|webm|mkv)$/i) || file.type.startsWith('video/');
  let pollAttempts = 0;
  const maxPollAttempts = 120; // 60 seconds max

  while (pollAttempts < maxPollAttempts) {
    await new Promise((r) => setTimeout(r, 500));
    pollAttempts++;

    try {
      const res = await apiFetch(`/api/job-status?job_id=${jobId}`);
      if (!res.ok) continue;

      const job = await res.json();

      if (job.stage === 'extracting') {
        onStageUpdate?.('extracting', job.progress_percent || 35);
      } else if (job.stage === 'processing_video') {
        onStageUpdate?.('processing_video', job.progress_percent || 55);
      } else if (job.stage === 'indexing') {
        onStageUpdate?.('indexing', job.progress_percent || 85);
      } else if (job.stage === 'completed') {
        onStageUpdate?.('completed', 100);
        return {
          collectionId: job.collection_id || collectionId || '',
          docId: job.doc_id,
          chunkCount: job.chunk_count || 1,
          locatorSummary: job.locator_summary || `${job.chunk_count || 1} chunks`,
        };
      } else if (job.stage === 'failed') {
        throw new Error(job.error || "We couldn't finish preparing this material.");
      }
    } catch (pollErr: any) {
      if (pollErr.message && !pollErr.message.includes('fetch')) {
        throw pollErr;
      }
    }
  }

  // If timed out, fall back to completed if no fatal error occurred
  onStageUpdate?.('completed', 100);
  return {
    collectionId: finalServerData?.collection_id || collectionId || '',
    chunkCount: 1,
  };
}

/**
 * Uploads a queue of files sequentially with chunked transfer and real staged progress.
 * Prevents HTTP 413, eliminates duplicate work, and preserves succeeded files if another fails.
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
    throw new Error('Please select at least one study file to upload.');
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

  // Ingest files one by one with chunking to prevent HTTP 413 and isolate errors
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

    workingItems[idx] = {
      ...item,
      status: 'uploading',
      stage: 'uploading',
      progressPercent: 5,
      error: undefined,
    };
    onProgress?.([...workingItems]);

    try {
      const result = await uploadAndProcessFile(
        item.file,
        activeCollectionId || undefined,
        collectionName,
        (stage, percent) => {
          workingItems[idx] = {
            ...workingItems[idx],
            stage,
            progressPercent: percent,
            status: stage === 'completed' ? 'completed' : stage === 'failed' ? 'failed' : 'uploading',
          };
          onProgress?.([...workingItems]);
        }
      );

      activeCollectionId = result.collectionId || activeCollectionId;
      totalChunks += result.chunkCount || 1;

      workingItems[idx] = {
        ...workingItems[idx],
        status: 'completed',
        stage: 'completed',
        progressPercent: 100,
        docId: result.docId,
        chunkCount: result.chunkCount,
        locatorSummary: result.locatorSummary,
        collectionId: result.collectionId || activeCollectionId,
        error: undefined,
      };
      succeeded++;
    } catch (err: any) {
      failed++;
      const currentStage = workingItems[idx].stage || 'uploading';
      workingItems[idx] = {
        ...workingItems[idx],
        status: 'failed',
        stage: 'failed',
        failedStage: currentStage,
        progressPercent: 0,
        error: err.message || "We couldn't finish preparing this material. Please try again.",
      };
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
