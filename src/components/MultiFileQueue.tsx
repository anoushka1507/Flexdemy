import React, { useRef, useState } from 'react';
import { FileQueueItem, QueueItemStatus } from '../types';

interface MultiFileQueueProps {
  items: FileQueueItem[];
  onItemsChange: (items: FileQueueItem[]) => void;
  onRetryItem?: (item: FileQueueItem) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const SUPPORTED_EXTENSIONS = ['.pdf', '.pptx', '.txt', '.md', '.mp4', '.mov', '.webm', '.mkv'];

export const getFileFormat = (filename: string): 'pdf' | 'pptx' | 'text' | 'video' | 'unsupported' => {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.pptx')) return 'pptx';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text';
  if (['.mp4', '.mov', '.webm', '.mkv'].some((ext) => lower.endsWith(ext))) return 'video';
  return 'unsupported';
};

export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const MultiFileQueue: React.FC<MultiFileQueueProps> = ({
  items,
  onItemsChange,
  onRetryItem,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [validationAlert, setValidationAlert] = useState<string | null>(null);

  const processFileList = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newItems: FileQueueItem[] = [];
    const errors: string[] = [];

    Array.from(fileList).forEach((file) => {
      const format = getFileFormat(file.name);

      // 1. Format check
      if (format === 'unsupported') {
        errors.push(`'${file.name}': Unsupported format. Flexdemy supports PDF, PPTX, TXT, MD, and MP4/MOV/WEBM/MKV video.`);
        return;
      }

      // 2. Size check
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`'${file.name}' (${formatBytes(file.size)}) exceeds the 25MB file size limit.`);
        return;
      }

      // 3. Duplicate check in current queue
      const isDuplicate = items.some(
        (existing) => existing.name === file.name && existing.size === file.size
      );
      if (isDuplicate) {
        errors.push(`'${file.name}' is already in the upload queue.`);
        return;
      }

      newItems.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        name: file.name,
        size: file.size,
        format,
        status: 'queued',
      });
    });

    if (errors.length > 0) {
      setValidationAlert(errors.join(' '));
      setTimeout(() => setValidationAlert(null), 7000);
    } else {
      setValidationAlert(null);
    }

    if (newItems.length > 0) {
      onItemsChange([...items, ...newItems]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFileList(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    processFileList(e.dataTransfer.files);
  };

  const handleRemove = (id: string) => {
    onItemsChange(items.filter((item) => item.id !== id));
  };

  const handleClearAll = () => {
    onItemsChange([]);
    setValidationAlert(null);
  };

  const getFormatBadgeStyle = (format: FileQueueItem['format']) => {
    switch (format) {
      case 'pdf':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30';
      case 'pptx':
        return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30';
      case 'text':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
      case 'video':
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30';
      default:
        return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30';
    }
  };

  const getStatusBadge = (item: FileQueueItem) => {
    // 1. Explicit Stages
    if (item.stage === 'waiting') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-700">
          <span className="material-symbols-outlined text-xs">schedule</span>
          Waiting to upload
        </span>
      );
    }

    if (item.stage === 'uploading') {
      const pct = item.progressPercent ?? 0;
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
          <svg className="animate-spin h-3 w-3 text-amber-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Uploading {pct}%
        </span>
      );
    }

    if (item.stage === 'extracting') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
          <svg className="animate-spin h-3 w-3 text-indigo-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Extracting content...
        </span>
      );
    }

    if (item.stage === 'indexing') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30">
          <span className="material-symbols-outlined text-xs animate-pulse">hub</span>
          Identifying topics & locators...
        </span>
      );
    }

    if (item.stage === 'preparing_questions') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30">
          <span className="material-symbols-outlined text-xs animate-spin">auto_awesome</span>
          Preparing questions...
        </span>
      );
    }

    // 2. Fallbacks based on item.status
    switch (item.status) {
      case 'uploading':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            <svg className="animate-spin h-3 w-3 text-amber-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Uploading...
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
            <span>Completed 100%</span>
            {item.chunkCount ? <span className="opacity-75 font-normal">({item.chunkCount} chunks)</span> : null}
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border border-yellow-500/30">
            <svg className="w-3 h-3 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Partial
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30">
            <svg className="w-3.5 h-3.5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Failed
          </span>
        );
      case 'skipped':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30">
            <span className="text-purple-600">✓</span> Cached (100%)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-700">
            <span className="material-symbols-outlined text-xs">hourglass_empty</span>
            Waiting to upload
          </span>
        );
    }
  };

  const totalBytes = items.reduce((acc, it) => acc + it.size, 0);

  return (
    <div className="space-y-3 w-full">
      {/* Hidden Multi-file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={SUPPORTED_EXTENSIONS.join(',')}
        onChange={handleInputChange}
        disabled={disabled}
        className="hidden"
        id="multi-file-upload-input"
      />

      {/* Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
          dragOver
            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 scale-[0.99]'
            : 'border-gray-300 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 bg-gray-50/50 dark:bg-gray-800/40'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              <span className="text-indigo-600 dark:text-indigo-400 underline decoration-indigo-300 hover:decoration-indigo-500">
                Click to browse
              </span>{' '}
              or drag and drop multiple study files
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Supports PDF textbooks, PPTX slides, Markdown/Text notes, and MP4/MOV videos (up to 25MB each)
            </p>
          </div>
        </div>
      </div>

      {/* Validation warning */}
      {validationAlert && (
        <div className="p-3 text-xs rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/50 flex items-start gap-2 animate-fadeIn">
          <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1 font-medium">{validationAlert}</div>
          <button
            type="button"
            onClick={() => setValidationAlert(null)}
            className="text-amber-700 dark:text-amber-300 hover:text-amber-900 text-sm font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Queue items list */}
      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs px-1 text-gray-600 dark:text-gray-400 font-medium">
            <span>
              {items.length} {items.length === 1 ? 'file' : 'files'} selected ({formatBytes(totalBytes)} total)
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
              >
                + Add more
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={disabled}
                className="text-rose-600 dark:text-rose-400 hover:underline"
              >
                Clear all
              </button>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {items.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                  item.status === 'failed'
                    ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20'
                    : item.status === 'completed'
                    ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/10'
                    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/80'
                }`}
              >
                {/* File info */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border shrink-0 ${getFormatBadgeStyle(
                      item.format
                    )}`}
                  >
                    {item.format}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={item.name}>
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatBytes(item.size)}</span>
                      {item.locatorSummary && (
                        <>
                          <span>•</span>
                          <span className="text-gray-600 dark:text-gray-300">{item.locatorSummary}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                  {getStatusBadge(item)}

                  {/* Retry button for failed item */}
                  {item.status === 'failed' && onRetryItem && (
                    <button
                      type="button"
                      onClick={() => onRetryItem(item)}
                      disabled={disabled}
                      className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 hover:bg-rose-200"
                    >
                      Retry
                    </button>
                  )}

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    disabled={disabled}
                    className="p-1 rounded-md text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Remove file"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Error details */}
                {item.error && (
                  <div className="w-full text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-1 rounded border border-rose-200 dark:border-rose-900/40">
                    {item.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
