import { getApp, type RouseApp } from '../core/app';
import { type HttpMethod, isHttpMethod } from '../core/constants';
import { err, getDirectiveValue, hasDirective, warn } from '../core/shared';
import type { SyncConfig } from '../core/store';
import { is } from '../dom/utils';
import type { DirectiveSlug, StoreDirective } from '../types';
import { rzRefreshRequest, rzRequest, rzSaveRequest } from './rz-request';
import { rzUrl } from './rz-url';

const SLUG = 'store' as const satisfies DirectiveSlug;
const initialized = new WeakSet<HTMLScriptElement>();

/**
 * Validate + normalize a declared method, warning on an unknown value.
 */
function resolveMethod(method: string | undefined, el: Element): HttpMethod | undefined {
  if (method == null) return undefined;
  if (!isHttpMethod(method)) {
    warn(`Unknown HTTP method '${method}'. Ignoring.`, el);
    return undefined;
  }
  return method.toUpperCase() as HttpMethod;
}

function validate(el: Element, app: RouseApp): el is HTMLScriptElement {
  if (!(is(el, 'Script') && hasDirective(el, SLUG) && getApp(el, app))) {
    return false;
  }
  if (!getDirectiveValue(el, SLUG)?.trim()) {
    warn(`Invalid or missing rz-store value on ${el}.`);
    return false;
  }
  return true;
}

/**
 * Bootstraps a global reactive store from a `<script>` tag. Initializes the
 * reactive data registry and seeds the store's URL from `rz-url` if present.
 *
 * Save/refresh triggers (`rz-save`, `rz-refresh`) are wired separately by
 * their own manager scans, so the store doesn't need to know about them.
 */
function initialize(el: HTMLScriptElement, app: RouseApp) {
  if (initialized.has(el) || !app) return;

  const storeName = getDirectiveValue(el, SLUG)?.trim();
  if (!storeName) return;

  const textContent = el.textContent?.trim();
  const storeExists = app.stores.has(storeName);

  // If the store was already created programmatically and this `<script>` has
  // no JSON, we skip defining state and move on to attaching the network directives.
  // If the programmatic store exists and the script contains JSON, however, the
  // programmatic data gets replaced.
  if (textContent || !storeExists) {
    let state: any;
    try {
      state = JSON.parse(textContent || '{}');
    } catch (_e) {
      err(`Invalid JSON in '${storeName}'.`);
      return;
    }

    if (storeExists) {
      app.stores.update(storeName, state);
    } else {
      app.stores.create(storeName, state, undefined, el);
    }
  }

  const cfg: Partial<SyncConfig> = {};

  // Seed the store URL from `rz-url`
  if (hasDirective(el, 'url')) {
    const { url } = rzUrl.getConfig(el);
    if (url) cfg.url = url;
  }

  // Capture declarative rollback config for store-level default
  const reqBase = rzRequest.getConfig(el, app);
  const reqSave = rzSaveRequest.getConfig(el, app);
  const reqRefresh = rzRefreshRequest.getConfig(el, app);

  const saveMethod = resolveMethod(reqSave.method ?? reqBase.method, el);
  const refreshMethod = resolveMethod(reqRefresh.method ?? reqBase.method, el);
  if (saveMethod) cfg.saveMethod = saveMethod;
  if (refreshMethod) cfg.refreshMethod = refreshMethod;

  const rollbackOnError = reqSave.rollbackOnError ?? reqBase.rollbackOnError;
  if (rollbackOnError !== undefined) {
    cfg.rollbackOnError = rollbackOnError;
  }

  if (Object.keys(cfg).length) {
    app.stores.config(storeName, cfg);
  }

  initialized.add(el);
}

function teardown(el: HTMLScriptElement) {
  initialized.delete(el);
}

/**
 * Definition for the `rz-store` directive object.
 */
export const rzStore = {
  slug: SLUG,
  validate,
  initialize,
  teardown,
} as const satisfies StoreDirective;
