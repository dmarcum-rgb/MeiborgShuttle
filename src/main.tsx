import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { logError } from './lib/logError';

window.addEventListener('unhandledrejection', (event) => {
  logError('unhandled_promise', event.reason?.message ?? String(event.reason), {
    stack: event.reason?.stack,
  });
});

window.addEventListener('error', (event) => {
  if (event.message?.includes('ResizeObserver')) return;
  logError('unhandled_error', event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
