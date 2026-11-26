import { computed, effect } from 'alien-signals';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { batch, reactive } from '../../../src/reactivity/reactive';

const stops: Array<() => void> = [];

/** Runs `fn` in an effect and returns a spy counting its runs. Stopped after each test. */
function track(fn: () => unknown) {
  const runs = vi.fn();
  stops.push(
    effect(() => {
      runs();
      fn();
    }),
  );
  runs.mockClear();
  return runs;
}

afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  vi.restoreAllMocks();
});

describe('batch()', () => {
  it('runs an effect once for several writes, and once per write without it', () => {
    const state = reactive({ a: 0, b: 0, c: 0 });
    const runs = track(() => state.a + state.b + state.c);

    batch(() => {
      state.a = 1;
      state.b = 1;
      state.c = 1;
    });
    expect(runs).toHaveBeenCalledOnce();

    runs.mockClear();
    state.a = 2;
    state.b = 2;
    state.c = 2;
    expect(runs).toHaveBeenCalledTimes(3);
  });

  it('runs effects once, when the outermost batch ends', () => {
    const state = reactive({ a: 0, b: 0 });
    const runs = track(() => state.a + state.b);

    batch(() => {
      state.a = 1;
      batch(() => {
        state.b = 1;
      });
      expect(runs).not.toHaveBeenCalled();
    });
    expect(runs).toHaveBeenCalledOnce();
  });

  it('runs effects for writes before a throw, and propagates the error', () => {
    const state = reactive({ a: 0 });
    let seen = 0;
    track(() => (seen = state.a));

    expect(() =>
      batch(() => {
        state.a = 1;
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(seen).toBe(1);
  });

  it("returns fn's result", () => {
    expect(batch(() => 42)).toBe(42);
  });

  it('reads current values from a computed inside the batch', () => {
    const state = reactive({ a: 1 });
    const double = computed(() => state.a * 2);

    batch(() => {
      state.a = 5;
      expect(double()).toBe(10);
    });
  });

  it('warns when fn returns a promise', async () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await batch(async () => {});
    expect(warnings).toHaveBeenCalledOnce();
  });
});
