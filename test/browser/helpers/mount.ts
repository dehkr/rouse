import { rouse } from '../../../src/index';
import type { RouseApp } from '../../../src/app';
import type { ScopeSetup } from '../../../src/types';

interface MountOptions {
  scopes?: Record<string, ScopeSetup>;
  stores?: Record<string, Record<string, any>>;
  /** Called after registration, before `start()`: interceptors, listeners, store config. */
  setup?: (app: RouseApp) => void;
}

interface Mounted {
  app: RouseApp;
  root: HTMLElement;
  /** First element in the root matching `selector`; throws if there is none. */
  $: <T extends Element = HTMLElement>(selector: string) => T;
}

const mounted = new Set<RouseApp>();

/**
 * Renders `html` into a fresh root, starts an app on it, and resolves after
 * `rz:app:ready`, once `ready`-woken scopes have bound. Unmounted after each test.
 */
export async function mount(html: string, options: MountOptions = {}): Promise<Mounted> {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);

  const app = rouse({ root });
  mounted.add(app);

  for (const [name, setup] of Object.entries(options.scopes ?? {})) {
    app.scope(name, setup);
  }
  for (const [name, data] of Object.entries(options.stores ?? {})) {
    app.store(name, data);
  }
  options.setup?.(app);

  const ready = new Promise<void>((resolve) => {
    root.addEventListener('rz:app:ready', () => resolve(), { once: true });
  });
  app.start();
  await ready;

  const $ = <T extends Element = HTMLElement>(selector: string): T => {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`mount: no element matches '${selector}'`);
    return el;
  };

  return { app, root, $ };
}

/** Destroys every mounted app and removes its root. Runs after each test. */
export function unmountAll() {
  for (const app of mounted) {
    app.destroy();
    app.root.remove();
  }
  mounted.clear();
}

/** Resolves after pending microtasks and one animation frame. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
