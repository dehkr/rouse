import { splitInjection } from '../core/props';
import { getDirectiveValue } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

const SLUG = 'scope' as const satisfies DirectiveSlug;

function getConfig(
  el: Element,
): { controllerName: string; rawPayload: string | undefined } | null {
  const value = getDirectiveValue(el, SLUG);
  if (value === null) return null;

  const { key: controllerName, rawPayload } = splitInjection(value);

  return { controllerName, rawPayload };
}

export const rzScope = {
  slug: SLUG,
  getConfig,
} as const satisfies ConfigDirective<{
  controllerName: string;
  rawPayload: string | undefined;
} | null>;
