// Private usage dashboard (behind Cloudflare Access). English only: a single-owner page.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './admin.css';
import { Admin } from './Admin.tsx';

const root = document.getElementById('admin');
if (!root) throw new Error('Missing #admin');
createRoot(root).render(
  <StrictMode>
    <Admin />
  </StrictMode>,
);
