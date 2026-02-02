import { endBatch, startBatch, trigger } from '.';
import { getSignal, ITERATION_KEY } from './handlers';
import { createProxy, getRaw } from './reactive';

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

// Batch updates, run on raw, and manually trigger 'length' and iteration signals
MUTATORS.forEach((key) => {
  methodIntercepts[key] = function (this: any[], ...args: any[]) {
    startBatch();
    try {
      const raw = getRaw(this);
      const res = raw[key].apply(raw, args);
      // Trigger the signals affected by mutation
      getSignal(raw, 'length')(raw.length);
      trigger(getSignal(raw, ITERATION_KEY));
      return res;
    } finally {
      endBatch();
    }
  };
});

const SEARCHERS = ['includes', 'indexOf', 'lastIndexOf'] as const;

// Track iteration, run on raw, and retry with raw args if search fails (handles proxies)
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

const ITERATORS = ['entries', 'keys', 'values', '[Symbol.iterator]'] as const;

// Track iteration, get raw iterator, and yield reactive proxies for safe loops
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

// Run on raw, proxy callback arguments, and wrap the return value if it's an object
CONSUMERS.forEach((key) => {
  methodIntercepts[key] = function (this: any[], ...args: any[]) {
    // For `find` methods, create proxy if it's an object
    const res = runOnRaw(this, key, args);
    return typeof res === 'object' && res !== null ? createProxy(res) : res;
  };
});

// prettier-ignore
const PRODUCERS = ['concat', 'filter', 'flat', 'flatMap', 'map', 'slice', 'toReversed', 'toSorted', 'toSpliced', 'with'] as const;

// Run on raw with proxied callback args, then wrap the resulting array items in proxies
PRODUCERS.forEach((key) => {
  methodIntercepts[key] = function (this: any[], ...args: any[]) {
    return runOnRaw(this, key, args, true);
  };
});

const STRINGIFIERS = ['join', 'toString', 'toLocaleString'] as const;

// Track iteration and run on raw to ensure dependency registration
STRINGIFIERS.forEach((key) => {
  methodIntercepts[key] = function (this: any[], ...args: any[]) {
    const raw = getRaw(this) as any;
    getSignal(raw, ITERATION_KEY)();
    return raw[key](...args);
  };
});
