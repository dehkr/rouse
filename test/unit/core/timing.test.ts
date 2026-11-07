import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { applyTiming, parseTime } from '../../../src/core/timing';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('parseTime', () => {
  it.each([
    [500, 500],
    ['500', 500],
    ['500ms', 500],
    ['5s', 5000],
    ['1.5s', 1500],
    ['.5s', 500],
    ['0.5m', 30000],
    [' 2S ', 2000],
  ] as const)('reads %j as %d ms', (input, ms) => {
    expect(parseTime(input)).toBe(ms);
  });

  it('reads empty values as 0', () => {
    expect(parseTime('')).toBe(0);
    expect(parseTime(undefined)).toBe(0);
    expect(parseTime(0)).toBe(0);
  });

  it.each(['5h', 'fast', '-1s', '1 s'])('warns and returns 0 for %j', (input) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseTime(input)).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('applyTiming', () => {
  it('calls through immediately without a strategy', () => {
    const fn = vi.fn();
    applyTiming(fn, {})('a');
    expect(fn).toHaveBeenCalledExactlyOnceWith('a');
  });

  describe('debounce', () => {
    it('fires once on the trailing edge with the last arguments of a burst', () => {
      const fn = vi.fn();
      const timed = applyTiming(fn, { debounce: '100ms' });
      timed(1);
      vi.advanceTimersByTime(50);
      timed(2);
      vi.advanceTimersByTime(50);
      timed(3);
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledExactlyOnceWith(3);
    });

    it('defaults to 300ms', () => {
      const fn = vi.fn();
      applyTiming(fn, { debounce: true })();
      vi.advanceTimersByTime(299);
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('fires on the leading edge only when leading is named alone', () => {
      const fn = vi.fn();
      const timed = applyTiming(fn, { debounce: '100ms', leading: true });
      timed(1);
      timed(2);
      expect(fn).toHaveBeenCalledExactlyOnceWith(1);
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledOnce();
      timed(3);
      expect(fn).toHaveBeenLastCalledWith(3);
    });

    it('fires on both edges when both are named, skipping a trailing call with no new input', () => {
      const fn = vi.fn();
      const timed = applyTiming(fn, { debounce: '100ms', leading: true, trailing: true });
      timed(1);
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledExactlyOnceWith(1);

      timed(2);
      timed(3);
      vi.advanceTimersByTime(100);
      expect(fn.mock.calls).toEqual([[1], [2], [3]]);
    });

    it('drops a pending call on cancel', () => {
      const fn = vi.fn();
      const timed = applyTiming(fn, { debounce: '100ms' });
      timed();
      timed.cancel();
      vi.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('throttle', () => {
    it('fires on the leading edge, then once on the trailing edge with the last arguments', () => {
      const fn = vi.fn();
      const timed = applyTiming(fn, { throttle: '100ms' });
      timed(1);
      timed(2);
      timed(3);
      expect(fn.mock.calls).toEqual([[1]]);
      vi.advanceTimersByTime(100);
      expect(fn.mock.calls).toEqual([[1], [3]]);
    });

    it('runs at most once per window under a steady stream', () => {
      const fn = vi.fn();
      const timed = applyTiming(fn, { throttle: '100ms' });
      for (let t = 0; t < 1000; t += 10) {
        timed(t);
        vi.advanceTimersByTime(10);
      }
      expect(fn.mock.calls.length).toBeGreaterThanOrEqual(10);
      expect(fn.mock.calls.length).toBeLessThanOrEqual(11);
    });

    it('defaults to 150ms', () => {
      const fn = vi.fn();
      const timed = applyTiming(fn, { throttle: true });
      timed(1);
      timed(2);
      vi.advanceTimersByTime(149);
      expect(fn).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('drops calls inside the window when only leading is named', () => {
      const fn = vi.fn();
      const timed = applyTiming(fn, { throttle: '100ms', leading: true });
      timed(1);
      timed(2);
      vi.advanceTimersByTime(100);
      expect(fn.mock.calls).toEqual([[1]]);
    });

    it('delays the first call by the full window when only trailing is named', () => {
      const fn = vi.fn();
      const timed = applyTiming(fn, { throttle: '100ms', trailing: true });
      timed(1);
      timed(2);
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledExactlyOnceWith(2);
    });

    it('drops a pending trailing call on cancel', () => {
      const fn = vi.fn();
      const timed = applyTiming(fn, { throttle: '100ms' });
      timed(1);
      timed(2);
      timed.cancel();
      vi.advanceTimersByTime(200);
      expect(fn.mock.calls).toEqual([[1]]);
    });
  });

  it('prefers debounce when both strategies are present', () => {
    const fn = vi.fn();
    const timed = applyTiming(fn, { debounce: '100ms', throttle: '100ms' });
    timed();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });
});
