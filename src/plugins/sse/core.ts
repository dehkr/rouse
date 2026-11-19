import type { CoreApi } from '../../plugin-api';

/** Core's shared functions, set at the first install. Every app passes the same object. */
export let core: CoreApi;

export function setCore(api: CoreApi): void {
  core = api;
}
