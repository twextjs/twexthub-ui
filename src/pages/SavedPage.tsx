import React from 'react';
import { Extension } from '../types/api';
import { SavedExtension } from '../lib/collections';
import { useSavedExtensions } from '../hooks/useCollections';
import { ExtensionCard } from '../components/ExtensionCard';
import { useConfirm } from '../hooks/useConfirm';
import { Icon } from '../components/Icon';

interface SavedPageProps {
  onNavigate: (route: string) => void;
}

function toExtension(item: SavedExtension): Extension {
  return {
    namespace: item.namespace,
    id: item.id,
    name: item.name,
    description: item.description,
    author: item.author || item.namespace,
    latestVersion: item.latestVersion,
  };
}

export const SavedPage: React.FC<SavedPageProps> = ({ onNavigate }) => {
  const { saved, clear } = useSavedExtensions();
  const { confirm, confirmDialog } = useConfirm();

  const handleClear = async () => {
    if (saved.length === 0) return;
    const confirmed = await confirm({
      title: 'Clear saved extensions',
      message: `Remove all ${saved.length} saved extensions? Your saved list is stored only in this browser.`,
      confirmLabel: 'Clear saved list',
      variant: 'danger',
    });
    if (confirmed) clear();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {confirmDialog}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
        <div>
          <h1 className="text-2xl font-display font-semibold text-ink flex items-center gap-2">
            <Icon name="bookmark" className="icon-lg text-lilac-500" />
            Saved Extensions
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Extensions you bookmarked. Saved locally in this browser and never uploaded.
          </p>
        </div>

        {saved.length > 0 && (
          <button
            onClick={handleClear}
            className="btn btn-secondary btn-sm self-start sm:self-auto"
          >
            <Icon name="delete" className="icon-sm" />
            <span>Clear all</span>
          </button>
        )}
      </div>

      {saved.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {saved.map((item) => (
            <ExtensionCard
              key={`${item.namespace}/${item.id}`}
              extension={toExtension(item)}
              onClick={() => onNavigate(`ext/${item.namespace}/${item.id}`)}
            />
          ))}
        </div>
      ) : (
        <div className="card p-10 text-center">
          <Icon name="bookmark" className="icon-2xl text-ink-3 mx-auto mb-3" />
          <h2 className="text-sm font-semibold text-ink mb-1">No saved extensions yet</h2>
          <p className="text-xs text-ink-3 max-w-sm mx-auto mb-4">
            Tap the bookmark icon on any extension card to keep it handy here.
          </p>
          <button onClick={() => onNavigate('search')} className="btn btn-primary btn-sm">
            Browse extensions
          </button>
        </div>
      )}
    </div>
  );
};
