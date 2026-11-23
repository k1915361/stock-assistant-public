(function (root) {
  'use strict';
  // Find by trail, on the screen. AutomationCore decides which place to check next. This file
  // draws each step, passes the answer on, and asks the app to record it and to show the place.
  // The search itself is kept in memory only. The saved history is the app's own location events.

  const Core = root.AutomationCore;
  const trails = new Map();
  const RECORDED = Object.freeze({ here: 'seen', 'not-here': 'not-here' });

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const placementKey = place => [place.doc, place.page, place.diagramPage, place.fixture, place.bay, place.position].map(value => value ?? '').join('|');
  const sameKeys = (left, right) => left.length === right.length && [...left].sort().join('\n') === [...right].sort().join('\n');
  const indexOfPlace = (places, place) => places.findIndex(item => placementKey(item) === placementKey(place));
  const shownIndex = options => (typeof options.shown === 'function' ? options.shown() : 0);

  // A trail is kept while the item's plan places stay the same. If the plan changes, the search starts again.
  function trailFor(key, options) {
    const keys = options.places.map(placementKey);
    const saved = trails.get(key);
    if (saved && sameKeys(saved.keys, keys)) return saved;
    const trail = { keys, state: Core.start(Core.expectedFirst(options.places, shownIndex(options))) };
    trails.set(key, trail);
    return trail;
  }

  function render(container, key, options, notice = '') {
    const trail = trails.get(key), view = Core.view(trail.state), label = options.label;
    let body;
    switch (view.kind) {
      case 'ask': {
        const index = indexOfPlace(options.places, view.candidate);
        body = `<p class="find-ask">Check place ${view.number} of ${view.of}: <strong>${esc(label(view.candidate))}</strong></p>` +
          '<div class="actions"><button type="button" data-answer="here" data-icon="check">Found here</button>' +
          '<button type="button" class="quiet" data-answer="not-here" data-icon="next">Not here</button></div>' +
          (index !== shownIndex(options) ? `<button type="button" class="quiet" data-show="${index}" data-icon="location">Show this place</button>` : '') +
          '<button type="button" class="quiet" data-stop data-icon="close">Stop searching</button>';
        break;
      }
      case 'found':
        body = `<p class="find-result">Found at <strong>${esc(label(view.candidate))}</strong> after ${plural(view.checkedCount, 'check')}. Saved to this item's history.</p>` +
          '<button type="button" class="quiet" data-restart data-icon="refresh">Search again</button>';
        break;
      case 'not-found': {
        const summary = view.remaining
          ? `Not in the first ${view.of} places. ${plural(view.remaining, 'place')} not checked.`
          : `Not in any of the ${view.of} places.`;
        const more = view.remaining ? `<button type="button" data-more data-icon="next">Check the other ${view.remaining}</button>` : '';
        body = `<p class="find-result">${summary}</p><div class="actions">${more}<button type="button" class="quiet" data-restart data-icon="refresh">Start again</button></div>`;
        break;
      }
      case 'stopped':
        body = `<p class="find-result">Search stopped after ${plural(view.checkedCount, 'check')}.</p>` +
          '<button type="button" class="quiet" data-restart data-icon="refresh">Start again</button>';
        break;
      default:
        body = '<p class="muted">No places to check.</p>';
    }
    container.innerHTML = `<div class="find-head"><h2>Find the item</h2><p class="muted">${plural(options.places.length, 'place')} in the plan, checked in order</p></div>` +
      body + (notice ? `<p class="warning" role="status">${esc(notice)}</p>` : '');
    if (root.AppUI && typeof root.AppUI.hydrateIcons === 'function') root.AppUI.hydrateIcons(container);
  }

  // Moves the app to another place only when it is not already showing it, then redraws the steps.
  function moveTo(container, key, options, index) {
    if (index >= 0 && index !== shownIndex(options) && options.show) options.show(index);
    render(container, key, options);
  }

  function act(container, key, options, button) {
    const trail = trails.get(key), state = trail.state;
    if (button.hasAttribute('data-stop')) {
      trails.set(key, { keys: trail.keys, state: Core.stop(state) });
      return render(container, key, options);
    }
    if (button.hasAttribute('data-restart')) {
      trails.set(key, { keys: trail.keys, state: Core.start(Core.expectedFirst(options.places, shownIndex(options))) });
      return render(container, key, options);
    }
    if (button.hasAttribute('data-more')) {
      const rest = state.candidates.slice(state.limit);
      trails.set(key, { keys: trail.keys, state: Core.start(rest, { window: rest.length }) });
      return moveTo(container, key, options, indexOfPlace(options.places, rest[0]));
    }
    if (button.hasAttribute('data-show')) return moveTo(container, key, options, Number(button.dataset.show));
    if (state.status !== 'checking') return render(container, key, options);

    const value = button.dataset.answer;
    const candidate = state.candidates[state.index];
    const next = Core.answer(state, value);
    // The answer is recorded before the search moves on. If the save fails, the step stays as it was.
    if (!options.record(RECORDED[value], candidate)) {
      return render(container, key, options, 'Not saved. This place is still to check, so try again.');
    }
    trails.set(key, { keys: trail.keys, state: next });
    const target = next.status === 'found' ? next.found : next.status === 'checking' ? next.candidates[next.index] : null;
    return moveTo(container, key, options, target ? indexOfPlace(options.places, target) : -1);
  }

  // options: { key, places, label(place), record(action, place) -> boolean, show(index), shown() -> index }
  function mount(container, options) {
    if (!container || !Core || !Array.isArray(options.places) || options.places.length < 2) return;
    const key = String(options.key);
    trailFor(key, options);
    container.onclick = event => {
      const button = event.target.closest('button');
      if (button && container.contains(button)) act(container, key, options, button);
    };
    render(container, key, options);
  }

  const api = Object.freeze({ mount, placementKey });
  if (typeof module !== 'undefined') module.exports = api;
  root.AutomationUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
