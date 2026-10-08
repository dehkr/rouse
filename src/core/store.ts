import { type LifecycleHandle, runRequestLifecycle } from '../net/lifecycle';
import { request } from '../net/request';
import { fallbackResponse } from '../net/response';
import { reactive, seedPropagation, trackDirty } from '../reactivity/reactive';
import type {
  DirectiveSlug,
  FetchRequest,
  LifecycleEventMap,
  RouseResponse,
  StorePatchEvent,
  SyncRequest,
  VoidFn,
} from '../types';
import type { RouseApp } from './app';
import { getDirectiveValue } from './attributes';
import { STORE_PREFIX } from './constants';
import { err, fail, warn } from './diagnostics';
import { dispatch } from './dispatch';
import { parseStoreRef, parseStoreValue } from './parser';
import {
  deleteNestedVal,
  getNestedVal,
  getPathParts,
  getPathRoot,
  setNestedVal,
} from './path';
import {
  clone,
  deepEqual,
  isOwnDataProp,
  isPlainObject,
  nullPaths,
  patchState,
} from './state';

/** Receives the store roots that changed in one batch of user edits. */
export type EditListener = (roots: ReadonlySet<string>) => void;

export interface StoreStatus {
  loading: false | 'push' | 'pull';
  error: string | null;
  lastSync: number;
  dirty: Record<string, boolean>;
}

export interface StoreTarget {
  storeName: string;
  nestedPath: string;
}

/**
 * A store's standing sync policy. Seeded at init, applied to every push and pull.
 *
 * `indicator` is deliberately absent: it belongs to the trigger, not the store. A
 * store has many triggers, and `resolveIndicators` takes a single value, so a
 * policy-level indicator would silently override every trigger's `rz-indicator`.
 */
export interface SyncPolicy extends Omit<SyncRequest, 'url' | 'indicator'> {
  /** Endpoint for push and pull. */
  url: string;
}

export interface StoreRequestOptions {
  url?: string;
  /** `triggerEl` is omitted: the top-level field is its only home. */
  overrides?: Omit<SyncRequest, 'triggerEl'>;
  nestedPath?: string;
  triggerEl?: Element;
}

/** What a settled request hands back to `_request`. */
interface SendOutcome {
  result: RouseResponse;
  /** Pushes held while the request was in flight, by slice, if it succeeded. */
  followUps: Array<[string, VoidFn]>;
}

/** The request that owns a store while it's in flight. */
interface InFlight {
  /** The data the request started from. */
  snapshot: any;
  /** The slice it syncs, or none for the whole store. */
  path?: string;
}

interface StoreEntry {
  name: string;
  data: any;
  status: StoreStatus;
  initial: any;
  config?: SyncPolicy;
  lastGood?: any;
  activeReq?: symbol;
  /** The owning request, while it's in flight. */
  inFlight?: InFlight;
  /** Pushes held while a request was in flight, keyed by slice (`''` is the whole store). */
  pendingPushes?: Map<string, VoidFn>;
  /** Settles held `push()` calls once the store has nothing in flight and nothing left to send. */
  idle?: { promise: Promise<void>; resolve: VoidFn };
  el?: Element;
  listeners?: Set<EditListener>;
  touched?: Set<string>;
}

/**
 * Returns the nested slice at `path`, or the whole object when no path is given.
 */
function sliceAt(obj: any, path?: string) {
  return path ? getNestedVal(obj, path) : obj;
}

/** The one root a path-level write can change, or `undefined` for the whole store. */
function rootsFor(path?: string): string[] | undefined {
  return path ? [getPathRoot(path) as string] : undefined;
}

/**
 * Writes the clone of `source`'s value at `path` into `base`, or deletes the path when
 * `source` has nothing there. Mutates and returns `base`.
 */
function withSlice(base: any, path: string, source: any) {
  const value = getNestedVal(source, path);

  if (value === undefined) {
    deleteNestedVal(base, path);
    return base;
  }

  // A primitive along the path can't be written through. The source replaced that
  // primitive wholesale with an object, so the whole root is taken from the source.
  if (hasPrimitiveAlong(base, path)) {
    const root = getPathRoot(path) as string;
    base[root] = clone(source[root]);
    return base;
  }

  setNestedVal(base, path, clone(value));
  return base;
}

/**
 * Applies `payload` to `target` as a JSON Merge Patch, whole or at `path`. A path
 * absent from the payload writes nothing; a `null` there removes the slice. `shape`
 * is the live store `target` mirrors, passed when `target` is a plain copy of it.
 */
function applyMergePatch(target: any, payload: any, path?: string, shape?: any) {
  if (!path) {
    patchState(target, payload, 'merge', shape);
    return;
  }

  const incoming = getNestedVal(payload, path);
  if (incoming === undefined) return;

  if (incoming === null) {
    deleteNestedVal(target, path);
    return;
  }

  if (!isPlainObject(incoming)) {
    setNestedVal(target, path, incoming);
    return;
  }

  let slice = getNestedVal<Record<string, any>>(target, path);

  // Seed an object when the slice is missing or holds a non-object, so the
  // merge drops nulls nested inside the incoming patch (RFC 7396).
  if (!isPlainObject(slice)) {
    setNestedVal(target, path, {});
    slice = getNestedVal<Record<string, any>>(target, path);
  }

  // `setNestedVal` bails when an intermediate is a primitive, so the seed
  // may not have landed.
  if (slice) {
    patchState(slice, incoming, 'merge', sliceAt(shape, path));
  }
}

/** Returns `true` when an existing intermediate on `path` holds a primitive. */
function hasPrimitiveAlong(obj: any, path: string): boolean {
  let current = obj;

  for (const part of getPathParts(path).slice(0, -1)) {
    const next = current[part];
    if (next == null) return false;
    if (typeof next !== 'object') return true;
    current = next;
  }

  return false;
}

/**
 * Protocol headers describing the sync to the server. Merged under the user layers,
 * so `data-rz-headers="Rouse-Store: null"` can drop any of them.
 */
function syncHeaders(
  operation: 'push' | 'pull',
  storeName: string,
  nestedPath?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Rouse-Sync': operation,
    'Rouse-Store': storeName,
  };

  // A push body is a JSON Merge Patch (RFC 7396). A pull carries no body.
  if (operation === 'push') {
    headers['Content-Type'] = 'application/merge-patch+json';
  }

  if (nestedPath) {
    headers['Rouse-Path'] = nestedPath;
  }

  return headers;
}

/**
 * Warns for each object property holding `null` in a baseline the caller is
 * asserting. Dev-only; gate every call with `__DEV__`.
 */
function warnNullFields(storeName: string, state: object) {
  nullPaths(state).forEach((path) =>
    warn(
      `Store '${storeName}': '${path}' is null. Sync reads null as a delete (RFC 7396), so it cannot rest as a value. Use '' or omit the key.`,
    ),
  );
}

/**
 * Resolves a push/pull subject into a store name and optional nested path.
 * A `null` subject means self-target, which is valid only on a <script> element
 * with the `rz-store` directive present.
 */
export function resolveTarget(
  el: Element,
  slug: Extract<DirectiveSlug, 'push' | 'pull'>,
  subject: string | null,
): StoreTarget | null {
  if (subject) {
    if (!subject.startsWith(STORE_PREFIX)) {
      __DEV__ &&
        warn(
          `rz-${slug}: target '${subject}' must be a store reference (e.g., '@cart').`,
        );
      return null;
    }

    const target = parseStoreRef(subject, slug);
    if (!target) {
      return null;
    }

    const { source: storeName, nestedPath } = target;

    if (!storeName) {
      __DEV__ && warn(`rz-${slug}: invalid store reference '${subject}'.`);
      return null;
    }
    return { storeName, nestedPath };
  }

  // Reference the `rz-store` name if `null`. Specific to <script> elements.
  const selfName = parseStoreValue(getDirectiveValue(el, 'store'))?.name;
  if (!selfName) {
    __DEV__ &&
      warn(
        `rz-${slug}: missing store reference. To self-reference a store on a <script> element, add data-rz-store as well.`,
        el,
      );
    return null;
  }

  return { storeName: selfName, nestedPath: '' };
}

/**
 * The central manager for all reactive stores and their network logic.
 * Instantiated once per RouseApp to ensure isolation.
 */
export class StoreManager {
  private app: RouseApp;

  private _stores = new Map<string, StoreEntry>();
  private _pendingFlush = new Set<StoreEntry>();
  private _isPatching = false;

  constructor(app: RouseApp) {
    this.app = app;
  }

  private _setConfig(entry: StoreEntry, partial?: Partial<SyncPolicy>) {
    entry.config = { url: '', ...entry.config, ...partial };
  }

  private _register(
    storeName: string,
    state: object,
    programmaticConfig?: Partial<SyncPolicy>,
    el?: Element,
  ): StoreEntry {
    __DEV__ && warnNullFields(storeName, state);

    const status: StoreStatus = reactive({
      loading: false,
      error: null,
      lastSync: 0,
      dirty: {},
    });

    const proxyState = reactive(state);

    const entry: StoreEntry = {
      name: storeName,
      data: proxyState,
      status,
      initial: clone(state),
    };

    this._stores.set(storeName, entry);

    trackDirty(proxyState, (rootKey: string) => {
      if (this._isPatching) return;

      entry.touched ??= new Set();
      entry.touched.add(rootKey);

      this._scheduleFlush(entry);
    });

    if (programmaticConfig) {
      this._setConfig(entry, programmaticConfig);
    }

    if (el) {
      entry.el = el;
    }

    return entry;
  }

  /**
   * Nullish-safe lookup for accessors that report absence through their own
   * return value. `_getStore` is the version that warns.
   */
  private _find(storeName: string | null | undefined) {
    return storeName == null ? undefined : this._stores.get(storeName);
  }

  /**
   * `_find` with a dev warning when the store is missing. `action` names what the
   * caller was about to do, for the message.
   */
  private _getStore(storeName: string | null | undefined, action?: string) {
    const entry = this._find(storeName);
    __DEV__ &&
      !entry &&
      warn(
        !storeName
          ? 'Store name is missing.'
          : action
            ? `Cannot ${action} store '${storeName}': store not found.`
            : `Store '${storeName}' not found.`,
      );
    return entry;
  }

  /**
   * Advances the `lastGood` baseline to `source`, whole or at a single path, and
   * reconciles the dirty flags that move with it.
   */
  private _updateLastGood(entry: StoreEntry, source: any, path?: string) {
    if (!path) {
      entry.lastGood = clone(source);
      this._reconcileDirty(entry);
      return;
    }

    entry.lastGood = withSlice(entry.lastGood ?? {}, path, source);
    this._reconcileDirty(entry, rootsFor(path));
  }

  /**
   * Applies a response payload to `lastGood` exactly as it was applied to the data,
   * and reconciles the dirty flags that move with it.
   */
  private _patchBaseline(entry: StoreEntry, payload: any, path?: string) {
    // Cloned so the baseline never shares an object or array with the store
    entry.lastGood ??= {};
    applyMergePatch(entry.lastGood, clone(payload), path, entry.data);
    this._reconcileDirty(entry, rootsFor(path));
  }

  /**
   * Recomputes dirty flags against `lastGood`. The only writer of `status.dirty`.
   * Without `roots`, walks every root in the data or the baseline, so a root
   * deleted locally still reads dirty.
   */
  private _reconcileDirty(entry: StoreEntry, roots?: Iterable<string>) {
    const { data, status } = entry;
    const baseline = entry.lastGood ?? {};
    const keys = roots ?? new Set([...Object.keys(data), ...Object.keys(baseline)]);

    for (const key of keys) {
      // Accessors and methods are absent from `lastGood` (clone strips them), so
      // comparing them would mark every getter permanently dirty. A key missing
      // from `data` entirely is a deleted root and must still be compared.
      if (!isOwnDataProp(data, key) && Object.getOwnPropertyDescriptor(data, key)) {
        continue;
      }

      if (deepEqual(data[key], baseline[key])) {
        delete status.dirty[key];
      } else {
        status.dirty[key] = true;
      }
    }
  }

  /** Returns `true` when the data at `path`, or the whole store, differs from `lastGood`. */
  private _isSliceDirty(entry: StoreEntry, path?: string): boolean {
    return !deepEqual(sliceAt(entry.data, path), sliceAt(entry.lastGood, path));
  }

  private _dispatchPatchEvent<E extends StorePatchEvent>(
    entry: StoreEntry,
    eventName: E,
    detail: LifecycleEventMap[E],
    options?: CustomEventInit,
  ): CustomEvent<LifecycleEventMap[E]> {
    const target = entry.el || this.app.root;

    return dispatch(target, eventName, detail as any, options) as CustomEvent<
      LifecycleEventMap[E]
    >;
  }

  /**
   * Internal unified request handler for push and pull operations.
   */
  private async _request(
    storeName: string | null | undefined,
    operation: 'push' | 'pull',
    manualConfig?: StoreRequestOptions,
  ) {
    const entry = this._getStore(storeName);
    if (!entry) return;

    const { data, config, name } = entry;
    const overrides = manualConfig?.overrides ?? {};
    const policy: Partial<SyncPolicy> = config ?? {};
    const { url: policyUrl, headers: policyHeaders, ...transport } = policy;

    const url = manualConfig?.url || overrides.url || policyUrl;

    if (!url) {
      __DEV__ && warn(`Cannot ${operation} store '${name}': URL not configured.`);
      return;
    }

    // Both verbs are prescribed: a push is a merge patch, a pull carries no body.
    const method = operation === 'push' ? 'PATCH' : 'GET';

    const nestedPath = manualConfig?.nestedPath;

    // Layers, later wins: protocol defaults, app config, store policy, programmatic
    // overrides. Headers merge per key so one layer never drops another's keys.
    const requestOptions: FetchRequest = {
      credentials: this.app.config.credentials,
      timeout: this.app.config.timeout,
      ...transport,
      ...overrides,
      headers: {
        ...syncHeaders(operation, name, nestedPath),
        ...this.app.config.headers,
        ...policyHeaders,
        ...overrides.headers,
      },
      method,
      triggerEl: manualConfig?.triggerEl,
      // A key that matched another request's would let that request abort this push
      abortKey:
        operation === 'push'
          ? undefined
          : (overrides.abortKey ?? transport.abortKey ?? `pull_${name}`),
    };

    // The body is the snapshot, not the live store. Serializing the live store later
    // would send edits made after the snapshot, and the values of its getters.
    const snapshot = clone(data);

    if (operation === 'push') {
      const slice = sliceAt(snapshot, nestedPath);

      // A missing slice has nothing to send. Sending a PATCH with no body would still
      // advance the baseline on success, so the store would read as saved.
      if (slice === undefined) {
        __DEV__ &&
          warn(
            `Cannot push '@${name}.${nestedPath}': the store has no value there, and a push can't send a deletion. Push an enclosing path or the whole store to send its current state.`,
          );
        return;
      }

      // Serialized here because a string slice would otherwise be sent as raw text,
      // which isn't valid JSON
      requestOptions.body = JSON.stringify(slice);
    }

    // Request-axis events prefer the trigger element, falling back to the store's
    // own element like the destination axis does. The fallback is deliberate: a
    // store has a home element, unlike a bare fetch, which fires from app.root.
    const firingEl = manualConfig?.triggerEl ?? entry.el ?? this.app.root;

    let outcome: SendOutcome | undefined;

    await runRequestLifecycle({
      el: firingEl,
      root: this.app.root,
      prefix: operation === 'push' ? 'rz:push' : 'rz:pull',
      configDetail: { storeName: name, config: requestOptions, url, method },
      terminalDetail: (result) => ({ storeName: name, result }),
      run: async (handle) => {
        outcome = await this._sendAndApply(
          entry,
          operation,
          url,
          requestOptions,
          snapshot,
          handle,
          manualConfig,
        );
        return outcome.result;
      },
    });

    if (!outcome) return;

    // Sent after `:end`, so listeners never see a follow-up start inside this request.
    // A slice that matches the baseline again has nothing left to send.
    for (const [path, send] of outcome.followUps) {
      if (this._isSliceDirty(entry, path || undefined)) {
        send();
      }
    }

    // A follow-up that started a request has already set `loading`, so the store is
    // still busy and held pushes keep waiting
    if (!entry.status.loading) {
      this._settleIdle(entry);
    }
  }

  /**
   * Sends the request and applies the outcome to the store: rolls back a failed push,
   * otherwise reconciles the response. `snapshot` is the data the request carries,
   * and what the baseline advances to if it succeeds. Tracks the request so a
   * superseded one leaves `loading` alone when it settles. Hands back the pushes
   * dropped while it was in flight when it owned the store and succeeded.
   */
  private async _sendAndApply(
    entry: StoreEntry,
    operation: 'push' | 'pull',
    url: string,
    requestOptions: FetchRequest,
    snapshot: any,
    handle: LifecycleHandle,
    manualConfig?: StoreRequestOptions,
  ): Promise<SendOutcome> {
    const { status } = entry;

    const reqToken = Symbol(__DEV__ ? 'rz.request' : '');
    entry.activeReq = reqToken;

    entry.inFlight = { snapshot, path: manualConfig?.nestedPath };
    status.loading = operation;
    status.error = null;

    let succeeded = false;

    // `finally` fills this after the `return` has built the object, which still
    // reaches the caller because the object holds the array, not a copy
    const followUps: SendOutcome['followUps'] = [];
    const done = (result: RouseResponse): SendOutcome => ({ result, followUps });

    try {
      const result = await request(url, requestOptions, this.app);
      handle.settle(result);

      // A superseded request must not touch store data. Its snapshot is stale, so
      // both the reconcile and the rollback target belong to a request that no
      // longer owns the store. `finally` already leaves `loading` to the winner.
      if (entry.activeReq !== reqToken) {
        return done(result);
      }

      if (result.error) {
        if (result.error.code === 'CANCELED') {
          return done(result);
        }

        status.error = result.error.message;

        if (operation === 'push') {
          this._maybeRollback(entry, snapshot, manualConfig?.nestedPath, result.error);
        }
        return done(result);
      }
      this._applyServerResponse(entry, operation, result, snapshot, manualConfig);
      succeeded = true;
      return done(result);
    } catch (error: any) {
      // If a request throws before returning, listeners would see `:start` then `:end`,
      // without a terminal `:abort`/`:success`/`:error` event in between. So settle
      // here to fulfill the lifecycle contract.
      err(`Store '${entry.name}' ${operation} failed.`, error);

      const fallback = fallbackResponse(
        requestOptions,
        error.message || 'Internal error',
        'INTERNAL_ERROR',
      );

      if (entry.activeReq === reqToken) {
        status.error = fallback.error?.message ?? null;
      }

      handle.settle(fallback);
      return done(fallback);
    } finally {
      if (entry.activeReq === reqToken) {
        status.loading = false;
        entry.activeReq = undefined;
        entry.inFlight = undefined;

        // Pending pushes are taken on any outcome, so a failure discards them rather
        // than leaving them for the next request to send
        const pending = entry.pendingPushes;
        entry.pendingPushes = undefined;
        if (pending && succeeded) {
          followUps.push(...pending);
        }
      }
    }
  }

  private _applyServerResponse(
    entry: StoreEntry,
    operation: 'push' | 'pull',
    result: RouseResponse,
    snapshot: any,
    manualConfig?: StoreRequestOptions,
  ) {
    const { name: storeName, data, status } = entry;

    const nestedPath = manualConfig?.nestedPath;

    // Request-scoped, not response-scoped: a 200 means the data reached the server,
    // so this stands even when the echo below is never applied (mid-flight skip, or
    // a listener cancelling `:before`).
    if (operation === 'push') {
      status.lastSync = Date.now();
      this._updateLastGood(entry, snapshot, nestedPath);
    }

    const beforeEvent = this._dispatchPatchEvent(
      entry,
      'rz:store:patch:before',
      {
        storeName,
        operation,
        data,
        payload: result.data,
        nestedPath,
      },
      { cancelable: true },
    );
    if (beforeEvent.defaultPrevented) return;

    // Whole `result.data`, mutable by listeners (matches the router's deposit path)
    const payload = beforeEvent.detail.payload;

    // Reconcile the response body into the store. On push, how server-owned fields
    // (assigned id, computed/normalized values) return to the client. On pull, the
    // fetched data itself.
    if (payload && typeof payload === 'object') {
      const localSlice = sliceAt(data, nestedPath);

      // Local state moved mid-flight; keep the edit and skip the echo
      if (!deepEqual(localSlice, sliceAt(snapshot, nestedPath))) {
        this._dispatchPatchEvent(entry, 'rz:store:patch:skipped', {
          storeName,
          operation,
          localData: localSlice,
          serverData: sliceAt(payload, nestedPath),
          response: result,
          nestedPath,
        });
        return;
      }

      this._patchPayload(entry, payload, nestedPath);

      // The response is applied to the baseline exactly as it was to the data. Keys
      // it omits keep their baseline, so an unsaved edit there stays unsaved.
      this._patchBaseline(entry, payload, nestedPath);
    }

    if (operation === 'pull') {
      status.lastSync = Date.now();
    }

    this._dispatchPatchEvent(entry, 'rz:store:patch', {
      storeName,
      operation,
      data,
      response: result,
      payload,
      nestedPath,
    });
  }

  /** Applies a response payload to the store's data, as a framework write. */
  private _patchPayload(entry: StoreEntry, payload: any, nestedPath?: string) {
    this._withPatchGuard(
      entry,
      () => applyMergePatch(entry.data, payload, nestedPath),
      rootsFor(nestedPath),
    );
  }

  /**
   * Runs a framework write with dirty tracking suppressed, then reconciles the
   * dirty flags against the baseline, for `roots` or the whole store. Every
   * framework mutation of store data goes through here, so the reconcile cannot
   * be forgotten.
   */
  private _withPatchGuard(entry: StoreEntry, fn: VoidFn, roots?: string[]) {
    this._isPatching = true;
    try {
      fn();
    } finally {
      this._isPatching = false;
      this._reconcileDirty(entry, roots);
    }
  }

  /**
   * Patches the store's data, then makes it the new baseline: both restore targets
   * (`reset()` and rollback) and the dirty flags are refreshed to match.
   */
  private _adoptState(entry: StoreEntry, state: object, action: 'replace' | 'merge') {
    this._withPatchGuard(entry, () => patchState(entry.data, state, action));
    entry.initial = clone(entry.data);
    this._updateLastGood(entry, entry.data);
  }

  /** Writes `value` into the store's data, whole or at `path`, as a framework write. */
  private _writeSlice(entry: StoreEntry, path: string | undefined, value: any) {
    this._withPatchGuard(
      entry,
      () => {
        if (path) {
          setNestedVal(entry.data, path, value);
        } else {
          patchState(entry.data, value, 'replace');
        }
      },
      rootsFor(path),
    );
  }

  private _maybeRollback(
    entry: StoreEntry,
    snapshot: any,
    nestedPath: string | undefined,
    error: unknown,
  ): void {
    const { name: storeName, data, lastGood } = entry;

    // Skip when the user has kept editing during flight
    const localSlice = sliceAt(data, nestedPath);
    if (!deepEqual(localSlice, sliceAt(snapshot, nestedPath))) return;

    // Skip if data already equals lastGood (avoids firing errant signals)
    if (!this._isSliceDirty(entry, nestedPath)) return;

    const rolledBackTo = clone(sliceAt(lastGood, nestedPath));
    this._writeSlice(entry, nestedPath, rolledBackTo);

    this._dispatchPatchEvent(entry, 'rz:store:patch:rollback', {
      storeName,
      operation: 'push',
      data,
      rolledBackTo,
      nestedPath,
      error,
    });
  }

  /**
   * Queues a store for end-of-microtask reconciliation, coalescing a batch of
   * synchronous writes into one dirty recompute and one round of notifications.
   */
  private _scheduleFlush(entry: StoreEntry) {
    const wasEmpty = this._pendingFlush.size === 0;
    this._pendingFlush.add(entry);
    if (!wasEmpty) return;

    queueMicrotask(() => {
      const flushing = [...this._pendingFlush];
      this._pendingFlush.clear();

      for (const pending of flushing) {
        const touched = pending.touched ?? new Set<string>();
        pending.touched = undefined;

        this._reconcileDirty(pending, touched);

        // Reconciling first is what lets the `edit` trigger's dirty guard read a
        // current value from inside its own notification.
        pending.listeners?.forEach((callback) => callback(touched));
      }
    });
  }

  /**
   * Listens for user-driven mutations to the store. Returns a cleanup function.
   *
   * The store must already exist. Stores declared in markup using `<script data-rz-store>`
   * are registered during `start()`, so subscribe after that call rather than before it.
   */
  onEdit(storeName: string | null | undefined, callback: EditListener): VoidFn {
    const entry = this._getStore(storeName);
    if (!entry) {
      return () => {};
    }

    let listeners = entry.listeners;
    if (!listeners) {
      listeners = new Set();
      entry.listeners = listeners;
      // Seed lazy tracker propagation across the initial tree
      if (entry.data) {
        seedPropagation(entry.data);
      }
    }
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0 && entry.listeners === listeners) {
        entry.listeners = undefined;
      }
    };
  }

  /**
   * Yields every `<script data-rz-store>` element registered in the store manager.
   * Used by `app.destroy()` to tear them down.
   *
   * @internal
   */
  *_elements(): Iterable<Element> {
    for (const entry of this._stores.values()) {
      if (entry.el) {
        yield entry.el;
      }
    }
  }

  /**
   * Registers a new store and returns its reactive proxy. `el` is the
   * `<script data-rz-store>` it was declared on, passed by `rz-store` only. The
   * public spelling is `app.store()`.
   *
   * @internal
   */
  _create<T extends object = any>(
    storeName: string,
    state: T,
    config?: Partial<SyncPolicy>,
    el?: Element,
  ): T {
    if (this._stores.has(storeName)) {
      fail(`A store named '${storeName}' already exists.`);
    }

    const entry = this._register(storeName, state, config, el);
    this._updateLastGood(entry, state);

    return entry.data;
  }

  /**
   * Replaces the store's data, then clears dirty flags and refreshes both
   * snapshots: the one `reset()` restores to, and the last-good state a failed push
   * rolls back to. To change the store's sync configuration, use `config()`.
   */
  update<T extends object = any>(storeName: string | null | undefined, state: object): T {
    const entry = this._find(storeName);
    if (!entry) {
      fail(storeName ? `Store '${storeName}' does not exist.` : 'Store name is missing.');
    }

    __DEV__ && warnNullFields(entry.name, state);

    this._adoptState(entry, state, 'replace');

    return entry.data;
  }

  /**
   * Writes a payload into a store as a JSON Merge Patch, the way a fetch response
   * or a stream message routed by `data-rz-deposit="@store"` does. Fires the same
   * events a push or pull fires, so a listener sees one shape whatever produced
   * the payload.
   *
   * @returns `false` if the store does not exist or a listener canceled the patch.
   */
  deposit(
    storeName: string | null | undefined,
    payload: object,
    options?: { response?: RouseResponse; operation?: 'fetch' | 'sse' },
  ): boolean {
    const entry = this._getStore(storeName);
    if (!entry) {
      return false;
    }

    const { data, name } = entry;
    const response = options?.response;
    const operation = options?.operation ?? 'fetch';

    const beforeEvent = this._dispatchPatchEvent(
      entry,
      'rz:store:patch:before',
      { storeName: name, operation, data, payload },
      { cancelable: true },
    );

    if (beforeEvent.defaultPrevented) {
      return false;
    }

    const applied = beforeEvent.detail.payload as object;

    this._adoptState(entry, applied, 'merge');
    entry.status.lastSync = Date.now();

    this._dispatchPatchEvent(entry, 'rz:store:patch', {
      storeName: name,
      operation,
      data,
      payload: applied,
      response,
    });

    return true;
  }

  /**
   * Returns the reactive proxy for a store, or `undefined`.
   */
  get<T extends object = any>(storeName: string | null | undefined): T | undefined {
    return this._find(storeName)?.data;
  }

  /**
   * Returns a deep-cloned non-reactive copy of the store's current data.
   */
  snapshot<T = any>(storeName: string | null | undefined): T | undefined {
    const data = this._find(storeName)?.data;
    return data ? clone(data) : undefined;
  }

  /**
   * Returns a copy of the last synced state: what a push or pull last confirmed,
   * or what `commit()`, `update()`, or `deposit()` last asserted. This is the
   * reference point for unsaved changes and the target a failed push rolls back
   * to. Non-reactive, like `snapshot()`.
   */
  baseline<T = any>(storeName: string | null | undefined): T | undefined {
    const lastGood = this._find(storeName)?.lastGood;
    return lastGood ? clone(lastGood) : undefined;
  }

  /**
   * Returns `true` if a store with the provided name exists.
   */
  has(storeName: string | null | undefined): boolean {
    return this._find(storeName) !== undefined;
  }

  /**
   * Returns the status object for a store, or `undefined`. Available store
   * status properties are `loading`, `error`, `lastSync`, and `dirty`.
   */
  status(storeName: string | null | undefined): StoreStatus | undefined {
    return this._find(storeName)?.status;
  }

  /**
   * Returns `true` when the store has unsaved changes. Pass a dot path to ask
   * about a single field or branch instead of the whole store.
   *
   * Without a path the answer comes from the store's status, which updates a
   * microtask after an edit. With a path the comparison runs on the spot.
   */
  isDirty(storeName: string | null | undefined, path?: string): boolean {
    const entry = this._getStore(storeName);
    if (!entry) {
      return false;
    }

    if (!path) {
      return Object.keys(entry.status.dirty).length > 0;
    }

    return this._isSliceDirty(entry, path);
  }

  /**
   * Patches `SyncPolicy` for a store. Warns if the store is missing.
   */
  config(storeName: string | null | undefined, config: Partial<SyncPolicy>) {
    const entry = this._getStore(storeName, 'configure');
    if (!entry) return;

    this._setConfig(entry, config);
  }

  /**
   * Sends the store's data to the server, the whole store or the slice at `nestedPath`.
   *
   * If the store already has a request in flight, the push waits for it, and once that
   * request succeeds, it's sent if the data still differs from what the server holds.
   * The promise resolves when the push's request finishes or, if it had to wait, once
   * the store has nothing in flight and nothing left to send. It never rejects: read
   * `status(name).error` to see whether a push failed.
   */
  async push(
    storeName: string | null | undefined,
    config?: StoreRequestOptions,
  ): Promise<void> {
    __DEV__ &&
      config?.overrides?.abortKey &&
      warn(
        `Store '${storeName}': abortKey is ignored on a push. A store sends one push at a time, so there is nothing to abort.`,
      );

    return this._push(storeName, config);
  }

  /** `push()` without the call-site warning, so a held push's follow-up doesn't repeat it. */
  private _push(
    storeName: string | null | undefined,
    config?: StoreRequestOptions,
  ): Promise<void> {
    const entry = this._find(storeName);

    if (entry?.status.loading) {
      this._deferPush(storeName, config?.nestedPath, () => this._push(storeName, config));
      return this._whenIdle(entry);
    }
    return this._request(storeName, 'push', config);
  }

  /**
   * Holds a push made while the store has a request in flight, to send once that
   * request succeeds, unless it brings nothing the request isn't already carrying.
   * A later push for the same slice replaces it.
   *
   * @internal
   */
  _deferPush(
    storeName: string | null | undefined,
    nestedPath: string | undefined,
    send: VoidFn,
  ): void {
    const entry = this._find(storeName);
    const flight = entry?.inFlight;
    if (!entry || !flight) return;

    if (
      deepEqual(
        sliceAt(entry.data, nestedPath),
        sliceAt(this._expectedBaseline(entry, flight), nestedPath),
      )
    ) {
      return;
    }

    entry.pendingPushes ??= new Map();
    entry.pendingPushes.set(nestedPath ?? '', send);
  }

  /** Returns a promise that settles once the store has nothing in flight and nothing left to send. */
  private _whenIdle(entry: StoreEntry): Promise<void> {
    if (!entry.idle) {
      let resolve!: VoidFn;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      entry.idle = { promise, resolve };
    }
    return entry.idle.promise;
  }

  /** Settles held `push()` calls. */
  private _settleIdle(entry: StoreEntry) {
    entry.idle?.resolve();
    entry.idle = undefined;
  }

  /** Returns what the server will hold if the request in flight succeeds. */
  private _expectedBaseline(entry: StoreEntry, flight: InFlight) {
    // A pull saves nothing, so the server keeps what it had
    if (entry.status.loading !== 'push') {
      return entry.lastGood;
    }

    // A slice push changes only its slice
    return flight.path
      ? withSlice(clone(entry.lastGood ?? {}), flight.path, flight.snapshot)
      : flight.snapshot;
  }

  /**
   * Pulls fresh store data from the server, unless a push is currently in flight.
   */
  async pull(
    storeName: string | null | undefined,
    config?: StoreRequestOptions,
  ): Promise<void> {
    if (this.status(storeName)?.loading === 'push') return;
    return this._request(storeName, 'pull', config);
  }

  /**
   * Restores the store to its initial state, and makes that the new baseline,
   * so nothing reads as dirty afterward.
   *
   * To restore the last state the server confirmed instead, use `revert()`.
   */
  reset(storeName: string | null | undefined) {
    const entry = this._getStore(storeName, 'reset');
    if (!entry) return;

    const { data, initial } = entry;

    this._withPatchGuard(entry, () => patchState(data, clone(initial), 'replace'));
    this._updateLastGood(entry, data);
  }

  /**
   * Discards unsaved changes, restoring the store to the last synced state, which
   * `baseline()` returns. Pass a dot path to revert a single field or branch
   * instead of the whole store. Returns `true` if anything changed.
   *
   * To restore the state the store started with, use `reset()`.
   */
  revert(storeName: string | null | undefined, path?: string): boolean {
    const entry = this._getStore(storeName, 'revert');
    if (!entry) return false;

    if (!this._isSliceDirty(entry, path)) {
      return false;
    }

    this._writeSlice(entry, path, clone(sliceAt(entry.lastGood, path)));
    return true;
  }

  /**
   * Marks the store's current data as the new baseline, so nothing reads as dirty.
   * Does not send anything to the server. Use it when state reached the server by
   * some means Rouse did not perform, such as a native form submit or a socket
   * acknowledgement.
   */
  commit(storeName: string | null | undefined) {
    const entry = this._getStore(storeName, 'commit');
    if (!entry) return;

    this._updateLastGood(entry, entry.data);
  }

  /**
   * Drops all per-store state from the manager. Existing references to the proxy
   * keep working but desync. Intended for tear-down of dynamically-created stores.
   */
  remove(storeName: string | null | undefined) {
    const entry = this._find(storeName);
    if (!entry) return;

    // A held `push()` would otherwise wait on a store that no longer exists, and a
    // follow-up would reach whatever store is registered under the name next
    this._settleIdle(entry);
    entry.pendingPushes = undefined;
    this._pendingFlush.delete(entry);
    this._stores.delete(entry.name);
  }
}
