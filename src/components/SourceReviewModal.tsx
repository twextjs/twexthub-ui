import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { PendingVersion } from '../types/api';
import { CodeEditor } from './CodeEditor';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface SourceReviewModalProps {
  item: PendingVersion;
  onClose: () => void;
  onApprove: (item: PendingVersion) => void;
  onReject: (item: PendingVersion) => void;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export const SourceReviewModal: React.FC<SourceReviewModalProps> = ({
  item,
  onClose,
  onApprove,
  onReject,
}) => {
  const [codeText, setCodeText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeUnavailable, setCodeUnavailable] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const ns = item.ownerNamespace || item.namespace;

  const loadCode = useCallback(async () => {
    setIsLoading(true);
    setCodeError(null);
    setCodeUnavailable(false);
    try {
      const code = await api.downloadVersion(ns, item.id, item.version);
      setCodeText(code);
    } catch (err: unknown) {
      setCodeError(errorMessage(err, 'Failed to load extension.js.'));
      setCodeUnavailable(err instanceof ApiError && err.status === 404);
    } finally {
      setIsLoading(false);
    }
  }, [ns, item.id, item.version]);

  useEffect(() => {
    void loadCode();
  }, [loadCode]);

  const lineCount = codeText ? codeText.split('\n').length : 0;
  const sizeKb = codeText ? (new Blob([codeText]).size / 1024).toFixed(1) : '0.0';

  const handleCopy = async () => {
    // With the API unavailable, optional chaining would resolve without
    // throwing and falsely show success, so verify it explicitly first.
    if (!navigator.clipboard?.writeText) {
      setCopied(false);
      setCopyError('Clipboard is not available. Select the source and copy manually.');
      return;
    }
    try {
      await navigator.clipboard.writeText(codeText);
      setCopyError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard failures must not masquerade as source-load errors:
      // codeError gates approval, and the loaded source stays reviewable.
      setCopied(false);
      setCopyError('Could not access the clipboard. Select the source and copy manually.');
    }
  };

  return (
    <Modal variant="fullscreen" labelledById="source-review-title" onClose={onClose}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              id="source-review-title"
              className="text-base font-display font-semibold text-ink truncate"
            >
              {item.name || item.id}
            </h2>
            <span className="font-mono text-xs text-ink-3">
              @{ns}/{item.id}
            </span>
            <span className="chip bg-lilac-50 dark:bg-lilac-900 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800 font-mono text-meta">
              v{item.version}
            </span>
          </div>
          <p className="text-meta text-ink-3">
            Source review — inspect the compiled JavaScript before approving.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-ink-3 hover:text-ink transition-colors shrink-0"
          aria-label="Close source review"
        >
          <Icon name="close" className="icon-lg" />
        </button>
      </div>

      {/* Metadata strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 bg-wash dark:bg-raised border-b border-line text-meta">
        {item.description && (
          <span className="text-ink-2 line-clamp-1 max-w-xl">{item.description}</span>
        )}
        <div className="flex items-center gap-3 ml-auto text-ink-3 shrink-0">
          {item.license && (
            <span className="px-1.5 py-0.5 uppercase font-mono bg-wash dark:bg-raised border border-line rounded">
              {item.license}
            </span>
          )}
          <span>
            by <strong className="text-ink-2">@{ns}</strong>
          </span>
          {item.createdAt && <span>• {new Date(item.createdAt).toLocaleString()}</span>}
        </div>
      </div>

      {/* Editor body */}
      <div className="flex-1 min-h-0 overflow-hidden px-5 py-4 flex flex-col">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-6 w-40 bg-wash dark:bg-raised rounded animate-pulse" />
            <div className="h-72 bg-wash dark:bg-raised border border-line rounded-lg animate-pulse" />
          </div>
        ) : codeError ? (
          <div className="space-y-3">
            {codeUnavailable ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <Icon name="gpp_maybe" className="text-amber-600 shrink-0" />
                <div>
                  <strong>extension.js is not available.</strong> The compiled output for this
                  version could not be loaded from the registry.
                </div>
              </div>
            ) : (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                <Icon name="gpp_maybe" className="text-rose-600 shrink-0" />
                <div>
                  <strong>Unable to load extension.js:</strong> {codeError}
                </div>
              </div>
            )}
            <div className="p-6 rounded-lg border border-dashed border-line text-center text-xs text-ink-3 font-mono">
              extension.js unavailable
            </div>
          </div>
        ) : (
          <CodeEditor
            label="extension.js source (read-only)"
            language="javascript"
            value={codeText}
            onChange={() => {}}
            readOnly
          />
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-5 py-2 border-t border-line bg-wash dark:bg-raised text-meta text-ink-3 font-mono">
        <div className="min-w-0">
          <span>
            extension.js • {lineCount} lines • {sizeKb} KB
          </span>
          {copyError && (
            <span role="alert" className="ml-3 text-rose-600 dark:text-rose-400 font-sans">
              {copyError}
            </span>
          )}
        </div>
        <button
          onClick={() => {
            void handleCopy();
          }}
          disabled={isLoading}
          className="text-lilac-700 dark:text-lilac-300 hover:underline flex items-center gap-1 font-medium disabled:opacity-50"
        >
          {copied ? (
            <>
              <Icon name="check" className="icon-xs text-emerald-600" />
              <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Icon name="content_copy" className="icon-xs" />
              <span>Copy source</span>
            </>
          )}
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line">
        <button onClick={onClose} className="btn btn-ghost btn-sm">
          Close
        </button>
        <button
          onClick={() => onReject(item)}
          className="btn btn-sm text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/40 border border-rose-200 dark:border-rose-800/60"
        >
          Reject Submission
        </button>
        <button
          onClick={() => onApprove(item)}
          disabled={isLoading || codeError !== null}
          className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Approve & Publish
        </button>
      </div>
    </Modal>
  );
};
