import { IS_SCOPE } from '../dom/scope';
import type { ScopeSetup } from '../types';
import { fail, warn } from './diagnostics';

/** Scope names already warned as duplicates. Dev-only. */
const warnedDuplicates = new Set<string>();

/**
 * Warns once per name when a scope name is registered again.
 * Call as `__DEV__ && warnDuplicateOnce(...)`.
 */
function warnDuplicateOnce(name: string): void {
  if (warnedDuplicates.has(name)) return;
  warnedDuplicates.add(name);

  warn(
    `Scope '${name}' is already registered. The new setup replaces it for elements scanned from now on.`,
  );
}

export class ScopeRegistry {
  private scopes = new Map<string, ScopeSetup<any>>();

  register(name: string, setup: ScopeSetup<any>) {
    if (!(setup as any)[IS_SCOPE]) {
      fail(`'${name}' is not a valid scope.`);
    }
    __DEV__ && this.scopes.has(name) && warnDuplicateOnce(name);
    this.scopes.set(name, setup);
  }

  get(name: string): ScopeSetup<any> | undefined {
    return this.scopes.get(name);
  }

  has(name: string): boolean {
    return this.scopes.has(name);
  }
}
