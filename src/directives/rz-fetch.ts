import type { RouseApp } from '../core/app';
import { parseFetchSubject, parseTriggerSubjectPairs } from '../core/parser';
import { getDirectiveValue, warn } from '../core/shared';
import { dispatchTrigger } from '../dom/scheduler';
import { is, isNativeNavigation } from '../dom/utils';
import { handleFetch } from '../net/engine';
import type { DirectiveSlug, RouseRequest, StandaloneDirective, VoidFn } from '../types';
import { rzUrl } from './rz-url';

const SLUG = 'fetch' as const satisfies DirectiveSlug;
const cleanups = new WeakMap<Element, Array<VoidFn>>();

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
  if (cleanups.has(el)) return;

  const value = getDirectiveValue(el, SLUG);
  if (value === null) return;

  const pairs = parseTriggerSubjectPairs(value);
  if (pairs.length === 0) {
    warn('A valid trigger is missing for rz-fetch.', el);
    return;
  }

  const teardowns: VoidFn[] = [];

  // The URL is shared by every trigger, so resolve and validate it once
  const elementUrl = rzUrl.getConfig(el).url || nativeUrl(el);
  let warnedMissingUrl = false;

  for (const { trigger, subject } of pairs) {
    const parsed = subject ? parseFetchSubject(subject) : {};

    // URL value from `rz-fetch` takes precedence. Fall back to the `rz-url`
    // value or native `href` or `action` attribute values.
    const url = parsed.url || elementUrl;

    // Warn and skip if missing a URL
    if (!url) {
      if (!warnedMissingUrl) {
        warn('No URL configured for rz-fetch.', el);
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
        handleFetch(el, app, applySubmitterOverrides({ ...parsed, url }, e));
      },
    });

    if (cleanup) {
      teardowns.push(cleanup);
    }
  }

  if (teardowns.length > 0) {
    cleanups.set(el, teardowns);
  }
}

function teardown(el: Element) {
  cleanups.get(el)?.forEach((fn) => fn());
  cleanups.delete(el);
}

export const rzFetch = {
  slug: SLUG,
  initialize,
  teardown,
} as const satisfies StandaloneDirective;
