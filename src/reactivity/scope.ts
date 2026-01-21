/* ---------------------------------------------------------------------------------------
Adapted from Vue.js
The following code is heavily inspired by / copied from @vue/reactivity.
https://github.com/vuejs/core/blob/main/packages/reactivity/src/effectScope.ts

Modifications:

- Removed `detached` mode; scopes are always `attached` in Gilligan
- Simplified scope tracking by using `Set` instead of `Array`
- Removed internal on() and off() methods

------------------------------------------------------------------------------------------
The MIT License (MIT)
 
Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
 
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
--------------------------------------------------------------------------------------- */
import type { ReactiveEffect } from './effect';

export let activeEffectScope: EffectScope | undefined;

export class EffectScope {
  active = true;
  effects: ReactiveEffect[] = [];
  cleanups: (() => void)[] = [];

  scopes?: Set<EffectScope>;

  private _isPaused = false;
  private parent: EffectScope | undefined;

  constructor() {
    this.parent = activeEffectScope;
    // Attach to parent if one exists
    if (activeEffectScope) {
      (activeEffectScope.scopes || (activeEffectScope.scopes = new Set())).add(this);
    }
  }

  /**
   * Runs a function within this scope.
   * If the scope is inactive, the function runs but effects won't be collected.
   */
  run<T>(fn: () => T): T | undefined {
    if (this.active) {
      const currentEffectScope = activeEffectScope;
      try {
        activeEffectScope = this;
        return fn();
      } finally {
        activeEffectScope = currentEffectScope;
      }
    } else {
      console.warn(`Cannot run an inactive effect scope.`);
    }
  }

  pause() {
    if (this.active) {
      this._isPaused = true;
      if (this.scopes) {
        this.scopes.forEach((s) => s.pause());
      }
      this.effects.forEach((e) => e.pause());
    }
  }

  resume() {
    if (this.active && this._isPaused) {
      this._isPaused = false;
      if (this.scopes) {
        this.scopes.forEach((s) => s.resume());
      }
      this.effects.forEach((e) => e.resume());
    }
  }

  stop(fromParent = false) {
    if (this.active) {
      this.active = false;

      this.effects.forEach((e) => e.stop());
      this.effects.length = 0;

      this.cleanups.forEach((cleanup) => cleanup());
      this.cleanups.length = 0;

      // Stop child scopes
      if (this.scopes) {
        this.scopes.forEach((s) => s.stop(true));
        this.scopes.clear();
      }

      // Detach from parent if not called by parent
      if (this.parent && !fromParent) {
        this.parent.scopes?.delete(this);
      }
      this.parent = undefined;
    }
  }
}

/**
 * Creates an effect scope object which can capture the reactive effects (i.e.
 * computed and watchers) created within it so that these effects can be
 * disposed together.
 *
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#effectscope}
 */
export function effectScope() {
  return new EffectScope();
}

/**
 * Returns the current active effect scope if there is one.
 *
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#getcurrentscope}
 */
export function getCurrentScope() {
  return activeEffectScope;
}

/**
 * Registers a dispose callback on the current active effect scope. The
 * callback will be invoked when the associated effect scope is stopped.
 *
 * @param fn - The callback function to attach to the scope's cleanup.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#onscopedispose}
 */
export function onScopeDispose(fn: () => void) {
  if (activeEffectScope) {
    activeEffectScope.cleanups.push(fn);
  } else {
    console.warn(`onScopeDispose() called with no active effect scope.`);
  }
}
