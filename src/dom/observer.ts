/*
 * Mount order is behavior: stores -> scopes -> scope scan -> standalone directives ->
 * global bound directives. Stores come first so `@store` references resolve for the
 * rest. Scopes and the scope scan come before standalone directives, which can fire
 * events while they mount (a `ready` trigger on an element added after `rz:app:ready`),
 * so an `rz-on` must already be listening.
 *
 * Standalone directives mount one pass per directive, since mount order is request
 * order, and tear down element by element through one selector. The mount record holds
 * cleanups, never directive objects: a removed node no longer resolves to an app.
 *
 * A new structural directive needs its own selector pass in `mountSubtree` and
 * `unmountSubtree`. Sharing another directive's pass misses elements carrying only the
 * new one, without a warning.
 *
 * One `MutationObserver` serves every app, so mutations apply in the order the DOM made
 * them: a node moved between apps is torn down before it's mounted again. Don't go back
 * to an observer per app. Observers run in creation order, so a destination app started
 * first would find the source app's records on the node and skip it. Code that reads
 * the registries synchronously (`start()`, `destroy()`, a nested app's release) flushes
 * queued mutations first.
 */
import type { RouseApp } from '../app';
import {
  directiveSelector,
  getDirectiveValue,
  hasDirective,
  queryTargets,
  SCOPE_SELECTOR,
  unknownDirectiveNames,
} from '../core/elements';
import { warn } from '../core/diagnostics';
import { parseTriggerSubjectPairs } from '../core/parser';
import { hasPlugin, needsPlugin, PLUGIN_DIRECTIVES } from '../core/plugins';
import { rzStore } from '../directives/rz-store';
import {
  closestScope,
  getApp,
  isRenderOwned,
  mountGlobalBinding,
  resolveRemovedOwner,
  runCleanups,
  teardownGlobalBindings,
  boundElements,
} from './binder';
import {
  destroyInstance,
  initScopeElement,
  scanScopeNode,
  teardownScopeNode,
} from './scope';
import type { DirectiveSlug, StandaloneDirective, VoidFn } from '../types';

/**
 * Each element's mounted standalone directives, by slug, with their cleanups. It holds
 * no directive objects, so a removed node, which no longer resolves to an app, tears
 * down from here alone.
 */
const mounted = new WeakMap<Element, Map<DirectiveSlug, VoidFn[]>>();

/** Every standalone slug any app registered, and a selector matching any of them. */
const standaloneSlugs = new Set<DirectiveSlug>();
let standaloneSelector = '';

/** Adds a slug to the selector the removal path tears down through. */
export function addStandaloneSlug(slug: DirectiveSlug): void {
  if (standaloneSlugs.has(slug)) {
    return;
  }
  standaloneSlugs.add(slug);
  standaloneSelector = [...standaloneSlugs].map((s) => directiveSelector(s)).join(', ');
}

/**
 * Mounts `directive` on `el` unless it already is. Records the mount even when it
 * bound nothing, so a re-scan doesn't repeat its warnings.
 */
function mountStandalone(el: Element, app: RouseApp, directive: StandaloneDirective) {
  const { slug } = directive;
  let record = mounted.get(el);
  if (record?.has(slug)) {
    return;
  }

  const pairs = parseTriggerSubjectPairs(getDirectiveValue(el, slug));
  if (__DEV__ && pairs.length === 0) {
    warn(`rz-${slug}: at least one trigger is required.`, el);
  }
  const cleanups = pairs.length > 0 ? directive.mount(el, app, pairs) : [];

  if (!record) {
    record = new Map();
    mounted.set(el, record);
  }
  record.set(slug, cleanups);
}

/** Runs the cleanups of every standalone directive mounted on `el`, in mount order. */
function teardownStandalone(el: Element) {
  const record = mounted.get(el);
  if (!record) {
    return;
  }
  mounted.delete(el);
  record.forEach((cleanups) => runCleanups(el, cleanups));
}

/**
 * Warns for each `data-rz-*` attribute in `root`'s subtree, root included, that isn't a
 * directive, or whose plugin isn't installed in `app`. An attribute set on an element
 * already in the page, and `<template>` content before it's inserted, go unchecked.
 */
function warnUnknownDirectives(root: Element, app: RouseApp) {
  for (const el of queryTargets(root, '*')) {
    if (!getApp(el, app)) {
      continue;
    }

    unknownDirectiveNames(el).forEach((name) =>
      warn(
        `'${name}' isn't a Rouse directive. The data-rz- prefix is reserved for directives.`,
        el,
      ),
    );
  }

  PLUGIN_DIRECTIVES.forEach((plugin, slug) => {
    if (hasPlugin(app, plugin)) {
      return;
    }
    forEachOwned(root, directiveSelector(slug), app, (el) =>
      warn(`rz-${slug}: ${needsPlugin(plugin)}`, el),
    );
  });
}

/**
 * Runs `fn` on each match of `selector` in `root`'s subtree, root included, that
 * belongs to `app`. Without `app`, runs it on every match.
 */
function forEachOwned<T extends Element>(
  root: Element,
  selector: string,
  app: RouseApp | undefined,
  fn: (el: T) => void,
) {
  for (const el of queryTargets<T>(root, selector)) {
    if (!app || getApp(el, app)) {
      fn(el);
    }
  }
}

/**
 * Sets up everything in `root`'s subtree, root included, that belongs to `app`. Shared
 * by `app.start()` and the observer, so a directive registered here is scanned on both
 * paths.
 */
export function mountSubtree(root: Element, app: RouseApp) {
  if (__DEV__) {
    warnUnknownDirectives(root, app);
  }

  forEachOwned<HTMLScriptElement>(root, rzStore.selector, app, (el) =>
    rzStore.initialize(el, app),
  );

  forEachOwned<HTMLElement>(root, SCOPE_SELECTOR, app, (el) => initScopeElement(el, app));

  const ownerScope = closestScope(root, app);

  // Scan elements that belong to a scope, but make sure the element itself
  // isn't a scope. `closest` matches self, so a scope element would scan itself
  // and double-bind (`initScopeElement` already handled it above).
  if (ownerScope && !hasDirective(root, 'scope') && getApp(ownerScope, app)) {
    scanScopeNode(ownerScope, root);
  }

  for (const directive of app._standaloneDirectives.values()) {
    forEachOwned(root, directiveSelector(directive.slug), app, (el) =>
      mountStandalone(el, app, directive),
    );
  }

  // Outside any scope, bound directives mount globally
  if (!ownerScope) {
    for (const el of boundElements(root)) {
      if (getApp(el, app)) {
        mountGlobalBinding(el, app);
      }
    }
  }
}

/**
 * Tears down the stores, scopes, and standalone directives in `root`'s subtree, root
 * included. With `app`, only those that belong to it: a removed node no longer
 * resolves to an app, so the removal path passes none. Bound directives are left to
 * the caller, which knows who owns them.
 */
export function unmountSubtree(root: Element, app?: RouseApp) {
  forEachOwned<HTMLScriptElement>(root, rzStore.selector, app, (el) =>
    rzStore.teardown(el),
  );

  forEachOwned<HTMLElement>(root, SCOPE_SELECTOR, app, destroyInstance);

  if (standaloneSelector) {
    forEachOwned(root, standaloneSelector, app, teardownStandalone);
  }
}

/**
 * Tears down what `app` set up in `root`'s subtree, root included, so a nested app can
 * mount there. Runs before the nested root is marked, while its elements still
 * resolve to `app`. Mirrors `mountSubtree`, which bound them.
 */
export function releaseSubtree(root: Element, app: RouseApp) {
  unmountSubtree(root, app);

  const ownerScope = closestScope(root, app);

  if (ownerScope && !hasDirective(root, 'scope') && getApp(ownerScope, app)) {
    teardownScopeNode(ownerScope, root);
  }

  if (!ownerScope) {
    teardownGlobalBindings(root, (el) => !!getApp(el, app));
  }
}

/** Apps whose roots the shared observer watches. */
const observedApps = new Set<RouseApp>();
const OBSERVE_OPTIONS: MutationObserverInit = { childList: true, subtree: true };
let observer: MutationObserver | undefined;

/**
 * Starts watching `app.root`. Applies the mutations already queued first, so the
 * app's first scan sees what they tore down.
 */
export function observeApp(app: RouseApp) {
  flushMutations();
  observedApps.add(app);
  observer ??= new MutationObserver(applyMutations);
  observer.observe(app.root, OBSERVE_OPTIONS);
}

/** Stops watching `app.root`, after applying the mutations already queued. */
export function unobserveApp(app: RouseApp) {
  flushMutations();
  observedApps.delete(app);
  if (!observer) {
    return;
  }
  // An observer can't stop watching one node, so it restarts on the remaining roots
  observer.disconnect();
  for (const { root } of observedApps) {
    observer.observe(root, OBSERVE_OPTIONS);
  }
}

/** Applies queued mutations now, before code that reads the binding registries. */
export function flushMutations() {
  if (observer) {
    applyMutations(observer.takeRecords());
  }
}

function applyMutations(mutations: MutationRecord[]) {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      // If a subtree is added then removed before the current task finishes,
      // the add will be reported, but the node will be detached when the observer
      // runs. So skip it to avoid errant ownership warnings.
      if (node.nodeType === Node.ELEMENT_NODE && node.isConnected) {
        mountAdded(node as Element);
      }
    }

    for (const node of mutation.removedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && !isMovedInstance(node as Element)) {
        isolate(() => unmountRemoved(node as Element));
      }
    }
  }
}

/**
 * Returns true for an `rz-render` instance root that `rz-render` moved rather than
 * removed. An instance's teardown detaches and unmarks its roots, so a root that is
 * still marked and connected only changed position. Its addition remounts nothing.
 */
function isMovedInstance(el: Element): boolean {
  return el.isConnected && isRenderOwned(el);
}

/**
 * Mounts an added subtree for each app it touches: the apps whose root contains it,
 * and the apps whose root it contains, which moved with it.
 */
function mountAdded(node: Element) {
  for (const app of observedApps) {
    if (app.root.contains(node)) {
      isolate(() => mountSubtree(node, app));
    } else if (node.contains(app.root)) {
      isolate(() => mountSubtree(app.root, app));
    }
  }
}

function unmountRemoved(removedEl: Element) {
  unmountSubtree(removedEl);

  // Ownership resolved against the `scopeBindings` WeakMap, not DOM
  // ancestry. Survives detached parents, cross-boundary moves, and
  // sync-detachment edge cases.
  const owner = resolveRemovedOwner(removedEl);
  if (owner === 'global') {
    teardownGlobalBindings(removedEl);
  } else if (owner && !hasDirective(removedEl, 'scope')) {
    teardownScopeNode(owner, removedEl);
  }
}

// Every app's mutations share one callback, so a throw while applying one must not
// skip the rest. Reported as an uncaught error, as it would be from its own callback.
function isolate(fn: VoidFn) {
  try {
    fn();
  } catch (error) {
    reportError(error);
  }
}
