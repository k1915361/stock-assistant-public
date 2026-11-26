// @ts-check
'use strict';
// Loud failures. A failure the app can survive is still reported, never dropped: it goes to the browser console with its
// stack, to a short in-memory list (stockAssistantFailures()), and to the status line. The app keeps running.
// Reporting never throws, so a broken report cannot crash, block or freeze the app.
// Use reportFailure(where, error) in place of an empty or silent catch, and in place of a promise rejection nobody handles.
(() => {
  const LIMIT = 50;
  const failures = [];

  function messageOf(error) {
    try {
      if (error instanceof Error) return error.message || error.name || 'Error';
      if (typeof error === 'string') return error;
      return String(error ?? 'unknown error');
    } catch {
      return 'unknown error';
    }
  }

  // Each step is guarded by a type check rather than a try block, so a missing page or console cannot hide a failure.
  function reportFailure(where, error) {
    const entry = {
      at: new Date().toISOString(),
      where: String(where ?? 'app').slice(0, 80),
      message: messageOf(error).slice(0, 300),
    };
    failures.push(entry);
    if (failures.length > LIMIT) failures.shift();
    if (typeof console !== 'undefined') console.error(`[Stock Assistant] ${entry.where}: ${entry.message}`, error);
    if (typeof document !== 'undefined') {
      const status = document.getElementById('status');
      if (status) status.textContent = `${entry.where} did not finish: ${entry.message}. The app is still running.`;
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('stock-assistant-failure', { detail: entry }));
  }

  if (typeof window !== 'undefined') {
    window.reportFailure = reportFailure;
    window.stockAssistantFailures = () => failures.slice();
    window.addEventListener('error', event => reportFailure('uncaught error', event.error ?? event.message));
    window.addEventListener('unhandledrejection', event => reportFailure('unhandled promise rejection', event.reason));
  }
})();
