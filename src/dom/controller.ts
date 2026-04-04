import { getApp } from '../core/app';
import { warn } from '../core/shared';
import { effectScope } from '../reactivity';
import type {
  LifecycleEvent,
  RouseRequest,
  SetupContext,
  SetupFunction,
} from '../types';
import { attachController } from './attacher';
import { dispatch, insert, on } from './utils';

const instanceMap = new WeakMap<HTMLElement, any>();

// Initializes a controller instance on a specific element
export function initInstance(
  el: HTMLElement,
  setup: SetupFunction,
  props: Record<string, any> = {},
) {
  if (instanceMap.has(el)) return;
  instanceMap.set(el, createController(el, setup, props));
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
  fn: SetupFunction<P>,
): SetupFunction<P> {
  return fn;
}

/**
 * Factory to create and manage a controller instance.
 */
export function createController(
  el: HTMLElement,
  setup: SetupFunction,
  props: Record<string, any> = {},
) {
  let isDestroyed = false;
  const cleanups: (() => void)[] = [];

  // Create abort signal for use in controllers to provide auto-cleanup
  const abortCtrl = new AbortController();

  const handle = {
    instance: null as any,
    _destroy: () => {
      if (isDestroyed) return;
      isDestroyed = true;

      abortCtrl.abort();

      // Teardown child effects (DOM) before parent state
      cleanups.reverse().forEach((fn) => {
        fn();
      });
    },
  };

  const app = getApp(el);
  if (!app) {
    warn('Cannot attach controller outside of an app instance:', el);
    return handle;
  }

  // Context object passed into the controller setup function
  const context: SetupContext = {
    el,
    root: app.root,
    props,
    stores: app.stores,
    abortSignal: abortCtrl.signal,
    insert,

    // Bound wrapper for auto-cleanup
    on: <D = any>(
      target: EventTarget,
      name: string,
      callback: (ev: CustomEvent<D>) => void,
      modifiers: string[] = [],
      customSignal?: AbortSignal,
    ) => {
      // Combine controller lifecycle with optional custom signal
      const activeSignal = customSignal
        ? AbortSignal.any([abortCtrl.signal, customSignal])
        : abortCtrl.signal;

      return on(target, name, callback, modifiers, activeSignal);
    },

    // Bound wrapper for API symmetry
    dispatch: <T extends string, D = any>(
      target: EventTarget,
      name: T | LifecycleEvent,
      detail?: D,
      options?: CustomEventInit,
    ) => {
      return dispatch(target, name, detail, options);
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
  };

  // Setup effect scope
  // Wraps the effects that belong to the controller instance
  let instance: any;
  const stopSetupScope = effectScope(() => {
    // Assign empty object if no controller provided
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
      const unbindDom = attachController(el, instance);
      if (unbindDom) {
        cleanups.push(unbindDom);
      }
    });
    cleanups.push(stopBindingScope);
  }

  return handle;
}
