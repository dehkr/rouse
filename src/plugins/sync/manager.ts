/*
 * `lastGood` is what Rouse believes the server holds, so `commit()` and `update()` may
 * set it without a round trip. On the sync path it moves only by what reached the
 * server: a push's snapshot, then the response as the server sent it. Never copy
 * `data` into it there. On a 204 that saves a mid-flight edit and cancels its
 * follow-up, and after a pull it marks unsaved edits in omitted keys as saved. A
 * deposit follows the same rule. Never patch it with the payload an
 * `rz:store:patch:before` listener returns: a key the listener rewrites or removes
 * must read dirty while the store and the server differ.
 *
 * Every dirty read, in HTML or JS, comes from `status.dirtyRoots` and `status.dirty`.
 * Don't give a JS read its own live comparison against `lastGood`.
 *
 * A failed push changes no data. Don't reintroduce an automatic rollback: rolling
 * back is the author's `revert()` from an `rz:push:error` listener.
 *
 * A new path that writes a response into an entry must check `_isRegistered`, and
 * every `rz:store:patch:*` dispatch goes through `StoreManager`.
 *
 * Sync state lives on the store's entry, typed here as `SyncEntry`. Core's
 * `StoreEntry` doesn't declare it, and only this plugin reads or writes it, through
 * the store hooks and the methods `install` assigns to `app.stores`.
 *
 * Conflict handling beyond the mid-flight guard is application policy, through
 * `rz:store:patch:before`. Don't add it here.
 */
import type { RouseApp } from '../../app';
import { err, fail, warn } from '../../core/diagnostics';
import type { LifecycleHandle } from '../../net/lifecycle';
import type { StoreEntry, StoreHooks, StoreManager } from '../../store';
import type { RequestError, ResolvedRequest, RouseResponse, VoidFn } from '../../types';
import { core } from '../core';
import { deepEqual } from './equal';
import type { StoreStatus, SyncPolicy, SyncRequest } from './types';

/** What a settled request hands back to `_request`. */
interface SendOutcome {
  result: RouseResponse;
  /** The push held while the request was in flight, if it succeeded. */
  followUp?: VoidFn;
}

/** The request that owns a store while it's in flight. */
interface InFlight {
  /** The data the request started from. */
  snapshot: any;
}

/**
 * Returns the nested slice at `path`, or the whole object when no path is given.
 */
function sliceAt(obj: any, path?: string) {
  return path ? core.getNestedVal(obj, path) : obj;
}

/** Copies the fields a store's status exposes from a request error. Replaced whole, never mutated. */
function storeError(error: RequestError | null): StoreStatus['error'] {
  return error && { code: error.code, message: error.message };
}

/**
 * Returns the roots a response patch can change: the keys of the payload as listeners
 * received it, and of the payload they returned.
 */
function patchedRoots(received: object, applied: object): Set<string> {
  return new Set([...Object.keys(received), ...Object.keys(applied)]);
}

/** Returns `true` for a payload that can patch a store: any non-null object. */
function isPatch(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/** The one root a path-level write can change, or `undefined` for the whole store. */
function rootsFor(path?: string): string[] | undefined {
  return path ? [core.getPathRoot(path) as string] : undefined;
}

/** Rejects a persisted store with an endpoint: both would claim its state on load. */
function failPersistUrl(storeName: string): never {
  fail(`Store '${storeName}' cannot combine 'persist' and 'url'.`);
}

/** A store entry with the sync state the `created` hook adds to it. */
export interface SyncEntry extends StoreEntry {
  status: StoreStatus;
  config?: SyncPolicy;
  lastGood?: any;
  /** The owning request, while it's in flight. A newer request replaces it. */
  inFlight?: InFlight;
  /** The push held while a request was in flight. A later one replaces it. */
  pendingPush?: VoidFn;
  /** Settles held `push()` calls once the store has nothing in flight and nothing left to send. */
  idle?: PromiseWithResolvers<void>;
}

const syncs = new WeakMap<StoreManager, StoreSync>();

/** Returns the store sync installed in `app`. Only called from code the plugin mounted. */
export function syncFor(app: RouseApp): StoreSync {
  return syncs.get(app.stores)!;
}

/** One app's store sync: the hooks that track sync state, and the methods on `app.stores`. */
export class StoreSync {
  private app: RouseApp;
  private stores: StoreManager;

  constructor(app: RouseApp) {
    this.app = app;
    this.stores = app.stores;
    syncs.set(app.stores, this);
  }

  private _find(storeName: string | null | undefined) {
    return this.stores._find(storeName) as SyncEntry | undefined;
  }

  private _getStore(storeName: string | null | undefined, action?: string) {
    return this.stores._getStore(storeName, action) as SyncEntry | undefined;
  }

  /** The store hooks that keep sync state current. */
  hooks(): StoreHooks {
    return {
      created: (stored, policy, persisted) => {
        const entry = stored as SyncEntry;
        if (persisted && policy?.url) {
          failPersistUrl(entry.name);
        }

        entry.status = core.reactive({
          syncing: false,
          error: null,
          lastSync: 0,
          dirty: false,
          dirtyRoots: {},
        });

        if (policy) {
          this._setConfig(entry, policy);
        }
        this._updateLastGood(entry, entry.data);
      },
      redeclared: (stored, policy) => {
        const entry = stored as SyncEntry;
        // Update url and headers config defined on the <script>. Options that can only
        // be set via JS are untouched.
        const config: SyncPolicy = { ...entry.config, url: policy.url ?? '' };
        if (policy.headers) {
          config.headers = policy.headers;
        } else {
          delete config.headers;
        }
        entry.config = config;
      },
      // The baseline is cloned from the patched data rather than the new state, so it
      // matches what the store holds after the write
      reseeded: (entry) => this._updateLastGood(entry as SyncEntry, entry.data),
      patched: (entry, roots) => this._reconcileDirty(entry as SyncEntry, roots),
      deposited: (stored, received, applied) => {
        const entry = stored as SyncEntry;
        this._patchBaseline(entry, received);
        this._reconcileDirty(entry, patchedRoots(received, applied));
        entry.status.lastSync = Date.now();
      },
      // Reconciled before the edit listeners run, so a debounced push reads a current
      // dirty status from inside its own notification
      edited: (entry, roots) => this._reconcileDirty(entry as SyncEntry, roots),
      removed: (stored) => {
        const entry = stored as SyncEntry;
        // A held `push()` would otherwise wait on a store that no longer exists, and a
        // follow-up would reach whatever store is registered under the name next
        this._settleIdle(entry);
        entry.pendingPush = undefined;
      },
    };
  }

  /** Replaces the policy object. Nothing in it is reactive, so there's no `@name::config`. */
  private _setConfig(entry: SyncEntry, partial?: Partial<SyncPolicy>) {
    entry.config = { url: '', ...entry.config, ...partial };
  }

  /**
   * Returns the store's element while it's on the page. A sync started from a detached
   * `<script data-rz-store>` treats the store as having no element.
   */
  private _elementOf(entry: SyncEntry): Element | undefined {
    return entry.el?.isConnected ? entry.el : undefined;
  }

  /**
   * Advances the `lastGood` baseline to `source` and reconciles the dirty flags
   * that move with it.
   */
  private _updateLastGood(entry: SyncEntry, source: any) {
    entry.lastGood = core.clone(source);
    this._reconcileDirty(entry);
  }

  /**
   * Merges a payload into `lastGood` the way a response merges into the data. The
   * caller reconciles the payload's roots once both sides hold it.
   *
   * `payload` must be a copy nothing else holds. A baseline sharing an object or array
   * with the store would change with every edit through the proxy and never read dirty.
   */
  private _patchBaseline(entry: SyncEntry, payload: object) {
    // The live data is the shape, so a key that's a getter on the store isn't stored as
    // data, where a nested one would read dirty forever
    entry.lastGood ??= {};
    core.patchState(entry.lastGood, payload, 'merge', entry.data);
  }

  /**
   * Recomputes the dirty status against `lastGood`. The only writer of
   * `status.dirtyRoots` and `status.dirty`. Without `roots`, walks every root in
   * the data, the baseline, or the current dirty set. A root deleted locally still
   * reads dirty, and a root the server deleted from both sides is cleared.
   */
  private _reconcileDirty(entry: SyncEntry, roots?: Iterable<string>) {
    const { data, status } = entry;
    const baseline = entry.lastGood ?? {};
    const keys =
      roots ??
      new Set([
        ...Object.keys(data),
        ...Object.keys(baseline),
        ...Object.keys(status.dirtyRoots),
      ]);

    core.batch(() => {
      for (const key of keys) {
        // Accessors and methods are absent from `lastGood` (clone strips them), so
        // comparing them would mark every getter permanently dirty. A key missing
        // from `data` entirely is a deleted root and must still be compared.
        if (core.hasAccessor(data, key)) {
          continue;
        }

        if (deepEqual(data[key], baseline[key])) {
          delete status.dirtyRoots[key];
        } else {
          status.dirtyRoots[key] = true;
        }
      }

      status.dirty = Object.keys(status.dirtyRoots).length > 0;
    });
  }

  /** Returns `true` when the data at `path`, or the whole store, differs from `lastGood`. */
  private _isSliceDirty(entry: SyncEntry, path?: string): boolean {
    return !deepEqual(sliceAt(entry.data, path), sliceAt(entry.lastGood, path));
  }

  /**
   * Internal unified request handler for push and pull operations.
   */
  private async _request(
    storeName: string | null | undefined,
    operation: 'push' | 'pull',
    options: SyncRequest = {},
  ) {
    const entry = this._getStore(storeName);
    if (!entry) {
      return;
    }

    const { data, config, name } = entry;
    const policy: Partial<SyncPolicy> = config ?? {};
    const { url: policyUrl, headers: policyHeaders, ...transport } = policy;

    const endpoint = options.url || policyUrl;

    if (!endpoint) {
      if (__DEV__) {
        warn(`Cannot ${operation} store '${name}': URL not configured.`);
      }
      return;
    }

    // Resolved before `:config`, so listeners and interceptors see the URL that's sent.
    // An unparseable URL would reject `push()` and `pull()`, which promise not to, so
    // it's recorded as the store's error instead. No request events fire for it.
    let url: string;
    try {
      url = core.resolveUrl(endpoint, this.app.config.baseUrl).href;
    } catch (error: any) {
      err(`Store '${name}' ${operation} failed.`, error);
      entry.status.error = storeError({
        code: 'INTERNAL_ERROR',
        message: error.message || 'Internal error',
      });
      return;
    }

    // Both verbs are prescribed: a push is a JSON Merge Patch (RFC 7396), a pull
    // carries no body. The method and URL identify the sync, so no header repeats them.
    const method = operation === 'push' ? 'PATCH' : 'GET';
    const protocolHeaders: Record<string, string> =
      operation === 'push' ? { 'Content-Type': 'application/merge-patch+json' } : {};

    // Layers, later wins: protocol defaults, app config, store policy, per-call
    // options. Headers merge per key so one layer never drops another's keys.
    const requestOptions: ResolvedRequest = {
      credentials: this.app.config.credentials,
      timeout: this.app.config.timeout,
      ...transport,
      ...options,
      url,
      headers: {
        ...protocolHeaders,
        ...this.app.config.headers,
        ...policyHeaders,
        ...options.headers,
      },
      method,
      triggerEl: options.triggerEl,
      // A key that matched another request's would let that request abort this push
      abortKey:
        operation === 'push'
          ? undefined
          : (options.abortKey ?? transport.abortKey ?? `pull_${name}`),
    };

    // The body is the snapshot, not the live store. Serializing the live store later
    // would send edits made after the snapshot, and the values of its getters. Listeners
    // and interceptors see it as a JSON string; editing it sends something other than
    // what the baseline advances to.
    const snapshot = core.clone(data);

    if (operation === 'push') {
      requestOptions.body = JSON.stringify(snapshot);
    }

    // Request-axis events prefer the trigger element, falling back to the store's
    // own element like the destination axis does. The fallback is deliberate: a
    // store has a home element, unlike a bare fetch, which fires from app.root.
    const storeEl = this._elementOf(entry);
    const firingEl = options.triggerEl ?? storeEl ?? this.app.root;

    // A store created in JS, or one whose <script> element was removed, doesn't have an
    // element on the page, so a programmatic sync fires its events from the app root. If left
    // unset, the in-flight indicator would default to it as well, marking the whole app busy.
    if (!options.triggerEl && !storeEl && requestOptions.indicator === undefined) {
      requestOptions.indicator = null;
    }

    let outcome: SendOutcome | undefined;

    await core.runRequestLifecycle({
      el: firingEl,
      root: this.app.root,
      prefix: operation === 'push' ? 'rz:push' : 'rz:pull',
      configDetail: { storeName: name, config: requestOptions },
      terminalDetail: (result) => ({ storeName: name, result }),
      run: async (handle) => {
        outcome = await this._sendAndApply(
          entry,
          operation,
          requestOptions,
          snapshot,
          handle,
        );
        return outcome.result;
      },
    });

    if (!outcome) {
      return;
    }

    // Sent after `:end`, so listeners never see a follow-up start inside this request.
    // A store that matches the baseline again has nothing left to send. Compared live,
    // since the dirty status lags a microtask.
    if (outcome.followUp && this._isSliceDirty(entry)) {
      outcome.followUp();
    }

    // A follow-up that started a request has already set `syncing`, so the store is
    // still busy and held pushes keep waiting
    if (!entry.status.syncing) {
      this._settleIdle(entry);
    }
  }

  /**
   * Sends the request and applies the outcome to the store: records a failure in
   * `status.error`, leaving the data alone, or reconciles the response.
   *
   * `snapshot` is the data the request carries, and what the baseline advances to if it
   * succeeds. Tracks the request so a superseded one leaves `syncing` alone when it settles.
   * Hands back the push held while it was in flight when it owned the store and succeeded.
   */
  private async _sendAndApply(
    entry: SyncEntry,
    operation: 'push' | 'pull',
    requestOptions: ResolvedRequest,
    snapshot: any,
    handle: LifecycleHandle,
  ): Promise<SendOutcome> {
    const { status } = entry;

    // A newer request replaces this object, so this one checks it to see whether it
    // still owns the store
    const flight: InFlight = { snapshot };
    entry.inFlight = flight;
    core.batch(() => {
      status.syncing = operation;
      status.error = null;
    });

    let succeeded = false;

    // `finally` sets the follow-up after the `return` has handed this back, which
    // still reaches the caller because it's the same object
    const outcome = {} as SendOutcome;
    const done = (result: RouseResponse) => Object.assign(outcome, { result });

    try {
      const result = await core.request(requestOptions, this.app);
      handle.settle(result);

      // A superseded request must not touch the store. Its snapshot is stale, and
      // its error belongs to a request that no longer owns the store. `finally`
      // already leaves `syncing` to the winner. A removed store is checked here
      // rather than in `remove()`, so a removal from a `:config` or `:start`
      // listener is caught too.
      if (entry.inFlight !== flight || !this.stores._isRegistered(entry)) {
        return done(result);
      }

      if (result.error) {
        if (result.error.code !== 'CANCELED') {
          status.error = storeError(result.error);
        }
        return done(result);
      }

      this._applyServerResponse(entry, operation, result, snapshot);
      succeeded = true;
      return done(result);
    } catch (error: any) {
      // If a request throws before returning, listeners would see `:start` then `:end`,
      // without a terminal `:abort`/`:success`/`:error` event in between. So settle
      // here to fulfill the lifecycle contract.
      err(`Store '${entry.name}' ${operation} failed.`, error);

      const fallback = core.fallbackResponse(
        requestOptions,
        error.message || 'Internal error',
        'INTERNAL_ERROR',
      );

      if (entry.inFlight === flight) {
        status.error = storeError(fallback.error);
      }

      handle.settle(fallback);
      return done(fallback);
    } finally {
      if (entry.inFlight === flight) {
        status.syncing = false;
        entry.inFlight = undefined;

        // The pending push is taken on any outcome, so a failure discards it rather
        // than leaving it for the next request to send
        const pending = entry.pendingPush;
        entry.pendingPush = undefined;
        if (succeeded) {
          outcome.followUp = pending;
        }
      }
    }
  }

  private _applyServerResponse(
    entry: SyncEntry,
    operation: 'push' | 'pull',
    result: RouseResponse,
    snapshot: any,
  ) {
    const { name: storeName, data, status } = entry;

    // Request-scoped, not response-scoped: a 200 means the data reached the server,
    // so this stands even when the echo below is never applied (mid-flight skip, or
    // a listener cancelling `:before`).
    if (operation === 'push') {
      core.batch(() => {
        status.lastSync = Date.now();
        this._updateLastGood(entry, snapshot);
      });
    }

    // Copied before dispatch, since listeners can edit the payload in place
    const received = isPatch(result.data) ? core.clone(result.data) : {};

    const beforeEvent = this.stores._dispatchPatchEvent(
      entry,
      'rz:store:patch:before',
      { storeName, operation, data, payload: result.data },
      { cancelable: true },
    );
    if (beforeEvent.defaultPrevented) {
      return;
    }

    // Whole `result.data`, mutable by listeners (matches the router's deposit path)
    const payload = beforeEvent.detail.payload;
    const hasBody = isPatch(payload);

    // Local state moved mid-flight; keep the edit and skip the echo
    if (hasBody && !deepEqual(data, snapshot)) {
      this.stores._dispatchPatchEvent(entry, 'rz:store:patch:skipped', {
        storeName,
        operation,
        localData: data,
        serverData: payload,
        response: result,
      });
      return;
    }

    core.batch(() => {
      // Merges server-owned fields (assigned IDs, normalized values) on push, or
      // hydrates fetched state on pull. The baseline takes what the server sent, and the
      // store takes what listeners return. Omitted keys keep their dirty state. The
      // baseline is patched first, so the data patch's `patched` hook sees both sides.
      const applied = hasBody ? payload : {};
      const roots = patchedRoots(received, applied);
      if (roots.size) {
        this._patchBaseline(entry, received);
        this.stores._withPatchGuard(
          entry,
          () => core.patchState(entry.data, applied, 'merge'),
          roots,
        );
      }

      if (operation === 'pull') {
        status.lastSync = Date.now();
      }
    });

    this.stores._dispatchPatchEvent(entry, 'rz:store:patch', {
      storeName,
      operation,
      data,
      response: result,
      payload,
    });
  }

  /**
   * Returns a copy of the last synced state: what a push or pull last confirmed,
   * or what `commit()`, `update()`, or `deposit()` last asserted. This is the
   * reference point for unsaved changes and what `revert()` restores. Non-reactive,
   * like `snapshot()`.
   */
  baseline<T = any>(storeName: string | null | undefined): T | undefined {
    const lastGood = this._find(storeName)?.lastGood;
    return lastGood ? core.clone(lastGood) : undefined;
  }

  /**
   * Returns the status object for a store, or `undefined`. Available store
   * status properties are `syncing`, `error`, `lastSync`, `dirty`, and `dirtyRoots`.
   */
  status(storeName: string | null | undefined): StoreStatus | undefined {
    return this._find(storeName)?.status;
  }

  /**
   * Returns `true` when the store has unsaved changes. Pass a root key to ask
   * about that key alone, the same question `@name::status.dirtyRoots.key` answers
   * in HTML.
   *
   * The answer comes from the store's status, which updates a microtask after an
   * edit.
   */
  isDirty(storeName: string | null | undefined, root?: string): boolean {
    const entry = this._getStore(storeName);
    if (!entry) {
      return false;
    }
    if (!root) {
      return entry.status.dirty;
    }

    // A path is checked as its root, which can only over-report. That's safer than a
    // `false` that reads as no unsaved changes.
    const key = core.getPathRoot(root) as string;
    if (__DEV__ && key !== root) {
      warn(
        `Store '${storeName}': isDirty() takes a root key, not a path. Checking '${key}' for '${root}'.`,
      );
    }

    return entry.status.dirtyRoots[key] === true;
  }

  /**
   * Patches `SyncPolicy` for a store. Warns if the store is missing.
   */
  config(storeName: string | null | undefined, config: Partial<SyncPolicy>) {
    const entry = this._getStore(storeName, 'configure');
    if (!entry) {
      return;
    }
    if (entry.stopSaving && config.url) {
      failPersistUrl(entry.name);
    }

    this._setConfig(entry, config);
  }

  /**
   * Sends the store's data to the server.
   *
   * If the store already has a request in flight, the push waits for it, and once that
   * request succeeds, it's sent if the data still differs from what the server holds.
   * The promise resolves when the push's request finishes or, if it had to wait, once
   * the store has nothing in flight and nothing left to send. It never rejects: read
   * `status(name).error` to see whether a push failed.
   *
   * Options apply to this push only and take precedence over the store's own config,
   * for example `push('user', { indicator: '#save', timeout: 5000 })`. A push is
   * always a `PATCH` carrying the whole store, so there is no `method` or `body`.
   */
  async push(storeName: string | null | undefined, options?: SyncRequest): Promise<void> {
    if (__DEV__ && options?.abortKey) {
      warn(
        `Store '${storeName}': abortKey is ignored on a push. A store sends one push at a time, so nothing can replace it. Cancel a push with 'signal'.`,
      );
    }

    return this._push(storeName, options);
  }

  /** `push()` without the call-site warning, so a held push's follow-up doesn't repeat it. */
  private _push(
    storeName: string | null | undefined,
    options?: SyncRequest,
  ): Promise<void> {
    const entry = this._find(storeName);

    if (entry?.status.syncing) {
      this.deferPush(storeName, () => this._push(storeName, options));
      return this._whenIdle(entry);
    }
    return this._request(storeName, 'push', options);
  }

  /**
   * Holds a push made while the store has a request in flight, to send once that
   * request succeeds, unless it brings nothing the request isn't already carrying.
   * A later push replaces it.
   */
  deferPush(storeName: string | null | undefined, send: VoidFn): void {
    const entry = this._find(storeName);
    const flight = entry?.inFlight;
    if (!entry || !flight) {
      return;
    }

    // Without this check, a remembered second click would send an edit made after it
    if (deepEqual(entry.data, this._expectedBaseline(entry, flight))) {
      return;
    }

    entry.pendingPush = send;
  }

  /** Returns a promise that settles once the store has nothing in flight and nothing left to send. */
  private _whenIdle(entry: SyncEntry): Promise<void> {
    entry.idle ??= Promise.withResolvers<void>();
    return entry.idle.promise;
  }

  /** Settles held `push()` calls. */
  private _settleIdle(entry: SyncEntry) {
    entry.idle?.resolve();
    entry.idle = undefined;
  }

  /** Returns what the server will hold if the request in flight succeeds. */
  private _expectedBaseline(entry: SyncEntry, flight: InFlight) {
    // A pull saves nothing, so the server keeps what it had. Its snapshot would be
    // wrong here: an edit made before the pull is in it but not on the server.
    return entry.status.syncing === 'push' ? flight.snapshot : entry.lastGood;
  }

  /**
   * Pulls fresh store data from the server, unless a push is currently in flight.
   *
   * Options apply to this pull only and take precedence over the store's own config.
   * Pass `url` to pull from somewhere other than the store's endpoint:
   * `pull('user', { url: '/api/user?fields=name' })`.
   */
  async pull(storeName: string | null | undefined, options?: SyncRequest): Promise<void> {
    if (this.status(storeName)?.syncing === 'push') {
      return;
    }
    return this._request(storeName, 'pull', options);
  }

  /**
   * Discards unsaved changes, restoring the store to the last synced state, which
   * `baseline()` returns. Pass a dot path to revert a single field or branch
   * instead of the whole store. Returns `true` if anything changed.
   */
  revert(storeName: string | null | undefined, path?: string): boolean {
    const entry = this._getStore(storeName, 'revert');
    if (!entry) {
      return false;
    }
    if (!this._isSliceDirty(entry, path)) {
      return false;
    }

    const value = core.clone(sliceAt(entry.lastGood, path));
    this.stores._withPatchGuard(
      entry,
      () => {
        if (path) {
          core.setNestedVal(entry.data, path, value);
        } else {
          core.patchState(entry.data, value, 'replace');
        }
      },
      rootsFor(path),
    );
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
    if (!entry) {
      return;
    }

    this._updateLastGood(entry, entry.data);
  }
}
