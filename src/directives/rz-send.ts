import type { RouseApp } from '../core/app';
import { getDirectiveValue, queryTargets } from '../core/attributes';
import { ITEM_PREFIX, STORE_PREFIX } from '../core/constants';
import { warn } from '../core/diagnostics';
import { parseDirectiveValue, parseStoreRef, safeJSONParse } from '../core/parser';
import { resolveState } from '../core/resolve';
import { clone, isPlainObject } from '../core/state';
import { resolveOwnerState } from '../dom/binder';
import { collectFields, isField, readField } from '../dom/forms';
import { getRaw } from '../reactivity/reactive';
import type { ConfigDirective, Scope } from '../types';

type Payload = Record<string, unknown>;

/**
 * Values to send with the element's fetch, gathered from a comma-separated list of
 * sources. When two sources share a key, the later one wins. If the element is a
 * field or a form, its own values come first.
 *
 * - `query`: a scope value, sent under its last path segment
 * - `@user`: a store's data. `@user.email` sends one field, as `email`
 * - `%`: the render item's data. `%.id` sends one field, as `id`
 * - `#user-name`: the element with that id. A field sends its value, and a form or fieldset sends its fields
 * - `{"page": 2}`: an inline JSON object
 *
 * GET and HEAD requests send the values as query parameters. Other methods send
 * them as a JSON body.
 *
 * @example
 * <button data-rz-fetch="click: /search" data-rz-send='query, @filters.sort, {"page": 2}'>
 */
function getConfig(el: Element, app: RouseApp): Payload {
  const scope = resolveOwnerState(el, app.root);
  const payload: Payload = { ...readElement(el) };

  for (const [entry, val] of parseDirectiveValue(getDirectiveValue(el, 'send'))) {
    if (val !== null) {
      __DEV__ &&
        warn(
          `rz-send: '${entry}: ${val}' is not a source. Write values as an inline JSON object.`,
          el,
        );
      continue;
    }

    Object.assign(payload, readSource(entry, el, scope, app));
  }

  return payload;
}

/**
 * Reads one source. Its first character decides its type, so no entry can be read
 * two ways.
 */
function readSource(
  entry: string,
  el: Element,
  scope: Scope,
  app: RouseApp,
): Payload | null {
  const lead = entry[0];

  if (lead === '{') {
    return readJson(entry, el);
  }
  if (lead === '#') {
    return readIdRef(entry.slice(1), el, app);
  }
  if (lead === STORE_PREFIX) {
    return parseStoreRef(entry, 'send') ? readState(entry, el, scope, app) : null;
  }
  if (lead === ITEM_PREFIX || /^[A-Za-z_$]/.test(entry)) {
    return readState(entry, el, scope, app);
  }

  __DEV__ &&
    warn(`rz-send: '${entry}' is not a source. Reference elements by id, as '#id'.`, el);

  return null;
}

function readJson(entry: string, el: Element): Payload | null {
  try {
    return safeJSONParse(entry) as Payload;
  } catch {
    __DEV__ && warn(`rz-send: '${entry}' is not valid JSON.`, el);
    return null;
  }
}

/**
 * Reads a state path. A bare store or render item sends its fields. Any other path
 * sends its value under the path's last segment.
 */
function readState(
  path: string,
  el: Element,
  scope: Scope,
  app: RouseApp,
): Payload | null {
  const value = resolveState(path, scope, app.stores);
  if (value === undefined) {
    __DEV__ && warn(`rz-send: '${path}' resolved to undefined. Ignoring.`, el);
    return null;
  }

  // A snapshot keeps getters and methods off the wire
  const data = clone(getRaw(value));
  const lastDot = path.lastIndexOf('.');

  if (lastDot === -1 && (path[0] === STORE_PREFIX || path === ITEM_PREFIX)) {
    if (isPlainObject(data)) {
      return data;
    }
    __DEV__ && warn(`rz-send: '${path}' has no fields to send.`, el);
    return null;
  }

  return { [path.slice(lastDot + 1)]: data };
}

/**
 * Reads the element with id `id` within the app root. The id is literal, not a
 * selector, so `#user.name` is the element whose id is `user.name`.
 */
function readIdRef(id: string, el: Element, app: RouseApp): Payload | null {
  if (!id || /\s/.test(id)) {
    __DEV__ &&
      warn(`rz-send: '#${id}' is not an id. Only ids can reference elements.`, el);
    return null;
  }

  const [target] = queryTargets(app.root, `#${CSS.escape(id)}`);
  if (!target) {
    __DEV__ && warn(`rz-send: no element with id '${id}'.`, el);
    return null;
  }

  if (isField(target) && !target.name) {
    __DEV__ && warn(`rz-send: '#${id}' has no name to send its value under.`, target);
    return null;
  }

  const pairs = readElement(target);
  __DEV__ && !pairs && warn(`rz-send: '#${id}' is not a field, form, or fieldset.`, el);
  return pairs;
}

/**
 * Reads a field's value, or the fields of a form or fieldset. Returns `null` for
 * any other element.
 */
function readElement(target: Element): Payload | null {
  if (target instanceof HTMLFormElement || target instanceof HTMLFieldSetElement) {
    return collectFields(target);
  }
  if (!isField(target)) {
    return null;
  }

  const value = readField(target);
  return value === null ? {} : { [target.name]: value };
}

export const rzSend = { getConfig } as const satisfies ConfigDirective<Payload>;
