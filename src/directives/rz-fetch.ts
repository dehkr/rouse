import type { RouseApp } from '../core/app';
import { warn } from '../core/diagnostics';
import { parseFetchSubject } from '../core/parser';
import { dispatchTrigger } from '../dom/events';
import { is, isNativeNavigation } from '../dom/utils';
import { handleFetch } from '../net/fetch-engine';
import type { DirectiveSlug, RouseRequest, TriggerSubjectPair, VoidFn } from '../types';
import { defineNetworkDirective } from './network-directive';
import { rzUrl } from './rz-url';

const SLUG = 'fetch' as const satisfies DirectiveSlug;

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
 * Binds each `[trigger]: [[METHOD] URL]` pair to a fetch. Resolves the URL once
 * and shares it across the element's triggers. Returns the pairs' cleanups.
 */
function bindFetchPairs(el: Element, app: RouseApp, pairs: TriggerSubjectPair[]) {
  const cleanups: VoidFn[] = [];
  const elementUrl = rzUrl.getConfig(el).url || nativeUrl(el);

  // A form without a URL at init can still get one at submit time from the
  // submitter's `formaction`, so bind anyway and validate on dispatch.
  const deferUrl = is(el, 'Form');

  // The URL is shared by every trigger, so resolve and validate it once
  let warnedMissingUrl = false;

  for (const { trigger, subject } of pairs) {
    const parsed = subject ? parseFetchSubject(subject) : {};

    // URL value from `rz-fetch` takes precedence
    const url = parsed.url || elementUrl;

    // If the URL is missing, it could mean there isn't one configured,
    // or that it's in the wrong position (missing trigger).
    if (!url && !deferUrl) {
      if (!warnedMissingUrl) {
        __DEV__ &&
          warn(
            `rz-fetch: no URL found. Configure it using rz-fetch (with at least one leading trigger), rz-url, or a native attribute (e.g. 'href', 'action', or 'formaction').`,
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
              `rz-fetch: no URL found. Configure it using rz-fetch (with at least one leading trigger), rz-url, or a native attribute (e.g. 'href', 'action', or 'formaction').`,
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

  return cleanups;
}

export const rzFetch = defineNetworkDirective(SLUG, 'click: /users', bindFetchPairs);
