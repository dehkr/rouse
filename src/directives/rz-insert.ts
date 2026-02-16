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
  target: HTMLElement | null;
  strategy: InsertMethod;
}

function isInsertMethod(key: string): key is InsertMethod {
  return STRATEGIES.has(key as InsertMethod);
}

/**
 * Parse value of rz-insert directive
 */
export function getInsertConfig(el: HTMLElement): InsertConfig {
  const raw = getDirective(el, SLUG);

  if (!raw) {
    return { target: el, strategy: DEFAULT_METHOD };
  }

  const parsed = parseDirective(raw);
  const firstPair = parsed[0];

  if (!firstPair) {
    return { target: el, strategy: DEFAULT_METHOD };
  }

  const [key, val] = firstPair;

  // Case 1: "STRATEGY: SELECTOR" (e.g. "beforebegin: #header")
  if (val) {
    const strategy = isInsertMethod(key) ? key : DEFAULT_METHOD;
    let target = document.querySelector(val) as HTMLElement;

    if (!target) {
      console.warn(`[Rouse] Target "${val}" not found.`);
      return { strategy, target: null };
    }

    return { strategy, target };
  }

  // Case 2: "STRATEGY" (e.g. "delete", "outerHTML")
  if (isInsertMethod(key)) {
    return { target: el, strategy: key };
  }

  // Case 3: "SELECTOR" (e.g. "#output")
  const target = document.querySelector(key) as HTMLElement;
  if (!target) {
    console.warn(`[Rouse] Target "${key}" not found.`);
    return { target: null, strategy: DEFAULT_METHOD };
  }
  
  return { target, strategy: DEFAULT_METHOD };
}
