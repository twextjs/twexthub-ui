import React, { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../services/api';
import { ExtensionVersion, VersionInfo } from '../types/api';
import { computeLineDiff } from '../lib/diff';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface VersionCompareModalProps {
  namespace: string;
  id: string;
  versions: ExtensionVersion[];
  onClose: () => void;
}

interface CompareSide {
  version: string;
  info: VersionInfo | null;
  code: string;
}

export const VersionCompareModal: React.FC<VersionCompareModalProps> = ({
  namespace,
  id,
  versions,
  onClose,
}) => {
  const sorted = useMemo(
    () =>
      [...versions].sort((a, b) =>
        b.version.localeCompare(a.version, undefined, { numeric: true }),
      ),
    [versions],
  );
  const [leftVersion, setLeftVersion] = useState(sorted[1]?.version || sorted[0]?.version || '');
  const [rightVersion, setRightVersion] = useState(sorted[0]?.version || '');
  const [left, setLeft] = useState<CompareSide | null>(null);
  const [right, setRight] = useState<CompareSide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (!leftVersion || !rightVersion) return;
      setLoading(true);
      setError(null);
      try {
        const [leftInfo, rightInfo, leftCode, rightCode] = await Promise.all([
          api.getVersion(namespace, id, leftVersion),
          api.getVersion(namespace, id, rightVersion),
          api.downloadVersion(namespace, id, leftVersion),
          api.downloadVersion(namespace, id, rightVersion),
        ]);
        if (!isMounted) return;
        setLeft({ version: leftVersion, info: leftInfo, code: leftCode });
        setRight({ version: rightVersion, info: rightInfo, code: rightCode });
      } catch (err: unknown) {
        if (isMounted) {
          setError(
            err instanceof ApiError ? err.message : 'Failed to load versions for comparison',
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [namespace, id, leftVersion, rightVersion]);

  const diff = useMemo(() => {
    if (!left || !right) return null;
    return computeLineDiff(left.code, right.code);
  }, [left, right]);

  const selectClass = 'input w-full px-2 py-1.5 text-xs font-mono';

  return (
    <Modal
      onClose={onClose}
      size="3xl"
      labelledById="version-compare-title"
      className="p-5 space-y-4 max-h-[90vh] flex flex-col"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="compare_arrows" className="text-lilac-600 dark:text-lilac-300" />
          <h2 id="version-compare-title" className="text-sm font-semibold text-ink">
            Compare versions of @{namespace}/{id}
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close comparison"
          className="text-ink-3 hover:text-ink transition-colors"
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="label block mb-1">Base version</label>
          <select
            value={leftVersion}
            onChange={(e) => setLeftVersion(e.target.value)}
            aria-label="Base version"
            className={selectClass}
          >
            {sorted.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            setLeftVersion(rightVersion);
            setRightVersion(leftVersion);
          }}
          title="Swap versions"
          aria-label="Swap versions"
          className="p-2 mb-0.5 text-ink-3 hover:text-ink rounded-lg border border-line hover:bg-wash dark:hover:bg-raised transition-colors"
        >
          <Icon name="swap_horiz" />
        </button>
        <div className="flex-1">
          <label className="label block mb-1">Compare version</label>
          <select
            value={rightVersion}
            onChange={(e) => setRightVersion(e.target.value)}
            aria-label="Compare version"
            className={selectClass}
          >
            {sorted.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-lg text-xs text-rose-800 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-ink-3">
          <Icon name="progress_activity" className="animate-spin" />
          <span>Loading versions...</span>
        </div>
      ) : diff && left && right ? (
        <>
          <div className="grid grid-cols-2 gap-3 text-meta">
            {[left, right].map((side) => (
              <div
                key={side.version}
                className="border border-line rounded-lg p-3 bg-wash dark:bg-raised space-y-1"
              >
                <div className="font-mono font-bold text-ink">v{side.version}</div>
                <div className="text-ink-3">
                  Status:{' '}
                  <strong className="text-ink-2 font-mono">{side.info?.status || 'unknown'}</strong>
                </div>
                {side.info?.createdAt && (
                  <div className="text-ink-3">
                    Created:{' '}
                    <strong className="text-ink-2">
                      {new Date(side.info.createdAt).toLocaleDateString()}
                    </strong>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 text-meta font-mono">
            <span className="text-emerald-700 dark:text-emerald-400">+{diff.added} added</span>
            <span className="text-rose-700 dark:text-rose-400">-{diff.removed} removed</span>
          </div>

          <div className="flex-1 min-h-0 overflow-auto border border-line rounded-lg bg-surface dark:bg-raised">
            {diff.rows.length === 0 ? (
              <p className="p-6 text-center text-xs text-ink-3">
                The selected versions have identical source code.
              </p>
            ) : (
              <table className="w-full border-collapse font-mono text-meta leading-5">
                <tbody>
                  {diff.rows.map((row, index) => (
                    <tr
                      key={index}
                      className={
                        row.type === 'added'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40'
                          : row.type === 'removed'
                            ? 'bg-rose-50 dark:bg-rose-950/40'
                            : ''
                      }
                    >
                      <td className="w-10 px-2 text-right text-ink-3 select-none border-r border-line align-top">
                        {row.oldLine ?? ''}
                      </td>
                      <td className="w-10 px-2 text-right text-ink-3 select-none border-r border-line align-top">
                        {row.newLine ?? ''}
                      </td>
                      <td
                        className={`px-2 whitespace-pre ${
                          row.type === 'added'
                            ? 'text-emerald-800 dark:text-emerald-300'
                            : row.type === 'removed'
                              ? 'text-rose-800 dark:text-rose-300'
                              : 'text-ink-2'
                        }`}
                      >
                        <span className="select-none mr-1.5 text-ink-3">
                          {row.type === 'added' ? '+' : row.type === 'removed' ? '-' : ' '}
                        </span>
                        {row.text}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </Modal>
  );
};
