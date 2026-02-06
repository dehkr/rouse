import type { RouseController } from "../types";

export const SLUG = 'on' as const;

export function applyOn(
  el: HTMLElement,
  instance: RouseController,
  evtName: string,
  methodName: string,
): () => void {
  const handler = (e: Event) => {
    instance[methodName](e);
  };

  el.addEventListener(evtName, handler);

  // Return the manual cleanup
  return () => el.removeEventListener(evtName, handler);
}
