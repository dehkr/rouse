/*
 * The request-axis contract: `:config` (cancelable), `:start`, exactly one of `:abort`,
 * `:success`, or `:error`, then `:end`. The terminal event depends on `run` calling
 * `settle`; `:end` doesn't. A new family's `run` must catch, settle with an
 * `INTERNAL_ERROR` fallback, and return it, or a throw leaves `:start` then `:end` with
 * no terminal between them.
 *
 * `RequestLifecycleOptions` is what checks a family's details, not `dispatch`. A new
 * family needs a member there and `LifecycleEventMap` entries for all its events, or
 * the union collapses to `any` and nothing is checked, with no error. Making the options
 * generic over the prefix doesn't work: TypeScript can't reduce `dispatch`'s
 * conditional return against a type parameter.
 *
 * Indicators are counted per element rather than owned by one request. An owner token
 * would fix one element firing twice and break two triggers sharing one indicator.
 */
import { queryTargets } from '../core/attributes';
import { warn } from '../core/diagnostics';
import { dispatch } from '../core/dispatch';
import { rzDisable } from '../directives/rz-disable';
import { rzIndicator } from '../directives/rz-indicator';
import type {
  FetchConfigDetail,
  PushPullConfigDetail,
  PushPullResultDetail,
  RouseResponse,
} from '../types';

export const PREVENTED = Symbol(__DEV__ ? 'rz.prevented' : '');

// `rouse-`, not `rz-`, which reads as a directive attribute. "Request", not "loading",
// since a push uploads.
const REQUEST_CLASS = 'rouse-request';

/** In-flight request count per indicator element. */
const inFlight = new WeakMap<Element, number>();

/**
 * Tracks request counts for elements disabled by Rouse. If an element is `disabled`
 * but not in this map, it was disabled externally.
 */
const heldDisabled = new WeakMap<Element, number>();

export interface LifecycleHandle {
  settle: (result: RouseResponse) => void;
}

/** Fields every request-axis family shares, independent of its detail shapes. */
interface LifecycleBase {
  el: Element;
  root: Element;
  run: (handle: LifecycleHandle) => Promise<RouseResponse>;
}

/**
 * Discriminated on `prefix` so each caller's detail objects are checked against
 * the `LifecycleEventMap` entries for the family it dispatches.
 */
type RequestLifecycleOptions = LifecycleBase &
  (
    | {
        prefix: 'rz:fetch';
        configDetail: FetchConfigDetail;
        terminalDetail: (result: RouseResponse) => RouseResponse;
      }
    | {
        prefix: 'rz:push' | 'rz:pull';
        configDetail: PushPullConfigDetail;
        terminalDetail: (result: RouseResponse) => PushPullResultDetail;
      }
  );

/**
 * Wraps a network operation in the shared request-axis lifecycle. Returns `PREVENTED`
 * if a `config` listener is canceled, otherwise the response.
 */
export async function runRequestLifecycle(
  opts: RequestLifecycleOptions,
): Promise<RouseResponse | typeof PREVENTED> {
  const { el, root, prefix, configDetail, terminalDetail, run } = opts;

  const configEvent = dispatch(el, `${prefix}:config`, configDetail, {
    cancelable: true,
  });

  if (configEvent.defaultPrevented) return PREVENTED;

  // Resolved after the `:config` gate so listeners can retarget `indicator`
  const indicators = resolveIndicators(el, root, configDetail.config.indicator);

  // A request with no trigger fires from the app root, and its `rz-disable` would
  // apply to every trigger-less fetch. A store's script is a deliberate firing element.
  const disableHost = configDetail.config.triggerEl ?? (el === root ? null : el);
  const disabled = holdDisabled(resolveDisabled(disableHost, root));

  trackInFlight(indicators, 1);

  dispatch(el, `${prefix}:start`, configDetail);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseDisabled(disabled);
  };

  let settled = false;

  /**
   * Classifies the settled response into exactly one terminal request-axis event:
   *
   * - `:abort` when the request was canceled
   * - `:error` for any other failure
   * - `:success` otherwise
   *
   * Then honors a `Rouse-Trigger` header by dispatching the named event with the
   * raw response as its detail. Idempotent. Affordances clear and `:end` fires even
   * when `run` never settles.
   *
   * Disabled elements are released first, so a terminal listener can focus them and a
   * `Rouse-Trigger` event can start a request from them.
   */
  const settle = (result: RouseResponse) => {
    if (settled) return;
    settled = true;
    release();

    if (result.error?.code === 'CANCELED') {
      dispatch(el, `${prefix}:abort`, configDetail);
      return;
    }

    if (result.error) {
      dispatch(el, `${prefix}:error`, terminalDetail(result));
      return;
    }

    dispatch(el, `${prefix}:success`, terminalDetail(result));

    const trigger = result.headers?.['rouse-trigger'];
    if (trigger) {
      dispatch(el, trigger, result);
    }
  };

  try {
    return await run({ settle });
  } finally {
    trackInFlight(indicators, -1);
    release();
    dispatch(el, `${prefix}:end`, configDetail);
  }
}

/**
 * Determines which elements receive the `rouse-request` indicator class.
 *
 * Precedence: explicit `indicator` option -> `rz-indicator` attribute -> firing element (`el`).
 * If resolved to `null`, no indicators are returned.
 */
function resolveIndicators(
  el: Element,
  root: Element,
  indicator: string | Element | null | undefined,
): Element[] {
  const resolved = indicator === undefined ? rzIndicator.getConfig(el) : indicator;

  if (resolved === undefined) {
    return [el];
  }
  if (resolved === null) {
    return [];
  }

  if (typeof resolved === 'string') {
    const els = queryTargets(root, resolved);
    __DEV__ &&
      !els.length &&
      warn(
        `No request indicator applied. Selector '${resolved}' does not match any elements.`,
        ...(el === root ? [] : [el]),
      );
    return els;
  }

  // Shape check instead of instanceof so cross-origin/iframe elements aren't rejected
  if ((resolved as Partial<Element>)?.nodeType === Node.ELEMENT_NODE) {
    return [resolved];
  }

  __DEV__ &&
    warn(
      `No request indicator applied. Expected an element, a selector, or null. Got: ${Array.isArray(resolved) ? 'array' : typeof resolved}.`,
      ...(el === root ? [] : [el]),
    );

  return [];
}

/**
 * Resolves the target elements to disable for an `rz-disable` directive on a host
 * element. Returns `[]` if the directive is missing, `[host]` for empty values, or all
 * matching elements that can be disabled for CSS selectors.
 */
function resolveDisabled(host: Element | null, root: Element): Element[] {
  if (!host) return [];

  const selector = rzDisable.getConfig(host);
  if (selector === undefined) return [];

  const els = selector === '' ? [host] : queryTargets(root, selector);
  __DEV__ &&
    !els.length &&
    warn(`rz-disable: selector '${selector}' does not match any elements.`, host);

  // Filter out elements that don't support the native `disabled` property (e.g. <div>, <a>)
  return els.filter((match) => {
    if ('disabled' in match) return true;
    __DEV__ &&
      warn(
        `rz-disable: <${match.localName}> can't be disabled. Name a form control or a fieldset.`,
        match,
        host,
      );
    return false;
  });
}

/**
 * Disables target elements and tracks their in-flight request count. Preserves pre-existing
 * author-disabled states by skipping elements that were disabled prior to tracking.
 */
function holdDisabled(els: Element[]): Element[] {
  const held = els.filter((el) => heldDisabled.has(el) || !el.hasAttribute('disabled'));
  held.forEach((el) => {
    heldDisabled.set(el, (heldDisabled.get(el) ?? 0) + 1);
    el.setAttribute('disabled', '');
  });

  return held;
}

/**
 * Releases in-flight disabled holds on target elements. Re-enables an element only when
 * its active request count reaches zero.
 */
function releaseDisabled(els: Element[]) {
  for (const el of els) {
    const n = (heldDisabled.get(el) ?? 1) - 1;
    if (n > 0) {
      heldDisabled.set(el, n);
      continue;
    }
    heldDisabled.delete(el);
    el.removeAttribute('disabled');
  }
}

/**
 * Tracks in-flight requests per indicator element (`1` on start and `-1` on settle) so
 * overlapping requests sharing an indicator don't clear each other's request class.
 */
function trackInFlight(els: Element[], delta: 1 | -1) {
  for (const el of els) {
    const n = Math.max(0, (inFlight.get(el) ?? 0) + delta);
    inFlight.set(el, n);
    el.classList.toggle(REQUEST_CLASS, n > 0);
  }
}
