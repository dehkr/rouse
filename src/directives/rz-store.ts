import { rzRefresh, rzSave, rzSource } from '.';
import { getApp, type RouseApp } from '../core/app';
import {
  err,
  getDefinedDirectiveValue,
  getDirectiveValue,
  hasDirective,
  warn,
} from '../core/shared';
import { is } from '../dom/utils';
import type { Directive } from '../types';

export const rzStore = {
  existsOn: (el: Element) => hasDirective(el, 'store'),
  getValue: (el: Element) => getDirectiveValue(el, 'store'),
  getDefinedValue: (el: Element) => getDefinedDirectiveValue(el, 'store'),
  isValid,
  validate,
  initialize,
  teardown,
} as const satisfies Directive;

const storeCleanups = new WeakMap<HTMLScriptElement, Array<() => void>>();

function isValid(el: Element, app: RouseApp): el is HTMLScriptElement {
  return is(el, 'Script') && hasDirective(el, 'store') && getApp(el) === app;
}

function validate(el: Element, app: RouseApp): el is HTMLScriptElement {
  if (!isValid(el, app)) return false;

  const storeName = getDefinedDirectiveValue(el, 'store');
  if (!storeName) {
    warn(`Invalid or missing 'rz-store' value on ${el}.`);
    return false;
  }

  return true;
}

/**
 * Bootstraps a global reactive store from a `<script>` tag.
 * Initializes the reactive data registry and attaches any declared
 * networking behaviors (`rz-source`, `rz-save`, `rz-refresh`).
 */
function initialize(el: HTMLScriptElement, app: RouseApp) {
  if (storeCleanups.has(el) || !app) return;

  const storeName = getDefinedDirectiveValue(el, 'store');
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

    const store = app.stores.define(storeName, state);
    if (!store) return;
  }

  const cleanups: Array<() => void> = [];

  // Configure the store URL and HTTP method for saving
  if (rzSource.existsOn(el)) {
    const { saveMethod, url } = rzSource.getMethodAndUrl(el);
    app.stores.config(storeName, { saveMethod, url });
  }

  // Attach save triggers and register cleanup functions
  if (rzSave.existsOn(el)) {
    const saveCleanup = rzSave.attachTriggers(el, storeName, app);
    if (saveCleanup) {
      cleanups.push(saveCleanup);
    }
  }

  // Attach refresh triggers and register cleanup functions
  if (rzRefresh.existsOn(el)) {
    const refreshCleanup = rzRefresh.attachTriggers(el, storeName, app);
    if (refreshCleanup) {
      cleanups.push(refreshCleanup);
    }
  }

  storeCleanups.set(el, cleanups);
}

function teardown(script: HTMLScriptElement) {
  const cleanups = storeCleanups.get(script);
  if (cleanups) {
    cleanups.forEach((cleanup) => {
      cleanup();
    });
    storeCleanups.delete(script);
  }
}
