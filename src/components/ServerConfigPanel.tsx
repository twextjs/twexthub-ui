import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../services/api';
import { ServerConfig, ServerSetting } from '../types/api';
import { useToast } from '../context/ToastContext';
import { Icon } from './Icon';

type DraftValue = string | boolean;
type Drafts = Record<string, DraftValue>;

const MIB = 1024 * 1024;

function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

/** Bytes read better as the unit a limit was chosen in than as a digit soup. */
function formatBytes(value: number): string {
  if (value >= MIB && value % MIB === 0) return `${value / MIB} MiB`;
  if (value >= 1024 && value % 1024 === 0) return `${value / 1024} KiB`;
  return String(value);
}

function toDraft(setting: ServerSetting): DraftValue {
  if (setting.type === 'boolean') return setting.value === true;
  if (Array.isArray(setting.value)) return setting.value.join('\n');
  if (setting.value === null || setting.value === undefined) return '';
  return String(setting.value);
}

function fromDraft(setting: ServerSetting, draft: DraftValue): ServerSetting['value'] {
  if (setting.type === 'boolean') return draft === true;
  if (setting.type === 'origins') {
    return String(draft)
      .split(/[\n,]/)
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  if (setting.type === 'number' || setting.type === 'bytes') {
    const text = String(draft).trim();
    return text === '' ? null : Number(text);
  }
  const text = String(draft).trim();
  return text === '' ? null : text;
}

/**
 * Per-setting validation, kept beside the parser so the two cannot drift: the
 * same rule that turns a draft into a value decides whether it is submittable.
 */
function validate(setting: ServerSetting, draft: DraftValue): string | null {
  if (setting.type === 'number' || setting.type === 'bytes') {
    // Empty means unset, which is a legitimate state: the file simply does not
    // mention the key, and clearing a value the operator set removes it. An
    // untouched empty field must not read as an error, or every setting the
    // file leaves out would be flagged the moment the page opens.
    const text = String(draft).trim();
    if (text === '') return null;
    if (!/^\d+$/.test(text)) return 'Enter a whole number.';
    const value = Number(text);
    if (setting.min != null && value < setting.min) return `At least ${setting.min}.`;
    if (setting.max != null && value > setting.max) return `At most ${setting.max}.`;
  }
  if (setting.type === 'url') {
    const text = String(draft).trim();
    if (text === '') return null;
    if (!/^https?:\/\/.+/i.test(text)) return 'Start with http:// or https://';
  }
  return null;
}

export const ServerConfigPanel: React.FC = () => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const next = await api.getServerConfig();
      setConfig(next);
      setDrafts(Object.fromEntries(next.settings.map((s) => [s.key, toDraft(s)])));
    } catch (err: unknown) {
      setLoadError(describeError(err, 'Failed to read the site settings'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const errors = useMemo(() => {
    if (!config) return {} as Record<string, string | null>;
    return Object.fromEntries(
      config.settings.map((s) => [s.key, validate(s, drafts[s.key] ?? toDraft(s))]),
    );
  }, [config, drafts]);

  const pending = useMemo(() => {
    if (!config) return [];
    return config.settings.filter((s) => {
      const draft = drafts[s.key] ?? toDraft(s);
      if (errors[s.key]) return false;
      // Both sides go through JSON so an unset setting compares equal to an
      // empty field, rather than a stringified "null" against a null.
      return JSON.stringify(fromDraft(s, draft) ?? null) !== JSON.stringify(s.value ?? null);
    });
  }, [config, drafts, errors]);

  const invalid = useMemo(
    () => config?.settings.filter((s) => errors[s.key]) ?? [],
    [config, errors],
  );

  const save = async () => {
    if (!config || pending.length === 0) return;
    setIsSaving(true);
    try {
      const res = await api.updateServerConfig(
        Object.fromEntries(pending.map((s) => [s.key, fromDraft(s, drafts[s.key])])),
      );
      setConfig((prev) => (prev ? { ...prev, settings: res.settings } : prev));
      setDrafts(Object.fromEntries(res.settings.map((s) => [s.key, toDraft(s)])));
      const changedCount = Object.keys(res.changed).length;
      if (changedCount === 0) {
        toastSuccess('Already set to those values');
      } else {
        const names = Object.keys(res.changed)
          .map((key) => res.settings.find((s) => s.key === key)?.label ?? key)
          .join(', ');
        toastSuccess(`Updated ${names}`);
      }
      if (res.restartRequired.length > 0) {
        const labels = res.restartRequired
          .map((key) => res.settings.find((s) => s.key === key)?.label ?? key)
          .join(', ');
        toastError(`${labels} only takes effect after a restart.`);
      }
    } catch (err: unknown) {
      toastError(describeError(err, 'Failed to save the site settings'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-2">
        <Icon name="refresh" className="animate-spin" />
        Reading the site settings
      </div>
    );
  }

  if (loadError || !config) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
        <button type="button" className="btn" onClick={() => void load()}>
          <Icon name="refresh" className="icon-sm" />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Icon name="dns" className="text-amber-600 dark:text-amber-400" />
        <h2 className="text-sm font-semibold text-ink">Site settings</h2>
      </div>
      <p className="text-xs text-ink-2 leading-relaxed max-w-2xl">
        Changes are written to the site&rsquo;s configuration file and take effect right away, so
        they survive a restart. Settings the file does not set yet show the built-in defaults.
      </p>

      {!config.editable && (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"
        >
          <Icon name="draft" className="shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-ink">This site cannot save its own settings</p>
            <p className="text-xs text-ink-2 leading-relaxed">
              {config.reason ??
                'The configuration file is not stored anywhere permanent, so changes would be lost when the site is rebuilt.'}
            </p>
            <p className="text-xs text-ink-3 leading-relaxed">
              An operator has to mount the file as a volume. Until then the values below are
              read-only, and changes made by hand in the file take effect on the next request.
            </p>
          </div>
        </div>
      )}

      {config.editable && (
        <div className="flex gap-3 rounded-lg border border-ink-3/20 p-3">
          <Icon name="gpp_maybe" className="shrink-0 text-ink-3" />
          <p className="text-xs text-ink-2 leading-relaxed">
            The database, address, port, and storage location are not editable here. Changing any of
            them can take the site offline, so they are changed only in the configuration file
            itself.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {config.settings.map((setting) => {
          const draft = drafts[setting.key] ?? toDraft(setting);
          const error = errors[setting.key];
          const controlId = `server-setting-${setting.key.replace(/[^a-zA-Z0-9]+/g, '-')}`;
          const describedBy = [
            setting.help ? `${controlId}-help` : null,
            error ? `${controlId}-error` : null,
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div key={setting.key} className="card p-3 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <label htmlFor={controlId} className="label block normal-case text-ink-3">
                  <span className="text-xs font-semibold text-ink">{setting.label}</span>
                  <code className="ml-2 text-meta text-ink-3">{setting.key}</code>
                </label>
                <span className="text-meta text-ink-3">
                  {setting.value === null || setting.value === undefined
                    ? 'not set in the file'
                    : setting.type === 'bytes' && typeof setting.value === 'number'
                      ? `now ${formatBytes(setting.value)}`
                      : setting.restartRequired
                        ? 'needs a restart'
                        : 'live'}
                </span>
              </div>

              {setting.help && (
                <p id={`${controlId}-help`} className="text-meta text-ink-3 leading-relaxed">
                  {setting.help}
                </p>
              )}

              {setting.type === 'boolean' ? (
                <label className="flex items-center gap-2 text-xs text-ink-2">
                  <input
                    id={controlId}
                    type="checkbox"
                    checked={draft === true}
                    disabled={!config.editable}
                    aria-describedby={describedBy || undefined}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [setting.key]: e.target.checked }))
                    }
                    className="w-4 h-4 accent-lilac-500"
                  />
                  {draft === true ? 'Enabled' : 'Disabled'}
                </label>
              ) : setting.type === 'origins' ? (
                <textarea
                  id={controlId}
                  rows={3}
                  value={String(draft)}
                  disabled={!config.editable}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describedBy || undefined}
                  placeholder={'One per line, or a single * for any origin.'}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [setting.key]: e.target.value }))
                  }
                  className="input resize-y font-mono text-xs"
                />
              ) : (
                <input
                  id={controlId}
                  type={setting.type === 'number' || setting.type === 'bytes' ? 'number' : 'text'}
                  inputMode={
                    setting.type === 'number' || setting.type === 'bytes' ? 'numeric' : undefined
                  }
                  min={setting.min ?? undefined}
                  max={setting.max ?? undefined}
                  step={setting.type === 'bytes' ? 1024 : 1}
                  value={String(draft)}
                  disabled={!config.editable}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describedBy || undefined}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [setting.key]: e.target.value }))
                  }
                  className="input"
                />
              )}

              {setting.type === 'bytes' && (
                <p className="text-meta text-ink-3">
                  {Number.isFinite(Number(draft)) && String(draft) !== ''
                    ? formatBytes(Number(draft))
                    : 'Enter a size in bytes.'}
                </p>
              )}

              {error && (
                <p id={`${controlId}-error`} className="text-meta text-rose-600 dark:text-rose-400">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap pt-1">
        <button
          type="button"
          className="btn btn-primary disabled:opacity-50"
          disabled={!config.editable || isSaving || pending.length === 0}
          onClick={() => void save()}
        >
          <Icon name="save" className="icon-sm" />
          {isSaving ? 'Saving' : 'Save changes'}
        </button>
        <button
          type="button"
          className="btn disabled:opacity-50"
          disabled={isSaving || pending.length === 0}
          onClick={() =>
            setDrafts(Object.fromEntries(config.settings.map((s) => [s.key, toDraft(s)])))
          }
        >
          Discard
        </button>
        <button
          type="button"
          className="btn disabled:opacity-50"
          disabled={isSaving}
          onClick={() => void load()}
        >
          <Icon name="refresh" className="icon-sm" />
          Reload
        </button>
        {invalid.length > 0 && (
          <span className="flex items-center gap-1 text-meta text-amber-600 dark:text-amber-400">
            <Icon name="warning" className="icon-sm" />
            {invalid.length} setting{invalid.length === 1 ? ' needs' : 's need'} a fix before
            saving.
          </span>
        )}
        {config.editable && invalid.length === 0 && pending.length > 0 && (
          <span className="text-meta text-ink-3">
            {pending.length} unsaved change{pending.length === 1 ? '' : 's'}.
          </span>
        )}
      </div>
    </div>
  );
};
