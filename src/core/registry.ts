import { IS_SCOPE } from '../dom/scope';
import type { ScopeFn } from '../types';
import { fail } from './shared';

export class Registry {
  private scopes = new Map<string, ScopeFn<any>>();

  register(name: string, setup: ScopeFn<any>) {
    if (!(setup as any)[IS_SCOPE]) {
      fail(`'${name}' is not a valid scope.`);
    }
    this.scopes.set(name, setup);
  }

  get(name: string): ScopeFn<any> | undefined {
    return this.scopes.get(name);
  }

  has(name: string): boolean {
    return this.scopes.has(name);
  }
}
