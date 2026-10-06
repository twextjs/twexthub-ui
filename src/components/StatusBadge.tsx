import React from 'react';
import { ModerationStatus } from '../types/api';
import { Icon } from './Icon';

interface StatusBadgeProps {
  status?: ModerationStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status = 'published', size = 'sm' }) => {
  const tones: Record<ModerationStatus, { tone: string; label: string; icon: React.ReactNode }> = {
    published: {
      tone: 'success',
      label: 'Published',
      icon: <Icon name="check_circle" className={size === 'sm' ? 'icon-xs' : 'icon-sm'} />,
    },
    pending: {
      tone: 'warn',
      label: 'Awaiting review',
      icon: <Icon name="schedule" className={size === 'sm' ? 'icon-xs' : 'icon-sm'} />,
    },
    yanked: {
      tone: 'danger',
      label: 'Unpublished',
      icon: <Icon name="block" className={size === 'sm' ? 'icon-xs' : 'icon-sm'} />,
    },
    rejected: {
      tone: 'neutral',
      label: 'Rejected',
      icon: <Icon name="error" className={size === 'sm' ? 'icon-xs' : 'icon-sm'} />,
    },
    deprecated: {
      tone: 'warn',
      label: 'Deprecated',
      icon: <Icon name="warning" className={size === 'sm' ? 'icon-xs' : 'icon-sm'} />,
    },
    staging: {
      tone: 'neutral',
      label: 'Draft',
      icon: <Icon name="schedule" className={size === 'sm' ? 'icon-xs' : 'icon-sm'} />,
    },
  };

  const current = tones[status] || tones.published;

  return (
    <span
      data-tone={current.tone}
      className={`chip tone-pill ${size === 'sm' ? 'text-xs' : 'text-sm px-2.5 py-1'}`}
    >
      {current.icon}
      <span>{current.label}</span>
    </span>
  );
};
