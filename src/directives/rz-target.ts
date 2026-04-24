import { getApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import {
  getDefinedDirectiveValue,
  getDirectiveValue,
  hasDirective,
  queryTargets,
  warn,
} from '../core/shared';
import type { Directive } from '../types';

export const rzTarget = {
  existsOn: (el: Element) => hasDirective(el, 'target'),
  getValue: (el: Element) => getDirectiveValue(el, 'target'),
  getDefinedValue: (el: Element) => getDefinedDirectiveValue(el, 'target'),
  getInsertConfig,
} as const satisfies Directive;

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

export interface InsertOperation {
  targets: Element[];
  strategy: InsertMethod;
}

function isInsertMethod(key: string): key is InsertMethod {
  return INSERT_METHODS.includes(key as InsertMethod);
}

/**
 * Parse value of rz-target directive.
 *
 * Returns an array of operations to support multi-target updates.
 * Accepts "strategy: selector", "strategy", and/or "selector" values.
 *
 * Defaults to "innerHTML" if strategy is missing and the host element
 * if the selector is missing.
 *
 * - `rz-target="beforebegin: #header"`
 * - `rz-target="beforebegin"`
 * - `rz-target="#output"`
 */
function getInsertConfig(el: Element, overrideValue?: string | null): InsertOperation[] {
  const value = overrideValue || getDefinedDirectiveValue(el, 'target');

  if (!value) {
    return [{ targets: [el], strategy: DEFAULT_METHOD }];
  }

  const parsed = parseDirectiveValue(value);
  if (parsed.length === 0) {
    return [{ targets: [el], strategy: DEFAULT_METHOD }];
  }

  const operations: InsertOperation[] = [];
  const appRoot = getApp(el)?.root || document.documentElement;

  for (const [key, val] of parsed) {
    // Skip store targets to prevent false DOM target warnings
    if (key.startsWith('@') || (val && val.startsWith('@'))) continue;

    // "Strategy: Selector"
    if (val) {
      const strategy = isInsertMethod(key) ? key : DEFAULT_METHOD;
      const nodeList = queryTargets(appRoot, val);

      if (nodeList.length === 0) {
        warn(`No targets found for '${val}'.`);
        operations.push({ strategy, targets: [] });
      } else {
        operations.push({
          strategy,
          targets: Array.from(nodeList),
        });
      }
      continue;
    }

    // "Strategy"
    if (isInsertMethod(key)) {
      operations.push({ targets: [el], strategy: key });
      continue;
    }

    // "Selector"
    const nodeList = queryTargets(appRoot, key);
    if (nodeList.length === 0) {
      warn(`No targets found for '${key}'.`);
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
