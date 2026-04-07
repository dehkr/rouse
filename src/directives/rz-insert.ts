import { parseDirectiveValue } from '../core/parser';
import { getDirectiveValue, queryTargets, warn } from '../core/shared';
import type { DirectiveSchema } from '../types';

export const rzInsert = {
  slug: 'insert',
  handler: getInsertConfig,
} as const satisfies DirectiveSchema;

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

const DEFAULT_METHOD: InsertMethod = 'innerHTML';
const strategies = new Set<InsertMethod>(INSERT_METHODS);

export interface InsertOperation {
  targets: Element[];
  strategy: InsertMethod;
}

function isInsertMethod(key: string): key is InsertMethod {
  return strategies.has(key as InsertMethod);
}

/**
 * Parse value of rz-insert directive.
 * Returns an array of operations to support multi-target updates.
 */
export function getInsertConfig(el: Element): InsertOperation[] {
  const rawValue = getDirectiveValue(el, 'insert');

  // Default behavior updates innerHTML of self
  if (!rawValue) {
    return [{ targets: [el], strategy: DEFAULT_METHOD }];
  }

  const parsed = parseDirectiveValue(rawValue);
  if (parsed.length === 0) {
    return [{ targets: [el], strategy: DEFAULT_METHOD }];
  }

  const operations: InsertOperation[] = [];

  const appRoot = el.closest('[data-rouse-app]') || document.documentElement;

  // Iterate over all parsed pairs
  for (const [key, val] of parsed) {
    // Case 1: "STRATEGY: SELECTOR" (e.g. "beforebegin: #header")
    if (val) {
      const strategy = isInsertMethod(key) ? key : DEFAULT_METHOD;
      const nodeList = queryTargets(appRoot, val);

      if (nodeList.length === 0) {
        warn(`No targets found for "${val}".`);
        // Push empty op to maintain index but do nothing
        operations.push({ strategy, targets: [] });
      } else {
        operations.push({
          strategy,
          targets: Array.from(nodeList),
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
    const nodeList = queryTargets(appRoot, key);
    if (nodeList.length === 0) {
      warn(`No targets found for "${key}".`);
      operations.push({ targets: [], strategy: DEFAULT_METHOD });
    } else {
      operations.push({
        targets: Array.from(nodeList),
        strategy: DEFAULT_METHOD,
      });
    }
  }

  return operations;
}
