import type { RouseApp } from '../core/app';
import { directiveSelector, getDirectiveValue } from '../core/attributes';
import { err, warn } from '../core/diagnostics';
import { parseStoreValue } from '../core/parser';
import { isPlainObject } from '../core/state';
import type { SyncPolicy } from '../core/store';
import type { StandaloneDirective } from '../types';
import { rzHeaders } from './rz-headers';

const initialized = new WeakSet<HTMLScriptElement>();

/**
 * Bootstraps a global reactive store from a `<script>` tag. Initializes the reactive
 * data registry and seeds the store's URL from the endpoint, if present.
 *
 * Push/pull triggers (`rz-push`, `rz-pull`) are wired separately, so the store doesn't
 * need to know about them.
 *
 * @example
 * <script data-rz-store="user: /api/user" type="application/json">
 */
function initialize(el: HTMLScriptElement, app: RouseApp) {
  if (initialized.has(el)) return;

  const parsed = parseStoreValue(getDirectiveValue(el, 'store'));
  if (!parsed) {
    __DEV__ && warn(`rz-store: value is missing or empty.`, el);
    return;
  }

  const { name: storeName, url } = parsed;

  const textContent = el.textContent?.trim();

  // Errors below log in production since a rejected store leaves its bindings
  // empty with no explanation.
  let state: object | undefined;
  if (textContent) {
    try {
      state = JSON.parse(textContent);
    } catch (error) {
      err(`rz-store: invalid JSON in store '${storeName}'.`, el, error);
      return;
    }
    if (!isPlainObject(state)) {
      err(`rz-store: store '${storeName}' must be a JSON object.`, el);
      return;
    }
  }

  const declared: Pick<Partial<SyncPolicy>, 'url' | 'headers'> = {};
  const headers = rzHeaders.getConfig(el);

  if (url) {
    declared.url = url;
  }

  if (Object.keys(headers).length) {
    declared.headers = headers;
  }

  // A store <script> with the same name that replaces its own <script> element
  // re-declares the store. If it was declared elsewhere it's ignored.
  app.stores._declare(el, storeName, state, declared);

  initialized.add(el);
}

// Removing the script leaves its store registered. Only `stores.remove()` removes a store.
function teardown(el: HTMLScriptElement) {
  initialized.delete(el);
}

export const rzStore = {
  selector: directiveSelector('store', 'script'),
  initialize,
  teardown,
} as const satisfies StandaloneDirective<HTMLScriptElement>;
