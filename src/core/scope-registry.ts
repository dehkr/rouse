import type { ScopeSetup } from '../types';
import { warn } from './diagnostics';

/** Scope names already warned as duplicates. Dev-only. */
const warnedDuplicates = new Set<string>();

/**
 * Warns once per name when a scope name is registered again.
 * Call inside `if (__DEV__)`.
 */
function warnDuplicateOnce(name: string): void {
  if (warnedDuplicates.has(name)) return;
  warnedDuplicates.add(name);

  warn(
    `Scope '${name}' is already registered. The new setup replaces it for elements scanned from now on.`,
  );
}

// `app.scope()` is the only way in and holds the setup check. The duplicate warning
// is also the only check on `app.scope()` called inside a setup.
export class ScopeRegistry {
  private scopes = new Map<string, ScopeSetup<any>>();

  register(name: string, setup: ScopeSetup<any>) {
    if (__DEV__ && this.scopes.has(name)) {
      warnDuplicateOnce(name);
    }
    this.scopes.set(name, setup);
  }

  get(name: string): ScopeSetup<any> | undefined {
    return this.scopes.get(name);
  }
}
