import { getInsertConfig } from '../directives/rz-insert';
import { dispatch, insert } from './utils';

const EVENTS = {
  SUCCESS_HTML: 'rz:fetch:success:html',
  INSERT_BEFORE: 'rz:fetch:insert:before',
  INSERT: 'rz:fetch:insert',
} as const;

/**
 * Listens globally for HTML fetch responses and securely executes DOM mutations
 * based on the element's rz-insert directive configuration.
 */
export function initDomMutator(appRoot: HTMLElement) {
  appRoot.addEventListener(EVENTS.SUCCESS_HTML, (e: Event) => {
    const customEvent = e as CustomEvent;
    const triggerEl = customEvent.target as HTMLElement;

    // The fetch engine passes these details in the custom event
    const { data, response } = customEvent.detail;

    const operations = getInsertConfig(triggerEl);

    operations.forEach(({ targets, strategy }) => {
      if (targets.length === 0) return;

      targets.forEach((target) => {
        // Dispatch cancelable 'before' event (allows for intercepting/modifying data)
        const beforeInsertEvent = dispatch(
          target,
          EVENTS.INSERT_BEFORE,
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

        dispatch(dispatcherEl, EVENTS.INSERT, {
          triggerEl,
          targetEl: target,
          strategy,
        });
      });
    });
  });
}
