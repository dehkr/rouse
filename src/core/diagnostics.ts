/*
 * Every call is written `__DEV__ && warn(...)`, and so is diagnostic-only state: a
 * dedupe latch lives inside a helper called that way (`warnWriteOnce`), a count that
 * crosses a function boundary is a dev-only optional callback, and `if (__DEV__)` is
 * only for bookkeeping stranded at a call site. A bare call ships its text in the min
 * build, and an ungated latch keeps the branch that reads it.
 *
 * Never gate a failure that can first occur in production. These `err` sites are bare
 * on purpose: `invokeHandler`, a scope's `setup`/`connect`/`disconnect`, `rz-store`'s
 * JSON parse and seed check, and the catches in `runFetch`, `sendAndRoute`, and
 * `_sendAndApply`, which settle a thrown request as `INTERNAL_ERROR` and leave the
 * report as the only trace of what threw.
 *
 * Messages: never write `[Rouse]`. Lead with an `rz-<slug>:` label and a lowercase word
 * only when one directive is clearly the entry point; shared internals (parsers,
 * `setNestedVal`, `invokeHandler`) read as plain sentences. Quote identifiers and values
 * in single quotes, write stores as `@store`, name the fix as an imperative follow-on,
 * end with a period, and pass `el` last (`err('…', el, error)`).
 *
 * Throws are control flow: never gated, never labeled, always through `fail()`, which
 * returns `never`. Payload-layer sites pass `TypeError` to mirror native `fetch()`.
 */
export function info(msg: string, ...args: any[]) {
  console.info(`[Rouse] ${msg}`, ...args);
}

export function warn(msg: string, ...args: any[]) {
  console.warn(`[Rouse] ${msg}`, ...args);
}

export function err(msg: string, ...args: any[]) {
  console.error(`[Rouse] ${msg}`, ...args);
}

export function fail(
  msg: string,
  ErrorClass: typeof Error | typeof TypeError = Error,
  options?: ErrorOptions,
): never {
  throw new ErrorClass(`[Rouse] ${msg}`, options);
}
