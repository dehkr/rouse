import type { RouseApp } from '../core/app';
import {
  looksLikeUrlSubject,
  parseTriggerSubjectPairs,
  parseUrlSubject,
} from '../core/parser';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { dispatchTrigger } from '../dom/scheduler';
import { isNativeNavigation, resolveDefaultTrigger } from '../dom/utils';
import { handleFetch } from '../net/engine';
import type { DirectiveSlug, ManagerDirective, RouseRequest, VoidFn } from '../types';

const SLUG = 'fetch' as const satisfies DirectiveSlug;
const cleanups = new WeakMap<Element, Array<VoidFn>>();

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

  const pairs = parseTriggerSubjectPairs(value, looksLikeUrlSubject);
  if (pairs.length === 0) return;

  const teardowns: VoidFn[] = [];

  for (const { trigger, subject } of pairs) {
    const resolvedTrigger = resolveDefaultTrigger(trigger, el, SLUG);
    if (!resolvedTrigger) continue;

    const cleanup = dispatchTrigger(resolvedTrigger, {
      el,
      app,
      action: (e?: Event) => {
        if (e && isNativeNavigation(el, e)) {
          e.preventDefault();
        }
        const requestOpts = applySubmitterOverrides(parseUrlSubject(subject), e);
        handleFetch(el, app, requestOpts);
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

/**
 * Definition for the `rz-fetch` directive object.
 */
export const rzFetch = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  initialize,
  teardown,
} as const satisfies ManagerDirective;
