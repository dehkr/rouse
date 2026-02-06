import { getDirective } from '../dom/attributes';
import { safeParse } from '../dom/utils';

export const SLUG = 'props' as const;

export function getProps(el: HTMLElement): Record<string, any> {
  let props = {};
  try {
    const raw = getDirective(el, SLUG);
    if (raw) props = safeParse(raw);
  } catch (e) {
    console.warn(`[Rouse] Failed to parse props for`, el, e);
  }
  return props;
}
