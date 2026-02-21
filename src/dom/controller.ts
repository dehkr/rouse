import { bus } from '../core/bus';
import { getProps } from '../directives/rz-props';
import { request } from '../net/request';
import { effectScope } from '../reactivity';
import type { SetupContext, SetupFn } from '../types';
import { attachController } from './attacher';
import { dispatch } from './utils';

const instanceMap = new WeakMap<HTMLElement, any>();

// Initializes a controller on a specific element
export function mountInstance(el: HTMLElement, setup: SetupFn) {
  if (instanceMap.has(el)) return;
  instanceMap.set(el, createController(el, setup));
}

export function unmountInstance(el: HTMLElement) {
  const inst = instanceMap.get(el);
  if (inst) {
    // Trigger disconnect() lifecycle and cleanup
    inst._unmount();
    instanceMap.delete(el);
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
export function createController(el: HTMLElement, setup: SetupFn) {
  let isUnmounted = false;
  const cleanups: (() => void)[] = [];

  const handle = {
    instance: null as any,
    _unmount: () => {
      if (isUnmounted) return;
      isUnmounted = true;
      // Teardown child effects (DOM) before parent state
      cleanups.reverse().forEach((fn) => {
        fn();
      });
    },
  };

  const context: SetupContext = {
    el,
    props: getProps(el),
    request: (url, opts) => request(url, opts),
    dispatch: (evt, detail, opts) => dispatch(el, evt, detail, opts),
    bus: {
      publish: (event, data) => bus.publish(event, data),
      subscribe: (event, cb) => {
        const unsub = bus.subscribe(event, cb);
        cleanups.push(unsub);
      },
      unsubscribe: (event, cb) => bus.unsubscribe(event, cb),
    },
  };

  // Setup effect scope
  // Wraps the effects that belong to the controller instance
  let instance: any;
  const stopSetupScope = effectScope(() => {
    instance = setup(context);
  });
  // Add setup scope's stop function to cleanup
  cleanups.push(stopSetupScope);

  // Block async setup functions since they can't be captured in effect scope
  // which will cause memory leaks. Controllers should be initialized synchronously,
  // then populated asynchronously if necessary. Data should be fetched as side effect.
  if (instance instanceof Promise) {
    handle._unmount();
    throw new Error(
      `[Rouse] Controller setup must be synchronous. Fetch data as a side effect.`,
    );
  }

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
