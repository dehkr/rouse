import type { SetupFn } from '../types';

export class Registry {
  private controllers = new Map<string, SetupFn<any>>();

  register(name: string, setup: SetupFn<any>) {
    this.controllers.set(name, setup);
  }

  get(name: string): SetupFn<any> | undefined {
    return this.controllers.get(name);
  }

  has(name: string): boolean {
    return this.controllers.has(name);
  }
}
