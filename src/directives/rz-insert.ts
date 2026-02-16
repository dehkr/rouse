import { parseDirective } from '../dom/parser';
import { getDirective } from './prefix';

export const SLUG = 'insert' as const;

const DEFAULT_METHOD = 'innerHTML';
const INSERT_METHODS = [
  'innerHTML',
  'outerHTML',
  'beforebegin',
  'afterbegin',
  'beforeend',
  'afterend',
  'delete',
] as const;

export type InsertMethod = (typeof INSERT_METHODS)[number];

const STRATEGIES = new Set<InsertMethod>(INSERT_METHODS);

export interface InsertOperation {
  targets: HTMLElement[];
  strategy: InsertMethod;
}

function isInsertMethod(key: string): key is InsertMethod {
  return STRATEGIES.has(key as InsertMethod);
}

function warn(val: string) {
  console.warn(`[Rouse] No targets found for "${val}".`);
}

/**
 * Parse value of rz-insert directive.
 * Returns an array of operations to support multi-target updates.
 */
export function getInsertConfig(el: HTMLElement): InsertOperation[] {
  const raw = getDirective(el, SLUG);

  // Default behavior updates innerHTML of self
  if (!raw) {
    return [{ targets: [el], strategy: DEFAULT_METHOD }];
  }

  const parsed = parseDirective(raw);
  if (parsed.length === 0) {
    return [{ targets: [el], strategy: DEFAULT_METHOD }];
  }

  const operations: InsertOperation[] = [];

  // Iterate over all parsed pairs
  for (const [key, val] of parsed) {
    // Case 1: "STRATEGY: SELECTOR" (e.g. "beforebegin: #header")
    if (val) {
      const strategy = isInsertMethod(key) ? key : DEFAULT_METHOD;
      const nodeList = document.querySelectorAll(val);

      if (nodeList.length === 0) {
        warn(val);
        // Push empty op to maintain index but do nothing
        operations.push({ strategy, targets: [] });
      } else {
        operations.push({
          strategy,
          targets: Array.from(nodeList) as HTMLElement[],
        });
      }
      continue;
    }

    // Case 2: "STRATEGY" (e.g. "delete", "outerHTML")
    if (isInsertMethod(key)) {
      operations.push({ targets: [el], strategy: key });
      continue;
    }

    // Case 3: "SELECTOR" (e.g. "#output")
    const nodeList = document.querySelectorAll(key);
    if (nodeList.length === 0) {
      warn(key);
      operations.push({ targets: [], strategy: DEFAULT_METHOD });
    } else {
      operations.push({
        targets: Array.from(nodeList) as HTMLElement[],
        strategy: DEFAULT_METHOD,
      });
    }
  }

  return operations;
}
