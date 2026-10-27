/*
 * A scope's returned object is a plain API. Don't wrap it in `reactive()`: a scope
 * composes reactivity from the primitives its setup creates, and may have none.
 *
 * `ScopeCtx` holds only what a scope has and the app doesn't: `host`, `term`, and
 * `scan`, with `app` for everything else. A new app method that registers something
 * takes a `signal`, so `signal: term` ends it with the scope.
 */
import { effectScope } from 'alien-signals';
import type { RouseApp } from '../core/app';
import { err, fail, warn } from '../core/diagnostics';
import { dispatch } from '../core/dispatch';
import { rzScope, rzWake } from '../directives';
import type { ScopeCtx, ScopeSetup, VoidFn } from '../types';
import { bindScope } from './binder';
import { attachWakeStrategies } from './events';

type ScopeHandle = ReturnType<typeof createScope>;
const instanceMap = new WeakMap<HTMLElement, ScopeHandle>();

/**
 * Initializes a scope element by parsing its directive, resolving its
 * setup function from the registry, and mounting the reactive instance.
 */
export function initScopeElement(el: HTMLElement, app: RouseApp) {
  const scopeName = rzScope.getConfig(el);
  if (scopeName === null) return;

  let setup: ScopeSetup;

  if (scopeName === '') {
    setup = () => ({});
  } else {
    const scope = app._registry.get(scopeName);
    if (!scope) {
      __DEV__ && warn(`Scope '${scopeName}' is not defined.`);
      return;
    }
    setup = scope;
  }

  const strategies = rzWake.getConfig(el, app);

  attachWakeStrategies(el, app, strategies, () => initScopeInstance(el, app, setup));
}

/**
 * Initializes a scope instance on a specific element.
 */
function initScopeInstance(el: HTMLElement, app: RouseApp, setup: ScopeSetup) {
  if (instanceMap.has(el)) return;
  instanceMap.set(el, createScope(el, app, setup));
}

/**
 * Tears down the instance on `el`. `_destroy()` fires `rz:scope:disconnect`
 * while unbinding. `rz:scope:destroy` is the final "instance gone" signal,
 * so it dispatches last.
 */
export function destroyInstance(el: HTMLElement) {
  const inst = instanceMap.get(el);
  if (inst) {
    inst._destroy();
    dispatch(el, 'rz:scope:destroy');
    instanceMap.delete(el);
  }
}

/**
 * Routes a newly added node to its owning scope instance for binding.
 */
export function scanScopeNode(el: HTMLElement, newNode: Element) {
  instanceMap.get(el)?._scan(newNode);
}

/**
 * Routes a removed node to its owning scope instance for teardown.
 */
export function teardownScopeNode(el: HTMLElement, removedNode: Element) {
  instanceMap.get(el)?._teardown(removedNode);
}

/**
 * Builds a scope instance on an HTML element. Runs `setup`, dispatches
 * `rz:scope:init`, then binds the subtree. Setup state and DOM bindings each
 * get their own `effectScope`, so bindings tear down before the state they
 * read. Returns an internal handle.
 */
function createScope(el: HTMLElement, app: RouseApp, setup: ScopeSetup) {
  let instance: any;
  let isDestroyed = false;
  let binding: {
    scan: (el: Element) => void;
    teardown: (el: Element) => void;
  } | null = null;

  const cleanups: VoidFn[] = [];
  const abortCtrl = new AbortController();

  const destroy = () => {
    if (isDestroyed) return;
    isDestroyed = true;
    abortCtrl.abort();
    // Reverse order: DOM bindings must dispose before the state they read
    [...cleanups].reverse().forEach((fn) => fn());
  };

  // Context object passed into the scope setup function
  const context: ScopeCtx = {
    host: el,
    app,
    term: abortCtrl.signal,
    scan: (newNode: Element) => binding?.scan(newNode),
  };

  // `effectScope` for setup state wraps effects that belong to the scope instance.
  // A failed setup leaves the region unbound, so the setup error is the only report
  // instead of one warning per directive resolving against nothing. Teardown still
  // works and the scan that mounted it continues.
  let setupFailed = false;
  const stopSetupScope = effectScope(() => {
    try {
      instance = setup(context) || {};
    } catch (error) {
      err('Scope setup failed. Its directives were not bound:', el, error);
      instance = {};
      setupFailed = true;
    }
  });

  // Block async setup functions since they can't be captured in an `effectScope`,
  // which would result in memory leaks. Scopes should be initialized synchronously,
  // then populated asynchronously (data should be fetched as a side effect).
  if (instance instanceof Promise) {
    stopSetupScope();
    abortCtrl.abort();
    fail('Scope setup must be synchronous. Fetch data as a side effect.');
  }

  cleanups.push(stopSetupScope);

  if (!setupFailed) {
    // State exists but not bound to DOM yet
    dispatch(el, 'rz:scope:init', { context, instance });

    // `effectScope` for bindings wraps the logic that connects the reactive state
    // to the DOM. Captures effects created by bindings (text, atts, etc.) so the
    // UI auto updates.
    const stopBindingScope = effectScope(() => {
      const { unbindDom, scan, teardown } = bindScope(el, instance, app);
      binding = { scan, teardown };
      cleanups.push(unbindDom);
    });

    cleanups.push(stopBindingScope);
  }

  return {
    instance,
    _scan: (node: Element) => binding?.scan(node),
    _teardown: (node: Element) => binding?.teardown(node),
    _destroy: destroy,
  };
}
