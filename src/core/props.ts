import type {
  AnyFunction,
  BindableValue,
  Controller,
  DirectiveSlug,
  HandlerCtx,
} from '../types';
import { KEY_BLOCKLIST, STORE_PREFIX } from './constants';
import { parseStoreLocator } from './parser';
import { getNestedVal, hasNestedPath, resolveState } from './path';
import { err, isPlainObject, warn } from './shared';
import { StoreManager } from './store';

export const NO_UPDATE = Symbol('rz:no-update');

/**
 * Returns `true` if every segment of the binding key exists on the
 * controller scope (or store, for `@`-prefixed keys).
 */
function hasBindingTarget(
  key: string,
  scope: Controller,
  storeManager: StoreManager,
): boolean {
  if (key.startsWith(STORE_PREFIX)) {
    const { storeName, nestedPath } = parseStoreLocator(key);
    if (!storeManager.has(storeName)) return false;
    if (!nestedPath) return true;
    return hasNestedPath(storeManager.get(storeName), nestedPath);
  }
  return hasNestedPath(scope, key);
}

/**
 * Parse JSON with recursive check that blocks prototype pollution keys.
 */
function safeJSONParse(text: string): unknown {
  return JSON.parse(text, (key, value) => {
    if (KEY_BLOCKLIST.includes(key)) {
      warn(`Blocked forbidden key in JSON: '${key}'.`);
      return undefined;
    }
    return value;
  });
}

/**
 * Resolves a payload string into a JavaScript value. Uses heuristics to determine
 * if the payload is inline JSON, a DOM ID, a global store, or URL params.
 *
 * @param requireObject - If true (default), enforces that the resolved value is an object.
 */
export function resolveProps(
  input: string | undefined | null,
  storeManager?: StoreManager,
  requireObject = true,
): Record<string, any> | undefined {
  const value = input?.trim();
  if (!value) return undefined;

  let resolvedValue: any;

  // Store data
  if (value.startsWith(STORE_PREFIX)) {
    if (!storeManager) {
      warn(`Cannot resolve '${value}' because StoreManager is missing.`);
      return undefined;
    }

    const { storeName, nestedPath } = parseStoreLocator(value);
    const storeData = storeManager.get(storeName);

    if (storeData === undefined) {
      warn(`Store '${storeName}' not found. Cannot resolve props '${value}'.`);
      return undefined;
    }

    resolvedValue = nestedPath ? getNestedVal(storeData, nestedPath) : storeData;
  }

  // URL query params
  else if (value.startsWith('?')) {
    const params = new URLSearchParams(value.slice(1));
    resolvedValue = Object.fromEntries(params.entries());
  }

  // DOM script ID
  else if (value.startsWith('#')) {
    const id = value.slice(1);
    const el = document.getElementById(id);
    if (el && el instanceof HTMLScriptElement && el.type === 'application/json') {
      const content = el.textContent?.trim();
      if (content) {
        try {
          resolvedValue = safeJSONParse(content);
        } catch (e) {
          warn(`Invalid JSON in #${id}.`, e);
        }
      }
    } else {
      warn(`#${id} must be a <script type="application/json">.`);
    }
  }

  // Inline JSON object ({)
  else if (value.startsWith('{')) {
    try {
      resolvedValue = safeJSONParse(value);
    } catch (e) {
      warn(`Invalid inline JSON.`, e);
    }
  }

  // Final check
  if (resolvedValue !== undefined) {
    if (!requireObject || isPlainObject(resolvedValue)) {
      return resolvedValue;
    }
    warn(`Invalid payload: '${value}'. Data must resolve to an object.`);
  }

  return undefined;
}

/**
 * Splits an injection string into its key and raw payload components.
 * Supports `?`, `{`, `@`, and `#` as payload delimiters.
 */
export function splitInjection(raw: string): {
  key: string;
  rawPayload: string | undefined;
} {
  // Find the first index of ?, #, @, or { starting after the first character.
  // This accomodates store keys like '@my-store.method{ "id": 234 }'
  const matchIndex = raw.substring(1).search(/[?#@{]/);

  if (matchIndex === -1) {
    return { key: raw.trim(), rawPayload: undefined };
  }

  const i = matchIndex + 1;
  return {
    key: raw.slice(0, i).trim(),
    rawPayload: raw.slice(i).trim(),
  };
}

/**
 * Resolves a one-way binding value that may target a static property or a
 * function. If the target is a function, it is invoked with a `HandlerCtx` whose
 * `e` is a synthetic CustomEvent typed `rz:${slug}`. If a payload was provided
 * but the target is not callable, logs a warning and returns the static state.
 *
 * Returns `NO_UPDATE` when the key does not resolve to an existing property.
 * Callers must check for this before passing the result to a DOM updater.
 */
export function resolveBoundValue(
  raw: string,
  scope: Controller,
  storeManager: StoreManager,
  el: Element,
  slug: DirectiveSlug,
): BindableValue | typeof NO_UPDATE {
  const { key, rawPayload } = splitInjection(raw);

  if (!hasBindingTarget(key, scope, storeManager)) {
    warn(`'${key}' not found.`);
    return NO_UPDATE;
  }

  const state = resolveState<unknown>(key, scope, storeManager);

  if (typeof state === 'function') {
    const context = key.startsWith(STORE_PREFIX)
      ? storeManager.get(parseStoreLocator(key).storeName)
      : scope;

    try {
      const props =
        rawPayload !== undefined ? (resolveProps(rawPayload, storeManager) ?? {}) : {};
      const e = new CustomEvent(`rz:${slug}`);
      const args = { props, e, el } as HandlerCtx<Record<string, any>, Element>;
      return (state as AnyFunction).call(context, args) as BindableValue;
    } catch (error) {
      err(`Failed to execute '${key}()'.`, error);
      return undefined;
    }
  }

  if (rawPayload !== undefined) {
    warn(`'${key}' is not callable; ignoring payload '${rawPayload}'.`);
  }

  return state as BindableValue;
}
