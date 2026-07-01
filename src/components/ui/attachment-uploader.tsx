'use client';

/**
 * Reusable file/attachment uploader — the shared "Upload + list" block used by
 * the work-order, purchase-order and defect forms (and any future form that
 * attaches documents). Controlled: the parent owns the `files` array.
 *
 * Encapsulates the hidden file input, the Upload button (with loading state),
 * the POST to /api/upload/documents, and the polished file-row list + remove.
 */
import { useRef, useState } from 'react';
import axios from 'axios';
import { Upload, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface UploadedFile {
  url: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
}

interface AttachmentUploaderProps {
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  /** Accepted file extensions/types for the file input. */
  accept?: string;
  multiple?: boolean;
  /** Small helper line (e.g. supported formats) shown next to the Upload button. */
  hint?: string;
  /** Empty-state text when no files are attached. */
  emptyText?: string;
  /** Surface an upload failure to the parent (e.g. its error banner). */
  onError?: (message: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentUploader({
  files,
  onChange,
  accept,
  multiple = true,
  hint,
  emptyText = 'No files uploaded.',
  onError,
}: AttachmentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;

    setUploading(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (let i = 0; i < list.length; i++) {
        const formData = new FormData();
        formData.append('file', list[i]);
        const res = await axios.post('/api/upload/documents', formData, {
          withCredentials: true,
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (res.data?.data) {
          uploaded.push({
            url: res.data.data.url,
            filename: res.data.data.filename,
            originalName: res.data.data.originalName,
            contentType: res.data.data.contentType,
            size: res.data.data.size,
          });
        }
      }
      if (uploaded.length > 0) onChange([...files, ...uploaded]);
    } catch {
      onError?.('Failed to upload file');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (idx: number) => onChange(files.filter((_, i) => i !== idx));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : <span />}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="shrink-0"
        >
          <Upload className="h-3.5 w-3.5 mr-1" />
          {uploading ? 'Uploading...' : 'Upload'}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={handleUpload}
      />

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {files.map((f, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 rounded-lg border border-border bg-card shadow-sm px-3 py-2.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <FileText className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{f.originalName}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(f.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(idx)}
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
