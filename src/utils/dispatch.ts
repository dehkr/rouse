/**
 * Dispatches a custom event from a specific element.
 *
 * @param el - The element to dispatch from
 * @param name - The event name
 * @param detail - The event data
 */
export function dispatch(el: HTMLElement, name: string, detail: any = {}) {
  const event = new CustomEvent(name, { detail, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}
