/*
 * Shared by `reactive()` and `StoreManager._create`. Restore writes into the raw target
 * before its proxy exists, so restoring triggers no effects.
 *
 * The restore and save reports are bare `err` calls, latched once per key. They depend
 * on the user's browser state (quota, blocked storage, a corrupt entry), not the markup.
 *
 * Saves coalesce per task. The effect still clones on every change, because that deep
 * read is what tracks every field. A microtask stringifies and writes the latest clone.
 * Don't move the write to a timer: a queued microtask can't be lost to unload.
 *
 * The save effect is nested. alien-signals runs an effect's returned cleanup before
 * every re-run, so the stop hooks live in an outer effect that reads nothing and never
 * re-runs. Its cleanup writes a queued save and, in dev, releases the claim. Scope
 * teardown stops the effect without calling the returned stop function, so the flush
 * can't live in that function.
 *
 * The claim registry is page-wide and dev-only: its sole output is the duplicate-key
 * warning. Check in a microtask, not at the claim. The observer mounts a record's added
 * nodes before it unmounts its removed nodes, so an `outerHTML` swap of a persisting
 * scope briefly holds two claims. Both claimants keep persisting: refusing the second
 * would break every swap, since the incoming instance is always the second claimant.
 */
import { effect } from 'alien-signals';
import { isPersistStorage, KEY_BLOCKLIST, type PersistStorage } from '../core/constants';
import { err, fail, warn } from '../core/diagnostics';
import { isPlainObject } from '../core/serializable';
import { clone, hasAccessor } from '../core/state';

export type { PersistStorage };

/**
 * Saves the state to Web Storage on every change and restores it on creation.
 * `persist` and `persistKey` are passed together or not at all.
 */
export type PersistOptions =
  | {
      persist?: undefined;
      persistKey?: undefined;
    }
  | {
      /** Where to save: `'local'` for `localStorage`, `'session'` for `sessionStorage`. */
      persist: PersistStorage;
      /** The storage key, used verbatim. Must be stable across page loads and unique on the page. */
      persistKey: string;
    };

/** A validated storage area and key. */
export interface PersistTarget {
  storage: PersistStorage;
  key: string;
}

const reported = new Set<string>();
const claims = __DEV__ ? new Map<string, number>() : undefined;
const warnedClaims = __DEV__ ? new Set<string>() : undefined;

/**
 * Validates the options and returns the target, or `undefined` when nothing persists.
 */
export function resolvePersist(
  options: PersistOptions | undefined,
): PersistTarget | undefined {
  // Typed as unknown: JS callers bypass the union
  const { persist, persistKey } = (options ?? {}) as {
    persist?: unknown;
    persistKey?: unknown;
  };

  if (persist === undefined && persistKey === undefined) {
    return undefined;
  }
  if (!isPersistStorage(persist) || typeof persistKey !== 'string' || !persistKey) {
    fail(
      `'persist' takes 'local' or 'session' and requires a non-empty 'persistKey' string.`,
    );
  }

  return { storage: persist, key: persistKey };
}

/**
 * Merges the saved value into the raw `target`. Keeps the initial value when nothing
 * is saved, or when the saved value is unreadable or a different type.
 */
export function restore(target: object, persisted: PersistTarget) {
  let saved: unknown;
  try {
    const text = area(persisted).getItem(persisted.key);
    if (text === null) {
      return;
    }
    saved = JSON.parse(text);
  } catch (error) {
    report('restore', persisted, error);
    return;
  }

  if (Array.isArray(target)) {
    if (Array.isArray(saved)) {
      return void target.splice(0, target.length, ...saved);
    }
  } else if (isPlainObject(saved)) {
    for (const key of Object.keys(saved)) {
      // `JSON.parse` makes `__proto__` an own key, and assigning it swaps the prototype
      if (KEY_BLOCKLIST.includes(key) || hasAccessor(target, key)) {
        continue;
      }
      (target as Record<string, unknown>)[key] = saved[key];
    }
    return;
  }

  report('restore', persisted, saved);
}

/**
 * Saves `proxy`'s data fields once per task after a change, at any depth. Returns the
 * stop function. Stopping writes a queued save immediately.
 */
export function startSaving(proxy: object, persisted: PersistTarget): () => void {
  // The latest clone, or `undefined` when no save is queued
  let pending: unknown;

  const write = () => {
    if (pending === undefined) {
      return;
    }
    const snapshot = pending;
    pending = undefined;
    try {
      area(persisted).setItem(persisted.key, JSON.stringify(snapshot));
    } catch (error) {
      report('save', persisted, error);
    }
  };

  const track = () => {
    // `clone()` reads every data field through the proxy and skips accessors
    // without invoking them, so getters neither save nor trigger a save
    const snapshot = clone(proxy);
    if (pending === undefined) {
      queueMicrotask(write);
    }
    pending = snapshot;
  };

  return effect(() => {
    effect(track);
    const release = __DEV__ ? claim(persisted) : undefined;
    return () => {
      release?.();
      write();
    };
  });
}

/** Throws on access when storage is blocked; callers catch it. */
function area({ storage }: PersistTarget): Storage {
  return (globalThis as any)[`${storage}Storage`];
}

function report(
  phase: 'restore' | 'save',
  { storage, key }: PersistTarget,
  detail: unknown,
) {
  const id = `${phase}:${storage}:${key}`;
  if (reported.has(id)) {
    return;
  }
  reported.add(id);

  err(`Could not ${phase} '${key}' in ${storage}Storage.`, detail);
}

/** Registers a live owner of the key. Dev-only; returns the release. */
function claim({ storage, key }: PersistTarget): () => void {
  const id = `${storage}:${key}`;
  claims!.set(id, (claims!.get(id) ?? 0) + 1);

  queueMicrotask(() => {
    if ((claims!.get(id) ?? 0) < 2 || warnedClaims!.has(id)) {
      return;
    }
    warnedClaims!.add(id);
    warn(
      `'${key}' in ${storage}Storage has more than one live owner, so each overwrites the other's saves. Give each persisted object its own 'persistKey'.`,
    );
  });

  return () => {
    const count = claims!.get(id)! - 1;
    if (count) {
      claims!.set(id, count);
    } else {
      claims!.delete(id);
    }
  };
}
