import type { RouseApp } from '../core/app';
import { effectScope } from '../reactivity';
import type { RouseRequest, ScopeCtx, ScopeFn } from '../types';
import { bindScope } from './binder';
import { dispatch, on } from './scheduler';
import { swap } from './swapper';

const instanceMap = new WeakMap<HTMLElement, any>();

export const IS_SCOPE: unique symbol = Symbol('rz_is_scope');

export function scanScopeNode(el: HTMLElement, newNode: Element) {
  const inst = instanceMap.get(el);
  if (inst?._scan) {
    inst._scan(newNode);
  }
}

export function teardownScopeNode(el: HTMLElement, removedNode: Element) {
  const inst = instanceMap.get(el);
  if (inst?._teardown) {
    inst._teardown(removedNode);
  }
}

// Initializes a scope instance on a specific element
export function initScopeInstance(
  el: HTMLElement,
  app: RouseApp,
  setup: ScopeFn,
  data: Record<string, any> = {},
  options: { isAlias?: boolean } = {},
) {
  if (instanceMap.has(el)) return;
  instanceMap.set(el, createScope(el, app, setup, data, options));
}

export function destroyInstance(el: HTMLElement) {
  const inst = instanceMap.get(el);
  if (inst) {
    dispatch(el, 'rz:scope:destroy');
    // Trigger disconnect() and cleanup
    inst._destroy();
    instanceMap.delete(el);
  }
}

/**
 * Identity function for TypeScript inference.
 */
export function defineScope<P extends Record<string, any> = Record<string, any>>(
  fn: ScopeFn<P>,
): ScopeFn<P> {
  (fn as any)[IS_SCOPE] = true;
  return fn;
}

/**
 * Factory to create and manage a scope instance.
 */
export function createScope(
  el: HTMLElement,
  app: RouseApp,
  setup: ScopeFn,
  data: Record<string, any> = {},
  options: { isAlias?: boolean } = {},
) {
  let isDestroyed = false;
  const cleanups: (() => void)[] = [];

  // Create abort signal for use in scopes to provide auto-cleanup
  const abortCtrl = new AbortController();

  const handle = {
    instance: null as any,
    _scan: null as ((el: Element) => void) | null,
    _teardown: null as ((el: Element) => void) | null,
    _destroy: () => {
      if (isDestroyed) return;
      isDestroyed = true;
      abortCtrl.abort();
      // Teardown child effects (DOM) before parent state
      cleanups.reverse().forEach((fn) => fn());
    },
  };

  // Context object passed into the scope setup function
  const context: ScopeCtx = {
    data,
    swap,
    scope: el,
    root: app.root,
    stores: app.stores,
    term: abortCtrl.signal,

    dispatch: (...args: any[]) => {
      // If the first argument is a string, assume target was omitted
      const isImplied = typeof args[0] === 'string';

      const target = isImplied ? el : args[0];
      const name = isImplied ? args[0] : args[1];
      const detail = isImplied ? args[1] : args[2];
      const options = isImplied ? args[2] : args[3];

      return dispatch(target, name, detail, options);
    },

    on: (...args: any[]) => {
      // If the first argument is a string, assume target was omitted
      const isImplied = typeof args[0] === 'string';

      const target = isImplied ? el : args[0];
      const events = isImplied ? args[0] : args[1];
      const callback = isImplied ? args[1] : args[2];
      const customSignal = isImplied ? args[2] : args[3];

      const activeSignal = customSignal
        ? AbortSignal.any([abortCtrl.signal, customSignal]) // Optional custom signal
        : abortCtrl.signal;

      return on(target, events, callback, activeSignal);
    },

    // Inject abort signal to avoid background request if scope is destroyed
    // User can override by adding `signal: undefined` option
    // `keepalive: true` option allows a request to finish even if tab closes
    fetch: (resource: string, options: RouseRequest = {}) => {
      const finalOptions: RouseRequest = {
        target: el,
        signal: abortCtrl.signal,
        swap: false,
        ...options,
      };
      return app.fetch(resource, finalOptions);
    },

    // Allows for triggering a scan from inside the scope
    scan: (newNode: Element) => {
      if (handle._scan) handle._scan(newNode);
    },
  };

  // Setup effect scope
  // Wraps the effects that belong to the scope instance
  let instance: any;
  const stopSetupScope = effectScope(() => {
    instance = setup(context) || {};
  });

  // Block async setup functions since they can't be captured in effect scope
  // which will cause memory leaks. Scopes should be initialized synchronously,
  // then populated asynchronously (data should be fetched as a side effect).
  if (instance instanceof Promise) {
    stopSetupScope();
    abortCtrl.abort();
    throw new Error(
      `[Rouse] Scope setup must be synchronous. Fetch data as a side effect.`,
    );
  }

  cleanups.push(stopSetupScope);
  handle.instance = instance;

  // State exists but not bound to DOM yet
  dispatch(el, 'rz:scope:init', { context, instance });

  // Binding effect scope
  // Wraps the logic that connects the reactive state to the DOM
  // Captures effects created by bindings (text, atts, etc.) so the UI auto updates
  if (instance !== undefined) {
    const stopBindingScope = effectScope(() => {
      const { unbindDom, scan, teardown } = bindScope(
        el,
        instance,
        app,
        options.isAlias === true,
      );

      handle._scan = scan;
      handle._teardown = teardown;

      cleanups.push(unbindDom);
    });
    cleanups.push(stopBindingScope);
  }

  return handle;
}
