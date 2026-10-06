import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { getAppConfig } from './config/settings';
import { migrateLegacyHash } from './lib/router';
import { api } from './services/api';
import './index.css';

api.configure(getAppConfig());

migrateLegacyHash();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
