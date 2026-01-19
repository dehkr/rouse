/**
 * Adapted from Vue.js
 * The following code for EffectScope is heavily inspired by/copied from @vue/reactivity.
 * https://github.com/vuejs/core/blob/main/packages/reactivity/src/effectScope.ts
 * --------------------------------------------------------------------------------------
 * The MIT License (MIT)
 *
 * Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import type { ReactiveEffect } from './effect';

export let activeEffectScope: EffectScope | undefined;

export class EffectScope {
  detached: boolean;
  /** @internal */
  private _active = true;
  /** @internal Track `on` calls, allow `on` call multiple times */
  private _on = 0;
  /** @internal */
  effects: ReactiveEffect[] = [];
  /** @internal */
  cleanups: (() => void)[] = [];

  private _isPaused = false;

  /** @internal Only assigned by undetached scope */
  parent: EffectScope | undefined;
  /** @internal Record undetached scopes */
  scopes: EffectScope[] | undefined;
  /** @internal Track a child scope's index in its parent's scopes array for optimized removal */
  private index: number | undefined;

  constructor(detached = false) {
    this.detached = detached;
    this.parent = activeEffectScope;
    if (!detached && activeEffectScope) {
      this.index = (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(this) - 1;
    }
  }

  get active(): boolean {
    return this._active;
  }

  pause(): void {
    if (this._active) {
      this._isPaused = true;
      let i, l;
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i]?.pause();
        }
      }
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i]?.pause();
      }
    }
  }

  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume(): void {
    if (this._active) {
      if (this._isPaused) {
        this._isPaused = false;
        let i, l;
        if (this.scopes) {
          for (i = 0, l = this.scopes.length; i < l; i++) {
            this.scopes[i]?.resume();
          }
        }
        for (i = 0, l = this.effects.length; i < l; i++) {
          this.effects[i]?.resume();
        }
      }
    }
  }

  run<T>(fn: () => T): T | undefined {
    if (this._active) {
      const currentEffectScope = activeEffectScope;
      try {
        activeEffectScope = this;
        return fn();
      } finally {
        activeEffectScope = currentEffectScope;
      }
    } else {
      console.warn(`cannot run an inactive effect scope.`);
    }
  }

  prevScope: EffectScope | undefined;
  /** @internal This should only be called on non-detached scopes */
  on(): void {
    if (++this._on === 1) {
      this.prevScope = activeEffectScope;
      activeEffectScope = this;
    }
  }

  /** @internal This should only be called on non-detached scopes */
  off(): void {
    if (this._on > 0 && --this._on === 0) {
      activeEffectScope = this.prevScope;
      this.prevScope = undefined;
    }
  }

  stop(fromParent?: boolean): void {
    if (this._active) {
      this._active = false;
      let i, l;
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i]?.stop();
      }
      this.effects.length = 0;

      for (i = 0, l = this.cleanups.length; i < l; i++) {
        const cleanup = this.cleanups[i];
        cleanup !== undefined && cleanup();
      }
      this.cleanups.length = 0;

      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i]?.stop(true);
        }
        this.scopes.length = 0;
      }

      // nested scope, dereference from parent to avoid memory leaks
      if (!this.detached && this.parent && !fromParent) {
        // optimized O(1) removal
        const last = this.parent.scopes!.pop();
        if (last && last !== this) {
          this.parent.scopes![this.index!] = last;
          last.index = this.index!;
        }
      }
      this.parent = undefined;
    }
  }
}

/**
 * Creates an effect scope object which can capture the reactive effects (i.e.
 * computed and watchers) created within it so that these effects can be
 * disposed together. For detailed use cases of this API, please consult its
 * corresponding {@link https://github.com/vuejs/rfcs/blob/master/active-rfcs/0041-reactivity-effect-scope.md | RFC}.
 *
 * @param detached - Can be used to create a "detached" effect scope.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#effectscope}
 */
export function effectScope(detached?: boolean): EffectScope {
  return new EffectScope(detached);
}

/**
 * Returns the current active effect scope if there is one.
 *
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#getcurrentscope}
 */
export function getCurrentScope(): EffectScope | undefined {
  return activeEffectScope;
}

/**
 * Registers a dispose callback on the current active effect scope. The
 * callback will be invoked when the associated effect scope is stopped.
 *
 * @param fn - The callback function to attach to the scope's cleanup.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#onscopedispose}
 */
export function onScopeDispose(fn: () => void, failSilently = false): void {
  if (activeEffectScope) {
    activeEffectScope.cleanups.push(fn);
  } else if (!failSilently) {
    console.warn(
      `onScopeDispose() is called when there is no active effect scope` + ` to be associated with.`,
    );
  }
}
