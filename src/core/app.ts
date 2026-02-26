import type { NetworkInterceptors, SetupFn } from '../types';
import { EventBus } from './bus';
import { Registry } from './registry';
import { StoreManager } from './store';

export const defaultConfig = {
  loadingClass: 'rz-loading',
  useDataAttr: false,
  wake: 'load',
  baseUrl: '',
  headers: {} as HeadersInit,
  interceptors: {} as NetworkInterceptors,
};

export type RouseConfig = Partial<typeof defaultConfig> & {
  root?: string | HTMLElement;
};

// Private map to isolate Rouse instances and prevent collisions
const appInstances = new WeakMap<HTMLElement, RouseApp>();

export class RouseApp {
  public root: HTMLElement;
  public bus: EventBus;
  public stores: StoreManager;
  public registry: Registry;
  public config: typeof defaultConfig;

  constructor(config: RouseConfig = {}) {
    const rootEl =
      typeof config.root === 'string'
        ? (document.querySelector(config.root) as HTMLElement)
        : config.root || document.body;

    if (!rootEl) {
      throw new Error('[Rouse] Root element not found.');
    }

    // Only one instance per element allowed
    if (appInstances.has(rootEl)) {
      throw new Error('[Rouse] An app instance is already attached to this element.');
    }

    this.root = rootEl;
    this.bus = new EventBus();
    this.stores = new StoreManager();
    this.registry = new Registry();

    this.config = {
      loadingClass: config.loadingClass ?? defaultConfig.loadingClass,
      useDataAttr: config.useDataAttr ?? defaultConfig.useDataAttr,
      wake: config.wake ?? defaultConfig.wake,
      baseUrl: config.baseUrl ?? defaultConfig.baseUrl,
      headers: config.headers ?? defaultConfig.headers,
      interceptors: config.interceptors ?? defaultConfig.interceptors,
    };

    // Mark root so children can find parent app
    this.root.setAttribute('data-rouse-app', '');
    appInstances.set(this.root, this);
  }

  // PUBLIC API

  register(name: string, setup: SetupFn<any>) {
    this.registry.register(name, setup);
    return this;
  }

  store(name: string, state: object, config?: any) {
    this.stores.define(name, state, config);
    return this;
  }

  start() {
    // TODO: build the scoped event listeners and observers
    console.log('[Rouse] App started on:', this.root);
  }
}

/**
 * High-performance DOM resolver.
 * Allows any deep child element to instantly find its specific parent app instance.
 */
export function getApp(el: HTMLElement): RouseApp | undefined {
  const root = el.closest<HTMLElement>('[data-rouse-app]');
  if (!root) {
    console.warn('[Rouse] Element is not inside a mounted app instance.', el);
    return undefined;
  }
  return appInstances.get(root);
}

/**
 * Main entry point for the framework.
 */
export function createApp(config: RouseConfig = {}): RouseApp {
  return new RouseApp(config);
}
