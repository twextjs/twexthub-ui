import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { AutomationToken, Session } from '../types/api';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface UserActivityModalProps {
  namespace: string;
  onClose: () => void;
}

export const UserActivityModal: React.FC<UserActivityModalProps> = ({ namespace, onClose }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tokens, setTokens] = useState<AutomationToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionRes, tokenRes] = await Promise.all([
        api.getSessions({ namespace }),
        api.getTokens({ namespace }),
      ]);
      setSessions(sessionRes.data || []);
      setTokens(tokenRes.data || []);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load account activity';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [namespace]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleRevokeSession = async (id: string) => {
    setRevokingId(id);
    try {
      await api.revokeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke session');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeToken = async (id: string) => {
    setRevokingId(id);
    try {
      await api.deleteToken(id);
      setTokens((prev) => prev.filter((t) => t.id !== id));
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke token');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Modal
      onClose={onClose}
      size="2xl"
      ariaLabel={`Account activity for @${namespace}`}
      className="p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">
          Account Activity — <span className="font-mono">@{namespace}</span>
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-ink-3 hover:text-ink p-1 rounded-md hover:bg-wash transition-colors"
        >
          <Icon name="close" />
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 p-3 rounded-lg text-xs flex items-center gap-2">
          <Icon name="error" className="text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <div className="h-14 bg-wash dark:bg-raised rounded animate-pulse" />
          <div className="h-14 bg-wash dark:bg-raised rounded animate-pulse" />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink">
              <Icon name="laptop" className="text-lilac-500 dark:text-lilac-300" />
              <span>Active sessions ({sessions.length})</span>
            </div>
            {sessions.length > 0 ? (
              <div className="divide-y divide-line border border-line rounded-lg">
                {sessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="p-3 flex items-center justify-between gap-3 text-xs bg-surface dark:bg-raised"
                  >
                    <div className="space-y-1">
                      <span className="font-mono text-ink font-semibold">
                        Session {sess.id.slice(0, 6)}…
                      </span>
                      <div className="text-meta text-ink-3">
                        Created {new Date(sess.createdAt).toLocaleString()}
                        {sess.lastUsedAt &&
                          ` • Last used ${new Date(sess.lastUsedAt).toLocaleString()}`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeSession(sess.id)}
                      disabled={revokingId === sess.id}
                      className="px-2.5 py-1 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-900/60 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-meta text-ink-3 py-2">No active sessions.</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink">
              <Icon name="key" className="text-lilac-500 dark:text-lilac-300" />
              <span>Access tokens ({tokens.length})</span>
            </div>
            {tokens.length > 0 ? (
              <div className="divide-y divide-line border border-line rounded-lg">
                {tokens.map((tok) => (
                  <div
                    key={tok.id}
                    className="p-3 flex items-center justify-between gap-3 text-xs bg-surface dark:bg-raised"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink">{tok.name}</span>
                        {tok.scopes?.map((sc) => (
                          <span
                            key={sc}
                            className="chip bg-wash dark:bg-raised border-line text-ink-2 font-mono text-micro"
                          >
                            {sc}
                          </span>
                        ))}
                      </div>
                      <div className="text-meta text-ink-3">
                        Created {new Date(tok.createdAt).toLocaleDateString()}
                        {tok.expiresAt
                          ? ` • Expires ${new Date(tok.expiresAt).toLocaleDateString()}`
                          : ' • Never expires'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeToken(tok.id)}
                      disabled={revokingId === tok.id}
                      title="Revoke token"
                      className="p-1.5 text-ink-3 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/40 transition-colors disabled:opacity-50"
                    >
                      <Icon name="delete" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-meta text-ink-3 py-2">No access tokens.</p>
            )}
          </div>
        </>
      )}
    </Modal>
  );
};
