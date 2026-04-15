import { rzInsert } from '../directives';
import type { RouseResponse } from '../types';
import { dispatch, insert } from './utils';

/**
 * Listens globally for HTML fetch responses and mutates the DOM
 * based on the element's `rz-insert` configuration.
 */
export function initDomMutator(root: Element, abortSignal: AbortSignal) {
  root.addEventListener(
    'rz:fetch:success:html',
    (e: Event) => {
      const customEvent = e as CustomEvent<RouseResponse>;
      const triggerEl = customEvent.target as Element;
      const { data, response, config } = customEvent.detail;

      // Programmatic fetch (app.fetch, ctx.fetch) defaults to `mutate: false` so
      // it doesn't automatically update the DOM, unlike `rz-fetch`
      if (config?.mutate === false) return;

      if (typeof data !== 'string') return;

      const operations = rzInsert.getInsertConfig(triggerEl);

      operations.forEach(({ targets, strategy }) => {
        if (targets.length === 0) return;

        targets.forEach((target) => {
          // Dispatch cancelable 'before' event (allows for intercepting/modifying data)
          const beforeInsertEvent = dispatch(
            target,
            'rz:fetch:insert:before',
            {
              data,
              triggerEl,
              targetEl: target,
              strategy,
              response,
            },
            { cancelable: true },
          );

          if (beforeInsertEvent.defaultPrevented) return;

          let dispatcherEl = target;

          // If replacing or deleting the target, the final event must be dispatched elsewhere
          if (strategy === 'outerHTML' || strategy === 'delete') {
            dispatcherEl = target.parentElement || root;
          }

          insert(beforeInsertEvent.detail.data, target, strategy);

          dispatch(dispatcherEl, 'rz:fetch:insert', {
            triggerEl,
            targetEl: target,
            strategy,
          });
        });
      });
    },
    { signal: abortSignal },
  );
}
