import type { RouseApp } from '../core/app';
import { getDirectiveValue, queryTargets } from '../core/attributes';
import { ITEM_PREFIX, STORE_PREFIX } from '../core/constants';
import { warn } from '../core/diagnostics';
import { parseDirectiveValue, parseStoreRef, safeJSONParse } from '../core/parser';
import { resolveState } from '../core/resolve';
import { clone, isPlainObject } from '../core/state';
import { resolveOwnerState } from '../dom/binder';
import {
  collectFields,
  isField,
  isFieldContainer,
  readTriggerValues,
} from '../dom/forms';
import { getRaw } from '../reactivity/reactive';
import type { ConfigDirective, Scope } from '../types';

type Payload = Record<string, unknown>;

/**
 * Values to send with the element's fetch, gathered from a comma-separated list of
 * sources. When two sources share a key, the later one wins. If the element is a
 * field or a form, its own values come first, including the value of the button
 * that submitted the form.
 *
 * - `query`: a scope value, sent under its last path segment
 * - `@user`: a store's data. `@user.email` sends one field, as `email`
 * - `%`: the render item's data. `%.id` sends one field, as `id`
 * - `{"page": 2}`: an inline JSON object
 * - `from: <selector>`: the fields a CSS selector matches. A form or fieldset sends
 *   its fields. Quote a selector list: `from: '.a, .b'`
 *
 * GET and HEAD requests send the values as query parameters. Other methods send
 * them as the request body, encoded as the request's `Content-Type` or the form's
 * `enctype` declares, or as form data when neither does.
 *
 * @example
 * <button data-rz-fetch="click: /search" data-rz-send='query, from: [name=tags], {"page": 2}'>
 */
function getConfig(
  el: Element,
  app: RouseApp,
  submitter: HTMLElement | null = null,
): Payload {
  const scope = resolveOwnerState(el, app.root);
  const payload: Payload = { ...readTriggerValues(el, submitter) };

  for (const [entry, val] of parseDirectiveValue(getDirectiveValue(el, 'send'))) {
    if (val === null) {
      Object.assign(payload, readSource(entry, el, scope, app));
    } else if (entry === 'from') {
      Object.assign(payload, readFrom(val, el, app));
    } else {
      __DEV__ && warn(`rz-send: unknown key '${entry}'. The only key is 'from'.`, el);
    }
  }

  return payload;
}

/**
 * Reads one bare source. Its first character decides its type, so no entry can be
 * read two ways.
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
  if (lead === STORE_PREFIX) {
    return parseStoreRef(entry, 'send') ? readState(entry, el, scope, app) : null;
  }
  if (lead === ITEM_PREFIX || /^[A-Za-z_$]/.test(entry)) {
    return readState(entry, el, scope, app);
  }

  __DEV__ &&
    warn(
      /^[#.[:*]/.test(entry)
        ? `rz-send: '${entry}' looks like a selector. Write 'from: ${entry}'.`
        : `rz-send: '${entry}' is not a source.`,
      el,
    );

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
 * Reads the fields a selector matches within the app root. An invalid selector
 * matches nothing, so it reports as no match.
 */
function readFrom(selector: string, el: Element, app: RouseApp): Payload | null {
  const matches = queryTargets(app.root, selector);
  if (!matches.length) {
    __DEV__ && warn(`rz-send: no elements match '${selector}'.`, el);
    return null;
  }

  __DEV__ && warnUnreadable(selector, matches);
  return collectFields(matches);
}

/**
 * Warns for each match that can't contribute: a field with no name to send under,
 * or an element that is neither a field nor a form or fieldset.
 */
function warnUnreadable(selector: string, matches: Element[]): void {
  for (const match of matches) {
    if (isField(match) ? !match.name : !isFieldContainer(match)) {
      warn(
        isField(match)
          ? `rz-send: '${selector}' matched a field with no name to send its value under.`
          : `rz-send: '${selector}' matched an element that isn't a field, form, or fieldset.`,
        match,
      );
    }
  }
}

export const rzSend = { getConfig } as const satisfies ConfigDirective<Payload>;
