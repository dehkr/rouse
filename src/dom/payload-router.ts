/*
 * Routing is a direct call from the code that received the payload, never a DOM event.
 * An event would let `stopPropagation()` on an ancestor block placement and deposit,
 * and would cross nested app roots, so each router would have to filter out payloads
 * that bubbled up from another app.
 */
import type { RouseApp } from '../app';
import { warn } from '../core/diagnostics';
import { isPlainObject } from '../core/state';
import type { RouseResponse, RoutablePayload } from '../types';
import { placeInto, readPlace } from './placer';
import { getDirectiveValue } from '../core/elements';
import { parseDirectiveValue, parseStoreName } from '../core/parser';
import { isFileType, isJsonType } from '../net/response';

/** What produced a routable payload. */
type PayloadSource = 'fetch' | 'sse';

/**
 * Sends a fetch response or stream message to its destination. HTML goes to the DOM
 * targets named by `rz-place` or a server `Rouse-Place` header. JSON goes to the stores
 * named by `rz-deposit` or a server `Rouse-Deposit` header, as a merge patch through
 * `app.stores.deposit()`. A file goes nowhere.
 *
 * The destination is read off `config.triggerEl`. A payload without one routes only
 * when the server names a destination, since `rz-place`'s host default would otherwise
 * replace the whole app. An error response also routes only when the server names a
 * destination, since `rz-place` and `rz-deposit` are success-only output.
 */
export function routePayload(
  app: RouseApp,
  payload: RoutablePayload,
  source: PayloadSource,
): void {
  const { data, error, placeOverride, depositOverride } = payload;
  const triggerEl = payload.config?.triggerEl;
  const host = triggerEl ?? app.root;

  // A server removing an element usually sends no body, which leaves nothing to
  // classify. `Rouse-Place` names the placement by itself, so an empty body that
  // carries it routes as HTML.
  const kind = data == null && placeOverride ? 'html' : payloadKind(data);

  if (kind === null) {
    // Ignore null/undefined (e.g., 204 No Content), but warn on unhandled complex types
    if (__DEV__ && data != null) {
      warn(`Unsupported payload: '${data?.constructor?.name || typeof data}'.`);
    }
    return;
  }

  if (__DEV__) {
    warnMismatchedPayload(payload, kind, host);
  }

  if (kind === 'file') {
    return;
  }

  const override = kind === 'html' ? placeOverride : depositOverride;
  if (!override && (error || !triggerEl)) {
    return;
  }

  if (kind === 'html') {
    placeHtml(app, payload, source, host);
  } else {
    depositJson(app, payload, source, host);
  }
}

/** Classifies a payload by the router that handles it. */
function payloadKind(data: unknown): 'file' | 'json' | 'html' | null {
  if (isFileType(data)) {
    return 'file';
  }
  // The store router needs parsed objects to merge state
  if (Array.isArray(data) || isPlainObject(data)) {
    return 'json';
  }
  if (typeof data === 'string') {
    return 'html';
  }

  return null;
}

/**
 * Warns when a server header or the response's Content-Type disagrees with how the
 * payload is routed. Each router reads only its own override, so a header aimed at
 * the other router would otherwise be dropped without a trace.
 */
function warnMismatchedPayload(
  payload: RoutablePayload,
  kind: 'file' | 'json' | 'html',
  host: Element,
) {
  if (payload.placeOverride && kind !== 'html') {
    warn(
      `Rouse-Place applies only to HTML responses, but this one was routed as ${kind === 'json' ? 'JSON' : 'a file'}. Ignoring it.`,
      host,
    );
  }
  if (payload.depositOverride && kind !== 'json') {
    warn(
      `Rouse-Deposit applies only to JSON responses, but this one was routed as ${kind === 'html' ? 'HTML' : 'a file'}. Ignoring it.`,
      host,
    );
  }

  if (kind === 'html' && typeof payload.data === 'string') {
    const response = (payload as RouseResponse).response;
    if (isJsonType(response?.headers.get('Content-Type') || '')) {
      warn(`Content-Type is JSON but data is a string. Defaulting to HTML.`);
    }
  }
}

function placeHtml(
  app: RouseApp,
  payload: RoutablePayload,
  source: PayloadSource,
  host: Element,
) {
  const { data, placeOverride } = payload;

  // An empty fetch response arrives as `null`. It places only under `Rouse-Place`,
  // where the header itself is the instruction, so a plain 204 leaves the page alone.
  const content = data == null ? '' : (data as string);

  for (const { targets, position } of readPlace(host, app.root, placeOverride)) {
    targets.forEach((targetEl) =>
      placeInto(targetEl, app.root, content, position, source),
    );
  }
}

function depositJson(
  app: RouseApp,
  payload: RoutablePayload,
  operation: PayloadSource,
  host: Element,
) {
  const { data } = payload;

  const stores = readDeposit(host, payload.depositOverride);
  if (stores.length === 0) {
    return;
  }

  if (!isPlainObject(data)) {
    if (__DEV__) {
      warn('Cannot route JSON payload to a store. Expected a JSON object.', data);
    }
    return;
  }

  // Only the fetch path passes a `RouseResponse`
  const response = operation === 'fetch' ? (payload as RouseResponse) : undefined;

  stores.forEach((storeName) =>
    app.stores.deposit(storeName, data, { response, operation }),
  );
}

/**
 * Resolves `rz-deposit` into store names for JSON payload routing via a fetch response
 * or an unnamed stream message.
 *
 * Whole stores only, comma separated. Without it, a payload deposits nothing, a store
 * script included: there's no fallback to the script's own store.
 *
 * - `data-rz-deposit="@cart"`
 * - `data-rz-deposit="@cart, @status"`
 *
 * @param overrideValue - Takes precedence over the attribute (a server `Rouse-Deposit` header).
 */
function readDeposit(el: Element, overrideValue?: string | null): string[] {
  const value = overrideValue || getDirectiveValue(el, 'deposit');
  const label = __DEV__ && overrideValue ? 'Rouse-Deposit' : undefined;

  return parseDirectiveValue(value).flatMap(([key]) => {
    const storeName = parseStoreName(key, 'deposit', el, label);
    return storeName ? [storeName] : [];
  });
}
