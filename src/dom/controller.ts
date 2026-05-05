import { getApp } from '../core/app';
import { warn } from '../core/shared';
import { effectScope } from '../reactivity';
import type { ControllerCtx, ControllerFunction, RouseRequest } from '../types';
import { attachController } from './attacher';
import { dispatch, insert, on } from './utils';

const instanceMap = new WeakMap<HTMLElement, any>();

export const IS_CONTROLLER: unique symbol = Symbol('rz_controller');

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

// Initializes a controller instance on a specific element
export function initInstance(
  el: HTMLElement,
  setup: ControllerFunction,
  props: Record<string, any> = {},
  options: { isAlias?: boolean } = {},
) {
  if (instanceMap.has(el)) return;
  instanceMap.set(el, createController(el, setup, props, options));
}

export function destroyInstance(el: HTMLElement) {
  const inst = instanceMap.get(el);
  if (inst) {
    dispatch(el, 'rz:controller:destroy');
    // Trigger disconnect() and cleanup
    inst._destroy();
    instanceMap.delete(el);
  }
}

/**
 * Identity function for TypeScript inference.
 */
export function controller<P extends Record<string, any> = Record<string, any>>(
  fn: ControllerFunction<P>,
): ControllerFunction<P> {
  (fn as any)[IS_CONTROLLER] = true;
  return fn;
}

/**
 * Factory to create and manage a controller instance.
 */
export function createController(
  el: HTMLElement,
  setup: ControllerFunction,
  props: Record<string, any> = {},
  options: { isAlias?: boolean } = {},
) {
  let isDestroyed = false;
  const cleanups: (() => void)[] = [];

  // Create abort signal for use in controllers to provide auto-cleanup
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

  const app = getApp(el);
  if (!app) {
    warn('Cannot attach controller outside of an app instance:', el);
    return handle;
  }

  // Context object passed into the controller setup function
  const context: ControllerCtx = {
    scope: el,
    root: app.root,
    props,
    stores: app.stores,
    term: abortCtrl.signal,
    insert,

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

    // Inject abort signal to avoid background request if controller is destroyed
    // User can override by adding `signal: undefined` option
    // `keepalive: true` option allows a request to finish even if tab closes
    fetch: (resource: string, options: RouseRequest = {}) => {
      const finalOptions: RouseRequest = {
        target: el,
        signal: abortCtrl.signal,
        mutate: false,
        ...options,
      };
      return app.fetch(resource, finalOptions);
    },

    // Allows for triggering a scan from inside the controller
    scan: (newNode: Element) => {
      if (handle._scan) handle._scan(newNode);
    },
  };

  // Setup effect scope
  // Wraps the effects that belong to the controller instance
  let instance: any;
  const stopSetupScope = effectScope(() => {
    instance = setup(context) || {};
  });

  // Block async setup functions since they can't be captured in effect scope
  // which will cause memory leaks. Controllers should be initialized synchronously,
  // then populated asynchronously (data should be fetched as a side effect).
  if (instance instanceof Promise) {
    stopSetupScope();
    abortCtrl.abort();
    throw new Error(
      `[Rouse] Controller setup must be synchronous. Fetch data as a side effect.`,
    );
  }

  cleanups.push(stopSetupScope);
  handle.instance = instance;

  // State exists but not bound to DOM yet
  dispatch(el, 'rz:controller:init', { context, instance });

  // Binding effect scope
  // Wraps the logic that connects the reactive state to the DOM
  // Captures effects created by bindings (text, atts, etc.) so the UI auto updates
  if (instance !== undefined) {
    const stopBindingScope = effectScope(() => {
      const { unbindDom, scan, teardown } = attachController(
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
