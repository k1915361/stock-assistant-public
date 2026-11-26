// @ts-check
(function (/** @type {any} */ root) {
  'use strict';
  // Find by trail: check the places an item may be, in order, until one holds it.
  // This is the engine only. It has no DOM, no clock and no storage. The caller
  // shows each step and saves each answer, so the rules here can be tested alone.

  const DEFAULT_WINDOW = 5;
  const ANSWERS = Object.freeze(['here', 'not-here']);

  function expectedFirst(/** @type {unknown[]} */ candidates, expectedIndex = 0) {
    if (!Array.isArray(candidates)) throw new TypeError('candidates must be an array');
    if (!candidates.length) return [];
    const wanted = Number.isFinite(expectedIndex) ? Math.trunc(expectedIndex) : 0;
    const first = Math.min(Math.max(0, wanted), candidates.length - 1);
    return [candidates[first], ...candidates.filter((_, index) => index !== first)];
  }

  function start(/** @type {unknown[]} */ candidates, { window: size = DEFAULT_WINDOW } = {}) {
    if (!Array.isArray(candidates)) throw new TypeError('candidates must be an array');
    if (!Number.isInteger(size) || size < 1) throw new RangeError('window must be a whole number of at least 1');
    const list = Object.freeze(candidates.slice());
    return Object.freeze({
      candidates: list,
      limit: Math.min(size, list.length),
      index: 0,
      checked: Object.freeze([]),
      found: null,
      status: list.length ? 'checking' : 'empty',
    });
  }

  function answer(/** @type {any} */ state, /** @type {any} */ value) {
    if (state.status !== 'checking') throw new Error('The search has already finished.');
    if (!ANSWERS.includes(value)) throw new RangeError('The answer must be "here" or "not-here".');
    const candidate = state.candidates[state.index];
    const checked = Object.freeze([...state.checked, Object.freeze({ index: state.index, candidate, answer: value })]);
    if (value === 'here') {
      return Object.freeze({ ...state, checked, found: candidate, status: 'found' });
    }
    const next = state.index + 1;
    return Object.freeze({
      ...state,
      checked,
      index: next,
      status: next >= state.limit ? 'not-found' : 'checking',
    });
  }

  function stop(/** @type {any} */ state) {
    if (state.status !== 'checking') return state;
    return Object.freeze({ ...state, status: 'stopped' });
  }

  function view(/** @type {any} */ state) {
    const checkedCount = state.checked.length;
    const remaining = state.candidates.length - state.limit;
    switch (state.status) {
      case 'checking':
        return Object.freeze({ kind: 'ask', candidate: state.candidates[state.index], number: state.index + 1, of: state.limit, answers: ANSWERS });
      case 'found':
        return Object.freeze({ kind: 'found', candidate: state.found, checkedCount });
      case 'not-found':
        return Object.freeze({ kind: 'not-found', checkedCount, of: state.limit, remaining });
      case 'stopped':
        return Object.freeze({ kind: 'stopped', checkedCount });
      default:
        return Object.freeze({ kind: 'empty' });
    }
  }

  const api = Object.freeze({ DEFAULT_WINDOW, ANSWERS, expectedFirst, start, answer, stop, view });
  if (typeof module !== 'undefined') module.exports = api;
  root.AutomationCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
