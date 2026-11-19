import { fail } from '../core/diagnostics';
import type { CoreApi } from '../plugin-api';

/** Core's shared functions, set at the first install. Every app passes the same object. */
export let core: CoreApi;

/**
 * Keeps the core from the first install. A different core means the page loaded two
 * copies of the library, whose apps would mix two reactivity systems.
 */
export function setCore(api: CoreApi): void {
  if (core && core !== api) {
    fail(
      'A plugin was installed into apps from two copies of core. Load core once, from one URL.',
    );
  }
  core = api;
}
