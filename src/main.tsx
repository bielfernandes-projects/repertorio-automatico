import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App.tsx';
import { initMonitoring } from './lib/monitoring';
import './index.css';

// Antes de qualquer render, para capturar falhas de inicialização.
initMonitoring();

const container = document.getElementById('root');
if (!container) {
  const div = document.createElement('div');
  div.id = 'root';
  document.body.appendChild(div);
}

const root = document.getElementById('root')!;
createRoot(root).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.error('SW registration failed:', err ? (err.message || err) : 'undefined error (check console for details)');
    });
  });
}
