import { IS_CONTROLLER } from '../dom/controller';
import type { ControllerFn } from '../types';

export class Registry {
  private controllers = new Map<string, ControllerFn<any>>();

  register(name: string, setup: ControllerFn<any>) {
    if (!(setup as any)[IS_CONTROLLER]) {
      throw new Error(`[Rouse] '${name}' is not a valid controller.`);
    }
    this.controllers.set(name, setup);
  }

  get(name: string): ControllerFn<any> | undefined {
    return this.controllers.get(name);
  }

  has(name: string): boolean {
    return this.controllers.has(name);
  }
}
