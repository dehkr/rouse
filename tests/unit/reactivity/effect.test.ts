import { effectScope, effect as rawEffect, getActiveSub, signal } from 'alien-signals';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { effect } from '../../../src/reactivity/effect';
import { batch, reactive } from '../../../src/reactivity/reactive';

const stops: Array<() => void> = [];

/** Registers a stop function to run after each test. */
function keep(stop: () => void) {
  stops.push(stop);
  return stop;
}

afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
});

/** The `[value, prev]` pairs an `apply` spy received, without `stop`. */
const calls = (apply: { mock: { calls: unknown[][] } }) =>
  apply.mock.calls.map(([value, prev]) => [value, prev]);

describe('effect(fn)', () => {
  it('re-runs when a value it read changes', () => {
    const count = signal(0);
    const seen: number[] = [];
    keep(effect(() => seen.push(count())));

    count(1);
    expect(seen).toEqual([0, 1]);
  });

  it('runs a returned cleanup before each re-run and on stop', () => {
    const count = signal(0);
    const log: string[] = [];
    const stop = effect(() => {
      const n = count();
      log.push(`run ${n}`);
      return () => log.push(`cleanup ${n}`);
    });

    count(1);
    stop();
    expect(log).toEqual(['run 0', 'cleanup 0', 'run 1', 'cleanup 1']);
  });

  it('ignores a non-function return value', () => {
    const label = signal('a');
    const el = { textContent: '' };
    const stop = effect(() => (el.textContent = label()));

    expect(() => label('b')).not.toThrow();
    expect(el.textContent).toBe('b');
    expect(stop).not.toThrow();
  });

  it('runs the cleanup returned by the run that stops it', () => {
    const count = signal(0);
    let cleanups = 0;
    const stop = effect(() => {
      if (count() === 1) {
        stop();
      }
      return () => cleanups++;
    });

    count(1);
    count(2);
    expect(cleanups).toBe(2);
  });
});

describe('effect(compute, apply)', () => {
  it('runs apply on creation with prev set to undefined', () => {
    const apply = vi.fn();
    keep(effect(() => 1, apply));

    expect(calls(apply)).toEqual([[1, undefined]]);
  });

  it('passes the new and previous values on a change', () => {
    const count = signal(0);
    const apply = vi.fn();
    keep(effect(() => count(), apply));

    count(1);
    expect(calls(apply)).toEqual([
      [0, undefined],
      [1, 0],
    ]);
  });

  it('skips the first apply with defer, then passes the initial value as prev', () => {
    const count = signal(0);
    const apply = vi.fn();
    keep(effect(() => count(), apply, { defer: true }));

    expect(apply).not.toHaveBeenCalled();
    count(1);
    expect(calls(apply)).toEqual([[1, 0]]);
  });

  it("doesn't run apply when compute re-runs with the same value", () => {
    const count = signal(1);
    const apply = vi.fn();
    keep(effect(() => count() > 0, apply));

    apply.mockClear();
    count(2);
    expect(apply).not.toHaveBeenCalled();
  });

  it("doesn't track reads inside apply", () => {
    const tracked = signal(0);
    const other = signal(0);
    const apply = vi.fn(() => other());
    keep(effect(() => tracked(), apply));

    apply.mockClear();
    other(1);
    expect(apply).not.toHaveBeenCalled();
  });

  it('runs a cleanup before the next apply and on stop, but not on an unchanged value', () => {
    const count = signal(1);
    const log: string[] = [];
    const stop = effect(
      () => count() > 0,
      (positive) => {
        log.push(`apply ${positive}`);
        return () => log.push(`cleanup ${positive}`);
      },
    );

    count(2);
    expect(log).toEqual(['apply true']);

    count(-1);
    stop();
    expect(log).toEqual(['apply true', 'cleanup true', 'apply false', 'cleanup false']);
  });

  it('accepts a signal as compute, typed by its value, without writing to it', () => {
    const count = signal(0);
    const seen: Array<[number, number | undefined]> = [];
    keep(
      effect(count, (n, prev) => {
        seen.push([n, prev]);
      }),
    );

    count(1);
    count(2);
    expect(count()).toBe(2);
    expect(seen).toEqual([
      [0, undefined],
      [1, 0],
      [2, 1],
    ]);
  });

  it('ignores a non-function return value', () => {
    const label = signal('a');
    const el = { textContent: '' };
    const stop = effect(
      () => label(),
      (t) => (el.textContent = t),
    );

    expect(() => label('b')).not.toThrow();
    expect(el.textContent).toBe('b');
    expect(stop).not.toThrow();
  });

  it('stops from apply on the first run', () => {
    const ready = signal(true);
    const apply = vi.fn((r: boolean, _prev: boolean | undefined, stop: () => void) => {
      if (r) {
        stop();
      }
    });
    keep(effect(ready, apply));

    ready(false);
    ready(true);
    expect(calls(apply)).toEqual([[true, undefined]]);
  });

  it("stops from apply on a later run, and runs that run's cleanup", () => {
    const count = signal(0);
    const log: string[] = [];
    keep(
      effect(count, (n, _prev, stop) => {
        log.push(`apply ${n}`);
        if (n === 1) {
          stop();
        }
        return () => log.push(`cleanup ${n}`);
      }),
    );

    count(1);
    count(2);
    expect(log).toEqual(['apply 0', 'cleanup 0', 'apply 1', 'cleanup 1']);
  });

  it('stops from apply after compute threw on creation', () => {
    const count = signal(0);
    const apply = vi.fn((n: number, _prev: number | undefined, stop: () => void) => {
      if (n === 1) {
        stop();
      }
    });
    const compute = () => {
      if (count() === 0) {
        throw new Error('compute');
      }
      return count();
    };
    expect(() => effect(compute, apply)).toThrow('compute');

    count(1);
    count(2);
    count(3);
    expect(calls(apply)).toEqual([[1, undefined]]);
  });

  it('stays stopped when apply calls stop and then throws on the first run', () => {
    const count = signal(0);
    const apply = vi.fn((_n: number, _prev: number | undefined, stop: () => void) => {
      stop();
      throw new Error('apply');
    });
    expect(() => effect(count, apply)).toThrow('apply');

    count(1);
    count(2);
    expect(calls(apply)).toEqual([[0, undefined]]);
  });

  it('stops from apply after apply threw on creation', () => {
    const count = signal(0);
    const apply = vi.fn((n: number, _prev: number | undefined, stop: () => void) => {
      if (n === 0) {
        throw new Error('apply');
      }
      if (n === 1) {
        stop();
      }
    });
    expect(() => effect(count, apply)).toThrow('apply');

    count(1);
    count(2);
    count(3);
    expect(calls(apply)).toEqual([
      [0, undefined],
      [1, 0],
    ]);
  });

  it('runs apply once for several writes inside batch()', () => {
    const state = reactive({ query: '', page: 1 });
    const apply = vi.fn();
    keep(effect(() => [state.query, state.page], apply));

    apply.mockClear();
    batch(() => {
      state.query = 'a';
      state.page = 2;
    });
    expect(calls(apply)).toEqual([
      [
        ['a', 2],
        ['', 1],
      ],
    ]);
  });

  it('restores the active subscriber after a throw in compute or apply', () => {
    const before = getActiveSub();

    expect(() =>
      effect(
        () => {
          throw new Error('compute');
        },
        () => {},
      ),
    ).toThrow('compute');
    expect(getActiveSub()).toBe(before);

    expect(() =>
      effect(
        () => 1,
        () => {
          throw new Error('apply');
        },
      ),
    ).toThrow('apply');
    expect(getActiveSub()).toBe(before);
  });

  it('keeps tracking after compute throws on a re-run, with the last good value as prev', () => {
    const count = signal(0);
    const apply = vi.fn();
    keep(
      effect(() => {
        if (count() === 1) {
          throw new Error('compute');
        }
        return count();
      }, apply),
    );

    expect(() => count(1)).toThrow('compute');
    count(2);
    count(3);
    expect(calls(apply)).toEqual([
      [0, undefined],
      [2, 0],
      [3, 2],
    ]);
  });

  it('keeps tracking after compute throws on creation', () => {
    const count = signal(1);
    const apply = vi.fn();
    const compute = () => {
      if (count() === 1) {
        throw new Error('compute');
      }
      return count();
    };
    expect(() => effect(compute, apply)).toThrow('compute');

    count(2);
    expect(calls(apply)).toEqual([[2, undefined]]);
  });

  it('takes the first good value as the baseline with defer after compute throws on creation', () => {
    const count = signal(1);
    const apply = vi.fn();
    const compute = () => {
      if (count() === 1) {
        throw new Error('compute');
      }
      return count();
    };
    expect(() => effect(compute, apply, { defer: true })).toThrow('compute');

    count(2);
    expect(apply).not.toHaveBeenCalled();
    count(3);
    expect(calls(apply)).toEqual([[3, 2]]);
  });

  it('keeps tracking compute after a throw in apply', () => {
    const count = signal(0);
    const apply = vi.fn((n: number) => {
      if (n === 1) {
        throw new Error('apply');
      }
    });
    keep(effect(() => count(), apply));

    expect(() => count(1)).toThrow('apply');
    count(2);
    expect(calls(apply).at(-1)).toEqual([2, 1]);
  });

  it('stops an effect created in apply before the next apply', () => {
    const outer = signal(0);
    const inner = signal(0);
    const innerRuns = vi.fn();
    keep(
      effect(outer, () => {
        rawEffect(() => innerRuns(inner()));
      }),
    );

    outer(1);
    innerRuns.mockClear();
    inner(1);
    // Only the effect from the second apply is left
    expect(innerRuns).toHaveBeenCalledOnce();
  });

  it('stops an effect created in apply when the effect stops', () => {
    const inner = signal(0);
    const innerRuns = vi.fn();
    const stop = effect(
      () => 0,
      () => {
        rawEffect(() => innerRuns(inner()));
      },
    );

    stop();
    innerRuns.mockClear();
    inner(1);
    expect(innerRuns).not.toHaveBeenCalled();
  });

  it('stops an effect created in apply when apply then throws', () => {
    const inner = signal(0);
    const innerRuns = vi.fn();
    expect(() =>
      effect(
        () => 0,
        () => {
          rawEffect(() => innerRuns(inner()));
          throw new Error('apply');
        },
      ),
    ).toThrow('apply');

    innerRuns.mockClear();
    inner(1);
    expect(innerRuns).not.toHaveBeenCalled();
  });

  it('stops with an enclosing effect scope, along with effects created in apply', () => {
    const outer = signal(0);
    const inner = signal(0);
    const apply = vi.fn();
    const innerRuns = vi.fn();
    const stopScope = effectScope(() => {
      effect(outer, (n) => {
        apply(n);
        rawEffect(() => innerRuns(inner()));
      });
    });

    stopScope();
    apply.mockClear();
    innerRuns.mockClear();
    outer(1);
    inner(1);
    expect(apply).not.toHaveBeenCalled();
    expect(innerRuns).not.toHaveBeenCalled();
  });
});
