export const isObj = (val: unknown): val is Record<string, any> =>
  val !== null && typeof val === 'object';

export const isElt = (el: unknown): el is HTMLElement => el instanceof HTMLElement;
export const isInp = (el: unknown): el is HTMLInputElement => el instanceof HTMLInputElement;
export const isSel = (el: unknown): el is HTMLSelectElement => el instanceof HTMLSelectElement;
export const isTxt = (el: unknown): el is HTMLTextAreaElement => el instanceof HTMLTextAreaElement;
