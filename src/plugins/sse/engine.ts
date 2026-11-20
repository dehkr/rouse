/*
 * An unnamed message is a payload, routed by `rz-place` and `rz-deposit`. A named
 * message is an event, heard only by `sse-[name]` triggers: `EventSource` has no
 * wildcard, so a name arrives only once a trigger subscribes it.
 *
 * Gate routing in `onMessage`, not in the routers. `subscribedNames` is shared by every
 * connection, so a name one trigger subscribes arrives on every stream, and routers
 * gating on payload type alone would make one element depend on unrelated markup.
 *
 * A stream never reaches `request()`. `EventSource` sends no headers, so request config,
 * timeouts, interceptors, and `rz-indicator` don't apply. Don't add warnings for them.
 *
 * `rz:sse:error` is the only reconnect switch, so there's no `reconnect` option, and
 * `rz:sse:config` fires once per open, since the browser retries with no hook in
 * between. A connection that closes for good leaves the registry and drops its holders,
 * so the next open on its URL, from markup or `app.sse()`, connects fresh and fires
 * `rz:sse:config` again. Don't keep a closed entry joinable: a holder joining it hears
 * nothing.
 */
import type { RouseApp } from '../../app';
import { dispatchFrom } from '../../core/dispatch';
import type {
  LifecycleEventMap,
  SseCloseReason,
  SseConnectionConfig,
  SseOptions,
  VoidFn,
} from '../../types';
import { core } from '../core';

/** Releases one reference to a stream. Assignable to `VoidFn`. */
export type SseRelease = (reason?: SseCloseReason) => void;

/** One holder of a stream: a directive binding, or an `app.sse` call. */
interface StreamRef {
  /** Dispatch node for this holder's events, and the `rz-place` host. */
  el: Element;
  /** The app root, where events fire once `el` has left the DOM. */
  root: Element;
  config: SseConnectionConfig;
  /** Called when the connection closes for good, before `rz:sse:close`. */
  onEnd?: VoidFn;
}

interface StreamEntry {
  key: string;
  url: string;
  withCredentials: boolean;
  source: EventSource | null;
  refs: Set<StreamRef>;
  /** Named events already wired to `source`. */
  attached: Set<string>;
  /** Consecutive failed attempts. Reset on every open. */
  attempt: number;
}

const DEFAULT_EVENT = 'message';

const entries = new Map<string, StreamEntry>();
const subscribedNames = new Set<string>();

function streamKey(url: string, withCredentials: boolean) {
  return `${withCredentials ? '1' : '0'}|${url}`;
}

/**
 * Opens a stream, or joins one already open at the same URL. Fires `rz:sse:config`
 * first; a listener that cancels it gets an inert release and no connection.
 *
 * @param onEnd - Called if the connection closes for good while this holder has it.
 * @returns A release for this holder's reference, idempotent after the first call.
 */
export function openStream(
  app: RouseApp,
  resource: string,
  options: SseOptions = {},
  onEnd?: VoidFn,
): SseRelease | null {
  const el = options.triggerEl ?? app.root;

  const config: SseConnectionConfig = {
    url: core.resolveUrl(resource, app.config.baseUrl).href,
    withCredentials: options.withCredentials ?? false,
    triggerEl: options.triggerEl,
  };

  // Cancelable, and the one chance to rewrite the endpoint: the key is read back
  // from `config` afterwards, so a mutated URL is the one that connects.
  const gate = dispatchFrom(
    el,
    app.root,
    'rz:sse:config',
    { config },
    { cancelable: true },
  );
  if (gate.defaultPrevented) {
    return null;
  }

  const key = streamKey(config.url, config.withCredentials);
  let entry = entries.get(key);

  const ref: StreamRef = { el, root: app.root, config, onEnd };

  if (!entry) {
    entry = {
      key,
      url: config.url,
      withCredentials: config.withCredentials,
      source: null,
      refs: new Set([ref]),
      attached: new Set(),
      attempt: 0,
    };
    entries.set(key, entry);
    connect(entry);
  } else {
    entry.refs.add(ref);
    if (entry.source?.readyState === EventSource.OPEN) {
      // A ref joining a live stream missed the connect dispatch
      dispatchFrom(el, app.root, 'rz:sse:open', { config });
    }
  }

  const joined = entry;
  return (reason = 'released') => release(joined, ref, reason);
}

/**
 * Opens a stream whose lifetime is bound to `signal`. Aborting releases the
 * reference, which is how `app.sse` cleans up without the caller holding on
 * to the closer.
 */
export function openBoundStream(
  app: RouseApp,
  resource: string,
  options: SseOptions,
  signal: AbortSignal,
): VoidFn {
  // An already-aborted owner means "don't open", matching `on`
  if (signal.aborted) {
    return () => {};
  }

  const release = openStream(app, resource, options);
  if (!release) {
    return () => {};
  }

  // Aborting is the owner going away; the returned closer is the caller choosing to
  // stop early. The reasons are reported separately so a listener can tell them apart.
  const onAbort = () => release('teardown');
  signal.addEventListener('abort', onAbort, { once: true });

  return () => {
    signal.removeEventListener('abort', onAbort);
    release('released');
  };
}

/**
 * Subscribes every current and future connection to a named server event. Called
 * by the `sse` trigger source, so a directive declares nothing about which names
 * a stream carries. There's no unsubscribe: the set is bounded by the app's names.
 */
export function subscribeNamed(name: string): void {
  if (!name || name === DEFAULT_EVENT || subscribedNames.has(name)) return;

  subscribedNames.add(name);
  entries.forEach((entry) => attachNamed(entry, name));
}

function connect(entry: StreamEntry) {
  const source = new EventSource(entry.url, {
    withCredentials: entry.withCredentials,
  });

  entry.source = source;

  // A server message named `open` or `error` reaches these listeners too, as a
  // `MessageEvent`. The connection's own events are plain `Event`s.
  source.addEventListener('open', (e) => {
    if (e instanceof MessageEvent) return;
    entry.attempt = 0;
    emit(entry, 'rz:sse:open', {});
  });

  source.addEventListener('error', (e) => {
    if (e instanceof MessageEvent) return;
    onError(entry);
  });

  attachNamed(entry, DEFAULT_EVENT);
  subscribedNames.forEach((name) => attachNamed(entry, name));
}

function attachNamed(entry: StreamEntry, name: string) {
  const { source } = entry;
  if (!source || entry.attached.has(name)) return;

  entry.attached.add(name);
  // `sse-[open]` and `sse-[error]` also hear the connection's own events, which carry no data
  source.addEventListener(name, (e) => {
    if (e instanceof MessageEvent) {
      onMessage(entry, name, e);
    }
  });
}

function onMessage(entry: StreamEntry, event: string, e: MessageEvent) {
  const raw: string = e.data;
  const data = parseMessageData(raw);

  // Only unnamed messages should route to `rz-place` or `rz-deposit`. Named
  // messages are events and can be handled using `sse-[name]` triggers.
  const routable = event === DEFAULT_EVENT;

  for (const ref of entry.refs) {
    const base = { config: ref.config, event, raw, lastEventId: e.lastEventId };

    // Routing before the trigger source, so an `sse-[name]` handler observes the
    // DOM already placed. The sub-event leading its parent is deliberate.
    if (routable) {
      if (Array.isArray(data) || core.isPlainObject(data)) {
        dispatchFrom(ref.el, ref.root, 'rz:sse:message:json', { ...base, data });
      } else {
        dispatchFrom(ref.el, ref.root, 'rz:sse:message:html', { ...base, data: raw });
      }
    }

    dispatchFrom(ref.el, ref.root, 'rz:sse:message', { ...base, data });
  }
}

/**
 * The browser schedules its own retry before this runs, and exposes no hook to
 * intercept it — so a prevented event closes the connection instead.
 */
function onError(entry: StreamEntry) {
  const { source } = entry;
  if (!source) return;

  entry.attempt += 1;

  // CLOSED here means the server rejected the connection outright (non-200 or a
  // wrong content type), which the platform never retries.
  const willRetry = source.readyState !== EventSource.CLOSED;
  const prevented = emit(entry, 'rz:sse:error', { attempt: entry.attempt }, true);

  if (!willRetry) {
    finalize(entry, 'failed');
  } else if (prevented) {
    finalize(entry, 'canceled');
  }
}

/**
 * Ends the connection for every holder and unregisters it. Holders are freed before
 * `rz:sse:close`, so a listener that reopens the URL gets a fresh connection.
 */
function finalize(entry: StreamEntry, reason: SseCloseReason) {
  entry.source?.close();
  entry.source = null;
  entries.delete(entry.key);

  entry.refs.forEach((ref) => ref.onEnd?.());
  emit(entry, 'rz:sse:close', { reason });
  // A holder's later release is a no-op: the close is already announced
  entry.refs.clear();
}

function release(entry: StreamEntry, ref: StreamRef, reason: SseCloseReason) {
  if (!entry.refs.delete(ref)) return;

  if (entry.refs.size === 0) {
    entry.source?.close();
    entries.delete(entry.key);
  }

  dispatchFrom(ref.el, ref.root, 'rz:sse:close', { config: ref.config, reason });
}

/**
 * Dispatches one connection event from every holder's element. Returns whether any
 * holder canceled it.
 */
function emit<E extends 'rz:sse:open' | 'rz:sse:error' | 'rz:sse:close'>(
  entry: StreamEntry,
  name: E,
  detail: Omit<LifecycleEventMap[E], 'config'>,
  cancelable = false,
): boolean {
  let prevented = false;

  for (const ref of entry.refs) {
    const event = dispatchFrom(
      ref.el,
      ref.root,
      name,
      { config: ref.config, ...detail } as any,
      { cancelable },
    );
    prevented ||= event.defaultPrevented;
  }

  return prevented;
}

/**
 * Parses a message body as JSON only when it looks like an object or array, so a
 * bare `123` or `true` stays the string the HTML path expects.
 */
function parseMessageData(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return raw;

  try {
    return core.safeJSONParse(trimmed);
  } catch {
    return raw;
  }
}
