import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { ExtensionOwner } from '../types/api';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../context/ToastContext';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface OwnersPanelProps {
  namespace: string;
  id: string;
  canManage: boolean;
  onClose: () => void;
}

// The registry's namespace rule, so a bad name is refused before the round trip.
const NAMESPACE_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export const OwnersPanel: React.FC<OwnersPanelProps> = ({ namespace, id, canManage, onClose }) => {
  const { confirm, confirmDialog } = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const [owners, setOwners] = useState<ExtensionOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [candidate, setCandidate] = useState('');
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [busyOwner, setBusyOwner] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setOwners(await api.getExtensionOwners(namespace, id));
    } catch (err: unknown) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load the owner list');
    } finally {
      setLoading(false);
    }
  }, [namespace, id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    const target = candidate.trim().toLowerCase();
    if (!NAMESPACE_RE.test(target)) {
      setCandidateError('Enter a valid namespace.');
      return;
    }
    if (owners.some((owner) => owner.namespace === target)) {
      setCandidateError(`${target} is already an owner.`);
      return;
    }
    setAdding(true);
    setCandidateError(null);
    try {
      // The server records an invitation rather than granting, so the wording
      // says so: nothing is owned until the candidate accepts it.
      await api.addExtensionOwner(namespace, id, target);
      toastSuccess(`Invited @${target} to co-own this extension.`);
      setCandidate('');
      await load();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Failed to add that owner';
      setCandidateError(message);
      toastError(message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (ownerNamespace: string) => {
    const ok = await confirm({
      title: 'Remove owner',
      message: `Remove @${ownerNamespace} from @${namespace}/${id}? They will lose the ability to publish immediately.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;

    setBusyOwner(ownerNamespace);
    try {
      await api.removeExtensionOwner(namespace, id, ownerNamespace);
      toastSuccess(`Removed @${ownerNamespace}.`);
      await load();
    } catch (err: unknown) {
      toastError(err instanceof ApiError ? err.message : 'Failed to remove that owner');
    } finally {
      setBusyOwner(null);
    }
  };

  return (
    <Modal onClose={onClose} size="lg" ariaLabel="Extension owners">
      <div className="flex items-center justify-between p-4 border-b border-line sticky top-0 bg-surface dark:bg-surface z-10">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Icon name="group" className="text-lilac-700 dark:text-lilac-300" />
            Owners
          </h2>
          <p className="font-mono text-meta text-ink-3 mt-0.5">
            @{namespace}/{id}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close owners panel"
          className="p-1 text-ink-3 hover:text-ink rounded-lg hover:bg-wash dark:hover:bg-raised transition-colors"
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {canManage && (
          <div className="space-y-2">
            <label htmlFor="owner-candidate" className="label text-ink-3 flex items-center gap-1.5">
              <Icon name="add" className="icon-xs" />
              Invite a co-owner by namespace
            </label>
            <div className="flex gap-2">
              <input
                id="owner-candidate"
                type="text"
                value={candidate}
                onChange={(e) => {
                  setCandidate(e.target.value);
                  setCandidateError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder="namespace"
                autoComplete="off"
                className="input flex-1"
              />
              <button
                onClick={handleAdd}
                disabled={adding || !candidate.trim()}
                className="btn btn-primary shrink-0"
              >
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
            <p className="text-micro text-ink-3">
              An account or an organization; whoever is on an organization's owner list answers for
              it. The candidate is notified, and nothing is granted until the invitation is
              accepted. The extension's own namespace cannot be invited.
            </p>
            {candidateError && (
              <p className="text-meta text-rose-600 dark:text-rose-400">{candidateError}</p>
            )}
          </div>
        )}

        {loadError ? (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 p-3 rounded-lg text-xs flex items-center gap-2">
            <Icon name="error" className="text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{loadError}</span>
          </div>
        ) : loading ? (
          <div className="space-y-2">
            <div className="h-10 bg-wash dark:bg-raised border border-line rounded-lg animate-pulse" />
            <div className="h-10 bg-wash dark:bg-raised border border-line rounded-lg animate-pulse" />
          </div>
        ) : owners.length > 0 ? (
          <ul className="divide-y divide-line border border-line rounded-lg">
            {owners.map((owner) => {
              // The extension's own namespace can never be removed.
              const isSelf = owner.namespace === namespace;
              return (
                <li
                  key={owner.namespace}
                  className="p-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-ink truncate">
                      @{owner.namespace}
                      {isSelf && (
                        <span className="ml-1.5 chip bg-wash dark:bg-raised text-ink-3">
                          extension
                        </span>
                      )}
                      {/* An organization owns extensions but has no account, so
                          the accounts acting for it live at /orgs/{ns}/owners. */}
                      {owner.kind === 'organization' && (
                        <span className="ml-1.5 chip bg-lilac-50 dark:bg-lilac-950 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800/60">
                          organization
                        </span>
                      )}
                    </div>
                    <div className="text-meta text-ink-3 truncate">
                      {owner.displayName}
                      {owner.addedAt && (
                        <span className="ml-1.5">
                          since {new Date(owner.addedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canManage && !isSelf && (
                      <button
                        onClick={() => handleRemove(owner.namespace)}
                        disabled={busyOwner === owner.namespace}
                        title={`Remove @${owner.namespace}`}
                        aria-label={`Remove @${owner.namespace}`}
                        className="p-1 text-ink-3 hover:text-rose-600 dark:hover:text-rose-400 rounded transition-colors disabled:opacity-50"
                      >
                        <Icon name="delete" className="icon-sm" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-meta text-ink-3">No owners listed.</p>
        )}
      </div>
      {confirmDialog}
    </Modal>
  );
};
