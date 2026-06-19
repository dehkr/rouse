import { splitInjection } from '../core/injection';
import { getDirectiveValue } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

const SLUG = 'scope' as const satisfies DirectiveSlug;

function getConfig(
  el: Element,
): { scopeName: string; rawPayload: string | undefined } | null {
  const value = getDirectiveValue(el, SLUG);
  if (value === null) return null;

  const { key: scopeName, rawPayload } = splitInjection(value);

  return { scopeName, rawPayload };
}

export const rzScope = {
  slug: SLUG,
  getConfig,
} as const satisfies ConfigDirective<{
  scopeName: string;
  rawPayload: string | undefined;
} | null>;
