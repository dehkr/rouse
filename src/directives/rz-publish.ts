import { getDirective } from './prefix';

export const SLUG = 'publish' as const;

export function getPublishTopic(el: HTMLElement): string | null {
  return getDirective(el, SLUG);
}
