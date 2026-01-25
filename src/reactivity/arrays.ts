import { getRaw, createProxy } from './reactive';
import { getSignal, ITERATION_KEY } from './handlers';
import { startBatch, endBatch } from 'alien-signals';

export const methodIntercepts: Record<string | symbol, Function> = {};

/**
 * Run methods on the raw array, not the proxy
 */
function runOnRaw(proxy: any[], method: string, args: any[], wrapResult = false) {
  const raw = getRaw(proxy) as any;
  getSignal(raw, ITERATION_KEY)();

  const isReduce = method === 'reduce' || method === 'reduceRight';

  // Wrap callbacks if present (e.g. forEach, map, find)
  const wrappedArgs = args.map((arg) => {
    if (typeof arg === 'function') {
      if (isReduce) {
        // Handle accumulator
        return (acc: any, item: any, index: number, _arr: any) => {
          return arg.call(proxy, acc, createProxy(item), index, proxy);
        };
      } else {
        return (item: any, index: number, _arr: any) => {
          return arg.call(proxy, createProxy(item), index, proxy);
        };
      }
    }
    return arg;
  });

  const res = raw[method](...wrappedArgs);

  // If method returns a new array (map, filter, slice) it should contain the proxies
  if (wrapResult && Array.isArray(res)) {
    return res.map(createProxy);
  }
  return res;
}

// prettier-ignore
const MUTATORS = ['copyWithin', 'fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'] as const;

// Start batch, run native method on raw, end batch
MUTATORS.forEach((key) => {
  methodIntercepts[key] = function (this: any[], ...args: any[]) {
    startBatch();
    try {
      const raw = getRaw(this);
      const res = raw[key].apply(raw, args);
      // Trigger the signals affected by mutation
      getSignal(raw, 'length')(raw.length);
      getSignal(raw, ITERATION_KEY)({});
      return res;
    } finally {
      endBatch();
    }
  };
});

// prettier-ignore
const SEARCHERS = ['includes', 'indexOf', 'lastIndexOf'] as const;

// Track ITERATION_KEY, run on raw. If not found, try getRaw(arg) and run again.
SEARCHERS.forEach((key) => {
  methodIntercepts[key] = function (this: any[], ...args: any[]) {
    const raw = getRaw(this) as any;
    getSignal(raw, ITERATION_KEY)();

    let res = raw[key](...args);

    // Try unwrapping args (in case a proxy was passed to search)
    if (res === -1 || res === false) {
      const rawArgs = args.map(getRaw);
      res = raw[key](...rawArgs);
    }
    return res;
  };
});

// prettier-ignore
const ITERATORS = ['entries', 'keys', 'values', '[Symbol.iterator]'] as const;

// Track ITERATION_KEY, get raw iterator. Wrap next() to return createProxy(value).
ITERATORS.forEach((key) => {
  methodIntercepts[key] = function* (this: any[]) {
    const raw = getRaw(this) as any;
    getSignal(raw, ITERATION_KEY)();

    const iterator = raw[key]();

    for (const val of iterator) {
      // Yield reactive values so 'for-of' loops are safe
      yield createProxy(val);
    }
  };
});

// prettier-ignore
const CONSUMERS = ['every', 'find', 'findIndex', 'findLast', 'findLastIndex', 'forEach', 'reduce', 'reduceRight', 'some'] as const;

// Wrap the callback so arguments are proxied: fn(rawItem) -> fn(createProxy(rawItem)).
CONSUMERS.forEach((key) => {
  methodIntercepts[key] = function (this: any[], ...args: any[]) {
    // For `find` methods, create proxy if it's an object
    const res = runOnRaw(this, key, args);
    return typeof res === 'object' && res !== null ? createProxy(res) : res;
  };
});

// prettier-ignore
const PRODUCERS = ['concat', 'filter', 'flat', 'flatMap', 'map', 'slice', 'toReversed', 'toSorted', 'toSpliced', 'with'] as const;

// Same strategy as `consumers` but also wrap the result.
PRODUCERS.forEach((key) => {
  methodIntercepts[key] = function (this: any[], ...args: any[]) {
    return runOnRaw(this, key, args, true);
  };
});

// prettier-ignore
const STRINGIFIERS = ['join', 'toString', 'toLocaleString'] as const;

// Track ITERATION_KEY, run on raw, return result.
STRINGIFIERS.forEach((key) => {
  methodIntercepts[key] = function (this: any[], ...args: any[]) {
    const raw = getRaw(this) as any;
    getSignal(raw, ITERATION_KEY)();
    return raw[key](...args);
  };
});
