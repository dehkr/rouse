import { directiveSelector, getDirectiveValue } from '../core/attributes';
import type { ConfigDirective } from '../types';

function getConfig(el: Element): string | null {
  return getDirectiveValue(el, 'scope');
}

// Queried despite being a config directive. Import this module directly: through the
// `directives/` barrel it closes a cycle back into `dom/binder.ts`.
export const SCOPE_SELECTOR = directiveSelector('scope');

export const rzScope = { getConfig } as const satisfies ConfigDirective<string | null>;
