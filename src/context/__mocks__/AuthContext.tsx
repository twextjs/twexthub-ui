import React from 'react';
import { vi } from 'vitest';

export const useAuth = vi.fn();

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);
