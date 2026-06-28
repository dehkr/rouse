import type { SwapMethod } from '../core/constants';
import { rzTarget } from '../directives';
import type { RouseResponse } from '../types';
import { dispatch } from './scheduler';

interface SwapOptions {
  data: string;
  triggerEl: Element;
  targetEl: Element;
  method: SwapMethod;
  response: Response | null;
  appRoot: Element;
}

/**
 * Listens globally for successful HTML fetch responses and mutates
 * the DOM based on the element's `rz-target` configuration.
 */
export function initDomSwapper(appRoot: Element, abortSignal: AbortSignal) {
  const handleMutate = (e: Event) => {
    const { detail, target } = e as CustomEvent<RouseResponse>;
    const { data, response, config, targetOverride } = detail;
    const triggerEl = target as Element;

    // Programmatic fetch (app.fetch, ctx.fetch) defaults to `swap: false` so
    // it doesn't automatically update the DOM, unlike `rz-fetch`.
    if (config?.swap === false) return;
    if (typeof data !== 'string') return;

    const operations = rzTarget.getConfig(triggerEl, appRoot, targetOverride);

    for (const { targets, method } of operations) {
      for (const targetEl of targets) {
        performSwap({
          data,
          triggerEl,
          targetEl,
          method,
          response,
          appRoot,
        });
      }
    }
  };

  appRoot.addEventListener('rz:fetch:success:html', handleMutate, {
    signal: abortSignal,
  });
}

/**
 * Handles swapping HTML partials into the DOM.
 */
export function swap(
  content: string,
  target: Element,
  method: SwapMethod = 'innerHTML',
  source: 'fetch' | 'programmatic' = 'programmatic',
) {
  const dispatcherEl =
    method === 'outerHTML' || method === 'delete'
      ? target.parentElement || target
      : target;

  const beforeEvent = dispatch(
    dispatcherEl,
    'rz:dom:swap:before',
    { target, method, payload: content, source },
    { cancelable: true },
  );

  if (beforeEvent.defaultPrevented) return;
  const finalContent = beforeEvent.detail.payload;

  switch (method) {
    case 'delete':
      target.remove();
      break;
    case 'innerHTML':
      target.innerHTML = finalContent;
      break;
    case 'outerHTML':
      target.outerHTML = finalContent;
      break;
    default:
      target.insertAdjacentHTML(method, finalContent);
  }

  dispatch(dispatcherEl, 'rz:dom:swap', {
    target,
    method,
    payload: finalContent,
    source,
  });
}

/**
 * Helper to handle the specific logic of a single DOM mutation.
 */
function performSwap({ data, targetEl, method }: SwapOptions) {
  swap(data, targetEl, method, 'fetch');
}
