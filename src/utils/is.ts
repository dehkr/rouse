export const isObj = (val: unknown): val is Record<string, any> =>
  val !== null && typeof val === 'object';

export const isCollection = (val: object) =>
  val instanceof Map || val instanceof Set || val instanceof WeakMap || val instanceof WeakSet;

export const isElt = (el: unknown) => el instanceof HTMLElement;
export const isInp = (el: unknown) => el instanceof HTMLInputElement;
export const isSel = (el: unknown) => el instanceof HTMLSelectElement;
export const isTxt = (el: unknown) => el instanceof HTMLTextAreaElement;
