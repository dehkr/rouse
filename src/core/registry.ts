import type { SetupFunction } from '../types';

export class Registry {
  private controllers = new Map<string, SetupFunction<any>>();

  register(name: string, setup: SetupFunction<any>) {
    this.controllers.set(name, setup);
  }

  get(name: string): SetupFunction<any> | undefined {
    return this.controllers.get(name);
  }

  has(name: string): boolean {
    return this.controllers.has(name);
  }
}
