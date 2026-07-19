import type { RouseApp } from '../core/app';
import { parseTriggerSubjectPairs } from '../core/parser';
import { getDirectiveValue, warn } from '../core/shared';
import type {
  DirectiveSlug,
  StandaloneDirective,
  TriggerSubjectPair,
  VoidFn,
} from '../types';

/**
 * Factory for standalone directives driven by `[trigger]: [subject]` pairs
 * (`rz-fetch`, `rz-push`, `rz-pull`). Owns the per-element cleanup registry
 * and the shared initialize/teardown scaffolding. `bindPairs` wires the parsed
 * pairs for one element and returns their cleanups.
 */
export function defineTriggerDirective(
  slug: Extract<DirectiveSlug, 'fetch' | 'push' | 'pull'>,
  example: string,
  bindPairs: (el: Element, app: RouseApp, pairs: TriggerSubjectPair[]) => VoidFn[],
): StandaloneDirective {
  const elementCleanups = new WeakMap<Element, VoidFn[]>();

  return {
    slug,

    initialize(el: Element, app: RouseApp) {
      if (elementCleanups.has(el)) return;

      const value = getDirectiveValue(el, slug);
      if (value === null) return;

      const pairs = parseTriggerSubjectPairs(value);
      if (pairs.length === 0) {
        __DEV__ &&
          warn(
            `rz-${slug}: at least one trigger is required (e.g., rz-${slug}="${example}").`,
            el,
          );
        return;
      }

      const cleanups = bindPairs(el, app, pairs);
      if (cleanups.length > 0) {
        elementCleanups.set(el, cleanups);
      }
    },

    teardown(el: Element) {
      elementCleanups.get(el)?.forEach((fn) => fn());
      elementCleanups.delete(el);
    },
  };
}
