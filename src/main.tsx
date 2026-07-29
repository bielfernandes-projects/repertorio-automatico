import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App.tsx';
import './index.css';

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
