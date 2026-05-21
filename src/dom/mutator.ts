import type { InsertMethod } from '../core/constants';
import { rzError, rzTarget } from '../directives';
import type { RouseResponse } from '../types';
import { insert } from './utils';

interface InsertionOptions {
  data: string;
  triggerEl: Element;
  targetEl: Element;
  strategy: InsertMethod;
  response: Response | null;
  appRoot: Element;
}

/**
 * Listens globally for HTML fetch responses and mutates the DOM
 * based on the element's `rz-target` configuration.
 */
export function initDomMutator(appRoot: Element, abortSignal: AbortSignal) {
  const events = ['rz:fetch:success:html', 'rz:fetch:error:html'];

  const handleMutate = (e: Event) => {
    const { detail, target } = e as CustomEvent<RouseResponse>;
    const { data, error, response, config, targetOverride } = detail;
    const triggerEl = target as Element;

    // Programmatic fetch (app.fetch, ctx.fetch) defaults to `mutate: false` so
    // it doesn't automatically update the DOM, unlike `rz-fetch`.
    if (config?.mutate === false) return;

    // Favoring error.detail for generic errors
    const rawPayload = error ? error.detail || data : data;
    if (typeof rawPayload !== 'string') return;

    const handler = e.type.includes('error') ? rzError : rzTarget;
    const operations = handler.getConfig(triggerEl, appRoot, targetOverride);

    for (const { targets, strategy } of operations) {
      for (const targetEl of targets) {
        performInsertion({
          data: rawPayload,
          triggerEl,
          targetEl,
          strategy,
          response,
          appRoot,
        });
      }
    }
  };

  for (const eventName of events) {
    appRoot.addEventListener(eventName, handleMutate, { signal: abortSignal });
  }
}

/**
 * Helper to handle the specific logic of a single DOM mutation.
 */
function performInsertion({ data, targetEl, strategy }: InsertionOptions) {
  insert(data, targetEl, strategy, 'fetch');
}
