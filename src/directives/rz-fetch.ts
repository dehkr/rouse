import type { RouseApp } from '../core/app';
import { STORE_PREFIX } from '../core/constants';
import {
  looksLikeUrlSubject,
  parseTriggerSubjectPairs,
  parseUrlSubject,
} from '../core/parser';
import { getDirectiveValue, hasDirective, warn } from '../core/shared';
import { dispatchTrigger } from '../dom/scheduler';
import { defaultTriggerFor, isNativeNavigation } from '../dom/utils';
import { handleFetch } from '../net/engine';
import type { DirectiveSlug, ManagerDirective, VoidFn } from '../types';

const SLUG = 'fetch' as const satisfies DirectiveSlug;
const cleanups = new WeakMap<Element, Array<VoidFn>>();

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
    if (subject?.startsWith(STORE_PREFIX)) {
      warn(`rz-fetch cannot target stores: '${subject}'.`);
      continue;
    }

    const resolvedTrigger = trigger ?? {
      event: defaultTriggerFor(el),
      modifiers: [],
    };

    const cleanup = dispatchTrigger(resolvedTrigger, {
      el,
      app,
      action: (e?: Event) => {
        if (e && isNativeNavigation(el, e)) {
          e.preventDefault();
        }
        handleFetch(el, app, parseUrlSubject(subject));
      },
    });

    if (cleanup) teardowns.push(cleanup);
  }

  if (teardowns.length > 0) cleanups.set(el, teardowns);
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
