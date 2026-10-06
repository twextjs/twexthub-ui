import React from 'react';
import { ModerationStatus } from '../types/api';
import { ExtensionIdentity } from '../lib/collections';
import { StatusBadge } from './StatusBadge';
import { useSavedExtensions } from '../hooks/useCollections';
import { Icon } from './Icon';

interface ExtensionCardProps {
  /** Detail payloads, list/search rows, and saved items all fit. */
  extension: ExtensionIdentity & { status?: ModerationStatus };
  onClick?: () => void;
}

export const ExtensionCard: React.FC<ExtensionCardProps> = ({ extension, onClick }) => {
  const { isSaved, toggle } = useSavedExtensions();
  const saved = isSaved(extension.namespace, extension.id);

  const authorNamespace =
    typeof extension.author === 'object' && extension.author !== null
      ? extension.author.namespace
      : extension.author || extension.namespace;

  const authorDisplayName =
    typeof extension.author === 'object' && extension.author !== null
      ? extension.author.displayName || authorNamespace
      : authorNamespace;

  const version =
    extension.version ||
    extension.latestVersion ||
    (extension.versions && extension.versions[0]?.version) ||
    '1.0.0';
  const status = extension.status || 'published';

  return (
    <div className="card group relative p-5 flex flex-col justify-between text-left leading-tight">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink group-hover:text-lilac-700 dark:group-hover:text-lilac-300 transition-colors truncate">
              {extension.name}
            </h3>
            <div className="flex items-center gap-1.5 font-mono text-xs text-ink-3 mt-0.5">
              <span>@{extension.namespace}</span>
              <span>/</span>
              <span className="font-semibold text-ink-2">{extension.id}</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {status !== 'published' && <StatusBadge status={status} size="sm" />}
            <span className="font-mono text-meta text-ink-3">v{version}</span>
          </div>
        </div>

        <p className="text-sm text-ink-2 line-clamp-2 mt-2.5 leading-relaxed">
          {extension.shortDescription || extension.description || 'No description provided.'}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-sm text-ink-3 relative z-10">
        <div className="flex items-center gap-1.5">
          <Icon name="person" className="icon-sm text-ink-3" />
          <span className="font-medium text-ink-2">{authorDisplayName}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle(extension);
            }}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${extension.name} from saved` : `Save ${extension.name}`}
            title={saved ? 'Remove from saved' : 'Save extension'}
            className={`p-1.5 rounded-md transition-colors ${
              saved
                ? 'text-lilac-700 dark:text-lilac-300'
                : 'text-ink-3 hover:text-ink hover:bg-wash dark:hover:bg-raised'
            }`}
          >
            <Icon name="bookmark" filled={saved} />
          </button>

          <button
            type="button"
            onClick={onClick}
            aria-label={`View details for ${extension.name}`}
            className="inline-flex items-center gap-1 text-lilac-700 dark:text-lilac-300 font-medium text-sm group-hover:underline underline-offset-4"
          >
            View details
            <Icon name="arrow_outward" className="icon-sm" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onClick}
        aria-label={`View details for ${extension.name}`}
        className="absolute inset-0 z-0 cursor-pointer"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
};
