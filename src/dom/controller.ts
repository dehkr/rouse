import { getApp } from '../core/app';
import { effectScope } from '../reactivity';
import type { RouseRequestOpts, SetupContext, SetupFn } from '../types';
import { attachController } from './attacher';
import { dispatch } from './utils';

const instanceMap = new WeakMap<HTMLElement, any>();

// Initializes a controller instance on a specific element
export function initInstance(
  el: HTMLElement,
  setup: SetupFn,
  props: Record<string, any> = {},
) {
  if (instanceMap.has(el)) return;
  instanceMap.set(el, createController(el, setup, props));
}

export function destroyInstance(el: HTMLElement) {
  const inst = instanceMap.get(el);
  if (inst) {
    // Trigger disconnect() and cleanup
    inst._destroy();
    instanceMap.delete(el);

    dispatch(el, 'rz:controller:destroy');
  }
}

/**
 * Identity function for TypeScript inference.
 */
export function controller<P extends Record<string, any> = Record<string, any>>(
  fn: SetupFn<P>,
): SetupFn<P> {
  return fn;
}

/**
 * Factory to create and manage a controller instance.
 */
export function createController(
  el: HTMLElement,
  setup: SetupFn,
  props: Record<string, any> = {},
) {
  let isDestroyed = false;
  const cleanups: (() => void)[] = [];

  const handle = {
    instance: null as any,
    _destroy: () => {
      if (isDestroyed) return;
      isDestroyed = true;
      // Teardown child effects (DOM) before parent state
      cleanups.reverse().forEach((fn) => {
        fn();
      });
    },
  };

  const app = getApp(el);
  if (!app) {
    console.warn('[Rouse] Cannot attach controller outside of an app instance:', el);
    return handle;
  }

  // Context object passed into the controller setup function
  const context: SetupContext = {
    el,
    appRoot: app.root,
    props,
    stores: app.stores,
    dispatch: (evt, detail, opts) => dispatch(el, evt, detail, opts),
    bus: {
      publish: (event, data) => app.bus.publish(event, data),
      subscribe: (event, cb) => {
        const unsub = app.bus.subscribe(event, cb);
        cleanups.push(unsub);
      },
      unsubscribe: (event, cb) => app.bus.unsubscribe(event, cb),
    },
    fetch: (resource: string, options: RouseRequestOpts = {}) => {
      // Target defaults to the controller root element unless provided
      const finalOptions: RouseRequestOpts = {
        target: el,
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
  cleanups.push(stopSetupScope);

  // Block async setup functions since they can't be captured in effect scope
  // which will cause memory leaks. Controllers should be initialized synchronously,
  // then populated asynchronously (data should be fetched as side effect).
  if (instance instanceof Promise) {
    handle._destroy();
    throw new Error(
      `[Rouse] Controller setup must be synchronous. Fetch data as a side effect.`,
    );
  }

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
