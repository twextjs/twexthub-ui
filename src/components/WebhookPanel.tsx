import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { useConfirm } from '../hooks/useConfirm';
import { WEBHOOK_EVENTS, Webhook, WebhookEvent } from '../types/api';
import { Icon } from './Icon';
import { Modal } from './Modal';

const EVENT_LABELS: Record<WebhookEvent, string> = {
  'version.published': 'Version published',
  'version.yanked': 'Version unpublished',
  'version.deprecated': 'Version deprecated',
  'version.rejected': 'Version rejected',
  'owners.changed': 'Owners changed',
};

interface WebhookPanelProps {
  namespace: string;
  /**
   * The extension these webhooks belong to. Left out, the panel edits the
   * organization's own list, which watches the whole namespace instead of one
   * extension and lives under a different collection of endpoints.
   */
  id?: string;
  organization?: boolean;
  onClose: () => void;
}

export const WebhookPanel: React.FC<WebhookPanelProps> = ({
  namespace,
  id,
  organization = false,
  onClose,
}) => {
  const { confirm, confirmDialog } = useConfirm();
  const label = id ? `@${namespace}/${id}` : `@${namespace}`;
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ url: string; value: string } | null>(null);
  const [active, setActive] = useState(true);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWebhooks(
        organization
          ? await api.getOrganizationWebhooks(namespace)
          : await api.getWebhooks(namespace, id as string),
      );
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }, [namespace, id, organization]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleEvent = (event: WebhookEvent) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (events.length === 0) {
      setCreateError('Select at least one event to deliver.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = organization
        ? await api.createOrganizationWebhook(namespace, { url: url.trim(), events, active })
        : await api.createWebhook(namespace, id as string, {
            url: url.trim(),
            events,
            active,
          });
      setUrl('');
      setEvents([]);
      setActive(true);
      setSecret({ url: created.url, value: created.secret });
      await load();
    } catch (err: unknown) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create webhook');
    } finally {
      setCreating(false);
    }
  };

  const handleCopySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCreateError('Failed to copy to the clipboard.');
    }
  };

  const handleDelete = async (hook: Webhook) => {
    const confirmed = await confirm({
      title: 'Delete webhook',
      message: `Delete the webhook delivering to ${hook.url}? Pending deliveries are dropped and cannot be recovered.`,
      confirmLabel: 'Delete webhook',
      variant: 'danger',
    });
    if (!confirmed) return;

    setDeletingId(hook.id);
    setError(null);
    try {
      if (organization) await api.deleteOrganizationWebhook(namespace, hook.id);
      else await api.deleteWebhook(namespace, id as string, hook.id);
      setWebhooks((prev) => prev.filter((h) => h.id !== hook.id));
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete webhook');
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * The registry records `ok` or `error`, not a status code, so match on those
   * first. A numeric 2xx is still accepted so the styling keeps working if the
   * API later reports the real response code.
   */
  const deliverySucceeded = (status?: string | null) => {
    if (!status) return null;
    const normalized = status.trim().toLowerCase();
    if (normalized === 'ok') return true;
    if (normalized === 'error') return false;
    if (/^2\d\d$/.test(normalized)) return true;
    return false;
  };

  const deliveryClass = (status?: string | null) => {
    const succeeded = deliverySucceeded(status);
    if (succeeded === null) return 'text-ink-3';
    return succeeded
      ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-rose-700 dark:text-rose-400';
  };

  const deliveryLabel = (status?: string | null) => {
    const succeeded = deliverySucceeded(status);
    if (succeeded === null) return '';
    return succeeded ? 'delivered OK' : 'last attempt failed';
  };

  return (
    <Modal
      onClose={onClose}
      size="2xl"
      ariaLabel={`Webhooks for ${label}`}
      className="p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Icon name="webhook" className="text-lilac-500 dark:text-lilac-300" />
          Webhooks — <span className="font-mono text-ink-2">{label}</span>
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

      {secret && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 p-3 rounded-lg text-xs space-y-2">
          <div className="flex items-start gap-2">
            <Icon name="warning" className="text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="space-y-1">
              <strong className="font-semibold block">Copy this signing secret now</strong>
              <span>
                It is shown exactly once. Store it in your CI secrets to verify the{' '}
                <code className="font-mono">X-TwextHub-Signature</code> HMAC-SHA256 header.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-ink bg-surface dark:bg-surface border border-line rounded px-2 py-1">
              {secret.value}
            </code>
            <button onClick={handleCopySecret} className="btn btn-secondary btn-sm shrink-0">
              {copied ? (
                <Icon name="check" className="icon-xs" />
              ) : (
                <Icon name="content_copy" className="icon-xs" />
              )}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={() => setSecret(null)}
              aria-label="Dismiss secret"
              className="btn btn-secondary btn-sm shrink-0"
            >
              <span>Dismiss</span>
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="border border-line rounded-lg p-3 space-y-3">
        <div className="label">Add a webhook</div>
        <input
          type="url"
          required
          placeholder="https://ci.example.com/hooks/twext"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Webhook URL"
          className="input font-mono text-xs"
        />
        <label className="flex items-center gap-2 text-meta text-ink-2 cursor-pointer">
          <input type="checkbox" checked={active} onChange={() => setActive((v) => !v)} />
          <span>
            Start active
            <span className="text-ink-3">
              {' '}
              — a paused webhook is registered but receives no deliveries.
            </span>
          </span>
        </label>
        <fieldset className="space-y-1.5">
          <legend className="text-meta text-ink-3 mb-1">Events</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {WEBHOOK_EVENTS.map((event) => (
              <label
                key={event}
                className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={events.includes(event)}
                  onChange={() => toggleEvent(event)}
                />
                <span>{EVENT_LABELS[event]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {createError && <p className="text-meta text-rose-700 dark:text-rose-400">{createError}</p>}
        <button type="submit" disabled={creating} className="btn btn-primary btn-sm">
          <Icon name="add" className="icon-sm" />
          <span>{creating ? 'Creating...' : 'Create webhook'}</span>
        </button>
      </form>

      {loading ? (
        <div className="space-y-2">
          <div className="h-14 bg-wash dark:bg-raised rounded animate-pulse" />
          <div className="h-14 bg-wash dark:bg-raised rounded animate-pulse" />
        </div>
      ) : webhooks.length > 0 ? (
        <div className="divide-y divide-line border border-line rounded-lg">
          {webhooks.map((hook) => (
            <div
              key={hook.id}
              className="p-3 flex items-start justify-between gap-3 text-xs bg-surface dark:bg-raised"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 min-w-0">
                  <code className="block truncate font-mono text-ink font-semibold">
                    {hook.url}
                  </code>
                  {hook.active ? (
                    <span className="chip bg-wash dark:bg-raised border-line text-ink-3 text-micro shrink-0">
                      Active
                    </span>
                  ) : (
                    <span className="chip bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-micro shrink-0">
                      Paused
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {hook.events.map((event) => (
                    <span
                      key={event}
                      className="chip bg-wash dark:bg-raised border-line text-ink-2 font-mono text-micro"
                    >
                      {event}
                    </span>
                  ))}
                </div>
                <div className={`text-meta ${deliveryClass(hook.lastDeliveryStatus)}`}>
                  {hook.lastDeliveryAt
                    ? `Last delivery ${new Date(hook.lastDeliveryAt).toLocaleString()}`
                    : 'No deliveries yet'}
                  {hook.lastDeliveryStatus ? ` — ${deliveryLabel(hook.lastDeliveryStatus)}` : ''}
                </div>
              </div>
              <button
                onClick={() => handleDelete(hook)}
                disabled={deletingId === hook.id}
                title="Delete webhook"
                aria-label={`Delete webhook ${hook.url}`}
                className="p-1.5 text-ink-3 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/40 transition-colors disabled:opacity-50 shrink-0"
              >
                <Icon name="delete" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-meta text-ink-3 py-2">No webhooks yet. Add one above.</p>
      )}

      {confirmDialog}
    </Modal>
  );
};
