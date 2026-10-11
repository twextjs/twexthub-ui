import React, { useState } from 'react';
import { api, ApiError } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface TransferPanelProps {
  namespace: string;
  id: string;
  onClose: () => void;
}

// The registry's namespace rule, so a bad name is refused before the round trip.
const NAMESPACE_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export const TransferPanel: React.FC<TransferPanelProps> = ({ namespace, id, onClose }) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [offering, setOffering] = useState(false);

  const handleOffer = async () => {
    const to = target.trim().toLowerCase();
    if (!NAMESPACE_RE.test(to)) {
      setError('Enter a valid namespace.');
      return;
    }
    if (to === namespace) {
      setError('An extension cannot be transferred to itself.');
      return;
    }

    setOffering(true);
    setError(null);
    try {
      await api.offerExtensionTransfer(namespace, id, to);
      toastSuccess(
        `Offered @${namespace}/${id} to @${to}. The transfer completes once it accepts.`,
      );
      onClose();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Failed to offer the transfer';
      setError(message);
      toastError(message);
    } finally {
      setOffering(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      size="lg"
      ariaLabel={`Transfer @${namespace}/${id}`}
      className="p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Icon name="swap_horiz" className="text-lilac-500 dark:text-lilac-300" />
          Transfer —{' '}
          <span className="font-mono text-ink-2">
            @{namespace}/{id}
          </span>
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-ink-3 hover:text-ink p-1 rounded-md hover:bg-wash transition-colors"
        >
          <Icon name="close" />
        </button>
      </div>

      <p className="text-xs text-ink-2 leading-relaxed">
        Offer this extension to another account or organization. Nothing moves until the destination
        accepts: once it does, the versions, dist-tags, owners, webhooks and download history all
        come with it, and the old address redirects here.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleOffer();
        }}
        className="border border-line rounded-lg p-3 space-y-3"
      >
        <label htmlFor="transfer-target" className="label text-ink-3 flex items-center gap-1.5">
          <Icon name="arrow_forward" className="icon-xs" />
          Destination namespace
        </label>
        <input
          id="transfer-target"
          type="text"
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setError(null);
          }}
          placeholder="namespace"
          autoComplete="off"
          className="input font-mono text-xs"
        />
        {error && <p className="text-meta text-rose-700 dark:text-rose-400">{error}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={offering || !target.trim()}
            className="btn btn-primary btn-sm"
          >
            <Icon name="swap_horiz" className="icon-sm" />
            <span>{offering ? 'Offering...' : 'Offer transfer'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
