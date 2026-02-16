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

export interface InsertConfig {
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
 * Parse value of rz-insert directive
 */
export function getInsertConfig(el: HTMLElement): InsertConfig {
  const raw = getDirective(el, SLUG);

  if (!raw) {
    return { targets: [el], strategy: DEFAULT_METHOD };
  }

  const parsed = parseDirective(raw);
  const firstPair = parsed[0];

  if (!firstPair) {
    return { targets: [el], strategy: DEFAULT_METHOD };
  }

  const [key, val] = firstPair;

  // Case 1: "STRATEGY: SELECTOR" (e.g. "beforebegin: #header")
  if (val) {
    const strategy = isInsertMethod(key) ? key : DEFAULT_METHOD;
    const nodeList = document.querySelectorAll(val);

    if (nodeList.length === 0) {
      warn(val);
      return { strategy, targets: [] };
    }

    return { strategy, targets: Array.from(nodeList) as HTMLElement[] };
  }

  // Case 2: "STRATEGY" (e.g. "delete", "outerHTML")
  if (isInsertMethod(key)) {
    return { targets: [el], strategy: key };
  }

  // Case 3: "SELECTOR" (e.g. "#output")
  const nodeList = document.querySelectorAll(key);
  if (nodeList.length === 0) {
    warn(key);
    return { targets: [], strategy: DEFAULT_METHOD };
  }

  return { targets: Array.from(nodeList) as HTMLElement[], strategy: DEFAULT_METHOD };
}
