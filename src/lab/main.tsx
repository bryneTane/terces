import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/index.css';
import { Lab } from './Lab.tsx';

const root = document.getElementById('lab');
if (!root) throw new Error('Missing #lab');
createRoot(root).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);
