import { getInsertConfig } from '../directives/rz-insert';
import { dispatch, insert } from './utils';

/**
 * Listens globally for HTML fetch responses and mutates the DOM
 * based on the element's `rz-insert` configuration.
 */
export function initDomMutator(appRoot: HTMLElement) {
  appRoot.addEventListener('rz:fetch:success:html', (e: Event) => {
    const customEvent = e as CustomEvent;
    const triggerEl = customEvent.target as HTMLElement;

    const { data, response } = customEvent.detail;

    const operations = getInsertConfig(triggerEl);

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

        // If replacing or deleting the target, the final event must be dispatched from the parent
        if (strategy === 'outerHTML' || strategy === 'delete') {
          dispatcherEl = target.parentElement || appRoot;
        }

        insert(target, beforeInsertEvent.detail.data, strategy);

        dispatch(dispatcherEl, 'rz:fetch:insert', {
          triggerEl,
          targetEl: target,
          strategy,
        });
      });
    });
  });
}
