import type { RousePlugin } from 'rousejs';

/** Syncs stores with a server endpoint. Install with `rouse({ plugins: [sync] })`. */
export const sync: RousePlugin = {
  name: 'sync',
  version: __VERSION__,
  install() {},
};
