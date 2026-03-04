import { parseDirective } from '../dom/parser';
import { getDirective } from './prefix';

export const SLUG = 'state' as const;

export function getStateMappings(el: HTMLElement) {
  const raw = getDirective(el, SLUG);
  if (!raw) return [];

  const parsed = parseDirective(raw);
  const mappings: { alias: string; storeName: string }[] = [];

  for (const [key] of parsed) {
    // Split by colon to separate alias and store name (e.g. "alias:store-name")
    const parts = key.split(':').map((s) => s.trim());

    if (parts.length > 1 && parts[0] && parts[1]) {
      mappings.push({ alias: parts[0], storeName: parts[1] });
    } else if (parts[0]) {
      mappings.push({ alias: parts[0], storeName: parts[0] });
    }
  }

  return mappings;
}
