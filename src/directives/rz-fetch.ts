import type { RouseApp } from '../core/app';
import { parseFetchSubject, parseTriggerSubjectPairs } from '../core/parser';
import { getDirectiveValue, warn } from '../core/shared';
import { dispatchTrigger } from '../dom/scheduler';
import { is, isNativeNavigation } from '../dom/utils';
import { handleFetch } from '../net/engine';
import type { DirectiveSlug, RouseRequest, StandaloneDirective, VoidFn } from '../types';
import { rzUrl } from './rz-url';

const SLUG = 'fetch' as const satisfies DirectiveSlug;
const elementCleanups = new WeakMap<Element, Array<VoidFn>>();

/**
 * Returns the URL value if it exists from an anchor element's `href` or
 * a form element's `action` attribute.
 */
function nativeUrl(el: Element): string {
  if (is(el, 'Anchor')) {
    return el.getAttribute('href') ?? '';
  }
  if (is(el, 'Form')) {
    return el.getAttribute('action') ?? '';
  }
  return '';
}

/**
 * Extracts `formaction` and `formmethod` from the button that triggered a
 * submit event to override the form's default request configuration.
 */
function applySubmitterOverrides(
  baseOpts: { method?: string; url?: string },
  e?: Event,
): RouseRequest {
  const opts: RouseRequest = { ...baseOpts };
  const sub =
    typeof SubmitEvent !== 'undefined' && e instanceof SubmitEvent ? e.submitter : null;

  if (sub) {
    opts.url = sub.getAttribute('formaction') ?? opts.url;
    opts.method = sub.getAttribute('formmethod')?.toUpperCase() ?? opts.method;
  }

  return opts;
}

/**
 * Attaches synthetic events (like polling) and custom non-standard events
 * to an element and stores their cleanup functions.
 */
function initialize(el: Element, app: RouseApp) {
  if (elementCleanups.has(el)) return;

  const value = getDirectiveValue(el, SLUG);
  if (value === null) return;

  const pairs = parseTriggerSubjectPairs(value);
  if (pairs.length === 0) {
    __DEV__ && warn('rz-fetch: at least one trigger is required.', el);
    return;
  }

  const cleanups: VoidFn[] = [];
  const elementUrl = rzUrl.getConfig(el).url || nativeUrl(el);

  // A form without a URL at init can still get one at submit time from the
  // submitter's `formaction`, so bind anyway and validate on dispatch.
  const deferUrl = is(el, 'Form');

  // The URL is shared by every trigger, so resolve and validate it once.
  let warnedMissingUrl = false;

  for (const { trigger, subject } of pairs) {
    const parsed = subject ? parseFetchSubject(subject) : {};

    // URL value from `rz-fetch` takes precedence. Fall back to the `rz-url`
    // value or native `href` or `action` attribute values.
    const url = parsed.url || elementUrl;

    // If the url is missing, it could mean there isn't a URL configured, or
    // that it's in the wrong position (missing trigger).
    if (!url && !deferUrl) {
      if (!warnedMissingUrl) {
        __DEV__ &&
          warn(
            `rz-fetch: no URL found. Set it via 'rz-fetch' with at least one leading trigger (e.g., rz-fetch="click: /users"), 'rz-url', or a native 'href' attribute.`,
            el,
          );
        warnedMissingUrl = true;
      }
      continue;
    }

    const cleanup = dispatchTrigger(trigger, {
      el,
      app,
      action: (e?: Event) => {
        if (e && isNativeNavigation(el, e)) {
          e.preventDefault();
        }
        const opts = applySubmitterOverrides({ ...parsed, url }, e);
        if (!opts.url) {
          __DEV__ &&
            warn(
              `rz-fetch: no URL found for form submission. Set it via 'rz-fetch' with a submit trigger (e.g., rz-fetch="submit: /users"), 'rz-url', a native 'action' attribute, or 'formaction' on the submit button.`,
              el,
            );
          return;
        }
        handleFetch(el, app, opts);
      },
    });

    if (cleanup) {
      cleanups.push(cleanup);
    }
  }

  if (cleanups.length > 0) {
    elementCleanups.set(el, cleanups);
  }
}

function teardown(el: Element) {
  elementCleanups.get(el)?.forEach((fn) => fn());
  elementCleanups.delete(el);
}

export const rzFetch = {
  slug: SLUG,
  initialize,
  teardown,
} as const satisfies StandaloneDirective;
