import { getApp, type RouseApp } from '../core/app';
import { err, getDirectiveValue, hasDirective, warn } from '../core/shared';
import { is } from '../dom/utils';
import type { DirectiveSlug, ManagerDirective } from '../types';
import { rzUrl } from './rz-url';

const SLUG = 'store' as const satisfies DirectiveSlug;
const initialized = new WeakSet<HTMLScriptElement>();

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
    } catch (e) {
      err(`Invalid JSON in '${storeName}'.`);
      return;
    }

    if (storeExists) {
      app.stores.update(storeName, state);
    } else {
      app.stores.create(storeName, state, undefined, el);
    }
  }

  // Seed the store URL from `rz-url`
  if (rzUrl.existsOn(el)) {
    const { url } = rzUrl.getConfig(el);
    if (url) app.stores.config(storeName, { url });
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
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  validate,
  initialize,
  teardown,
} as const satisfies ManagerDirective<HTMLScriptElement>;
