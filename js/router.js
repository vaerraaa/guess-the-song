// Tiny hash router. Each page module exports mount(root, params) → optional { destroy, beforeLeave }.
import { app } from './app.js';

const routes = new Map();
let current = null;
let root = null;
let ignoreNextChange = false;

export function defineRoute(name, loader) {
  routes.set(name, loader);
}

export function navigate(name, { replace = false } = {}) {
  const hash = `#/${name === 'home' ? '' : name}`;
  if (location.hash === hash || (name === 'home' && (location.hash === '' || location.hash === '#/'))) {
    render();
    return;
  }
  if (replace) {
    history.replaceState(null, '', hash);
    render();
  } else {
    location.hash = hash;
  }
}

function currentRouteName() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
  return routes.has(name) ? name : 'home';
}

async function render() {
  const name = currentRouteName();
  if (current?.name === name) return;

  if (current?.instance?.beforeLeave) {
    const ok = await current.instance.beforeLeave();
    if (!ok) {
      // Restore the previous URL without triggering another render.
      ignoreNextChange = true;
      history.pushState(null, '', `#/${current.name === 'home' ? '' : current.name}`);
      setTimeout(() => (ignoreNextChange = false), 0);
      return;
    }
  }
  current?.instance?.destroy?.();

  const page = await routes.get(name)();
  app.route = name;
  app.syncAmbient();
  root.replaceChildren();
  const view = document.createElement('div');
  view.className = 'page page-enter';
  view.dataset.page = name;
  root.append(view);
  current = { name, instance: page.mount(view) ?? {} };
  window.scrollTo(0, 0);
  // Move focus to the new page's heading for screen reader and keyboard users.
  const heading = view.querySelector('h1, h2');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

export function startRouter(container) {
  root = container;
  window.addEventListener('hashchange', () => {
    if (!ignoreNextChange) render();
  });
  render();
}
