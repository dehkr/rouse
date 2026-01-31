import type { SetupFn } from '../types';

export const registry: Record<string, SetupFn> = {};

export function register(name: string, setup: SetupFn<any>) {
  registry[name] = setup;
}
