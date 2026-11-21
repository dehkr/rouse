/*
 * `~item` resolves against the nearest instance only; there's no walk to an outer item.
 *
 * Keys are positional unless `rz-key` names a field. Don't add an identity or
 * automatic key: an explicit key is the opt-in for lists that refetch or reorder.
 */
import { signal } from 'alien-signals';
import type { RouseApp } from '../app';
import { RENDER_FRAME } from '../core/constants';
import { warn } from '../core/diagnostics';
import { getNestedVal } from '../core/path';
import { isPlainObject } from '../core/state';
import { effect } from '../reactivity/effect';
import { getRaw, reactive, untracked } from '../reactivity/reactive';
import type { RenderContext, RenderFrame, Scope, VoidFn } from '../types';
import {
  bindDirectives,
  markRenderOwned,
  runCleanups,
  unmarkRenderOwned,
  boundElements,
} from './binder';

type RenderMode = 'array' | 'object' | 'number' | 'boolean';

type IndexSignal = {
  (): number;
  (value: number): void;
};

type ItemSignal = {
  (): unknown;
  (value: unknown): void;
};

interface NormalizedValue {
  mode: RenderMode;
  /** One item per instance, at its index */
  items: unknown[];
}

interface InstanceRecord {
  item: unknown;
  itemSig: ItemSignal;
  indexSig: IndexSignal;
  roots: ChildNode[];
  target: Element | null;
  teardown: VoidFn;
}

/** Options the directive feeds the engine. */
interface RenderOptions {
  app: RouseApp;
  parentState: Scope;
  keyPath?: string | null;
}

/**
 * Classifies the resolved render value and lays out the instances to render.
 *
 * - Boolean: renders the contents once or not at all, with the value as the item
 * - Number: renders them that many times, with the number as every instance's item
 * - Object: renders once with the object as the item
 * - Array: renders one instance per element, with the element as the item
 *
 * Copies arrays through the proxy's iterator, so the render tracks the array and
 * re-runs on structural changes, including in-place reorders.
 */
function normalize(value: unknown): NormalizedValue {
  if (Array.isArray(value)) {
    return { mode: 'array', items: Array.from(value) };
  }

  if (typeof value === 'number') {
    const n = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    return { mode: 'number', items: Array.from({ length: n }, () => value) };
  }

  if (isPlainObject(value)) {
    return { mode: 'object', items: [value] };
  }

  // `boolean` and anything else: truthy renders once, falsy renders nothing
  return { mode: 'boolean', items: value ? [value] : [] };
}

/**
 * Resolves the reconciliation key. Positional by default. An explicit `rz-key`
 * path keys by a stable field. A missing/null explicit key warns and falls back
 * to position.
 */
function keyFor(
  item: unknown,
  index: number,
  mode: RenderMode,
  keyPath: string | null,
  onMissing?: VoidFn,
): string | number {
  if (mode === 'boolean' || mode === 'number' || !keyPath) {
    return index;
  }

  const explicit = getNestedVal(item, keyPath);
  if (explicit == null) {
    onMissing?.();
    return index;
  }

  return explicit as string | number;
}

/** `ParentNode.moveBefore()`, which TypeScript's DOM types don't include yet. */
type MoveBefore = (node: ChildNode, child: ChildNode | null) => void;

/**
 * Positions an instance's root nodes immediately after `prev`, moving only
 * what's out of place. Returns the new trailing node.
 *
 * Moves a placed node with `moveBefore()` where supported, which keeps focus and
 * running transitions. It throws for a node outside `parent`'s connected tree, so a
 * new instance, still in its fragment, is inserted.
 */
function placeAfter(parent: ParentNode, roots: ChildNode[], prev: ChildNode): ChildNode {
  const moveBefore =
    'moveBefore' in parent ? (parent.moveBefore as MoveBefore) : undefined;
  let ref = prev;
  for (const node of roots) {
    if (ref.nextSibling !== node) {
      if (moveBefore && node.parentNode === parent && node.isConnected) {
        moveBefore.call(parent, node, ref.nextSibling);
      } else {
        parent.insertBefore(node, ref.nextSibling);
      }
    }
    ref = node;
  }
  return ref;
}

/**
 * Renders a `<template>`'s contents from a reactive value and keeps them
 * reconciled. Resolves the value via `source` inside a tracked effect. On every
 * change it diffs by key and creates, reuses, moves, or removes instances.
 * Returns a teardown that stops tracking and tears every instance down.
 */
export function renderTemplate(
  template: HTMLTemplateElement,
  source: () => unknown,
  opts: RenderOptions,
): VoidFn {
  const { app, parentState, keyPath = null } = opts;

  const records = new Map<string | number, InstanceRecord>();
  let currentMode: RenderMode | null = null;
  // Key warnings fire once per template, summarized per pass, so a typo in `rz-key`
  // over thousands of rows doesn't flood the console
  let keyWarned = false;
  let dupWarned = false;

  /**
   * Creates one rendered instance. Clones the template contents, layers the item
   * and index onto a render context, binds the cloned directives against it,
   * and teleports the nodes to a target when the item requests one.
   */
  function buildInstance(item: unknown, index: number): InstanceRecord {
    const frag = template.content.cloneNode(true) as DocumentFragment;
    const roots = Array.from(frag.childNodes);
    const elementRoots = roots.filter(
      (n): n is Element => n.nodeType === Node.ELEMENT_NODE,
    );

    // Collect directive elements before marking render-owned, so the binder
    // guard doesn't reject our own walk.
    const collected = elementRoots.flatMap((root) => [...boundElements(root)]);

    const itemSig: ItemSignal = signal(reactive(item as object));
    const indexSig: IndexSignal = signal(index);
    const frame: RenderFrame = {
      get item() {
        return itemSig();
      },
      get index() {
        return indexSig();
      },
      parent: parentState,
    };

    // The parent as receiver keeps `this` correct in the parent's getters
    const ctx = new Proxy(parentState, {
      get(t, k) {
        return k === RENDER_FRAME ? frame : Reflect.get(t, k, t);
      },
    }) as RenderContext;

    elementRoots.forEach((root) => markRenderOwned(root, ctx));

    // Detach from the render effect's tracking so these per-instance effects
    // survive its re-runs (and don't leak into it).
    const cleanups: VoidFn[] = untracked(() =>
      collected.flatMap((e) => bindDirectives(e, ctx, app)),
    );

    // Per-item teleport. `renderTarget` accepts a selector string or
    // a direct Element reference.
    const rt =
      item && typeof item === 'object'
        ? (getRaw(item) as Record<string, unknown>).renderTarget
        : undefined;

    let target: Element | null = null;
    if (typeof rt === 'string' && rt) {
      target = app.root.querySelector(rt);
      if (__DEV__ && !target) {
        warn(`rz-render: render target '${rt}' not found.`);
      }
    } else if (rt instanceof Element) {
      // Kept inside the app root, as `rz-place` is, so the instance stays in the
      // observed subtree
      if (app.root.contains(rt)) {
        target = rt;
      } else {
        if (__DEV__) {
          warn(`rz-render: render target is outside the app root; ignoring.`, rt);
        }
      }
    }

    target?.append(...roots);

    const teardown = () => {
      runCleanups(template, cleanups);
      roots.forEach((node) => node.remove());
      elementRoots.forEach(unmarkRenderOwned);
    };

    return {
      item,
      itemSig,
      indexSig,
      roots,
      target,
      teardown,
    };
  }

  function teardownAll() {
    for (const rec of records.values()) {
      rec.teardown();
    }
    records.clear();
  }

  /**
   * Diffs the incoming items against the live instances by key, then creates,
   * reuses, repositions, or removes instances so the DOM matches the new list.
   */
  function reconcile(normalized: NormalizedValue) {
    const { mode, items } = normalized;
    if (mode !== currentMode) {
      teardownAll();
      currentMode = mode;
    }

    const parent = template.parentNode;
    if (!parent) {
      return;
    }

    let missing = 0;
    let dups = 0;
    let firstDup: string | number | null = null;

    const onMissing = __DEV__ ? () => missing++ : undefined;
    const live = new Set<string | number>();

    // One key per item, `null` for an item whose key repeats an earlier one
    const keys = items.map((item, index) => {
      const key = keyFor(item, index, mode, keyPath, onMissing);
      if (live.has(key)) {
        if (__DEV__) {
          dups++;
          firstDup ??= key;
        }
        return null;
      }
      live.add(key);
      return key;
    });

    if (__DEV__) {
      if (missing > 0 && !keyWarned) {
        keyWarned = true;
        warn(
          `rz-key: '${keyPath}' could not be resolved on ${missing} item(s). Positional keys used.`,
        );
      }
      if (dups > 0 && !dupWarned) {
        dupWarned = true;
        warn(
          `rz-key: skipped ${dups} item(s) with duplicate '${keyPath}' values. First collision: '${firstDup}'.`,
        );
      }
    }

    // Tear down before placing. A removed instance left between two live ones puts
    // the next one out of place, and every later instance moves after it.
    for (const [key, rec] of records) {
      if (!live.has(key)) {
        rec.teardown();
        records.delete(key);
      }
    }

    let prev: ChildNode = template;

    for (const [index, instanceKey] of keys.entries()) {
      if (instanceKey === null) {
        continue;
      }
      const item = items[index];

      let rec = records.get(instanceKey);
      if (rec) {
        // Same key, new identity (e.g. refetched data, explicit rz-key): swap
        // the item so bound directives re-read without a rebuild.
        if (rec.item !== item) {
          rec.item = item;
          rec.itemSig(reactive(item as object));
        }
        if (rec.indexSig() !== index) {
          rec.indexSig(index);
        }
      } else {
        rec = buildInstance(item, index);
        records.set(instanceKey, rec);
      }

      // Teleported instances live in a remote target, so don't position inline
      if (!rec.target) {
        prev = placeAfter(parent, rec.roots, prev);
      }
    }
  }

  // Only the source is tracked. `reconcile` reads key fields and instance signals,
  // and none of those reads should re-run the whole render. Untrack it inside `apply`
  // too: `apply`'s effect scope would otherwise hold a link per read until the next
  // pass, and `buildInstance` already keeps instance bindings out of that scope.
  const stop = effect(
    () => normalize(source()),
    (normalized) => untracked(() => reconcile(normalized)),
  );

  return () => {
    stop();
    teardownAll();
  };
}
