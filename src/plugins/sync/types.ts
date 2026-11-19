import type { BaseRequestConfig, RequestError } from '../../types';

/**
 * The authoring surface for a store push or pull. A push body is the store's own data
 * and a pull carries none, so `body` is absent by design. `method` is absent too: a
 * push is always `PATCH` (RFC 7396 merge patch), and a pull always `GET`.
 */
export type SyncRequest = Omit<RequestInit, 'body' | 'headers' | 'method'> &
  BaseRequestConfig;

/**
 * A store's sync status. Read it with `app.stores.status(name)` in JavaScript,
 * or as `@name::status` in a directive, for example
 * `data-rz-prop="disabled: @cart::status.syncing"`. Every property updates
 * reactively, and none of them can be written from HTML.
 */
export interface StoreStatus {
  /** `'push'` or `'pull'` while that operation is in progress, `false` when idle. */
  syncing: false | 'push' | 'pull';
  /** Why the last push or pull failed, or `null`. Cleared when the next one starts. */
  error: Pick<RequestError, 'code' | 'message'> | null;
  /** When the store last took in data from the server, in milliseconds, or `0`. */
  lastSync: number;
  /** `true` when the store holds changes the server hasn't confirmed. */
  dirty: boolean;
  /** The roots whose values differ from what the server has. */
  dirtyRoots: Record<string, true>;
}

/**
 * A store's standing sync policy, applied to every push and pull. A store script seeds
 * it when it declares the store, and replaces `url` and `headers` when it re-declares it.
 *
 * `indicator` is deliberately absent: it belongs to the trigger, not the store. A
 * store has many triggers, and `resolveIndicators` takes a single value, so a
 * policy-level indicator would silently override every trigger's `rz-indicator`.
 */
export interface SyncPolicy extends Omit<SyncRequest, 'url' | 'indicator'> {
  /** Endpoint for push and pull. */
  url: string;
}
