// node_modules/.pnpm/alien-signals@3.1.2/node_modules/alien-signals/esm/system.mjs
function createReactiveSystem({ update, notify, unwatched }) {
  return {
    link: link2,
    unlink: unlink2,
    propagate: propagate2,
    checkDirty: checkDirty2,
    shallowPropagate: shallowPropagate2
  };
  function link2(dep, sub, version) {
    const prevDep = sub.depsTail;
    if (prevDep !== void 0 && prevDep.dep === dep) {
      return;
    }
    const nextDep = prevDep !== void 0 ? prevDep.nextDep : sub.deps;
    if (nextDep !== void 0 && nextDep.dep === dep) {
      nextDep.version = version;
      sub.depsTail = nextDep;
      return;
    }
    const prevSub = dep.subsTail;
    if (prevSub !== void 0 && prevSub.version === version && prevSub.sub === sub) {
      return;
    }
    const newLink = sub.depsTail = dep.subsTail = {
      version,
      dep,
      sub,
      prevDep,
      nextDep,
      prevSub,
      nextSub: void 0
    };
    if (nextDep !== void 0) {
      nextDep.prevDep = newLink;
    }
    if (prevDep !== void 0) {
      prevDep.nextDep = newLink;
    } else {
      sub.deps = newLink;
    }
    if (prevSub !== void 0) {
      prevSub.nextSub = newLink;
    } else {
      dep.subs = newLink;
    }
  }
  function unlink2(link3, sub = link3.sub) {
    const dep = link3.dep;
    const prevDep = link3.prevDep;
    const nextDep = link3.nextDep;
    const nextSub = link3.nextSub;
    const prevSub = link3.prevSub;
    if (nextDep !== void 0) {
      nextDep.prevDep = prevDep;
    } else {
      sub.depsTail = prevDep;
    }
    if (prevDep !== void 0) {
      prevDep.nextDep = nextDep;
    } else {
      sub.deps = nextDep;
    }
    if (nextSub !== void 0) {
      nextSub.prevSub = prevSub;
    } else {
      dep.subsTail = prevSub;
    }
    if (prevSub !== void 0) {
      prevSub.nextSub = nextSub;
    } else if ((dep.subs = nextSub) === void 0) {
      unwatched(dep);
    }
    return nextDep;
  }
  function propagate2(link3) {
    let next = link3.nextSub;
    let stack;
    top: do {
      const sub = link3.sub;
      let flags = sub.flags;
      if (!(flags & (4 | 8 | 16 | 32))) {
        sub.flags = flags | 32;
      } else if (!(flags & (4 | 8))) {
        flags = 0;
      } else if (!(flags & 4)) {
        sub.flags = flags & ~8 | 32;
      } else if (!(flags & (16 | 32)) && isValidLink(link3, sub)) {
        sub.flags = flags | (8 | 32);
        flags &= 1;
      } else {
        flags = 0;
      }
      if (flags & 2) {
        notify(sub);
      }
      if (flags & 1) {
        const subSubs = sub.subs;
        if (subSubs !== void 0) {
          const nextSub = (link3 = subSubs).nextSub;
          if (nextSub !== void 0) {
            stack = { value: next, prev: stack };
            next = nextSub;
          }
          continue;
        }
      }
      if ((link3 = next) !== void 0) {
        next = link3.nextSub;
        continue;
      }
      while (stack !== void 0) {
        link3 = stack.value;
        stack = stack.prev;
        if (link3 !== void 0) {
          next = link3.nextSub;
          continue top;
        }
      }
      break;
    } while (true);
  }
  function checkDirty2(link3, sub) {
    let stack;
    let checkDepth = 0;
    let dirty = false;
    top: do {
      const dep = link3.dep;
      const flags = dep.flags;
      if (sub.flags & 16) {
        dirty = true;
      } else if ((flags & (1 | 16)) === (1 | 16)) {
        if (update(dep)) {
          const subs = dep.subs;
          if (subs.nextSub !== void 0) {
            shallowPropagate2(subs);
          }
          dirty = true;
        }
      } else if ((flags & (1 | 32)) === (1 | 32)) {
        if (link3.nextSub !== void 0 || link3.prevSub !== void 0) {
          stack = { value: link3, prev: stack };
        }
        link3 = dep.deps;
        sub = dep;
        ++checkDepth;
        continue;
      }
      if (!dirty) {
        const nextDep = link3.nextDep;
        if (nextDep !== void 0) {
          link3 = nextDep;
          continue;
        }
      }
      while (checkDepth--) {
        const firstSub = sub.subs;
        const hasMultipleSubs = firstSub.nextSub !== void 0;
        if (hasMultipleSubs) {
          link3 = stack.value;
          stack = stack.prev;
        } else {
          link3 = firstSub;
        }
        if (dirty) {
          if (update(sub)) {
            if (hasMultipleSubs) {
              shallowPropagate2(firstSub);
            }
            sub = link3.sub;
            continue;
          }
          dirty = false;
        } else {
          sub.flags &= ~32;
        }
        sub = link3.sub;
        const nextDep = link3.nextDep;
        if (nextDep !== void 0) {
          link3 = nextDep;
          continue top;
        }
      }
      return dirty;
    } while (true);
  }
  function shallowPropagate2(link3) {
    do {
      const sub = link3.sub;
      const flags = sub.flags;
      if ((flags & (32 | 16)) === 32) {
        sub.flags = flags | 16;
        if ((flags & (2 | 4)) === 2) {
          notify(sub);
        }
      }
    } while ((link3 = link3.nextSub) !== void 0);
  }
  function isValidLink(checkLink, sub) {
    let link3 = sub.depsTail;
    while (link3 !== void 0) {
      if (link3 === checkLink) {
        return true;
      }
      link3 = link3.prevDep;
    }
    return false;
  }
}

// node_modules/.pnpm/alien-signals@3.1.2/node_modules/alien-signals/esm/index.mjs
var cycle = 0;
var batchDepth = 0;
var notifyIndex = 0;
var queuedLength = 0;
var activeSub;
var queued = [];
var { link, unlink, propagate, checkDirty, shallowPropagate } = createReactiveSystem({
  update(node) {
    if (node.depsTail !== void 0) {
      return updateComputed(node);
    } else {
      return updateSignal(node);
    }
  },
  notify(effect2) {
    let insertIndex = queuedLength;
    let firstInsertedIndex = insertIndex;
    do {
      queued[insertIndex++] = effect2;
      effect2.flags &= ~2;
      effect2 = effect2.subs?.sub;
      if (effect2 === void 0 || !(effect2.flags & 2)) {
        break;
      }
    } while (true);
    queuedLength = insertIndex;
    while (firstInsertedIndex < --insertIndex) {
      const left = queued[firstInsertedIndex];
      queued[firstInsertedIndex++] = queued[insertIndex];
      queued[insertIndex] = left;
    }
  },
  unwatched(node) {
    if (!(node.flags & 1)) {
      effectScopeOper.call(node);
    } else if (node.depsTail !== void 0) {
      node.depsTail = void 0;
      node.flags = 1 | 16;
      purgeDeps(node);
    }
  }
});
function setActiveSub(sub) {
  const prevSub = activeSub;
  activeSub = sub;
  return prevSub;
}
function startBatch() {
  ++batchDepth;
}
function endBatch() {
  if (!--batchDepth) {
    flush();
  }
}
function signal(initialValue) {
  return signalOper.bind({
    currentValue: initialValue,
    pendingValue: initialValue,
    subs: void 0,
    subsTail: void 0,
    flags: 1
  });
}
function computed(getter) {
  return computedOper.bind({
    value: void 0,
    subs: void 0,
    subsTail: void 0,
    deps: void 0,
    depsTail: void 0,
    flags: 0,
    getter
  });
}
function effect(fn) {
  const e = {
    fn,
    subs: void 0,
    subsTail: void 0,
    deps: void 0,
    depsTail: void 0,
    flags: 2 | 4
  };
  const prevSub = setActiveSub(e);
  if (prevSub !== void 0) {
    link(e, prevSub, 0);
  }
  try {
    e.fn();
  } finally {
    activeSub = prevSub;
    e.flags &= ~4;
  }
  return effectOper.bind(e);
}
function effectScope(fn) {
  const e = {
    deps: void 0,
    depsTail: void 0,
    subs: void 0,
    subsTail: void 0,
    flags: 0
  };
  const prevSub = setActiveSub(e);
  if (prevSub !== void 0) {
    link(e, prevSub, 0);
  }
  try {
    fn();
  } finally {
    activeSub = prevSub;
  }
  return effectScopeOper.bind(e);
}
function trigger(fn) {
  const sub = {
    deps: void 0,
    depsTail: void 0,
    flags: 2
  };
  const prevSub = setActiveSub(sub);
  try {
    fn();
  } finally {
    activeSub = prevSub;
    let link2 = sub.deps;
    while (link2 !== void 0) {
      const dep = link2.dep;
      link2 = unlink(link2, sub);
      const subs = dep.subs;
      if (subs !== void 0) {
        sub.flags = 0;
        propagate(subs);
        shallowPropagate(subs);
      }
    }
    if (!batchDepth) {
      flush();
    }
  }
}
function updateComputed(c) {
  ++cycle;
  c.depsTail = void 0;
  c.flags = 1 | 4;
  const prevSub = setActiveSub(c);
  try {
    const oldValue = c.value;
    return oldValue !== (c.value = c.getter(oldValue));
  } finally {
    activeSub = prevSub;
    c.flags &= ~4;
    purgeDeps(c);
  }
}
function updateSignal(s) {
  s.flags = 1;
  return s.currentValue !== (s.currentValue = s.pendingValue);
}
function run(e) {
  const flags = e.flags;
  if (flags & 16 || flags & 32 && checkDirty(e.deps, e)) {
    ++cycle;
    e.depsTail = void 0;
    e.flags = 2 | 4;
    const prevSub = setActiveSub(e);
    try {
      e.fn();
    } finally {
      activeSub = prevSub;
      e.flags &= ~4;
      purgeDeps(e);
    }
  } else {
    e.flags = 2;
  }
}
function flush() {
  try {
    while (notifyIndex < queuedLength) {
      const effect2 = queued[notifyIndex];
      queued[notifyIndex++] = void 0;
      run(effect2);
    }
  } finally {
    while (notifyIndex < queuedLength) {
      const effect2 = queued[notifyIndex];
      queued[notifyIndex++] = void 0;
      effect2.flags |= 2 | 8;
    }
    notifyIndex = 0;
    queuedLength = 0;
  }
}
function computedOper() {
  const flags = this.flags;
  if (flags & 16 || flags & 32 && (checkDirty(this.deps, this) || (this.flags = flags & ~32, false))) {
    if (updateComputed(this)) {
      const subs = this.subs;
      if (subs !== void 0) {
        shallowPropagate(subs);
      }
    }
  } else if (!flags) {
    this.flags = 1 | 4;
    const prevSub = setActiveSub(this);
    try {
      this.value = this.getter();
    } finally {
      activeSub = prevSub;
      this.flags &= ~4;
    }
  }
  const sub = activeSub;
  if (sub !== void 0) {
    link(this, sub, cycle);
  }
  return this.value;
}
function signalOper(...value) {
  if (value.length) {
    if (this.pendingValue !== (this.pendingValue = value[0])) {
      this.flags = 1 | 16;
      const subs = this.subs;
      if (subs !== void 0) {
        propagate(subs);
        if (!batchDepth) {
          flush();
        }
      }
    }
  } else {
    if (this.flags & 16) {
      if (updateSignal(this)) {
        const subs = this.subs;
        if (subs !== void 0) {
          shallowPropagate(subs);
        }
      }
    }
    let sub = activeSub;
    while (sub !== void 0) {
      if (sub.flags & (1 | 2)) {
        link(this, sub, cycle);
        break;
      }
      sub = sub.subs?.sub;
    }
    return this.currentValue;
  }
}
function effectOper() {
  effectScopeOper.call(this);
}
function effectScopeOper() {
  this.depsTail = void 0;
  this.flags = 0;
  purgeDeps(this);
  const sub = this.subs;
  if (sub !== void 0) {
    unlink(sub);
  }
}
function purgeDeps(sub) {
  const depsTail = sub.depsTail;
  let dep = depsTail !== void 0 ? depsTail.nextDep : sub.deps;
  while (dep !== void 0) {
    dep = unlink(dep, sub);
  }
}

// src/core/constants.ts
var DIRECTIVE_SLUGS = [
  "attr",
  "class",
  "close",
  "deposit",
  "disable",
  "fetch",
  "headers",
  "html",
  "indicator",
  "key",
  "model",
  "on",
  "place",
  "prop",
  "pull",
  "push",
  "render",
  "request",
  "scope",
  "send",
  "sse",
  "store",
  "style",
  "text",
  "wake"
];
function isDirectiveSlug(key) {
  return DIRECTIVE_SLUGS.includes(key);
}
var STORE_PREFIX = "@";
var ITEM_PREFIX = "%";
var ITEM_NAMESPACES = ["index", "position"];
function isItemNamespace(key) {
  return ITEM_NAMESPACES.includes(key);
}
var KEY_BLOCKLIST = ["__proto__", "constructor", "prototype"];
var RENDER_FRAME = /* @__PURE__ */ Symbol(true ? "rz.renderFrame" : "");
var PLACE_POSITIONS = [
  "innerHTML",
  "outerHTML",
  "beforebegin",
  "afterbegin",
  "beforeend",
  "afterend",
  "delete"
];
var DEFAULT_PLACE_POSITION = "innerHTML";
function isPlacePosition(key) {
  return PLACE_POSITIONS.includes(key);
}
var HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "QUERY"
];
function isHttpMethod(key) {
  return HTTP_METHODS.includes(key?.toUpperCase());
}
var SAFE_METHODS = [
  "GET",
  "HEAD",
  "OPTIONS",
  "QUERY"
];
function isSafeMethod(key) {
  return SAFE_METHODS.includes(key?.toUpperCase());
}
var FLAG_MODIFIERS = [
  "once",
  "capture",
  "passive",
  "outside",
  "self",
  "loose",
  "ctrl",
  "alt",
  "shift",
  "meta",
  "prevent",
  "stop",
  "stop-immediate",
  "leading",
  "trailing"
];
var isFlagModifier = (val) => FLAG_MODIFIERS.includes(val);
var LISTEN_TARGETS = ["window", "document", "root"];
var isListenTarget = (val) => LISTEN_TARGETS.includes(val);

// src/core/attributes.ts
var PREFIX = "data-rz-";
function directiveSelector(slug, tag = "") {
  return `${tag}[${PREFIX}${slug}]`;
}
function getDirectiveValue(el, slug) {
  return el.getAttribute(`${PREFIX}${slug}`);
}
function hasDirective(el, slug) {
  return el.hasAttribute(`${PREFIX}${slug}`);
}
function isDisabled(el) {
  return el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";
}
function unknownDirectiveNames(el) {
  return el.getAttributeNames().filter(
    (name) => name.startsWith(PREFIX) && !isDirectiveSlug(name.slice(PREFIX.length))
  );
}
function queryTargets(el, selector) {
  try {
    const targets = Array.from(el.querySelectorAll(selector));
    if (el.matches(selector)) {
      targets.unshift(el);
    }
    return targets;
  } catch {
    return [];
  }
}

// src/core/diagnostics.ts
function info(msg, ...args) {
  console.info(`[Rouse] ${msg}`, ...args);
}
function warn(msg, ...args) {
  console.warn(`[Rouse] ${msg}`, ...args);
}
function err(msg, ...args) {
  console.error(`[Rouse] ${msg}`, ...args);
}
function fail(msg, ErrorClass = Error, options) {
  throw new ErrorClass(`[Rouse] ${msg}`, options);
}

// src/core/parser.ts
var closers = { ")": "(", "}": "{", "]": "[" };
var openers = new Set(Object.values(closers));
var isCloser = (char) => Object.hasOwn(closers, char);
var isOpener = (char) => openers.has(char);
function parseDirectiveValue(value) {
  let cleanedValue = value?.trim();
  if (!cleanedValue) return [];
  if (cleanedValue.endsWith(",")) {
    cleanedValue = cleanedValue.slice(0, -1).trim();
  }
  const parsed = [];
  let start = 0;
  const scanResult = forEachSafeChar(cleanedValue, (i, char) => {
    if (char === "," && hasTrailingWhitespace(cleanedValue, i)) {
      parseSegment(cleanedValue.slice(start, i), parsed);
      start = i + 1;
    }
    return false;
  });
  !scanResult.mismatched && (scanResult.depth > 0 || scanResult.quote) && warn(`Malformed directive value: '${value}'.`);
  parseSegment(cleanedValue.slice(start), parsed);
  return parsed;
}
function parseSegment(segment, pairs) {
  const trimmed = segment.trim();
  if (!trimmed) return;
  let splitIndex = -1;
  forEachSafeChar(trimmed, (i, char, text) => {
    if (char === ":" && hasTrailingWhitespace(text, i)) {
      splitIndex = i;
      return true;
    }
    return false;
  });
  if (splitIndex !== -1) {
    const key = stripQuotes(trimmed.slice(0, splitIndex).trim());
    const val = stripQuotes(trimmed.slice(splitIndex + 1).trim());
    if (key) {
      pairs.push([key, val]);
    }
  } else if (trimmed.endsWith(":")) {
    warn(`Ignoring '${trimmed}': trailing colon has no value.`);
  } else {
    const key = stripQuotes(trimmed);
    if (key) {
      pairs.push([key, null]);
    }
  }
}
function parseTriggerSubjectPairs(value) {
  return parseDirectiveValue(value).flatMap(([keyStr, subjectStr]) => {
    const subject = subjectStr || null;
    return parseTriggers(keyStr).map((trigger2) => ({ trigger: trigger2, subject }));
  });
}
function parseArgToken(token) {
  if (!token.endsWith("]")) return null;
  const open = token.indexOf("-[");
  return open > 0 ? [token.slice(0, open), token.slice(open + 2, -1).trim()] : null;
}
function normalizeModifiers(tokens, trigger2) {
  const options = {};
  const keys = [];
  for (const token of tokens) {
    const argToken = parseArgToken(token);
    if (argToken) {
      const [name, arg] = argToken;
      if (!arg) {
        warn(`Empty argument on modifier '${name}' in trigger '${trigger2}'.`);
        continue;
      }
      if (name === "key") {
        const key = arg.toLowerCase();
        keys.push(key === "space" ? " " : key);
      } else if (name === "debounce" || name === "throttle") {
        options[name] = arg;
      } else {
        warn(`Unknown modifier '${name}' in trigger '${trigger2}'.`);
      }
      continue;
    }
    if (isFlagModifier(token)) {
      options[token === "stop-immediate" ? "stopImmediate" : token] = true;
    } else if (isListenTarget(token)) {
      options.listenOn = token;
    } else if (token === "debounce" || token === "throttle") {
      options[token] = true;
    } else {
      warn(`Unknown modifier '${token}' in trigger '${trigger2}'.`);
    }
  }
  if (keys.length > 0) {
    options.key = keys;
  }
  return options;
}
function parseTriggers(value) {
  let raw = value?.trim();
  if (!raw) return [];
  raw = stripQuotes(raw);
  if (splitOnSafeDelimiter(raw, ",").length > 1) {
    warn(`Separate multi-trigger values by spaces, not commas: '${raw}'.`);
    return [];
  }
  const triggers = splitOnSafeDelimiter(raw, (char) => /\s/.test(char));
  const parsed = [];
  for (const trigger2 of triggers) {
    if (!trigger2) continue;
    const [event = "", modifierGroup, ...extraGroups] = splitOnSafeDelimiter(
      trigger2,
      "|"
    );
    if (!event || modifierGroup === "" || extraGroups.length > 0) {
      warn(
        `Malformed trigger: '${trigger2}'. Use a single '|' after the event, followed by dot-separated modifiers.`
      );
      continue;
    }
    const modifiers = modifierGroup ? splitOnSafeDelimiter(modifierGroup, ".").filter(Boolean) : [];
    const argToken = parseArgToken(event);
    const def = {
      event: argToken ? argToken[0] : event,
      options: normalizeModifiers(modifiers, trigger2)
    };
    if (argToken) {
      def.arg = argToken[1];
    }
    parsed.push(def);
  }
  return parsed;
}
function parseFetchSubject(subject) {
  const ws = subject.search(/\s/);
  const head = ws === -1 ? subject : subject.slice(0, ws);
  if (isHttpMethod(head)) {
    return {
      method: head.toUpperCase(),
      url: ws === -1 ? void 0 : subject.slice(ws + 1).trim()
    };
  }
  return { url: subject };
}
function parseStoreValue(value) {
  const pairs = parseDirectiveValue(value);
  const [first] = pairs;
  if (!first) {
    return null;
  }
  const [name, url] = first;
  if (pairs.length > 1) {
    warn(`rz-store: only one store can be initialized per element. Using '${name}'.`);
  }
  return { name, url: url || null };
}
function parseDataSourcePath(value) {
  const path = value.slice(1);
  const nsIndex = path.indexOf("::");
  if (nsIndex !== -1) {
    const rest = path.slice(nsIndex + 2);
    const dot = rest.indexOf(".");
    return {
      source: path.slice(0, nsIndex),
      namespace: dot === -1 ? rest : rest.slice(0, dot),
      nestedPath: dot === -1 ? "" : rest.slice(dot + 1)
    };
  }
  const dotIndex = path.indexOf(".");
  if (dotIndex === -1) {
    return { source: path, namespace: null, nestedPath: "" };
  }
  return {
    source: path.slice(0, dotIndex),
    namespace: null,
    nestedPath: path.slice(dotIndex + 1)
  };
}
function parseStoreRef(ref, slug) {
  const { source, namespace, nestedPath } = parseDataSourcePath(ref);
  if (namespace) {
    warn(
      `${slug ? `rz-${slug}: ` : ""}'${ref}' references the '${namespace}' namespace. Use '@${source}' to reference store data.`
    );
    return null;
  }
  return { source, nestedPath };
}
function parseDeclarations(decl) {
  return splitOnSafeDelimiter(decl, ";").map((d) => {
    const [prop = "", ...rest] = splitOnSafeDelimiter(d, ":");
    return [prop.trim(), rest.join(":").trim()];
  }).filter(([prop]) => prop);
}
function splitOnSafeDelimiter(text, delimiter) {
  const isDelimiter = typeof delimiter === "string" ? (c) => c === delimiter : delimiter;
  const parts = [];
  let start = 0;
  forEachSafeChar(text, (i, char) => {
    if (isDelimiter(char)) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
    return false;
  });
  parts.push(text.slice(start));
  return parts;
}
function safeJSONParse(text) {
  return JSON.parse(text, (key, value) => {
    if (KEY_BLOCKLIST.includes(key)) {
      warn(`Blocked forbidden key in JSON: '${key}'.`);
      return void 0;
    }
    return value;
  });
}
function forEachSafeChar(text, callback) {
  const depths = { "(": 0, "{": 0, "[": 0 };
  let totalDepth = 0;
  let quote = null;
  let mismatched = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const prev = text[i - 1];
    if (quote) {
      if (char === quote && prev !== "\\") {
        quote = null;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (isOpener(char)) {
      depths[char]++;
      totalDepth++;
    } else if (isCloser(char)) {
      const opener = closers[char];
      if (depths[opener] > 0) {
        depths[opener]--;
        totalDepth--;
      } else {
        mismatched = true;
        warn(`Mismatched bracket '${char}' in value: '${text}'.`);
      }
    } else if (totalDepth === 0) {
      if (callback(i, char, text)) {
        return { depth: totalDepth, quote, mismatched };
      }
    }
  }
  return { depth: totalDepth, quote, mismatched };
}
function isInQuotes(val) {
  if (val.length < 2) return false;
  const first = val[0];
  const last = val[val.length - 1];
  return (first === '"' || first === "'") && first === last;
}
function stripQuotes(val) {
  if (isInQuotes(val)) {
    return val.slice(1, -1).trim();
  }
  return val;
}
function hasTrailingWhitespace(text, index) {
  return index + 1 < text.length && /\s/.test(text.charAt(index + 1));
}

// src/reactivity/arrays.ts
var methodIntercepts = {};
var DATA_ARG_METHODS = /* @__PURE__ */ new Set(["concat", "with", "toSpliced"]);
function runOnRaw(proxy, method, args, wrapResult = false) {
  const raw = trackedRaw(proxy);
  const isReduce = method === "reduce" || method === "reduceRight";
  const isData = DATA_ARG_METHODS.has(method);
  const thisArg = isReduce ? proxy : args[1] ?? proxy;
  const wrappedArgs = args.map((arg) => {
    if (isData || typeof arg !== "function") return arg;
    return isReduce ? (acc, item, index) => arg.call(thisArg, acc, reactive(item), index, proxy) : (item, index) => arg.call(thisArg, reactive(item), index, proxy);
  });
  const result = raw[method](...wrappedArgs);
  if (wrapResult && Array.isArray(result)) {
    return result.map(reactive);
  }
  return result;
}
function trackedRaw(proxy) {
  const raw = getRaw(proxy);
  getSignal(raw, ITERATION_KEY)();
  return raw;
}
var MUTATORS = [
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift"
];
for (const key of MUTATORS) {
  methodIntercepts[key] = function(...args) {
    startBatch();
    try {
      const raw = getRaw(this);
      const result = raw[key].apply(raw, args);
      getSignal(raw, "length")(raw.length);
      trigger(getSignal(raw, ITERATION_KEY));
      const tracker = dirtyTrackers.get(raw);
      if (tracker) {
        const rootKey = objectRootKeys.get(raw) ?? "root";
        tracker(rootKey);
      }
      return result;
    } finally {
      endBatch();
    }
  };
}
var SEARCHERS = ["includes", "indexOf", "lastIndexOf"];
for (const key of SEARCHERS) {
  methodIntercepts[key] = function(...args) {
    const raw = trackedRaw(this);
    let result = raw[key](...args);
    if (result === -1 || result === false) {
      const rawArgs = args.map(getRaw);
      result = raw[key](...rawArgs);
    }
    return result;
  };
}
var ITERATORS = ["entries", "keys", "values", Symbol.iterator];
for (const key of ITERATORS) {
  methodIntercepts[key] = function* () {
    const raw = trackedRaw(this);
    const iterator = raw[key]();
    for (const val of iterator) {
      yield reactive(val);
    }
  };
}
var CONSUMERS = [
  "at",
  "every",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "forEach",
  "reduce",
  "reduceRight",
  "some"
];
for (const key of CONSUMERS) {
  methodIntercepts[key] = function(...args) {
    const result = runOnRaw(this, key, args);
    return reactive(result);
  };
}
var PRODUCERS = [
  "concat",
  "filter",
  "flat",
  "flatMap",
  "map",
  "slice",
  "toReversed",
  "toSorted",
  "toSpliced",
  "with"
];
for (const key of PRODUCERS) {
  methodIntercepts[key] = function(...args) {
    return runOnRaw(this, key, args, true);
  };
}
var STRINGIFIERS = ["join", "toString", "toLocaleString"];
for (const key of STRINGIFIERS) {
  methodIntercepts[key] = function(...args) {
    const raw = trackedRaw(this);
    return raw[key](...args);
  };
}

// src/reactivity/handlers.ts
var ITERATION_KEY = /* @__PURE__ */ Symbol(true ? "rz.iteration" : "");
var signalCache = /* @__PURE__ */ new WeakMap();
var computedCache = /* @__PURE__ */ new WeakMap();
var handlers = {
  get(target, key, receiver) {
    if (key === "__proto__") return target;
    if (Array.isArray(target) && Object.hasOwn(methodIntercepts, key)) {
      return Reflect.get(methodIntercepts, key, receiver);
    }
    const desc = Object.getOwnPropertyDescriptor(target, key);
    if (desc?.get) {
      const comp = getComputed(target, key, desc.get, receiver)();
      return reactive(comp);
    }
    const value = getSignal(target, key)();
    if (proxiable(value)) {
      const parentTracker = dirtyTrackers.get(target);
      if (parentTracker) {
        propagateTracker(target, key, value, parentTracker, desc);
      }
      return reactive(value);
    }
    return value;
  },
  set(target, key, value, receiver) {
    const desc = Object.getOwnPropertyDescriptor(target, key);
    if (desc?.get || desc?.set) {
      return Reflect.set(target, key, value, receiver);
    }
    const hadKey = Object.hasOwn(target, key);
    const oldValue = target[key];
    value = getRaw(value);
    const result = Reflect.set(target, key, value, receiver);
    if (value !== oldValue) {
      const sig = getSignal(target, key);
      value !== untracked(sig) ? sig(value) : trigger(sig);
      const tracker = dirtyTrackers.get(target);
      if (tracker) {
        tracker(getRootKey(target, key));
        if (proxiable(value)) {
          propagateTracker(target, key, value, tracker, desc);
        }
      }
      if (!hadKey || Array.isArray(target)) {
        trigger(getSignal(target, ITERATION_KEY));
      }
    }
    return result;
  },
  ownKeys(target) {
    getSignal(target, Array.isArray(target) ? "length" : ITERATION_KEY)();
    return Reflect.ownKeys(target);
  },
  deleteProperty(target, key) {
    const hadKey = Object.hasOwn(target, key);
    const result = Reflect.deleteProperty(target, key);
    if (result && hadKey) {
      getSignal(target, key)(void 0);
      trigger(getSignal(target, ITERATION_KEY));
      const tracker = dirtyTrackers.get(target);
      if (tracker) {
        tracker(getRootKey(target, key));
      }
    }
    return result;
  },
  has(target, key) {
    getSignal(target, key)();
    return Reflect.has(target, key);
  }
};
function getSignal(target, key) {
  const props = propsOf(signalCache, target);
  let sig = props.get(key);
  if (!sig) {
    sig = signal(Reflect.get(target, key));
    props.set(key, sig);
  }
  return sig;
}
function getComputed(target, key, getter, receiver) {
  const props = propsOf(computedCache, target);
  let comp = props.get(key);
  if (!comp) {
    comp = computed(() => getter.call(receiver));
    props.set(key, comp);
  }
  return comp;
}
function propsOf(cache, target) {
  let props = cache.get(target);
  if (!props) {
    props = /* @__PURE__ */ new Map();
    cache.set(target, props);
  }
  return props;
}
function propagateTracker(target, key, child, tracker, desc) {
  const rawChild = getRaw(child);
  if (!dirtyTrackers.has(rawChild) && desc?.enumerable !== false) {
    dirtyTrackers.set(rawChild, tracker);
    objectRootKeys.set(rawChild, getRootKey(target, key));
  }
}
function getRootKey(target, key) {
  return objectRootKeys.get(target) ?? String(key);
}

// src/reactivity/reactive.ts
var proxyCache = /* @__PURE__ */ new WeakMap();
var rawCache = /* @__PURE__ */ new WeakMap();
var dirtyTrackers = /* @__PURE__ */ new WeakMap();
var objectRootKeys = /* @__PURE__ */ new WeakMap();
function reactive(target) {
  if (!proxiable(target)) return target;
  if (rawCache.has(target)) return target;
  if (proxyCache.has(target)) return proxyCache.get(target);
  const proxy = new Proxy(target, handlers);
  proxyCache.set(target, proxy);
  rawCache.set(proxy, target);
  return proxy;
}
function proxiable(target) {
  if (target === null || typeof target !== "object") return false;
  if (Array.isArray(target)) return true;
  return Object.prototype.toString.call(target) === "[object Object]";
}
function getRaw(target) {
  const raw = rawCache.get(target);
  return raw ? getRaw(raw) : target;
}
function trackDirty(target, callback) {
  dirtyTrackers.set(getRaw(target), callback);
}
function seedPropagation(obj, seen = /* @__PURE__ */ new WeakSet()) {
  if (!obj || typeof obj !== "object" || seen.has(obj)) return;
  seen.add(obj);
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    seedPropagation(value, seen);
  }
}
function untracked(fn) {
  const prev = setActiveSub(void 0);
  try {
    return fn();
  } finally {
    setActiveSub(prev);
  }
}

// src/core/render-context.ts
function renderFrame(scope) {
  return scope[RENDER_FRAME];
}
function renderItem(scope) {
  return renderFrame(scope)?.item;
}
function renderParent(scope) {
  return renderFrame(getRaw(scope))?.parent ?? scope;
}
function renderCtxOf(scope) {
  const frame = renderFrame(scope);
  return frame ? { item: frame.item ?? null, index: frame.index } : { item: null, index: null };
}

// src/core/path.ts
var MAX_CACHE_SIZE = 500;
var pathCache = /* @__PURE__ */ new Map();
function getNestedVal(obj, path) {
  if (!obj || !path) return void 0;
  const parts = getPathParts(path);
  let current = obj;
  for (const part of parts) {
    if (current == null) return void 0;
    current = current[part];
  }
  return current;
}
function setNestedVal(obj, path, value) {
  if (!obj || typeof obj !== "object" || !path) return;
  const parts = getPathParts(path);
  const lastKey = parts[parts.length - 1];
  if (lastKey === void 0 || KEY_BLOCKLIST.includes(lastKey)) return;
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (KEY_BLOCKLIST.includes(part)) return;
    if (!(part in current) || current[part] == null) {
      current[part] = {};
    } else if (typeof current[part] !== "object") {
      warn(`Cannot write to '${path}': '${part}' is a primitive.`);
      return;
    }
    current = current[part];
  }
  current[lastKey] = value;
}
function getPathRoot(path) {
  if (!path) return;
  return getPathParts(path)[0];
}
function getPathParts(path) {
  let parts = pathCache.get(path);
  if (!parts) {
    parts = path.split(".");
    if (pathCache.size >= MAX_CACHE_SIZE) {
      const firstKey = pathCache.keys().next().value;
      pathCache.delete(firstKey);
    }
    pathCache.set(path, parts);
  }
  return parts;
}

// src/core/resolve.ts
var EMPTY_SCOPE = {};
var warnedWrites = /* @__PURE__ */ new Set();
function resolveState(path, scope, storeManager) {
  const isItem = path.startsWith(ITEM_PREFIX);
  if (!isItem && !path.startsWith(STORE_PREFIX)) {
    return getNestedVal(scope, path);
  }
  const { source, namespace, nestedPath } = parseDataSourcePath(path);
  if (isItem && source) return void 0;
  let resolved;
  if (isItem) {
    resolved = namespace ? resolveItemNamespace(namespace, scope) : renderItem(scope);
  } else {
    resolved = namespace ? resolveStoreNamespace(source, namespace, storeManager) : storeManager.get(source);
  }
  return nestedPath ? getNestedVal(resolved, nestedPath) : resolved;
}
function resolveItemNamespace(namespace, scope) {
  const frame = renderFrame(scope);
  if (!frame || !isItemNamespace(namespace)) {
    return void 0;
  }
  return namespace === "index" ? frame.index : frame.index + 1;
}
function resolveStoreNamespace(storeName, namespace, storeManager) {
  return namespace !== "status" ? void 0 : storeManager.status(storeName);
}
function writeState(path, value, scope, storeManager) {
  const isItem = path.startsWith(ITEM_PREFIX);
  if (isItem || path.startsWith(STORE_PREFIX)) {
    const { source, namespace, nestedPath } = parseDataSourcePath(path);
    if (isItem && source) return;
    if (namespace) {
      warnWriteOnce(
        path,
        `rz-model: cannot write to '${path}'. The '${namespace}' namespace is read-only.`
      );
      return;
    }
    if (!nestedPath) {
      warnWriteOnce(
        path,
        `rz-model: cannot use '${path}' because it overwrites the entire ${isItem ? "render item" : "store"}. Bind to a field instead.`
      );
      return;
    }
    const target = isItem ? renderItem(scope) : storeManager.get(source);
    if (!hasNestedKey(target, nestedPath)) {
      warnWriteOnce(
        path,
        isItem ? `rz-model: '${path}' could not be resolved. Field does not exist on the render item.` : `rz-model: cannot resolve '${path}' on '${source}'. One or both may be undefined.`
      );
      return;
    }
    setNestedVal(target, nestedPath, value);
    return;
  }
  if (renderParent(scope) === EMPTY_SCOPE) {
    warnWriteOnce(
      path,
      `rz-model: '${path}' used outside of a scope. Use '@' to target a store.`
    );
    return;
  }
  if (!hasNestedKey(scope, path)) {
    warnWriteOnce(path, `rz-model: '${path}' does not exist on the scope.`);
    return;
  }
  setNestedVal(scope, path, value);
}
function hasNestedKey(obj, path) {
  const parts = getPathParts(path);
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current == null || typeof current !== "object") {
      return false;
    }
    current = current[parts[i]];
  }
  return current != null && typeof current === "object" && parts[parts.length - 1] in current;
}
function warnWriteOnce(path, message) {
  if (warnedWrites.has(path)) return;
  warnedWrites.add(path);
  warn(message);
}

// src/core/invoke.ts
function invokeHandler(method, context, name, scope, el, e) {
  const onError2 = (error) => {
    err(`Failed to execute '${name}()'.`, el, error);
    return void 0;
  };
  try {
    const args = {
      el,
      e,
      render: renderCtxOf(scope)
    };
    const result = method.call(context, args);
    return typeof result?.then === "function" ? result.then(void 0, onError2) : result;
  } catch (error) {
    return onError2(error);
  }
}
function resolveBoundValue(raw, scope, storeManager, el, slug) {
  const key = raw.trim();
  const state = resolveState(key, scope, storeManager);
  if (typeof state === "function") {
    const context = key.startsWith(STORE_PREFIX) ? storeManager.get(parseDataSourcePath(key).source) : scope;
    return invokeHandler(
      state,
      context,
      key,
      scope,
      el,
      new CustomEvent(`rz:${slug}`)
    );
  }
  return state;
}

// src/dom/updater.ts
var prevHtml = /* @__PURE__ */ new WeakMap();
var prevClasses = /* @__PURE__ */ new WeakMap();
var prevStyles = /* @__PURE__ */ new WeakMap();
var warnedProps = /* @__PURE__ */ new WeakMap();
var toKebab = (k) => k.startsWith("--") ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
var WS = /\s+/;
function updateText(el, value) {
  setStringValue(el, "textContent", value);
}
function updateHtml(el, value) {
  const htmlVal = String(value ?? "");
  if (prevHtml.get(el) === htmlVal) return;
  prevHtml.set(el, htmlVal);
  el.innerHTML = htmlVal;
}
function setModelableValue(el, value) {
  if (!(el instanceof HTMLElement)) return;
  if (el.isContentEditable) {
    setStringValue(el, "innerText", value);
    return;
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox") {
      el.checked = !!value;
    } else if (el.type === "radio") {
      el.checked = el.value === String(value);
    } else {
      setStringValue(el, "value", value);
    }
    return;
  }
  if (el instanceof HTMLSelectElement) {
    if (el.multiple && Array.isArray(value)) {
      const vals = new Set(value.map(String));
      for (const opt of el.options) {
        opt.selected = vals.has(opt.value);
      }
    } else {
      el.value = value == null ? "" : String(value);
    }
    return;
  }
  if (el instanceof HTMLTextAreaElement) {
    setStringValue(el, "value", value);
    return;
  }
  if ("value" in el) {
    el.value = value;
  }
}
function getModelableValue(el) {
  if (!(el instanceof HTMLElement)) return;
  if (el.isContentEditable) {
    return el.innerText;
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox") {
      return el.checked;
    }
    if (el.type === "number" || el.type === "range") {
      return Number.isNaN(el.valueAsNumber) ? void 0 : el.valueAsNumber;
    }
    return el.value;
  }
  if (el instanceof HTMLSelectElement) {
    return el.multiple ? Array.from(el.selectedOptions).map((o) => o.value) : el.value;
  }
  return "value" in el ? el.value : void 0;
}
function updateClass(el, value) {
  if (value && typeof value === "object") {
    for (const [cls, active] of Object.entries(value)) {
      const classes = cls.trim().split(WS).filter(Boolean);
      if (classes.length > 0) {
        if (active) {
          el.classList.add(...classes);
        } else {
          el.classList.remove(...classes);
        }
      }
    }
  } else {
    const newClass = String(value ?? "").trim();
    const oldClass = prevClasses.get(el);
    if (oldClass) {
      el.classList.remove(...oldClass.split(WS));
    }
    if (newClass) {
      el.classList.add(...newClass.split(WS));
      prevClasses.set(el, newClass);
    } else {
      prevClasses.delete(el);
    }
  }
}
function applyStyles(el, decl, active) {
  if (!canBeStyled(el)) return;
  for (const [prop, value] of parseDeclarations(decl)) {
    if (active) {
      el.style.setProperty(prop, value);
    } else {
      el.style.removeProperty(prop);
    }
  }
}
function setStyleProperty(el, prop, value) {
  if (!canBeStyled(el)) return;
  if (value == null) {
    el.style.removeProperty(prop);
  } else {
    el.style.setProperty(prop, String(value));
  }
}
function updateStyle(el, value) {
  if (!canBeStyled(el)) return;
  for (const prop of prevStyles.get(el) ?? []) {
    el.style.removeProperty(prop);
  }
  const entries2 = value && typeof value === "object" ? Object.entries(value).filter(([, v]) => v != null).map(([k, v]) => [toKebab(k), String(v)]) : parseDeclarations(String(value ?? ""));
  for (const [prop, v] of entries2) {
    el.style.setProperty(prop, v);
  }
  if (entries2.length) {
    prevStyles.set(
      el,
      entries2.map(([prop]) => prop)
    );
  } else {
    prevStyles.delete(el);
  }
}
function updateAttr(el, attr, value) {
  if (typeof value === "boolean" && attr.toLowerCase().startsWith("aria-")) {
    el.setAttribute(attr, String(value));
  } else if (value === false || value == null) {
    el.removeAttribute(attr);
  } else {
    el.setAttribute(attr, value === true ? "" : String(value));
  }
}
function updateProp(el, name, value) {
  if (Reflect.set(el, name, value)) return;
  warnPropOnce(el, name);
}
function warnPropOnce(el, name) {
  let seen = warnedProps.get(el);
  if (!seen) {
    seen = /* @__PURE__ */ new Set();
    warnedProps.set(el, seen);
  }
  if (seen.has(name)) return;
  seen.add(name);
  warn(`rz-prop: cannot set property '${name}'. It is read-only or has no setter.`, el);
}
function canBeStyled(el) {
  return "style" in el;
}
function setStringValue(el, prop, value) {
  const strVal = String(value ?? "");
  if (el[prop] !== strVal) {
    el[prop] = strVal;
  }
}

// src/directives/rz-attr.ts
function bind(el, scope, app, key, value) {
  const name = key.toLowerCase();
  if (name === "class" || name === "style") {
    warn(`rz-attr: '${key}' belongs on data-rz-${name}. Ignoring.`, el);
    return void 0;
  }
  return effect(() => {
    updateAttr(el, key, resolveBoundValue(value || key, scope, app.stores, el, "attr"));
  });
}
var rzAttr = {
  slug: "attr",
  selector: directiveSelector("attr"),
  bind
};

// src/directives/rz-class.ts
function bind2(el, scope, app, key, val) {
  return effect(() => {
    const resolvedValue = resolveBoundValue(val || key, scope, app.stores, el, "class");
    updateClass(el, val === "" ? resolvedValue : { [key]: !!resolvedValue });
  });
}
var rzClass = {
  slug: "class",
  selector: directiveSelector("class"),
  bind: bind2
};

// src/directives/rz-close.ts
function getConfig(el) {
  return parseTriggers(getDirectiveValue(el, "close"));
}
var rzClose = { getConfig };

// src/directives/rz-deposit.ts
function getConfig2(el, overrideValue) {
  const value = overrideValue || getDirectiveValue(el, "deposit");
  const label = true ? overrideValue ? "Rouse-Deposit" : "rz-deposit" : "";
  return parseDirectiveValue(value).flatMap(([key]) => {
    if (!key.startsWith(STORE_PREFIX)) {
      warn(`${label}: '${key}' is not a store reference. Use '@name'.`, el);
      return [];
    }
    const ref = parseStoreRef(key, "deposit");
    if (!ref) return [];
    if (ref.nestedPath) {
      warn(`${label}: '${key}' targets a slice. A deposit writes a whole store.`, el);
      return [];
    }
    return [ref.source];
  });
}
var rzDeposit = { getConfig: getConfig2 };

// src/directives/rz-disable.ts
function getConfig3(el) {
  const value = getDirectiveValue(el, "disable");
  if (value === null) return void 0;
  return stripQuotes(value.trim());
}
var rzDisable = { getConfig: getConfig3 };

// src/core/timing.ts
var DEFAULT_DEBOUNCE_MS = 300;
var DEFAULT_THROTTLE_MS = 150;
var TIME_REGEX = /^(\d*\.?\d+)(ms|s|m)?$/;
function getTimingConfig(options) {
  const { debounce: debounceOpt, throttle: throttleOpt } = options;
  const strategy = debounceOpt !== void 0 ? "debounce" : throttleOpt !== void 0 ? "throttle" : void 0;
  const value = debounceOpt ?? throttleOpt;
  const explicitWait = value === void 0 || value === true ? void 0 : parseTime(value);
  const wait = explicitWait ?? (strategy === "throttle" ? DEFAULT_THROTTLE_MS : DEFAULT_DEBOUNCE_MS);
  let { leading, trailing } = options;
  if (leading !== void 0 || trailing !== void 0) {
    leading = !!leading;
    trailing = !!trailing;
  } else if (strategy === "throttle") {
    leading = true;
    trailing = true;
  } else if (strategy === "debounce") {
    leading = false;
    trailing = true;
  }
  return { strategy, wait, leading, trailing };
}
function debounce(fn, { wait, leading = false, trailing = true }) {
  let timer;
  let lastArgs;
  const debounced = (...args) => {
    lastArgs = args;
    if (timer === void 0) {
      if (leading) {
        fn(...args);
        lastArgs = void 0;
      }
    } else {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = void 0;
      if (trailing && lastArgs) {
        fn(...lastArgs);
        lastArgs = void 0;
      }
    }, wait);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = lastArgs = void 0;
  };
  return debounced;
}
function throttle(fn, { wait, leading = true, trailing = true }) {
  let lastRun = 0;
  let timer;
  let lastArgs;
  const run2 = (args) => {
    fn(...args);
    lastRun = Date.now();
    clearTimeout(timer);
    timer = lastArgs = void 0;
  };
  const throttled = (...args) => {
    const elapsed = Date.now() - lastRun;
    lastArgs = args;
    if (elapsed >= wait) {
      if (leading) {
        run2(args);
      } else if (trailing && !timer) {
        timer = setTimeout(() => run2(lastArgs), wait);
      }
    } else if (trailing && !timer) {
      timer = setTimeout(() => run2(lastArgs), wait - elapsed);
    }
  };
  throttled.cancel = () => {
    clearTimeout(timer);
    timer = lastArgs = void 0;
  };
  return throttled;
}
function applyTiming(fn, options) {
  const config = getTimingConfig(options);
  if (config.strategy === "debounce") {
    return debounce(fn, config);
  }
  if (config.strategy === "throttle") {
    return throttle(fn, config);
  }
  const timed = (...args) => fn(...args);
  timed.cancel = () => {
  };
  return timed;
}
function parseTime(val) {
  if (!val) return 0;
  if (typeof val === "number") return val;
  const normalized = String(val).trim().toLowerCase();
  const match = normalized.match(TIME_REGEX);
  if (!match) {
    warn(`Invalid time value: '${val}'.`);
    return 0;
  }
  const [, amountStr = "0", unit] = match;
  const amount = parseFloat(amountStr);
  if (unit === "m") return amount * 6e4;
  return unit === "s" ? amount * 1e3 : amount;
}

// src/directives/rz-scope.ts
function getConfig4(el) {
  return getDirectiveValue(el, "scope");
}
var SCOPE_SELECTOR = directiveSelector("scope");
var rzScope = { getConfig: getConfig4 };

// src/core/dispatch.ts
function dispatch(el, name, detail = {}, options = {}) {
  const event = new CustomEvent(name, {
    bubbles: true,
    cancelable: false,
    ...options,
    detail
  });
  el.dispatchEvent(event);
  return event;
}

// src/core/state.ts
function isOwnDataProp(obj, key) {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (!desc) return false;
  if (desc.get || desc.set) return false;
  if (typeof desc.value === "function") return false;
  return true;
}
function clone(obj, seen = /* @__PURE__ */ new WeakMap(), path = "root") {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (seen.has(obj)) {
    return seen.get(obj);
  }
  if (Array.isArray(obj)) {
    const arr = [];
    seen.set(obj, arr);
    for (let i = 0; i < obj.length; i++) {
      const val = obj[i];
      arr[i] = typeof val === "function" || val === void 0 ? null : clone(val, seen, `${path}[${i}]`);
    }
    return arr;
  }
  if (!isPlainObject(obj)) {
    warn(
      `Non-serializable value at '${path}'. Use plain objects, arrays, or primitives.`
    );
    return {};
  }
  const result = {};
  seen.set(obj, result);
  for (const key in obj) {
    if (!isOwnDataProp(obj, key)) continue;
    const val = obj[key];
    if (val !== void 0) {
      result[key] = clone(val, seen, `${path}.${key}`);
    }
  }
  return result;
}
function nullPaths(obj, seen = /* @__PURE__ */ new WeakSet(), path = "") {
  if (!isPlainObject(obj) || seen.has(obj)) return [];
  seen.add(obj);
  return Object.keys(obj).flatMap((key) => {
    if (!isOwnDataProp(obj, key)) return [];
    const val = obj[key];
    const keyPath = path ? `${path}.${key}` : key;
    return val === null ? [keyPath] : nullPaths(val, seen, keyPath);
  });
}
function deepEqual(a, b, seen = /* @__PURE__ */ new WeakMap()) {
  if (a === b) {
    return true;
  }
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (seen.has(a)) {
    return seen.get(a) === b;
  }
  seen.set(a, b);
  if (a.constructor !== b.constructor) {
    return false;
  }
  if (a instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (a instanceof RegExp) {
    return a.toString() === b.toString();
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      const valA = typeof a[i] === "function" || a[i] === void 0 ? null : a[i];
      const valB = typeof b[i] === "function" || b[i] === void 0 ? null : b[i];
      if (!deepEqual(valA, valB, seen)) {
        return false;
      }
    }
    return true;
  }
  let validKeysA = 0;
  for (const key in a) {
    if (!isOwnDataProp(a, key)) continue;
    const valA = a[key];
    if (valA !== void 0) {
      validKeysA++;
      if (!Object.hasOwn(b, key)) return false;
      if (!deepEqual(valA, b[key], seen)) return false;
    }
  }
  let validKeysB = 0;
  for (const key in b) {
    if (!isOwnDataProp(b, key)) continue;
    const valB = b[key];
    if (valB !== void 0) {
      validKeysB++;
    }
  }
  return validKeysA === validKeysB;
}
function hasAccessor(obj, key) {
  return !isOwnDataProp(obj, key) && !!Object.getOwnPropertyDescriptor(obj, key);
}
function patchState(target, source, action = "replace", shape) {
  if (action === "replace") {
    for (const key of Object.keys(target)) {
      if (!isOwnDataProp(target, key)) continue;
      if (!Object.hasOwn(source, key)) delete target[key];
    }
    for (const key of Object.keys(source)) {
      if (hasAccessor(target, key)) continue;
      target[key] = source[key];
    }
    return;
  }
  for (const sourceKey of Object.keys(source)) {
    if (!isOwnDataProp(source, sourceKey)) continue;
    const sourceVal = source[sourceKey];
    if (sourceVal === void 0) continue;
    if (hasAccessor(target, sourceKey) || isPlainObject(shape) && hasAccessor(shape, sourceKey)) {
      continue;
    }
    if (sourceVal === null) {
      delete target[sourceKey];
      continue;
    }
    const targetVal = target[sourceKey];
    const nestedShape = isPlainObject(shape) ? shape[sourceKey] : void 0;
    if (isPlainObject(sourceVal)) {
      if (isPlainObject(targetVal)) {
        patchState(targetVal, sourceVal, "merge", nestedShape);
      } else {
        target[sourceKey] = {};
        patchState(target[sourceKey], sourceVal, "merge", nestedShape);
      }
    } else {
      target[sourceKey] = sourceVal;
    }
  }
}
function isPlainObject(val) {
  if (typeof val !== "object" || val === null || Array.isArray(val)) {
    return false;
  }
  const proto = Object.getPrototypeOf(val);
  return proto === null || proto === Object.prototype;
}

// src/net/payload.ts
function resolveUrl(url, baseUrl) {
  try {
    if (isAbsoluteUrl(url)) {
      return new URL(url);
    }
    const base = baseUrl ? new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`, document.baseURI) : document.baseURI;
    return new URL(url, base);
  } catch (err2) {
    fail(`Failed to construct URL: '${url}'.`, TypeError, { cause: err2 });
  }
}
function preparePayload(options, baseUrl) {
  const { url, headers = {}, body, params, ...restOptions } = options;
  const method = (options.method || "GET").toUpperCase();
  if (body != null && (method === "GET" || method === "HEAD")) {
    fail(
      `A ${method} request can't have a body. Pass query values as 'params', or use a method that takes a body.`,
      TypeError
    );
  }
  const urlObj = resolveUrl(url, baseUrl);
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      if (val == null) continue;
      urlObj.searchParams.delete(key);
      for (const v of Array.isArray(val) ? val : [val]) {
        urlObj.searchParams.append(key, String(v));
      }
    }
  }
  const reqHeaders = new Headers();
  reqHeaders.set("Rouse-Request", "true");
  reqHeaders.set("Accept", "application/json, text/html, image/svg+xml, */*;q=0.8");
  for (const [key, val] of Object.entries(headers)) {
    if (val == null) {
      reqHeaders.delete(key);
    } else {
      reqHeaders.set(key, String(val));
    }
  }
  let finalBody = null;
  let contentType = null;
  if (body != null) {
    if (isNativeBinaryBody(body) || typeof body === "string") {
      finalBody = body;
    } else if (body instanceof URLSearchParams) {
      finalBody = body;
      contentType = "application/x-www-form-urlencoded";
    } else if (typeof body === "object") {
      finalBody = JSON.stringify(body);
      contentType = "application/json";
    } else {
      finalBody = String(body);
      contentType = "text/plain";
    }
  }
  if (contentType && !reqHeaders.has("Content-Type")) {
    reqHeaders.set("Content-Type", contentType);
  }
  return { finalUrl: urlObj.toString(), method, reqHeaders, finalBody, restOptions };
}
function isNativeBinaryBody(body) {
  return body instanceof FormData || body instanceof Blob || // File inherits from Blob, so this catches both
  body instanceof ArrayBuffer || ArrayBuffer.isView(body) || // Catches DataView and TypedArray
  body instanceof ReadableStream;
}
function isAbsoluteUrl(url) {
  if (/^(blob|data):/.test(url)) {
    fail(`Unsupported URL scheme: '${url}'.`, TypeError);
  }
  return /^https?:\/\//i.test(url);
}

// src/net/sse-engine.ts
var DEFAULT_EVENT = "message";
var entries = /* @__PURE__ */ new Map();
var subscribedNames = /* @__PURE__ */ new Set();
function streamKey(url, withCredentials) {
  return `${withCredentials ? "1" : "0"}|${url}`;
}
function openStream(app, resource, options = {}, revive = false) {
  const el = options.triggerEl ?? app.root;
  const config = {
    url: resolveUrl(resource, app.config.baseUrl).href,
    withCredentials: options.withCredentials ?? false,
    triggerEl: options.triggerEl
  };
  const gate = dispatch(el, "rz:sse:config", { config }, { cancelable: true });
  if (gate.defaultPrevented) {
    return null;
  }
  const key = streamKey(config.url, config.withCredentials);
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      url: config.url,
      withCredentials: config.withCredentials,
      source: null,
      refs: /* @__PURE__ */ new Set(),
      attached: /* @__PURE__ */ new Set(),
      attempt: 0,
      closed: false
    };
    entries.set(key, entry);
  }
  const ref = { el, config };
  entry.refs.add(ref);
  if (!entry.source && (!entry.closed || revive)) {
    entry.attempt = 0;
    connect(entry);
  } else if (entry.source?.readyState === EventSource.OPEN) {
    dispatch(el, "rz:sse:open", { config });
  }
  return (reason = "released") => release(key, ref, reason);
}
function openBoundStream(app, resource, options, signal2) {
  if (signal2.aborted) {
    return () => {
    };
  }
  const release2 = openStream(app, resource, options, true);
  if (!release2) {
    return () => {
    };
  }
  const onAbort = () => release2("teardown");
  signal2.addEventListener("abort", onAbort, { once: true });
  return () => {
    signal2.removeEventListener("abort", onAbort);
    release2("released");
  };
}
function subscribeNamed(name) {
  if (!name || name === DEFAULT_EVENT || subscribedNames.has(name)) return;
  subscribedNames.add(name);
  entries.forEach((entry) => attachNamed(entry, name));
}
function connect(entry) {
  const source = new EventSource(entry.url, {
    withCredentials: entry.withCredentials
  });
  entry.source = source;
  entry.closed = false;
  entry.attached = /* @__PURE__ */ new Set();
  source.addEventListener("open", () => {
    entry.attempt = 0;
    emit(entry, "rz:sse:open", {});
  });
  source.addEventListener("error", () => onError(entry));
  attachNamed(entry, DEFAULT_EVENT);
  subscribedNames.forEach((name) => attachNamed(entry, name));
}
function attachNamed(entry, name) {
  const { source } = entry;
  if (!source || entry.attached.has(name)) return;
  entry.attached.add(name);
  source.addEventListener(name, (e) => onMessage(entry, name, e));
}
function onMessage(entry, event, e) {
  const raw = e.data;
  const data = parseMessageData(raw);
  const routable = event === DEFAULT_EVENT;
  for (const ref of entry.refs) {
    const base = { config: ref.config, event, raw, lastEventId: e.lastEventId };
    if (routable) {
      if (Array.isArray(data) || isPlainObject(data)) {
        dispatch(ref.el, "rz:sse:message:json", { ...base, data });
      } else {
        dispatch(ref.el, "rz:sse:message:html", { ...base, data: raw });
      }
    }
    dispatch(ref.el, "rz:sse:message", { ...base, data });
  }
}
function onError(entry) {
  const { source } = entry;
  if (!source) return;
  entry.attempt += 1;
  const willRetry = source.readyState !== EventSource.CLOSED;
  const prevented = emit(entry, "rz:sse:error", { attempt: entry.attempt }, true);
  if (!willRetry) {
    finalize(entry, "failed");
  } else if (prevented) {
    finalize(entry, "canceled");
  }
}
function finalize(entry, reason) {
  entry.source?.close();
  entry.source = null;
  entry.attached.clear();
  entry.closed = true;
  emit(entry, "rz:sse:close", { reason });
}
function release(key, ref, reason) {
  const entry = entries.get(key);
  if (!entry?.refs.delete(ref)) return;
  const announced = entry.closed;
  if (entry.refs.size === 0) {
    entry.source?.close();
    entries.delete(key);
  }
  if (!announced) {
    dispatch(ref.el, "rz:sse:close", { config: ref.config, reason });
  }
}
function emit(entry, name, detail, cancelable = false) {
  let prevented = false;
  for (const ref of entry.refs) {
    const event = dispatch(ref.el, name, { config: ref.config, ...detail }, {
      cancelable
    });
    prevented ||= event.defaultPrevented;
  }
  return prevented;
}
function parseMessageData(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return raw;
  try {
    return safeJSONParse(trimmed);
  } catch {
    return raw;
  }
}

// src/dom/binder.ts
var globalBindings = /* @__PURE__ */ new WeakMap();
var scopeBindings = /* @__PURE__ */ new WeakMap();
var renderOwned = /* @__PURE__ */ new WeakMap();
var boundDirectiveList = [];
var boundSelector = "";
var awakeScopes = /* @__PURE__ */ new WeakMap();
function isScopeAwake(el) {
  return awakeScopes.has(el);
}
function registerBoundDirectives(...directives) {
  boundDirectiveList = directives;
  boundSelector = directives.map((directive) => directive.selector).join(", ");
}
function markRenderOwned(el, ctx) {
  renderOwned.set(el, ctx);
}
function unmarkRenderOwned(el) {
  renderOwned.delete(el);
}
function resolveOwnerState(el, root) {
  for (let node = el; node; node = node.parentElement) {
    const ctx = renderOwned.get(node);
    if (ctx) {
      return ctx;
    }
    if (node.matches(SCOPE_SELECTOR)) {
      return awakeScopes.get(node) ?? EMPTY_SCOPE;
    }
    if (node === root) break;
  }
  return EMPTY_SCOPE;
}
function bindDirectives(el, scope, app) {
  const cleanups = [];
  for (const directive of boundDirectiveList) {
    const value = getDirectiveValue(el, directive.slug);
    if (value === null) continue;
    const parsed = parseDirectiveValue(value);
    if (directive.singleValue && parsed.length > 1) {
      warn(
        `rz-${directive.slug}: accepts a single value, but received ${parsed.length}. Ignoring extra values.`,
        el
      );
      parsed.length = 1;
    }
    for (const [key, val] of parsed) {
      const cleanup = directive.bind(el, scope, app, key, val ?? "");
      if (cleanup) {
        cleanups.push(cleanup);
      }
    }
  }
  return cleanups;
}
function walkBoundElements(root, callback, options) {
  if (!options?.acceptScopeRoot && root.matches(SCOPE_SELECTOR)) return;
  if (renderOwned.has(root)) return;
  if (root.matches(boundSelector)) {
    callback(root);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node2) {
      const el = node2;
      if (el.matches(SCOPE_SELECTOR) || renderOwned.has(el)) {
        return NodeFilter.FILTER_REJECT;
      }
      return el.matches(boundSelector) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  let node = walker.nextNode();
  while (node !== null) {
    callback(node);
    node = walker.nextNode();
  }
}
function mountGlobalBinding(el, app) {
  if (globalBindings.has(el)) return;
  const cleanups = bindDirectives(el, EMPTY_SCOPE, app);
  if (cleanups.length) {
    globalBindings.set(el, cleanups);
  }
}
function teardownGlobalBindings(root, owns) {
  walkBoundElements(root, (el) => {
    if (owns && !owns(el)) return;
    const cleanups = globalBindings.get(el);
    if (!cleanups) return;
    globalBindings.delete(el);
    runCleanups(el, cleanups);
  });
}
function resolveRemovedOwner(el) {
  const direct = scopeBindings.get(el);
  if (direct) return direct;
  let found = null;
  walkBoundElements(el, (boundEl) => {
    if (!found) {
      const owner = scopeBindings.get(boundEl);
      if (owner) {
        found = owner;
      }
    }
  });
  return found;
}
function runCleanups(el, cleanups) {
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (error) {
      err("Cleanup failed for element:", el, error);
    }
  }
}
function runHook(instance, name, root) {
  const hook = instance[name];
  if (typeof hook !== "function") return;
  try {
    hook.call(instance);
  } catch (error) {
    err(`Scope hook '${name}()' failed.`, root, error);
  }
}
function bindScope(root, instance, app) {
  const elementCleanups = /* @__PURE__ */ new Map();
  const boundNodes = /* @__PURE__ */ new WeakSet();
  function runCleanup(el) {
    boundNodes.delete(el);
    const cleanups = elementCleanups.get(el);
    if (!cleanups) return;
    elementCleanups.delete(el);
    scopeBindings.delete(el);
    runCleanups(el, cleanups);
  }
  function bindNode(el) {
    if (boundNodes.has(el)) return;
    boundNodes.add(el);
    const cleanups = bindDirectives(el, instance, app);
    if (!cleanups.length) return;
    elementCleanups.set(el, cleanups);
    scopeBindings.set(el, root);
  }
  function scan(startEl) {
    const owner = startEl.closest(SCOPE_SELECTOR);
    if (!owner || owner !== root) return;
    walkBoundElements(startEl, bindNode, {
      acceptScopeRoot: startEl === root
    });
  }
  function teardown2(removedEl) {
    if (elementCleanups.has(removedEl)) {
      runCleanup(removedEl);
    }
    const walker = document.createTreeWalker(removedEl, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node !== null) {
      const el = node;
      if (elementCleanups.has(el)) {
        runCleanup(el);
      }
      node = walker.nextNode();
    }
  }
  scan(root);
  runHook(instance, "connect", root);
  awakeScopes.set(root, instance);
  dispatch(root, "rz:scope:connect", { instance });
  function unbindDom() {
    for (const el of elementCleanups.keys()) {
      runCleanup(el);
    }
    runHook(instance, "disconnect", root);
    awakeScopes.delete(root);
    dispatch(root, "rz:scope:disconnect", { instance });
  }
  return { unbindDom, scan, teardown: teardown2 };
}

// src/dom/modifiers.ts
var sysModifierMap = {
  ctrl: "ctrlKey",
  alt: "altKey",
  shift: "shiftKey",
  meta: "metaKey"
};
var SYS_MODIFIERS = Object.keys(sysModifierMap);
var SYS_MODIFIER_FLAGS = Object.values(sysModifierMap);
var modifierKeyFlags = /* @__PURE__ */ new Map([
  ["control", "ctrlKey"],
  ["alt", "altKey"],
  ["shift", "shiftKey"],
  ["meta", "metaKey"]
]);
function expectedKeys(key) {
  if (key === void 0) return [];
  return (Array.isArray(key) ? key : [key]).map((k) => k.toLowerCase());
}
function resolveListenerTarget(el, options, app) {
  if (options.listenOn === "window") {
    return window;
  }
  if (options.listenOn === "document") {
    return document;
  }
  if (options.listenOn === "root") {
    return app.root;
  }
  if (options.outside) {
    return document;
  }
  return el;
}
function applyModifiers(e, el, options) {
  if (options.self && e.target !== e.currentTarget) {
    return false;
  }
  if (options.outside && el instanceof Element) {
    if (el.contains(e.target)) {
      return false;
    }
  }
  if (e instanceof KeyboardEvent || e instanceof MouseEvent) {
    const expectedSysModifiers = SYS_MODIFIERS.filter((m) => options[m]);
    for (const mod of expectedSysModifiers) {
      if (!e[sysModifierMap[mod]]) {
        return false;
      }
    }
    const keys = e instanceof KeyboardEvent ? expectedKeys(options.key) : [];
    if (e instanceof KeyboardEvent && expectedSysModifiers.length > 0 && keys.length === 0) {
      return false;
    }
    const exact = !options.loose && (expectedSysModifiers.length > 0 || keys.length > 0);
    if (exact) {
      const selfFlag = e instanceof KeyboardEvent ? modifierKeyFlags.get(e.key.toLowerCase()) : void 0;
      const expectedFlags = expectedSysModifiers.map((m) => sysModifierMap[m]);
      const pressedModifiers = SYS_MODIFIER_FLAGS.filter(
        (key) => e[key] && (key !== selfFlag || expectedFlags.includes(key))
      );
      if (pressedModifiers.length !== expectedFlags.length) {
        return false;
      }
    }
    if (e instanceof KeyboardEvent && keys.length > 0) {
      const pressedKey = e.key.toLowerCase();
      const pressedCode = e.code.toLowerCase();
      const isMatch = keys.some((expected) => {
        if (!expected) return false;
        if (pressedKey === expected) return true;
        if (expected.length === 1) {
          if (expected === " ") {
            return pressedCode === "space";
          }
          return pressedCode === `key${expected}` || pressedCode === `digit${expected}`;
        }
        return false;
      });
      if (!isMatch) return false;
    }
  }
  if (options.prevent) {
    e.preventDefault();
  }
  if (options.stop) {
    e.stopPropagation();
  }
  if (options.stopImmediate) {
    e.stopImmediatePropagation();
  }
  return true;
}

// src/dom/events.ts
function isNativeNavigation(el, e) {
  return e.type === "submit" && el instanceof HTMLFormElement || e.type === "click" && el instanceof HTMLAnchorElement;
}
function attachListener(el, name, callback, triggerOptions, app) {
  const { capture, once, passive } = triggerOptions;
  const listener = (e) => {
    if (!applyModifiers(e, el, triggerOptions)) return;
    if (once) {
      cleanup();
    }
    callback(e);
  };
  const target = resolveListenerTarget(el, triggerOptions, app);
  const cleanup = () => {
    target.removeEventListener(name, listener, capture);
  };
  target.addEventListener(name, listener, { capture, passive });
  return cleanup;
}
function on(target, event, callback, options, app) {
  const { signal: signal2, ...modifiers } = options;
  if (signal2?.aborted) {
    return () => {
    };
  }
  let name;
  let arg;
  if (typeof event === "string") {
    name = event.trim();
    /\||-\[/.test(name) && warn(
      `'${name}' looks like Rouse trigger syntax, which isn't parsed in app.on. Pass a trigger's argument with its name and modifiers as options: app.on({ sse: 'late' }, fn, { once: true }).`,
      target
    );
  } else {
    const keys = Object.keys(event);
    const [key] = keys;
    if (key === void 0 || keys.length > 1) {
      warn(
        `app.on expected a trigger source with its argument, such as { interval: '10s' }, but got an object with ${keys.length} keys.`,
        target
      );
      return () => {
      };
    }
    name = key;
    arg = event[key];
  }
  const action = typeof callback === "function" ? (e) => callback(e ?? new CustomEvent(name)) : (e) => callback.handleEvent(e ?? new CustomEvent(name));
  const cleanup = dispatchTrigger(
    { event: name, options: modifiers },
    { el: target, app, arg, action, suppressNavigation: false }
  );
  signal2?.addEventListener("abort", cleanup, { once: true });
  return cleanup;
}
function dispatchTrigger(trigger2, base) {
  const timed = applyTiming(base.action, trigger2.options);
  const suppressNavigation = base.suppressNavigation ?? true;
  const wrapCleanup = (cleanup2) => {
    return () => {
      timed.cancel();
      cleanup2?.();
    };
  };
  const source = triggerSources[trigger2.event];
  if (source) {
    let arg = base.arg;
    if (trigger2.arg !== void 0) {
      const resolved = source.fromArg ? source.fromArg(trigger2.arg, base.el) : trigger2.arg;
      if (resolved === null) return () => {
      };
      arg = resolved;
    }
    const cleanup2 = attachTriggerSource(source.attach, {
      ...base,
      arg,
      options: trigger2.options,
      action: timed
    });
    return wrapCleanup(cleanup2);
  }
  const cleanup = attachListener(
    base.el,
    trigger2.event,
    (e) => {
      if (suppressNavigation && isNativeNavigation(base.el, e)) {
        e.preventDefault();
      }
      timed(e);
    },
    trigger2.options,
    base.app
  );
  return wrapCleanup(cleanup);
}
function attachTriggerSource(handler, ctx) {
  if (!ctx.options.once) {
    return handler(ctx);
  }
  const action = ctx.action;
  let cleanup = null;
  let fired = false;
  ctx.action = (e) => {
    if (fired) return;
    fired = true;
    cleanup?.();
    action(e);
  };
  cleanup = handler(ctx);
  if (fired) {
    cleanup?.();
  }
  return cleanup;
}
function isTriggerSource(name) {
  return Object.hasOwn(triggerSources, name);
}
function attachWakeStrategies(el, app, triggers, onWake) {
  let pending = triggers.length;
  if (pending === 0) {
    onWake();
    return () => {
    };
  }
  let isAwake = false;
  let cleanups = [];
  const teardown2 = () => cleanups.forEach((cleanup) => cleanup());
  const satisfy = () => {
    if (isAwake) return;
    pending--;
    if (pending === 0) {
      isAwake = true;
      teardown2();
      onWake();
    }
  };
  cleanups = triggers.map((trigger2) => {
    let satisfied = false;
    return dispatchTrigger(trigger2, {
      el,
      app,
      suppressNavigation: false,
      action: () => {
        if (satisfied) return;
        satisfied = true;
        satisfy();
      }
    });
  });
  if (isAwake) {
    teardown2();
  }
  return () => {
    if (!isAwake) {
      teardown2();
    }
  };
}
var triggerSources = {
  /** Fires when the RouseApp instance is fully initialized. */
  ready: {
    attach: ({ app, action }) => {
      if (app.isReady) {
        action();
        return null;
      }
      app.root.addEventListener("rz:app:ready", action, { once: true });
      return () => app.root.removeEventListener("rz:app:ready", action);
    }
  },
  /** Fires when the nearest enclosing scope is activated. */
  wake: {
    attach: ({ el, app, action }) => {
      const scopeEl = el.closest(SCOPE_SELECTOR);
      if (!scopeEl) {
        warn(`The 'wake' trigger requires an enclosing scope element.`, el);
        return null;
      }
      if (!getApp(scopeEl, app)) {
        return null;
      }
      if (scopeEl === el && gatesOnWake(el)) {
        warn(`The 'wake' trigger can't be used to wake its own scope element.`, el);
      }
      if (isScopeAwake(scopeEl)) {
        action();
      }
      const onConnect = (e) => {
        if (e.target === scopeEl) {
          action(e);
        }
      };
      scopeEl.addEventListener("rz:scope:connect", onConnect);
      return () => scopeEl.removeEventListener("rz:scope:connect", onConnect);
    }
  },
  /** Opts the directive out of all auto-binding (explicit no-op). */
  none: { attach: () => null },
  /** Fires once after a specified period (`setTimeout`). */
  timeout: { attach: (ctx) => attachTimingSource("timeout", ctx) },
  /** Repeating timer (`setInterval`). */
  interval: { attach: (ctx) => attachTimingSource("interval", ctx) },
  /** Listens to a media query. */
  media: {
    attach: ({ el, arg: query, action }) => {
      if (typeof query !== "string" || !query) {
        warn(
          `The 'media' trigger requires a query: 'media-[(min-width: 640px)]' in HTML, or { media: '(min-width: 640px)' } from app.on.`,
          el
        );
        return null;
      }
      const mql = window.matchMedia(query);
      mql.media === "not all" && query !== "not all" && warn(`Invalid media query '${query}'. It will never match.`, el);
      if (mql.matches) {
        action();
      }
      const changeHandler = (e) => {
        if (e.matches) {
          action();
        }
      };
      mql.addEventListener("change", changeHandler);
      return () => mql.removeEventListener("change", changeHandler);
    }
  },
  /** Element intersection with the viewport. */
  intersect: {
    fromArg: (arg) => Number.parseFloat(arg),
    attach: ({ el, arg, action }) => {
      let threshold = arg ?? 0;
      if (typeof threshold !== "number" || !(threshold >= 0 && threshold <= 1)) {
        warn(`Invalid intersect threshold '${arg}'. Use a number from 0 to 1.`, el);
        threshold = 0;
      }
      const observer = new IntersectionObserver(
        (entries2) => {
          for (const entry of entries2) {
            if (!entry.isIntersecting || entry.intersectionRatio < threshold) continue;
            action();
            break;
          }
        },
        { threshold }
      );
      observer.observe(el);
      return () => observer.disconnect();
    }
  },
  /**
   * Fires on pointer or focus interaction with the element. `pointerover` covers
   * mouse, touch, and pen. `focusin` covers keyboard.
   */
  interact: {
    attach: ({ el, action }) => {
      const events = ["pointerover", "focusin"];
      events.forEach((evt) => el.addEventListener(evt, action, { passive: true }));
      return () => events.forEach((evt) => el.removeEventListener(evt, action));
    }
  },
  /**
   * Fires on a stream message with the named event: `sse-[cart-updated]`.
   * Listens on the element, which hears its own stream and its descendants'.
   * `|root` widens it to every stream in the app.
   *
   * Subscribing is what makes the name observable.
   */
  sse: {
    attach: ({ el, app, arg: name, options, action }) => {
      if (typeof name !== "string" || !name) {
        warn(
          `The 'sse' trigger requires an event name: 'sse-[cart-updated]' in HTML, or { sse: 'cart-updated' } from app.on.`,
          el
        );
        return null;
      }
      subscribeNamed(name);
      const target = resolveListenerTarget(el, options, app);
      const handler = (e) => {
        const { detail } = e;
        if (detail.event === name) {
          action(e);
        }
      };
      target.addEventListener("rz:sse:message", handler);
      return () => target.removeEventListener("rz:sse:message", handler);
    }
  },
  /** window.requestIdleCallback (one-time execution). */
  idle: {
    attach: ({ action }) => {
      if (typeof window.requestIdleCallback === "function") {
        const id2 = window.requestIdleCallback(() => action());
        return () => window.cancelIdleCallback(id2);
      }
      const id = window.setTimeout(action, 1);
      return () => window.clearTimeout(id);
    }
  },
  /**
   * Fires when a store's data is edited. Framework writes are excluded; user
   * writes in one tick coalesce into a single notification.
   */
  edit: {
    // The store sigil `@` is required in HTML, so if missing it falls through to the warning
    fromArg: (arg) => arg.startsWith(STORE_PREFIX) ? arg.slice(STORE_PREFIX.length) : void 0,
    attach: ({ el, app, arg: path, action }) => {
      if (typeof path !== "string" || !path) {
        warn(
          `The 'edit' trigger requires a store, e.g. 'edit-[@cart]' in HTML, or { edit: 'cart' } from app.on.`,
          el
        );
        return null;
      }
      if (path.startsWith(STORE_PREFIX)) {
        warn(
          `The 'edit' trigger takes a store without '${STORE_PREFIX}' from app.on: { edit: '${path.slice(STORE_PREFIX.length)}' }.`,
          el
        );
        return null;
      }
      const ref = parseStoreRef(`${STORE_PREFIX}${path}`);
      if (!ref) return null;
      const rootKey = getPathRoot(ref.nestedPath);
      return app.stores._onEdit(ref.source, (roots) => {
        if (!rootKey || roots.has(rootKey)) {
          action();
        }
      });
    }
  }
};
function attachTimingSource(type, ctx) {
  const delay = ctx.arg;
  if (delay === void 0 || delay === "") {
    warn(
      `The '${type}' trigger requires a delay: '${type}-[5s]' in HTML, or { ${type}: '5s' } from app.on.`,
      ctx.el
    );
    return null;
  }
  const ms = parseTime(delay);
  if (ms <= 0) {
    return null;
  }
  const setup = type === "timeout" ? window.setTimeout : window.setInterval;
  const clear = type === "timeout" ? window.clearTimeout : window.clearInterval;
  const id = setup(ctx.action, ms);
  return () => clear(id);
}
function gatesOnWake(el) {
  const value = getDirectiveValue(el, "wake");
  return !!value && parseTriggers(value).some((trigger2) => trigger2.event === "wake");
}

// src/core/keys.ts
var session = Date.now().toString(36);
var count = 46656;
function createKey(prefix = "rz_") {
  return prefix + session + (count++).toString(36);
}

// src/dom/forms.ts
var BUTTON_TYPES = /* @__PURE__ */ new Set(["submit", "button", "reset", "image"]);
function isField(el) {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
}
function isFieldContainer(el) {
  return el instanceof HTMLFormElement || el instanceof HTMLFieldSetElement;
}
function readField(field) {
  if (field.type === "radio" && field.name) {
    const root = field.closest("form") || document;
    const checked = root.querySelector(
      `input[type="radio"][name="${CSS.escape(field.name)}"]:checked`
    );
    return checked ? submittedValue(checked) : null;
  }
  return submittedValue(field);
}
function collectFields(elements) {
  const fields = /* @__PURE__ */ new Set();
  for (const el of elements) {
    for (const member of isFieldContainer(el) ? el.elements : [el]) {
      if (isField(member) && !BUTTON_TYPES.has(member.type)) {
        fields.add(member);
      }
    }
  }
  const pairs = {};
  const named = /* @__PURE__ */ new Set();
  const shared = /* @__PURE__ */ new Set();
  for (const field of fields) {
    if (field.name && field.type !== "radio") {
      (named.has(field.name) ? shared : named).add(field.name);
    }
    const value = submittedValue(field);
    if (value !== null) {
      appendValue(pairs, field.name, value);
    }
  }
  for (const name of shared) {
    const value = pairs[name];
    if (value !== void 0 && !Array.isArray(value)) {
      pairs[name] = [value];
    }
  }
  return pairs;
}
function readTriggerValues(el, submitter = null) {
  if (isField(el)) {
    const value = readField(el);
    return value === null ? null : { [el.name]: value };
  }
  return isFieldContainer(el) ? { ...collectFields([el]), ...readSubmitter(submitter) } : null;
}
function readSubmitter(submitter) {
  const isButton = submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement;
  return isButton && submitter.name ? { [submitter.name]: submitter.value } : {};
}
function submittedValue(field) {
  if (!field.name || field.matches(":disabled")) return null;
  if (field instanceof HTMLInputElement) {
    if ((field.type === "checkbox" || field.type === "radio") && !field.checked) {
      return null;
    }
    if (field.type === "file") {
      const files = Array.from(field.files ?? []);
      if (!files.length) {
        return null;
      }
      return field.multiple ? files : files[0] ?? null;
    }
  }
  if (field instanceof HTMLSelectElement && field.multiple) {
    const values = Array.from(field.selectedOptions, (opt) => opt.value);
    return values.length ? values : null;
  }
  return field.value;
}
function appendValue(pairs, name, value) {
  const prev = pairs[name];
  pairs[name] = prev === void 0 ? value : [prev, value].flat();
}

// src/directives/rz-send.ts
function getConfig5(el, app, submitter = null) {
  const scope = resolveOwnerState(el, app.root);
  const payload = { ...readTriggerValues(el, submitter) };
  for (const [entry, val] of parseDirectiveValue(getDirectiveValue(el, "send"))) {
    if (val === null) {
      Object.assign(payload, readSource(entry, el, scope, app));
    } else if (entry === "selector") {
      Object.assign(payload, readSelector(val, el, app));
    } else {
      warn(`rz-send: unknown key '${entry}'. The only key is 'selector'.`, el);
    }
  }
  return payload;
}
function readSource(entry, el, scope, app) {
  const lead = entry[0];
  if (lead === "{") {
    return readJson(entry, el);
  }
  if (lead === STORE_PREFIX) {
    return parseStoreRef(entry, "send") ? readState(entry, el, scope, app) : null;
  }
  if (lead === ITEM_PREFIX) {
    if (parseDataSourcePath(entry).namespace) {
      warn(
        `rz-send: '${entry}' is render metadata, not item data. Use '%' or a field like '%.id'.`,
        el
      );
      return null;
    }
    return readState(entry, el, scope, app);
  }
  if (/^[A-Za-z_$]/.test(entry)) {
    return readState(entry, el, scope, app);
  }
  warn(
    /^[#.[:*]/.test(entry) ? `rz-send: '${entry}' looks like a selector. Write 'selector: ${entry}'.` : `rz-send: '${entry}' is not a source.`,
    el
  );
  return null;
}
function readJson(entry, el) {
  try {
    return safeJSONParse(entry);
  } catch {
    warn(`rz-send: '${entry}' is not valid JSON.`, el);
    return null;
  }
}
function readState(path, el, scope, app) {
  const value = resolveState(path, scope, app.stores);
  if (value === void 0) {
    warn(`rz-send: '${path}' resolved to undefined. Ignoring.`, el);
    return null;
  }
  const data = clone(getRaw(value));
  const isSource = path[0] === STORE_PREFIX || path[0] === ITEM_PREFIX;
  if (isSource && !parseDataSourcePath(path).nestedPath) {
    if (isPlainObject(data)) {
      return data;
    }
    warn(`rz-send: '${path}' has no fields to send.`, el);
    return null;
  }
  return { [path.slice(path.lastIndexOf(".") + 1)]: data };
}
function readSelector(selector, el, app) {
  if (/^[@%{]/.test(selector)) {
    warn(
      `rz-send: '${selector}' isn't a selector. Write state references and JSON without 'selector:'.`,
      el
    );
    return null;
  }
  const matches = queryTargets(app.root, selector);
  if (!matches.length) {
    warn(`rz-send: no elements match '${selector}'.`, el);
    return null;
  }
  warnUnreadable(selector, matches);
  return collectFields(matches);
}
function warnUnreadable(selector, matches) {
  for (const match of matches) {
    if (isField(match) ? !match.name : !isFieldContainer(match)) {
      warn(
        isField(match) ? `rz-send: '${selector}' matched a field with no name to send its value under.` : `rz-send: '${selector}' matched an element that isn't a field, form, or fieldset.`,
        match
      );
    }
  }
}
var rzSend = { getConfig: getConfig5 };

// src/directives/rz-indicator.ts
function getConfig6(el) {
  const value = getDirectiveValue(el, "indicator")?.trim();
  if (!value) return void 0;
  if (value === "null") return null;
  return stripQuotes(value) || void 0;
}
var rzIndicator = { getConfig: getConfig6 };

// src/net/lifecycle.ts
var PREVENTED = /* @__PURE__ */ Symbol(true ? "rz.prevented" : "");
var REQUEST_CLASS = "rouse-request";
var inFlight = /* @__PURE__ */ new WeakMap();
var heldDisabled = /* @__PURE__ */ new WeakMap();
async function runRequestLifecycle(opts) {
  const { el, root, prefix, configDetail, terminalDetail, run: run2 } = opts;
  const configEvent = dispatch(el, `${prefix}:config`, configDetail, {
    cancelable: true
  });
  if (configEvent.defaultPrevented) return PREVENTED;
  const indicators = resolveIndicators(el, root, configDetail.config.indicator);
  const disableHost = configDetail.config.triggerEl ?? (el === root ? null : el);
  const disabled = holdDisabled(resolveDisabled(disableHost, root));
  trackInFlight(indicators, 1);
  dispatch(el, `${prefix}:start`, configDetail);
  let released = false;
  const release2 = () => {
    if (released) return;
    released = true;
    releaseDisabled(disabled);
  };
  let settled = false;
  const settle = (result) => {
    if (settled) return;
    settled = true;
    release2();
    if (result.error?.code === "CANCELED") {
      dispatch(el, `${prefix}:abort`, configDetail);
      return;
    }
    if (result.error) {
      dispatch(el, `${prefix}:error`, terminalDetail(result));
      return;
    }
    dispatch(el, `${prefix}:success`, terminalDetail(result));
    const trigger2 = result.headers?.["rouse-trigger"];
    if (trigger2) {
      dispatch(el, trigger2, result);
    }
  };
  try {
    return await run2({ settle });
  } finally {
    trackInFlight(indicators, -1);
    release2();
    dispatch(el, `${prefix}:end`, configDetail);
  }
}
function resolveIndicators(el, root, indicator) {
  const resolved = indicator === void 0 ? rzIndicator.getConfig(el) : indicator;
  if (resolved === void 0) {
    return [el];
  }
  if (resolved === null) {
    return [];
  }
  if (typeof resolved === "string") {
    const els = queryTargets(root, resolved);
    !els.length && warn(
      `No request indicator applied. Selector '${resolved}' does not match any elements.`,
      ...el === root ? [] : [el]
    );
    return els;
  }
  if (resolved?.nodeType === Node.ELEMENT_NODE) {
    return [resolved];
  }
  warn(
    `No request indicator applied. Expected an element, a selector, or null. Got: ${Array.isArray(resolved) ? "array" : typeof resolved}.`,
    ...el === root ? [] : [el]
  );
  return [];
}
function resolveDisabled(host, root) {
  if (!host) return [];
  const selector = rzDisable.getConfig(host);
  if (selector === void 0) return [];
  const els = selector === "" ? [host] : queryTargets(root, selector);
  !els.length && warn(`rz-disable: selector '${selector}' does not match any elements.`, host);
  return els.filter((match) => {
    if ("disabled" in match) return true;
    warn(
      `rz-disable: <${match.localName}> can't be disabled. Name a form control or a fieldset.`,
      match,
      host
    );
    return false;
  });
}
function holdDisabled(els) {
  const held = els.filter((el) => heldDisabled.has(el) || !el.hasAttribute("disabled"));
  held.forEach((el) => {
    heldDisabled.set(el, (heldDisabled.get(el) ?? 0) + 1);
    el.setAttribute("disabled", "");
  });
  return held;
}
function releaseDisabled(els) {
  for (const el of els) {
    const n = (heldDisabled.get(el) ?? 1) - 1;
    if (n > 0) {
      heldDisabled.set(el, n);
      continue;
    }
    heldDisabled.delete(el);
    el.removeAttribute("disabled");
  }
}
function trackInFlight(els, delta) {
  for (const el of els) {
    const n = Math.max(0, (inFlight.get(el) ?? 0) + delta);
    inFlight.set(el, n);
    el.classList.toggle(REQUEST_CLASS, n > 0);
  }
}

// src/directives/rz-headers.ts
function getConfig7(el) {
  const value = getDirectiveValue(el, "headers");
  if (!value) return {};
  const headers = {};
  if (value.startsWith("{")) {
    try {
      for (const [k, v] of Object.entries(safeJSONParse(value))) {
        headers[k] = v == null ? null : String(v);
      }
    } catch {
      warn(`rz-headers: value is not valid JSON: ${value}`, el);
    }
    return headers;
  }
  for (const [key, val] of parseDirectiveValue(value)) {
    if (val === null) {
      warn(
        `rz-headers: header '${key}' has no value. Write '${key}: <value>', or '${key}: null' to remove it.`,
        el
      );
      continue;
    }
    headers[key] = val === "null" ? null : val;
  }
  return headers;
}
var rzHeaders = { getConfig: getConfig7 };

// src/directives/rz-request.ts
var KEYS = {
  timeout: "duration",
  "abort-key": "string",
  credentials: "string",
  keepalive: "boolean",
  redirect: "string",
  cache: "string"
};
function getConfig8(el) {
  const value = getDirectiveValue(el, "request");
  if (!value) return {};
  const config = {};
  for (const [key, rawVal] of parseDirectiveValue(value)) {
    const type = KEYS[key];
    if (!type) {
      warn(
        key === "headers" || key === "indicator" ? `rz-request: '${key}' belongs on data-rz-${key}. Ignoring.` : key === "method" ? `rz-request: 'method' belongs in the data-rz-fetch subject, as in 'click: POST /save'. Ignoring.` : `rz-request: unknown key '${key}'. Ignoring.`,
        el
      );
      continue;
    }
    const val = rawVal ?? "";
    if (type === "boolean") {
      config[kebabToCamel(key)] = val === "true" || val === "";
    } else if (type === "duration") {
      config[kebabToCamel(key)] = parseTime(val);
    } else {
      config[kebabToCamel(key)] = val;
    }
  }
  return config;
}
function kebabToCamel(str) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
var rzRequest = { getConfig: getConfig8 };

// src/net/response.ts
async function normalizeResponse(response, config) {
  let data = null;
  let error = null;
  const parsedHeaders = Object.fromEntries(response.headers.entries());
  try {
    const contentType = response.headers.get("Content-Type") || "";
    const contentLength = response.headers.get("Content-Length");
    const isEmpty = response.status === 204 || response.status === 205 || contentLength === "0";
    if (!isEmpty) {
      if (contentType.includes("text/event-stream")) {
        response.body?.cancel();
        error = {
          message: "Cannot read an event stream as a response. Open it with rz-sse.",
          code: "PARSE_ERROR"
        };
      } else if (isJsonType(contentType)) {
        const text = await response.text();
        if (text) {
          data = JSON.parse(text);
        }
      } else if (contentType.includes("text/") || contentType.includes("xml")) {
        data = await response.text();
      } else {
        data = await response.blob();
      }
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    data = null;
    error = { message: errorMessage, code: "PARSE_ERROR" };
  }
  if (!response.ok) {
    error = {
      message: response.statusText || "Request failed",
      code: response.status,
      body: data ?? void 0,
      parseError: error?.code === "PARSE_ERROR" ? error.message : void 0
    };
  }
  return {
    data,
    error,
    response,
    headers: parsedHeaders,
    status: response.status,
    config
  };
}
function mapCatchError(error, isMainAborted) {
  const isAbort = error.name === "AbortError";
  const isTimeout = error.name === "TimeoutError";
  const code = isTimeout ? "TIMEOUT" : isAbort ? isMainAborted ? "CANCELED" : "TIMEOUT" : "NETWORK_ERROR";
  const message = code === "TIMEOUT" ? "Request timed out" : code === "CANCELED" ? "Request canceled" : error.message || "Network error";
  return { message, code, original: error };
}
function errorResponse(config, error) {
  return {
    data: null,
    error,
    response: null,
    headers: null,
    status: null,
    config
  };
}
function fallbackResponse(config, message, code = "CANCELED") {
  return errorResponse(config, { message, code });
}
function isJsonType(val) {
  return val.includes("application/json") || val.includes("+json");
}
function isFileType(data) {
  return data instanceof Blob || data instanceof ArrayBuffer;
}

// src/net/request.ts
var abortRegistry = /* @__PURE__ */ new Map();
async function request(config, app) {
  if (!config.skipInterceptors) {
    try {
      for (const fn of app._interceptors.request) {
        Object.assign(config, await fn(config));
      }
    } catch (e) {
      const error = await runErrorInterceptors(mapCatchError(e, false), config, app);
      return errorResponse(config, error);
    }
  }
  const { finalUrl, method, reqHeaders, finalBody, restOptions } = preparePayload(
    config,
    app.config.baseUrl
  );
  const {
    timeout = 0,
    abortKey,
    triggerEl: _triggerEl,
    signal: externalSignal,
    method: _method,
    ...fetchOptions
  } = restOptions;
  let controller = null;
  if (abortKey) {
    abortRegistry.get(abortKey)?.abort("Replacement request started");
    controller = new AbortController();
    abortRegistry.set(abortKey, controller);
  }
  const mainSignal = controller?.signal ?? externalSignal ?? null;
  const signals = [mainSignal, timeout > 0 ? AbortSignal.timeout(timeout) : null].filter(
    (s) => s !== null
  );
  const combinedSignal = AbortSignal.any(signals);
  const execute = async (attempt = 0) => {
    if (combinedSignal.aborted) {
      const status = mainSignal?.aborted ? "CANCELED" : "TIMEOUT";
      return fallbackResponse(config, "Request canceled or timed out", status);
    }
    let responded = false;
    try {
      const response = await fetch(finalUrl, {
        method,
        headers: reqHeaders,
        signal: combinedSignal,
        ...fetchOptions,
        ...finalBody != null ? { body: finalBody } : {}
      });
      responded = true;
      const normalized = await normalizeResponse(response, config);
      if (!config.skipInterceptors) {
        if (normalized.error) {
          normalized.error = await runErrorInterceptors(normalized.error, config, app);
        } else {
          for (const fn of app._interceptors.response) {
            normalized.data = await fn(
              normalized.data,
              normalized.response,
              config
            );
          }
        }
      }
      return normalized;
    } catch (err2) {
      let errorPayload = mapCatchError(err2, !!mainSignal?.aborted);
      if (!responded && attempt === 0 && errorPayload.code === "NETWORK_ERROR" && isSafeMethod(method)) {
        return execute(attempt + 1);
      }
      if (!config.skipInterceptors) {
        errorPayload = await runErrorInterceptors(errorPayload, config, app);
      }
      return errorResponse(config, errorPayload);
    }
  };
  try {
    return await execute();
  } finally {
    if (abortKey && abortRegistry.get(abortKey) === controller) {
      abortRegistry.delete(abortKey);
    }
  }
}
function resolveRequestConfig(triggerEl, app) {
  const config = {
    credentials: app.config.credentials,
    timeout: app.config.timeout,
    ...triggerEl ? rzRequest.getConfig(triggerEl) : {}
  };
  config.headers = {
    ...app.config.headers,
    ...triggerEl ? rzHeaders.getConfig(triggerEl) : {}
  };
  return config;
}
async function runErrorInterceptors(error, config, app) {
  for (const fn of app._interceptors.error) {
    error = await fn(error, config);
  }
  return error;
}

// src/net/fetch-engine.ts
var abortKeys = /* @__PURE__ */ new WeakMap();
var writesInFlight = /* @__PURE__ */ new Set();
async function runFetch(app, options) {
  const triggerEl = options.triggerEl ?? null;
  const hostEl = triggerEl ?? app.root;
  try {
    if (triggerEl) {
      if (!triggerEl.isConnected) {
        abortKeys.delete(triggerEl);
        return fallbackResponse(options, "Element disconnected from DOM");
      }
      if (isDisabled(triggerEl)) {
        return fallbackResponse(options, "Element is disabled");
      }
    }
    const submitter = triggerEl instanceof HTMLFormElement ? options.submitter ?? null : null;
    const rawUrl = submitter?.getAttribute("formaction") ?? options.url;
    if (!rawUrl) {
      warn(
        "Invalid or missing URL for the fetch request.",
        ...triggerEl ? [triggerEl] : []
      );
      return fallbackResponse(
        options,
        "Invalid or missing URL for the fetch request.",
        "INTERNAL_ERROR"
      );
    }
    const url = resolveUrl(rawUrl, app.config.baseUrl).href;
    const finalRequestInit = resolveRequestConfig(triggerEl, app);
    const formMethod = triggerEl instanceof HTMLFormElement ? triggerEl.getAttribute("method") : void 0;
    const method = (submitter?.getAttribute("formmethod") || options.method || formMethod || "GET").toUpperCase();
    const abortKey = options.abortKey || finalRequestInit.abortKey || (triggerEl ? getAbortKey(triggerEl) : void 0);
    if (abortKey && writesInFlight.has(abortKey)) {
      return fallbackResponse(options, "A write is in flight for this abort key");
    }
    const headers = { ...finalRequestInit.headers, ...options.headers };
    const hasExplicitBody = options.body !== void 0;
    const payload = triggerEl && !hasExplicitBody ? resolvePayload(triggerEl, submitter, method, headers, app) : {};
    triggerEl && hasExplicitBody && hasDirective(triggerEl, "send") && warn("rz-send: ignored because a body was passed to app.fetch().", triggerEl);
    const finalOptions = {
      ...finalRequestInit,
      ...options,
      ...payload,
      url,
      method,
      // A multipart body replaces the headers to drop a declared Content-Type
      headers: payload.headers ?? headers,
      // Params merge per key like headers, so a programmatic param can override one
      // value from the element without discarding the rest
      params: { ...payload.params, ...options.params },
      abortKey
    };
    if (!triggerEl && finalOptions.indicator === void 0) {
      finalOptions.indicator = null;
    }
    const outcome = await runRequestLifecycle({
      el: hostEl,
      root: app.root,
      prefix: "rz:fetch",
      configDetail: { config: finalOptions },
      terminalDetail: (result) => result,
      run: async (handle) => {
        const key = finalOptions.abortKey;
        const marked = key && !isSafeMethod(finalOptions.method) && !writesInFlight.has(key) ? key : null;
        if (marked) {
          writesInFlight.add(marked);
        }
        try {
          return await sendAndRoute(hostEl, triggerEl, finalOptions, app, handle);
        } finally {
          if (marked) {
            writesInFlight.delete(marked);
          }
        }
      }
    });
    return outcome === PREVENTED ? fallbackResponse(finalOptions, "Prevented by rz:fetch:config listener") : outcome;
  } catch (error) {
    err(`Error executing fetch:`, ...triggerEl ? [triggerEl] : [], error);
    return fallbackResponse(options, error.message || "Internal error", "INTERNAL_ERROR");
  }
}
async function sendAndRoute(hostEl, triggerEl, options, app, handle) {
  try {
    const result = await request(options, app);
    const rouseHeaders = extractRouseHeaders(result.headers);
    if (rouseHeaders.redirect) {
      followRedirect(triggerEl, rouseHeaders.redirect);
      return result;
    }
    if (result.response?.redirected) {
      if (isSameOrigin(result.response.url)) {
        followRedirect(triggerEl, result.response.url);
        return result;
      }
      warn(`Cross-origin redirect blocked: '${result.response.url}'.`);
      result.error = {
        message: "Cross-origin redirect blocked",
        code: "REDIRECTED"
      };
    }
    applyUrlChange(rouseHeaders.pushUrl, rouseHeaders.replaceUrl);
    if (rouseHeaders.place) {
      result.placeOverride = rouseHeaders.place;
    }
    if (rouseHeaders.deposit) {
      result.depositOverride = rouseHeaders.deposit;
    }
    handle.settle(result);
    if (result.error) {
      const { code } = result.error;
      if (code !== "CANCELED" && code !== "REDIRECTED" && result.response) {
        routePayload(hostEl, result, "error");
      }
      return result;
    }
    if (result.response) {
      routePayload(hostEl, result, "success");
    }
    return result;
  } catch (error) {
    err("Fetch failed unexpectedly.", hostEl, error);
    const fallback = fallbackResponse(
      options,
      error.message || "Internal Error",
      "INTERNAL_ERROR"
    );
    handle.settle(fallback);
    return fallback;
  }
}
function resolvePayload(el, submitter, method, headers, app) {
  const payload = hasDirective(el, "send") ? rzSend.getConfig(el, app, submitter) : readTriggerValues(el, submitter);
  if (!payload) {
    return {};
  }
  if (method === "GET" || method === "HEAD") {
    return { params: toParams(toFormPairs(payload, el, false)) };
  }
  const encoding = resolveEncoding(el, submitter, headers);
  if (encoding === "json") {
    return { body: dropFiles(payload, el) };
  }
  const pairs = toFormPairs(payload, el, encoding === "multipart");
  if (encoding === "urlencoded") {
    return { body: new URLSearchParams(pairs) };
  }
  const body = new FormData();
  pairs.forEach(([key, val]) => body.append(key, val));
  return { body, headers: withoutContentType(headers) };
}
function resolveEncoding(el, submitter, headers) {
  const declared = declaredContentType(headers);
  if (declared) {
    const mime = declared.replace(/;.*$/s, "").trim().toLowerCase();
    if (isJsonType(mime)) {
      return "json";
    }
    if (mime === "multipart/form-data") {
      return "multipart";
    }
    mime !== "application/x-www-form-urlencoded" && warn(
      `Content-Type '${declared}' isn't an encoding Rouse can build. Sending form data under it.`,
      el
    );
    return "urlencoded";
  }
  if (!(el instanceof HTMLFormElement)) {
    return "urlencoded";
  }
  const enctype = (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) && submitter.hasAttribute("formenctype") ? submitter.formEnctype : el.enctype;
  return enctype === "multipart/form-data" ? "multipart" : "urlencoded";
}
function declaredContentType(headers) {
  let type = null;
  for (const [key, val] of Object.entries(headers)) {
    if (key.toLowerCase() === "content-type") {
      type = val;
    }
  }
  return type;
}
function withoutContentType(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, val]) => [
      key,
      key.toLowerCase() === "content-type" ? null : val
    ])
  );
}
function toFormPairs(payload, el, keepFiles) {
  return Object.entries(payload).flatMap(
    ([key, val]) => (Array.isArray(val) ? val : [val]).flatMap((item) => {
      if (item == null) {
        return [];
      }
      if (item instanceof File) {
        if (keepFiles) {
          return [[key, item]];
        }
        warn(
          `File in '${key}' needs a multipart encoding to be sent. Sending its name.`,
          el
        );
        return [[key, item.name]];
      }
      if (typeof item === "object") {
        warn(`'${key}' holds an object, which form data can't carry. Ignoring it.`, el);
        return [];
      }
      return [[key, String(item)]];
    })
  );
}
function toParams(pairs) {
  const params = {};
  pairs.forEach(([key, val]) => {
    params[key] ??= [];
    params[key].push(String(val));
  });
  return params;
}
function dropFiles(payload, el) {
  return Object.fromEntries(
    Object.entries(payload).flatMap(([key, val]) => {
      const items = Array.isArray(val) ? val : [val];
      if (!items.some((item) => item instanceof File)) {
        return [[key, val]];
      }
      warn(`File in '${key}' can't be sent as JSON. Ignoring it.`, el);
      const rest = items.filter((item) => !(item instanceof File));
      return Array.isArray(val) && rest.length ? [[key, rest]] : [];
    })
  );
}
function followRedirect(el, url) {
  if (el) {
    abortKeys.delete(el);
  }
  window.location.assign(url);
}
function getAbortKey(el) {
  let key = abortKeys.get(el);
  if (!key) {
    key = createKey("rz_abort_");
    abortKeys.set(el, key);
  }
  return key;
}
function routePayload(hostEl, result, type) {
  const data = result.data;
  const kind = data == null && result.placeOverride ? "html" : payloadKind(data);
  if (kind === null) {
    if (data != null) {
      warn(`Unsupported payload: '${data?.constructor?.name || typeof data}'.`);
    }
    return;
  }
  if (result.placeOverride && kind !== "html") {
    warn(
      `Rouse-Place applies only to HTML responses, but this one was routed as ${kind === "json" ? "JSON" : "a file"}. Ignoring it.`,
      hostEl
    );
  }
  if (result.depositOverride && kind !== "json") {
    warn(
      `Rouse-Deposit applies only to JSON responses, but this one was routed as ${kind === "html" ? "HTML" : "a file"}. Ignoring it.`,
      hostEl
    );
  }
  if (typeof data === "string") {
    const contentType = result.response?.headers.get("Content-Type") || "";
    if (isJsonType(contentType)) {
      warn(`Content-Type is JSON but data is a string. Defaulting to HTML.`);
    }
  }
  dispatch(hostEl, `rz:fetch:${type}:${kind}`, result);
}
function payloadKind(data) {
  if (isFileType(data)) {
    return "file";
  }
  if (Array.isArray(data) || isPlainObject(data)) {
    return "json";
  }
  if (typeof data === "string") {
    return "html";
  }
  return null;
}
function extractRouseHeaders(headers) {
  return {
    redirect: headers?.["rouse-redirect"] || null,
    place: headers?.["rouse-place"] || null,
    deposit: headers?.["rouse-deposit"] || null,
    pushUrl: headers?.["rouse-push-url"] || null,
    replaceUrl: headers?.["rouse-replace-url"] || null
  };
}
function applyUrlChange(pushUrl, replaceUrl) {
  const url = pushUrl ?? replaceUrl;
  if (url === null) return;
  pushUrl && replaceUrl && warn(`Both 'Rouse-Push-Url' and 'Rouse-Replace-Url' present. Using Push.`);
  if (!isSameOrigin(url)) {
    const headerName = pushUrl ? "Rouse-Push-Url" : "Rouse-Replace-Url";
    warn(`'${headerName}' rejected: cross-origin URL '${url}'.`);
    return;
  }
  const method = pushUrl ? "pushState" : "replaceState";
  try {
    history[method]({}, "", url);
  } catch (error) {
    warn(`${method} failed for URL '${url}'.`, error);
  }
}
function isSameOrigin(url) {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

// src/directives/define-network-op.ts
function defineNetworkOpDirective(slug, bindPairs) {
  const elementCleanups = /* @__PURE__ */ new WeakMap();
  return {
    selector: directiveSelector(slug),
    initialize(el, app) {
      if (elementCleanups.has(el)) return;
      const value = getDirectiveValue(el, slug);
      if (value === null) return;
      const pairs = parseTriggerSubjectPairs(value);
      if (pairs.length === 0) {
        warn(`rz-${slug}: at least one trigger is required.`, el);
        return;
      }
      const cleanups = bindPairs(el, app, pairs);
      if (cleanups.length > 0) {
        elementCleanups.set(el, cleanups);
      }
    },
    teardown(el) {
      elementCleanups.get(el)?.forEach((fn) => fn());
      elementCleanups.delete(el);
    }
  };
}

// src/directives/rz-fetch.ts
function nativeUrl(el) {
  if (el instanceof HTMLAnchorElement) {
    return el.getAttribute("href") ?? "";
  }
  if (el instanceof HTMLFormElement) {
    return el.getAttribute("action") ?? "";
  }
  return "";
}
function warnMissingUrl(el) {
  warn(
    `rz-fetch: no URL found. Configure it using data-rz-fetch (with at least one leading trigger), or a native 'href', 'action', or 'formaction' attribute.`,
    el
  );
}
function bindFetchPairs(el, app, pairs) {
  const elementUrl = nativeUrl(el);
  const deferUrl = el instanceof HTMLFormElement;
  let warnedMissingUrl = false;
  return pairs.flatMap(({ trigger: trigger2, subject }) => {
    const parsed = subject ? parseFetchSubject(subject) : {};
    const url = parsed.url || elementUrl;
    if (!url && !deferUrl) {
      if (!warnedMissingUrl) {
        warnMissingUrl(el);
        warnedMissingUrl = true;
      }
      return [];
    }
    return [
      dispatchTrigger(trigger2, {
        el,
        app,
        action: (e) => {
          const submitter = e instanceof SubmitEvent ? e.submitter : null;
          if (!url && !submitter?.getAttribute("formaction")) {
            warnMissingUrl(el);
            return;
          }
          runFetch(app, { ...parsed, url, triggerEl: el, submitter });
        }
      })
    ];
  });
}
var rzFetch = defineNetworkOpDirective("fetch", bindFetchPairs);

// src/directives/define-bound-writer.ts
function defineBoundWriterDirective(slug, write, options) {
  return {
    slug,
    selector: directiveSelector(slug),
    singleValue: options?.singleValue,
    bind(el, scope, app, key, value) {
      const raw = value || key;
      return effect(() => {
        write(el, key, resolveBoundValue(raw, scope, app.stores, el, slug));
      });
    }
  };
}

// src/directives/rz-html.ts
var rzHtml = defineBoundWriterDirective(
  "html",
  (el, _key, val) => updateHtml(el, val),
  { singleValue: true }
);

// src/directives/rz-key.ts
function getConfig9(el) {
  return getDirectiveValue(el, "key")?.trim() || null;
}
var rzKey = { getConfig: getConfig9 };

// src/directives/rz-model.ts
function modelDefaultTrigger(el) {
  const def = (event) => ({ event, options: {} });
  if (el instanceof HTMLTextAreaElement || el.isContentEditable) {
    return def("input");
  }
  if (el instanceof HTMLInputElement) {
    return el.type === "checkbox" || el.type === "radio" ? def("change") : def("input");
  }
  if (el instanceof HTMLSelectElement) {
    return def("change");
  }
  return null;
}
function bind3(el, scope, app, key, value) {
  const subject = value || key;
  let triggers;
  if (value) {
    triggers = parseTriggers(key);
  } else {
    const def = modelDefaultTrigger(el);
    if (!def) {
      warn(
        `rz-model: an explicit trigger is required when used on <${el.tagName.toLowerCase()}> (e.g., data-rz-model="input: value").`,
        el
      );
      return;
    }
    triggers = [def];
  }
  const action = () => writeState(subject, getModelableValue(el), scope, app.stores);
  const cleanups = [
    effect(() => {
      setModelableValue(el, resolveState(subject, scope, app.stores));
    }),
    ...triggers.map((trigger2) => dispatchTrigger(trigger2, { el, app, action }))
  ];
  return (() => cleanups.forEach((fn) => fn()));
}
var rzModel = {
  slug: "model",
  selector: directiveSelector("model"),
  singleValue: true,
  bind: bind3
};

// src/directives/rz-on.ts
function bind4(el, scope, app, key, value) {
  if (!value) {
    return bindModifiersOnly(el, app, key);
  }
  const methodName = value.trim();
  let method;
  let context;
  if (methodName.startsWith(STORE_PREFIX)) {
    const ref = parseStoreRef(methodName, "on");
    if (!ref) return;
    const { source: storeName, nestedPath } = ref;
    const storeData = app.stores.get(storeName);
    if (storeData === void 0) {
      warn(`rz-on: store '@${storeName}' not found.`, el);
      return;
    }
    if (!nestedPath) {
      warn(`rz-on: '@${storeName}' needs a handler (e.g., @${storeName}.save).`, el);
      return;
    }
    method = getNestedVal(storeData, nestedPath);
    context = storeData;
  } else {
    method = scope[methodName];
    context = scope;
  }
  if (typeof method !== "function") {
    warn(`rz-on: handler '${methodName}' is undefined or not a function.`, el);
    return;
  }
  const cleanups = parseTriggers(key).map(
    (trigger2) => dispatchTrigger(trigger2, {
      el,
      app,
      action: (e) => invokeHandler(
        method,
        context,
        methodName,
        scope,
        el,
        e ?? new CustomEvent(trigger2.event)
      )
    })
  );
  return (() => cleanups.forEach((fn) => fn()));
}
function bindModifiersOnly(el, app, key) {
  const cleanups = parseTriggers(key).flatMap((trigger2) => {
    const { prevent, stop, stopImmediate } = trigger2.options;
    if (isTriggerSource(trigger2.event) || !(prevent || stop || stopImmediate)) {
      warn(
        `rz-on: '${trigger2.event}' has no handler and no prevent, stop, or stop-immediate, so it does nothing. Ignoring.`,
        el
      );
      return [];
    }
    return dispatchTrigger(trigger2, {
      el,
      app,
      action: () => {
      },
      suppressNavigation: false
    });
  });
  return (() => cleanups.forEach((fn) => fn()));
}
var rzOn = {
  slug: "on",
  selector: directiveSelector("on"),
  bind: bind4
};

// src/directives/rz-place.ts
function getConfig10(el, appRoot, overrideValue) {
  const value = overrideValue || getDirectiveValue(el, "place");
  if (value?.trim() === "null") {
    return [];
  }
  return resolvePlacements(value, el, appRoot, !!overrideValue);
}
function resolvePlacements(value, hostEl, appRoot, fromOverride) {
  const parsed = value?.trim() ? parseDirectiveValue(value) : [];
  if (parsed.length === 0) {
    if (hostEl instanceof HTMLScriptElement) {
      return [];
    }
    return [{ targets: [hostEl], position: DEFAULT_PLACE_POSITION }];
  }
  const placements = [];
  for (const [key, val] of parsed) {
    const store = key.startsWith(STORE_PREFIX) ? key : val;
    if (store?.startsWith(STORE_PREFIX)) {
      warn(
        `${placeLabel(fromOverride)}: '${store}' names a store. Use ${fromOverride ? "Rouse-Deposit" : "data-rz-deposit"} for store targets.`,
        hostEl
      );
      continue;
    }
    if (val) {
      const position = isPlacePosition(key) ? key : DEFAULT_PLACE_POSITION;
      if (position !== key) {
        warn(
          `${placeLabel(fromOverride)}: unknown position '${key}'. Using '${DEFAULT_PLACE_POSITION}'. Positions are case-sensitive: ${PLACE_POSITIONS.join(", ")}.`,
          hostEl
        );
      }
      placements.push({
        position,
        targets: queryPlaceTargets(appRoot, val, hostEl, fromOverride)
      });
    } else if (isPlacePosition(key)) {
      placements.push({ targets: [hostEl], position: key });
    } else {
      placements.push({
        targets: queryPlaceTargets(appRoot, key, hostEl, fromOverride),
        position: DEFAULT_PLACE_POSITION
      });
    }
  }
  return placements;
}
function queryPlaceTargets(root, selector, hostEl, fromOverride = false) {
  const targets = queryTargets(root, selector);
  if (targets.length === 0) {
    if (hostEl) {
      warn(`${placeLabel(fromOverride)}: no targets found for '${selector}'.`, hostEl);
    } else {
      warn(`No targets found for '${selector}' in app.place().`);
    }
  }
  return targets;
}
function placeLabel(fromOverride) {
  return fromOverride ? "Rouse-Place" : "rz-place";
}
var rzPlace = {
  getConfig: getConfig10
};

// src/directives/rz-prop.ts
var rzProp = defineBoundWriterDirective(
  "prop",
  (el, key, val) => updateProp(el, key, val)
);

// src/directives/bind-store-pairs.ts
function bindStorePairs(op, el, app, pairs) {
  if (!hasDirective(el, "fetch") && !hasDirective(el, "store")) {
    if (hasDirective(el, "headers")) {
      warn(
        `rz-${op}: data-rz-headers is ignored. Set headers on the store's <script> element.`,
        el
      );
    }
    if (hasDirective(el, "request")) {
      warn(`rz-${op}: data-rz-request is ignored. It only applies to rz-fetch.`, el);
    }
    if (hasDirective(el, "send")) {
      warn(`rz-${op}: data-rz-send is ignored. It only applies to rz-fetch.`, el);
    }
  }
  return pairs.flatMap(({ trigger: trigger2, subject }) => {
    const storeName = resolveTarget(el, op, subject);
    if (!storeName) return [];
    const isEdit = trigger2.event === "edit";
    const sync = () => triggerStoreSync(op, el, app, storeName);
    const fire = isEdit ? () => {
      if (app.stores.isDirty(storeName)) {
        sync();
      }
    } : sync;
    return [dispatchTrigger(trigger2, { el, app, action: fire })];
  });
}
function resolveTarget(el, op, subject) {
  if (!subject) {
    warn(
      `rz-${op}: missing store reference. Name the store, as in 'click: @cart'.`,
      el
    );
    return null;
  }
  if (!subject.startsWith(STORE_PREFIX)) {
    warn(`rz-${op}: target '${subject}' must be a store reference (e.g., '@cart').`);
    return null;
  }
  const target = parseStoreRef(subject, op);
  if (!target) {
    return null;
  }
  const { source: storeName, nestedPath } = target;
  if (!storeName) {
    warn(`rz-${op}: invalid store reference '${subject}'.`);
    return null;
  }
  if (nestedPath) {
    warn(
      `rz-${op}: '${subject}' names a path, but a store syncs as a whole. Use '@${storeName}'.`,
      el
    );
    return null;
  }
  return storeName;
}
function triggerStoreSync(op, triggerEl, app, storeName) {
  if (!triggerEl.isConnected || isDisabled(triggerEl)) return;
  const status = app.stores.status(storeName);
  if (!status) {
    warn(`rz-${op}: store '@${storeName}' not found.`, triggerEl);
    return;
  }
  if (status.syncing) {
    if (op === "push") {
      app.stores._deferPush(
        storeName,
        () => triggerStoreSync(op, triggerEl, app, storeName)
      );
    }
    return;
  }
  app.stores[op](storeName, { triggerEl });
}

// src/directives/rz-pull.ts
var rzPull = defineNetworkOpDirective(
  "pull",
  (el, app, pairs) => bindStorePairs("pull", el, app, pairs)
);

// src/directives/rz-push.ts
var rzPush = defineNetworkOpDirective(
  "push",
  (el, app, pairs) => bindStorePairs("push", el, app, pairs)
);

// src/dom/renderer.ts
function normalize(value) {
  if (Array.isArray(value)) {
    const items = value.map((item, index) => ({ item, index }));
    return { mode: "array", items };
  }
  if (typeof value === "number") {
    const n = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    const items = Array.from({ length: n }, (_, index) => ({
      item: value,
      index
    }));
    return { mode: "number", items };
  }
  if (isPlainObject(value)) {
    return { mode: "object", items: [{ item: value, index: 0 }] };
  }
  return {
    mode: "boolean",
    items: value ? [{ item: value, index: 0 }] : []
  };
}
function keyFor(plan, mode, keyPath, onMissing) {
  if (mode === "boolean" || mode === "number" || !keyPath) {
    return plan.index;
  }
  const explicit = getNestedVal(plan.item, keyPath);
  if (explicit == null) {
    onMissing?.();
    return plan.index;
  }
  return explicit;
}
function placeAfter(parent, roots, prev) {
  let ref = prev;
  for (const node of roots) {
    if (ref.nextSibling !== node) {
      parent.insertBefore(node, ref.nextSibling);
    }
    ref = node;
  }
  return ref;
}
function renderTemplate(template, source, opts) {
  const { app, parentState, keyPath = null } = opts;
  const records = /* @__PURE__ */ new Map();
  let currentMode = null;
  let keyWarned = false;
  let dupWarned = false;
  function buildInstance(plan) {
    const frag = template.content.cloneNode(true);
    const roots = Array.from(frag.childNodes);
    const elementRoots = roots.filter(
      (n) => n.nodeType === Node.ELEMENT_NODE
    );
    const collected = [];
    elementRoots.forEach((root) => walkBoundElements(root, (e) => collected.push(e)));
    const itemSig = signal(reactive(plan.item));
    const indexSig = signal(plan.index);
    const frame = {
      get item() {
        return itemSig();
      },
      get index() {
        return indexSig();
      },
      parent: parentState
    };
    const ctx = new Proxy(parentState, {
      get(t, k) {
        return k === RENDER_FRAME ? frame : Reflect.get(t, k, t);
      }
    });
    elementRoots.forEach((root) => markRenderOwned(root, ctx));
    const cleanups = untracked(
      () => collected.flatMap((e) => bindDirectives(e, ctx, app))
    );
    const item = plan.item;
    const rt = item && typeof item === "object" ? getRaw(item).renderTarget : void 0;
    let target = null;
    if (typeof rt === "string" && rt) {
      target = app.root.querySelector(rt);
      !target && warn(`rz-render: render target '${rt}' not found.`);
    } else if (rt instanceof Element) {
      if (app.root.contains(rt)) {
        target = rt;
      } else {
        warn(`rz-render: render target is outside the app root; ignoring.`, rt);
      }
    }
    target?.append(...roots);
    const teardown2 = () => {
      runCleanups(template, cleanups);
      roots.forEach((node) => node.remove());
      elementRoots.forEach(unmarkRenderOwned);
    };
    return {
      item: plan.item,
      itemSig,
      indexSig,
      roots,
      target,
      teardown: teardown2
    };
  }
  function teardownAll() {
    for (const rec of records.values()) {
      rec.teardown();
    }
    records.clear();
  }
  function reconcile(normalized) {
    if (normalized.mode !== currentMode) {
      teardownAll();
      currentMode = normalized.mode;
    }
    const parent = template.parentNode;
    if (!parent) return;
    let prev = template;
    let missing = 0;
    let dups = 0;
    let firstDup = null;
    const onMissing = true ? () => missing++ : void 0;
    const seen = /* @__PURE__ */ new Set();
    for (const plan of normalized.items) {
      const instanceKey = keyFor(plan, normalized.mode, keyPath, onMissing);
      if (seen.has(instanceKey)) {
        if (true) {
          dups++;
          firstDup ??= instanceKey;
        }
        continue;
      }
      seen.add(instanceKey);
      let rec = records.get(instanceKey);
      if (rec) {
        if (rec.item !== plan.item) {
          rec.item = plan.item;
          rec.itemSig(reactive(plan.item));
        }
        if (rec.indexSig() !== plan.index) {
          rec.indexSig(plan.index);
        }
      } else {
        rec = buildInstance(plan);
        records.set(instanceKey, rec);
      }
      if (!rec.target) {
        prev = placeAfter(parent, rec.roots, prev);
      }
    }
    if (true) {
      if (missing > 0 && !keyWarned) {
        keyWarned = true;
        warn(
          `rz-key: '${keyPath}' could not be resolved on ${missing} item(s). Positional keys used.`
        );
      }
      if (dups > 0 && !dupWarned) {
        dupWarned = true;
        warn(
          `rz-key: skipped ${dups} item(s) with duplicate '${keyPath}' values. First collision: '${firstDup}'.`
        );
      }
    }
    for (const [k, rec] of records) {
      if (!seen.has(k)) {
        rec.teardown();
        records.delete(k);
      }
    }
  }
  const stop = effect(() => {
    const normalized = normalize(source());
    untracked(() => reconcile(normalized));
  });
  return () => {
    stop();
    teardownAll();
  };
}

// src/directives/rz-render.ts
function bind5(el, scope, app, key, value) {
  if (!(el instanceof HTMLTemplateElement)) {
    warn(`rz-render: must be placed on a <template> element.`, el);
    return;
  }
  const raw = value || key;
  const keyPath = rzKey.getConfig(el);
  return renderTemplate(
    el,
    () => resolveBoundValue(raw, scope, app.stores, el, "render"),
    {
      app,
      parentState: scope,
      keyPath
    }
  );
}
var rzRender = {
  slug: "render",
  selector: directiveSelector("render"),
  singleValue: true,
  bind: bind5
};

// src/directives/rz-sse.ts
var activeStreams = /* @__PURE__ */ new WeakMap();
function openFor(el, app, url) {
  if (activeStreams.has(el)) return;
  const release2 = openStream(app, url, { triggerEl: el });
  if (release2) {
    activeStreams.set(el, release2);
  }
}
function closeFor(el, reason) {
  const release2 = activeStreams.get(el);
  if (!release2) return;
  activeStreams.delete(el);
  release2(reason);
}
function bindSsePairs(el, app, pairs) {
  const url = pairs[0]?.subject;
  if (!url) {
    warn(
      `rz-sse: no URL found. Configure it using data-rz-sse with at least one leading trigger (e.g. data-rz-sse="ready: /events").`,
      el
    );
    return [];
  }
  const shared = pairs.filter((pair) => pair.subject === url);
  shared.length !== pairs.length && warn(`rz-sse: a single element can only carry one stream.`, el);
  return [
    ...shared.map(
      ({ trigger: trigger2 }) => dispatchTrigger(trigger2, { el, app, action: () => openFor(el, app, url) })
    ),
    ...rzClose.getConfig(el).map(
      (trigger2) => dispatchTrigger(trigger2, { el, app, action: () => closeFor(el, "released") })
    ),
    // The connection outlives the triggers that opened it, so teardown ends it
    () => closeFor(el, "teardown")
  ];
}
var rzSse = defineNetworkOpDirective("sse", bindSsePairs);

// src/directives/rz-store.ts
var initialized = /* @__PURE__ */ new WeakSet();
function initialize(el, app) {
  if (initialized.has(el)) return;
  const parsed = parseStoreValue(getDirectiveValue(el, "store"));
  if (!parsed) {
    warn(`rz-store: value is missing or empty.`, el);
    return;
  }
  const { name: storeName, url } = parsed;
  const textContent = el.textContent?.trim();
  let state;
  if (textContent) {
    try {
      state = JSON.parse(textContent);
    } catch (error) {
      err(`rz-store: invalid JSON in store '${storeName}'.`, el, error);
      return;
    }
    if (!isPlainObject(state)) {
      err(`rz-store: store '${storeName}' must be a JSON object.`, el);
      return;
    }
  }
  const declared = {};
  const headers = rzHeaders.getConfig(el);
  if (url) {
    declared.url = url;
  }
  if (Object.keys(headers).length) {
    declared.headers = headers;
  }
  app.stores._declare(el, storeName, state, declared);
  initialized.add(el);
}
function teardown(el) {
  initialized.delete(el);
}
var rzStore = {
  selector: directiveSelector("store", "script"),
  initialize,
  teardown
};

// src/directives/rz-style.ts
function bind6(el, scope, app, key, val) {
  return effect(() => {
    const lookup = val === "" ? key : val;
    const resolved = resolveBoundValue(lookup, scope, app.stores, el, "style");
    if (val === "") {
      updateStyle(el, resolved);
    } else if (key.includes(":")) {
      applyStyles(el, key, !!resolved);
    } else {
      setStyleProperty(el, key, resolved);
    }
  });
}
var rzStyle = {
  slug: "style",
  selector: directiveSelector("style"),
  bind: bind6
};

// src/directives/rz-text.ts
var rzText = defineBoundWriterDirective(
  "text",
  (el, _key, val) => updateText(el, val),
  { singleValue: true }
);

// src/directives/rz-wake.ts
function getConfig11(el, app) {
  const wakeTriggers = parseTriggers(getDirectiveValue(el, "wake"));
  if (wakeTriggers.length === 0) {
    const wakeTriggersConfig = parseTriggers(app.config.wake);
    return wakeTriggersConfig.length === 0 ? [{ event: "ready", options: {} }] : wakeTriggersConfig;
  }
  return wakeTriggers;
}
var rzWake = { getConfig: getConfig11 };

// src/dom/scope.ts
var instanceMap = /* @__PURE__ */ new WeakMap();
function initScopeElement(el, app) {
  const scopeName = rzScope.getConfig(el);
  if (scopeName === null) return;
  let setup;
  if (scopeName === "") {
    setup = () => ({});
  } else {
    const scope = app._registry.get(scopeName);
    if (!scope) {
      warn(`Scope '${scopeName}' is not defined.`);
      return;
    }
    setup = scope;
  }
  const strategies = rzWake.getConfig(el, app);
  attachWakeStrategies(el, app, strategies, () => initScopeInstance(el, app, setup));
}
function initScopeInstance(el, app, setup) {
  if (instanceMap.has(el)) return;
  instanceMap.set(el, createScope(el, app, setup));
}
function destroyInstance(el) {
  const inst = instanceMap.get(el);
  if (inst) {
    inst._destroy();
    dispatch(el, "rz:scope:destroy", { instance: inst.instance });
    instanceMap.delete(el);
  }
}
function scanScopeNode(el, newNode) {
  instanceMap.get(el)?._scan(newNode);
}
function teardownScopeNode(el, removedNode) {
  instanceMap.get(el)?._teardown(removedNode);
}
function createScope(el, app, setup) {
  let instance;
  let isDestroyed = false;
  let binding = null;
  const cleanups = [];
  const abortCtrl = new AbortController();
  const destroy = () => {
    if (isDestroyed) return;
    isDestroyed = true;
    abortCtrl.abort();
    [...cleanups].reverse().forEach((fn) => fn());
  };
  const context = {
    host: el,
    app,
    term: abortCtrl.signal,
    scan: (newNode) => binding?.scan(newNode)
  };
  let setupFailed = false;
  const stopSetupScope = effectScope(() => {
    try {
      instance = setup(context) || {};
    } catch (error) {
      err("Scope setup failed. Its directives were not bound:", el, error);
      instance = {};
      setupFailed = true;
    }
  });
  if (instance instanceof Promise) {
    stopSetupScope();
    abortCtrl.abort();
    fail("Scope setup must be synchronous. Fetch data as a side effect.");
  }
  cleanups.push(stopSetupScope);
  if (!setupFailed) {
    dispatch(el, "rz:scope:init", { context, instance });
    const stopBindingScope = effectScope(() => {
      const { unbindDom, scan, teardown: teardown2 } = bindScope(el, instance, app);
      binding = { scan, teardown: teardown2 };
      cleanups.push(unbindDom);
    });
    cleanups.push(stopBindingScope);
  }
  return {
    instance,
    _scan: (node) => binding?.scan(node),
    _teardown: (node) => binding?.teardown(node),
    _destroy: destroy
  };
}

// src/dom/observer.ts
function warnUnknownDirectives(root, app) {
  for (const el of queryTargets(root, "*")) {
    if (!getApp(el, app)) continue;
    unknownDirectiveNames(el).forEach(
      (name) => warn(
        `'${name}' isn't a Rouse directive. The data-rz- prefix is reserved for directives.`,
        el
      )
    );
  }
}
function forEachOwned(root, selector, app, fn) {
  for (const el of queryTargets(root, selector)) {
    if (getApp(el, app)) {
      fn(el);
    }
  }
}
function mountSubtree(root, app) {
  warnUnknownDirectives(root, app);
  forEachOwned(
    root,
    rzStore.selector,
    app,
    (el) => rzStore.initialize(el, app)
  );
  forEachOwned(root, SCOPE_SELECTOR, app, (el) => initScopeElement(el, app));
  const ownerScope = root.closest(SCOPE_SELECTOR);
  if (ownerScope && !hasDirective(root, "scope") && getApp(ownerScope, app)) {
    scanScopeNode(ownerScope, root);
  }
  for (const directive of NETWORK_DIRECTIVES) {
    forEachOwned(root, directive.selector, app, (el) => directive.initialize(el, app));
  }
  if (!ownerScope) {
    walkBoundElements(root, (el) => {
      if (getApp(el, app)) {
        mountGlobalBinding(el, app);
      }
    });
  }
}
function unmountSubtree(root) {
  queryTargets(root, rzStore.selector).forEach(
    (el) => rzStore.teardown(el)
  );
  queryTargets(root, SCOPE_SELECTOR).forEach(destroyInstance);
  for (const directive of NETWORK_DIRECTIVES) {
    queryTargets(root, directive.selector).forEach((el) => directive.teardown(el));
  }
}
function releaseSubtree(root, app) {
  forEachOwned(
    root,
    rzStore.selector,
    app,
    (el) => rzStore.teardown(el)
  );
  forEachOwned(root, SCOPE_SELECTOR, app, (el) => destroyInstance(el));
  for (const directive of NETWORK_DIRECTIVES) {
    forEachOwned(root, directive.selector, app, (el) => directive.teardown(el));
  }
  const ownerScope = root.closest(SCOPE_SELECTOR);
  if (ownerScope && !hasDirective(root, "scope") && getApp(ownerScope, app)) {
    teardownScopeNode(ownerScope, root);
  }
  if (!ownerScope) {
    teardownGlobalBindings(root, (el) => !!getApp(el, app));
  }
}
function initObserver(app) {
  return new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && node.isConnected) {
          mountSubtree(node, app);
        }
      }
      for (const node of mutation.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const removedEl = node;
        unmountSubtree(removedEl);
        const ownerScope = resolveRemovedOwner(removedEl);
        if (!ownerScope) {
          teardownGlobalBindings(removedEl);
        } else if (!hasDirective(removedEl, "scope")) {
          teardownScopeNode(ownerScope, removedEl);
        }
      }
    }
  });
}

// src/dom/placer.ts
function placeContent(app, target, content, options = {}) {
  const requested = options.position ?? DEFAULT_PLACE_POSITION;
  const position = isPlacePosition(requested) ? requested : DEFAULT_PLACE_POSITION;
  if (position !== requested) {
    warn(
      `Unknown position '${requested}' in app.place(). Using '${DEFAULT_PLACE_POSITION}'. Positions are case-sensitive: ${PLACE_POSITIONS.join(", ")}.`
    );
  }
  let targets = [];
  if (typeof target === "string") {
    targets = queryPlaceTargets(app.root, target);
  } else if (target instanceof Element) {
    targets = [target];
  } else {
    warn(`Targets in app.place() must be an element or a selector. Got '${target}'.`);
  }
  let placed = false;
  for (const el of targets) {
    if (placeInto(el, content, position, "programmatic")) {
      placed = true;
    }
  }
  return placed;
}
function placeInto(target, content, position, source) {
  const dispatcherEl = position === "outerHTML" || position === "delete" ? target.parentElement || target : target;
  const beforeEvent = dispatch(
    dispatcherEl,
    "rz:dom:place:before",
    { target, position, payload: content, source },
    { cancelable: true }
  );
  if (beforeEvent.defaultPrevented) {
    return false;
  }
  const finalContent = beforeEvent.detail.payload;
  switch (position) {
    case "delete":
      target.remove();
      break;
    case "innerHTML":
      target.innerHTML = finalContent;
      break;
    case "outerHTML":
      target.outerHTML = finalContent;
      break;
    default:
      target.insertAdjacentHTML(position, finalContent);
  }
  dispatch(dispatcherEl, "rz:dom:place", {
    target,
    position,
    payload: finalContent,
    source
  });
  return true;
}

// src/dom/payload-router.ts
function initPayloadRouters(app, signal2) {
  listenForPayloads(app, signal2, "html", "placeOverride", (detail, source, host) => {
    const { data, placeOverride } = detail;
    const content = data == null && placeOverride ? "" : data;
    if (typeof content !== "string") return;
    for (const { targets, position } of rzPlace.getConfig(
      host,
      app.root,
      placeOverride
    )) {
      targets.forEach((targetEl) => placeInto(targetEl, content, position, source));
    }
  });
  listenForPayloads(app, signal2, "json", "depositOverride", (detail, operation, host) => {
    const { data, depositOverride } = detail;
    const stores = rzDeposit.getConfig(host, depositOverride);
    if (stores.length === 0) return;
    if (!isPlainObject(data)) {
      warn("Cannot route JSON payload to a store. Expected a JSON object.", data);
      return;
    }
    const response = operation === "fetch" ? detail : void 0;
    stores.forEach(
      (storeName) => app.stores.deposit(storeName, data, { response, operation })
    );
  });
}
function listenForPayloads(app, signal2, kind, override, route) {
  const listen = (name, source) => {
    app.root.addEventListener(
      name,
      (e) => {
        if (!getApp(e.target, app)) return;
        const { detail } = e;
        const triggerEl = detail.config?.triggerEl;
        if (!detail[override]) {
          if (e.type.includes("error")) return;
          if (!triggerEl) return;
        }
        route(detail, source, triggerEl ?? app.root);
      },
      { signal: signal2 }
    );
  };
  listen(`rz:fetch:success:${kind}`, "fetch");
  listen(`rz:fetch:error:${kind}`, "fetch");
  listen(`rz:sse:message:${kind}`, "sse");
}

// src/core/scope-registry.ts
var warnedDuplicates = /* @__PURE__ */ new Set();
function warnDuplicateOnce(name) {
  if (warnedDuplicates.has(name)) return;
  warnedDuplicates.add(name);
  warn(
    `Scope '${name}' is already registered. The new setup replaces it for elements scanned from now on.`
  );
}
var ScopeRegistry = class {
  scopes = /* @__PURE__ */ new Map();
  register(name, setup) {
    this.scopes.has(name) && warnDuplicateOnce(name);
    this.scopes.set(name, setup);
  }
  get(name) {
    return this.scopes.get(name);
  }
};

// src/core/store.ts
function sliceAt(obj, path) {
  return path ? getNestedVal(obj, path) : obj;
}
function storeError(error) {
  return error && { code: error.code, message: error.message };
}
function rootsFor(path) {
  return path ? [getPathRoot(path)] : void 0;
}
function syncHeaders(operation, storeName) {
  const headers = {
    "Rouse-Sync": operation,
    "Rouse-Store": storeName
  };
  if (operation === "push") {
    headers["Content-Type"] = "application/merge-patch+json";
  }
  return headers;
}
function assertStoreState(storeName, state) {
  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    fail(
      `Store '${storeName}' must be an object, not ${Array.isArray(state) ? "an array" : String(state)}.`
    );
  }
}
function warnNullFields(storeName, state) {
  nullPaths(state).forEach(
    (path) => warn(
      `Store '${storeName}': '${path}' is null. Sync reads null as a delete (RFC 7396), so it cannot rest as a value. Use '' or omit the key.`
    )
  );
}
var StoreManager = class {
  app;
  _stores = /* @__PURE__ */ new Map();
  _pendingFlush = /* @__PURE__ */ new Set();
  _isPatching = false;
  constructor(app) {
    this.app = app;
  }
  /** Replaces the policy object. Nothing in it is reactive, so there's no `@name::config`. */
  _setConfig(entry, partial) {
    entry.config = { url: "", ...entry.config, ...partial };
  }
  /**
   * Returns the store's element while it's on the page. Events dispatched on a
   * detached script never reach the app root.
   */
  _elementOf(entry) {
    return entry.el?.isConnected ? entry.el : void 0;
  }
  /** Returns `true` while `entry` is the store registered under its name. */
  _isRegistered(entry) {
    return this._stores.get(entry.name) === entry;
  }
  /**
   * Nullish-safe lookup for accessors that report absence through their own
   * return value. `_getStore` is the version that warns.
   */
  _find(storeName) {
    return storeName == null ? void 0 : this._stores.get(storeName);
  }
  /**
   * `_find` with a dev warning when the store is missing. `action` names what the
   * caller was about to do, for the message.
   */
  _getStore(storeName, action) {
    const entry = this._find(storeName);
    !entry && warn(
      !storeName ? "Store name is missing." : action ? `Cannot ${action} store '${storeName}': store not found.` : `Store '${storeName}' not found.`
    );
    return entry;
  }
  /**
   * Advances the `lastGood` baseline to `source` and reconciles the dirty flags
   * that move with it.
   */
  _updateLastGood(entry, source) {
    entry.lastGood = clone(source);
    this._reconcileDirty(entry);
  }
  /**
   * Applies a response payload to `lastGood` exactly as it was applied to the data,
   * and reconciles the dirty flags that move with it.
   */
  _patchBaseline(entry, payload) {
    entry.lastGood ??= {};
    patchState(entry.lastGood, clone(payload), "merge", entry.data);
    this._reconcileDirty(entry);
  }
  /**
   * Recomputes the dirty status against `lastGood`. The only writer of
   * `status.dirtyRoots` and `status.dirty`. Without `roots`, walks every root in
   * the data or the baseline, so a root deleted locally still reads dirty.
   */
  _reconcileDirty(entry, roots) {
    const { data, status } = entry;
    const baseline = entry.lastGood ?? {};
    const keys = roots ?? /* @__PURE__ */ new Set([...Object.keys(data), ...Object.keys(baseline)]);
    for (const key of keys) {
      if (hasAccessor(data, key)) continue;
      if (deepEqual(data[key], baseline[key])) {
        delete status.dirtyRoots[key];
      } else {
        status.dirtyRoots[key] = true;
      }
    }
    status.dirty = Object.keys(status.dirtyRoots).length > 0;
  }
  /** Returns `true` when the data at `path`, or the whole store, differs from `lastGood`. */
  _isSliceDirty(entry, path) {
    return !deepEqual(sliceAt(entry.data, path), sliceAt(entry.lastGood, path));
  }
  _dispatchPatchEvent(entry, eventName, detail, options) {
    const target = this._elementOf(entry) ?? this.app.root;
    return dispatch(target, eventName, detail, options);
  }
  /**
   * Internal unified request handler for push and pull operations.
   */
  async _request(storeName, operation, options = {}) {
    const entry = this._getStore(storeName);
    if (!entry) return;
    const { data, config, name } = entry;
    const policy = config ?? {};
    const { url: policyUrl, headers: policyHeaders, ...transport } = policy;
    const endpoint = options.url || policyUrl;
    if (!endpoint) {
      warn(`Cannot ${operation} store '${name}': URL not configured.`);
      return;
    }
    let url;
    try {
      url = resolveUrl(endpoint, this.app.config.baseUrl).href;
    } catch (error) {
      err(`Store '${name}' ${operation} failed.`, error);
      entry.status.error = storeError({
        code: "INTERNAL_ERROR",
        message: error.message || "Internal error"
      });
      return;
    }
    const method = operation === "push" ? "PATCH" : "GET";
    const requestOptions = {
      credentials: this.app.config.credentials,
      timeout: this.app.config.timeout,
      ...transport,
      ...options,
      url,
      headers: {
        ...syncHeaders(operation, name),
        ...this.app.config.headers,
        ...policyHeaders,
        ...options.headers
      },
      method,
      triggerEl: options.triggerEl,
      // A key that matched another request's would let that request abort this push
      abortKey: operation === "push" ? void 0 : options.abortKey ?? transport.abortKey ?? `pull_${name}`
    };
    const snapshot = clone(data);
    if (operation === "push") {
      requestOptions.body = JSON.stringify(snapshot);
    }
    const storeEl = this._elementOf(entry);
    const firingEl = options.triggerEl ?? storeEl ?? this.app.root;
    if (!options.triggerEl && !storeEl && requestOptions.indicator === void 0) {
      requestOptions.indicator = null;
    }
    let outcome;
    await runRequestLifecycle({
      el: firingEl,
      root: this.app.root,
      prefix: operation === "push" ? "rz:push" : "rz:pull",
      configDetail: { storeName: name, config: requestOptions },
      terminalDetail: (result) => ({ storeName: name, result }),
      run: async (handle) => {
        outcome = await this._sendAndApply(
          entry,
          operation,
          requestOptions,
          snapshot,
          handle
        );
        return outcome.result;
      }
    });
    if (!outcome) return;
    if (outcome.followUp && this._isSliceDirty(entry)) {
      outcome.followUp();
    }
    if (!entry.status.syncing) {
      this._settleIdle(entry);
    }
  }
  /**
   * Sends the request and applies the outcome to the store: records a failure in
   * `status.error`, leaving the data alone, or reconciles the response.
   *
   * `snapshot` is the data the request carries, and what the baseline advances to if it
   * succeeds. Tracks the request so a superseded one leaves `syncing` alone when it settles.
   * Hands back the push held while it was in flight when it owned the store and succeeded.
   */
  async _sendAndApply(entry, operation, requestOptions, snapshot, handle) {
    const { status } = entry;
    const flight = { snapshot };
    entry.inFlight = flight;
    status.syncing = operation;
    status.error = null;
    let succeeded = false;
    const outcome = {};
    const done = (result) => Object.assign(outcome, { result });
    try {
      const result = await request(requestOptions, this.app);
      handle.settle(result);
      if (entry.inFlight !== flight || !this._isRegistered(entry)) {
        return done(result);
      }
      if (result.error) {
        if (result.error.code !== "CANCELED") {
          status.error = storeError(result.error);
        }
        return done(result);
      }
      this._applyServerResponse(entry, operation, result, snapshot);
      succeeded = true;
      return done(result);
    } catch (error) {
      err(`Store '${entry.name}' ${operation} failed.`, error);
      const fallback = fallbackResponse(
        requestOptions,
        error.message || "Internal error",
        "INTERNAL_ERROR"
      );
      if (entry.inFlight === flight) {
        status.error = storeError(fallback.error);
      }
      handle.settle(fallback);
      return done(fallback);
    } finally {
      if (entry.inFlight === flight) {
        status.syncing = false;
        entry.inFlight = void 0;
        const pending = entry.pendingPush;
        entry.pendingPush = void 0;
        if (succeeded) {
          outcome.followUp = pending;
        }
      }
    }
  }
  _applyServerResponse(entry, operation, result, snapshot) {
    const { name: storeName, data, status } = entry;
    if (operation === "push") {
      status.lastSync = Date.now();
      this._updateLastGood(entry, snapshot);
    }
    const beforeEvent = this._dispatchPatchEvent(
      entry,
      "rz:store:patch:before",
      {
        storeName,
        operation,
        data,
        payload: result.data
      },
      { cancelable: true }
    );
    if (beforeEvent.defaultPrevented) return;
    const payload = beforeEvent.detail.payload;
    if (payload && typeof payload === "object") {
      if (!deepEqual(data, snapshot)) {
        this._dispatchPatchEvent(entry, "rz:store:patch:skipped", {
          storeName,
          operation,
          localData: data,
          serverData: payload,
          response: result
        });
        return;
      }
      this._patchPayload(entry, payload);
      this._patchBaseline(entry, payload);
    }
    if (operation === "pull") {
      status.lastSync = Date.now();
    }
    this._dispatchPatchEvent(entry, "rz:store:patch", {
      storeName,
      operation,
      data,
      response: result,
      payload
    });
  }
  /** Applies a response payload to the store's data, as a framework write. */
  _patchPayload(entry, payload) {
    this._withPatchGuard(entry, () => patchState(entry.data, payload, "merge"));
  }
  /**
   * Runs a framework write with dirty tracking suppressed, then reconciles the
   * dirty flags against the baseline, for `roots` or the whole store. Every
   * framework mutation of store data goes through here, so the reconcile cannot
   * be forgotten.
   */
  _withPatchGuard(entry, fn, roots) {
    this._isPatching = true;
    try {
      fn();
    } finally {
      this._isPatching = false;
      this._reconcileDirty(entry, roots);
    }
  }
  /**
   * Queues a store for end-of-microtask reconciliation, coalescing a batch of
   * synchronous writes into one dirty recompute and one round of notifications.
   */
  _scheduleFlush(entry) {
    const wasEmpty = this._pendingFlush.size === 0;
    this._pendingFlush.add(entry);
    if (!wasEmpty) return;
    queueMicrotask(() => {
      const flushing = [...this._pendingFlush];
      this._pendingFlush.clear();
      for (const pending of flushing) {
        const touched = pending.touched ?? /* @__PURE__ */ new Set();
        pending.touched = void 0;
        this._reconcileDirty(pending, touched);
        pending.listeners?.forEach((callback) => callback(touched));
      }
    });
  }
  /**
   * Subscribes to user edits of a store, passing each batch's edited roots.
   * Returns an unsubscribe. Backs the `edit` trigger source. A missing store warns
   * and gets a no-op, which is how `app.on({ edit })` reports a script store
   * listened to before `start()` declared it.
   *
   * @internal
   */
  _onEdit(storeName, callback) {
    const entry = this._getStore(storeName);
    if (!entry) {
      return () => {
      };
    }
    let listeners = entry.listeners;
    if (!listeners) {
      listeners = /* @__PURE__ */ new Set();
      entry.listeners = listeners;
      if (entry.data) {
        seedPropagation(entry.data);
      }
    }
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0 && entry.listeners === listeners) {
        entry.listeners = void 0;
      }
    };
  }
  /**
   * Registers a new store and returns its reactive proxy. `el` is the
   * `<script data-rz-store>` it was declared on, passed by `rz-store` only. The
   * public spelling is `app.store()`.
   *
   * @internal
   */
  _create(storeName, state, config, el) {
    if (this._stores.has(storeName)) {
      fail(`A store named '${storeName}' already exists.`);
    }
    assertStoreState(storeName, state);
    storeName.includes(".") && warn(
      `Store name '${storeName}' contains a dot, so '@${storeName}' and { edit: '${storeName}' } read as store '${storeName.slice(0, storeName.indexOf("."))}'. Use a name without dots.`
    );
    warnNullFields(storeName, state);
    const status = reactive({
      syncing: false,
      error: null,
      lastSync: 0,
      dirty: false,
      dirtyRoots: {}
    });
    const proxyState = reactive(state);
    const entry = {
      name: storeName,
      data: proxyState,
      status,
      initial: clone(state)
    };
    this._stores.set(storeName, entry);
    trackDirty(proxyState, (rootKey) => {
      if (this._isPatching || !this._isRegistered(entry)) return;
      entry.touched ??= /* @__PURE__ */ new Set();
      entry.touched.add(rootKey);
      this._scheduleFlush(entry);
    });
    if (config) {
      this._setConfig(entry, config);
    }
    if (el) {
      entry.el = el;
    }
    this._updateLastGood(entry, state);
    return entry.data;
  }
  /**
   * Applies a `<script data-rz-store>`: creates the store on a new name, or
   * re-declares it if it's replacing the store's own detached script.
   * `state` is the script's JSON, or `undefined` when it has none.
   *
   * @internal
   */
  _declare(el, storeName, state, declared) {
    const entry = this._stores.get(storeName);
    if (!entry) {
      this._create(storeName, state ?? {}, declared, el);
      return;
    }
    if (!entry.el || entry.el !== el && entry.el.isConnected) {
      warn(
        entry.el ? `rz-store: store '${storeName}' is already declared by another <script> on the page. This one is ignored.` : `rz-store: store '${storeName}' was created in JS, so this <script> is ignored.`,
        el
      );
      return;
    }
    if (state) {
      this._reseed(entry, state);
    }
    entry.el = el;
    const config = { ...entry.config, url: declared.url ?? "" };
    if (declared.headers) {
      config.headers = declared.headers;
    } else {
      delete config.headers;
    }
    entry.config = config;
  }
  /**
   * Replaces the store's data, then clears dirty flags and refreshes both
   * snapshots: the one `reset()` restores to, and the last synced state `revert()`
   * restores to. To change the store's sync configuration, use `config()`.
   */
  update(storeName, state) {
    const entry = this._find(storeName);
    if (!entry) {
      fail(storeName ? `Store '${storeName}' does not exist.` : "Store name is missing.");
    }
    assertStoreState(entry.name, state);
    this._reseed(entry, state);
    return entry.data;
  }
  /**
   * Replaces the store's data and makes it both restore targets. Shared by `update()`
   * and a re-declared script.
   */
  _reseed(entry, state) {
    warnNullFields(entry.name, state);
    this._withPatchGuard(entry, () => patchState(entry.data, state, "replace"));
    entry.initial = clone(entry.data);
    this._updateLastGood(entry, entry.data);
  }
  /**
   * Writes a payload into a store as a JSON Merge Patch, the way a fetch response
   * or a stream message routed by `data-rz-deposit="@store"` does. Fires the same
   * events a push or pull fires, so a listener sees one shape whatever produced
   * the payload.
   *
   * The payload's keys become the last synced state, as they would after a pull.
   * Keys it leaves out keep any unsaved changes, and `reset()` still restores the
   * state the store started with.
   *
   * @returns `false` if the store does not exist or a listener canceled the patch.
   */
  deposit(storeName, payload, options) {
    const entry = this._getStore(storeName);
    if (!entry) {
      return false;
    }
    const { data, name } = entry;
    const response = options?.response;
    const operation = options?.operation ?? "fetch";
    const beforeEvent = this._dispatchPatchEvent(
      entry,
      "rz:store:patch:before",
      { storeName: name, operation, data, payload },
      { cancelable: true }
    );
    if (beforeEvent.defaultPrevented) {
      return false;
    }
    const applied = beforeEvent.detail.payload;
    this._patchPayload(entry, applied);
    this._patchBaseline(entry, applied);
    entry.status.lastSync = Date.now();
    this._dispatchPatchEvent(entry, "rz:store:patch", {
      storeName: name,
      operation,
      data,
      payload: applied,
      response
    });
    return true;
  }
  /**
   * Returns the reactive proxy for a store, or `undefined`.
   */
  get(storeName) {
    return this._find(storeName)?.data;
  }
  /**
   * Returns a deep-cloned non-reactive copy of the store's current data.
   */
  snapshot(storeName) {
    const data = this._find(storeName)?.data;
    return data ? clone(data) : void 0;
  }
  /**
   * Returns a copy of the last synced state: what a push or pull last confirmed,
   * or what `commit()`, `update()`, or `deposit()` last asserted. This is the
   * reference point for unsaved changes and what `revert()` restores. Non-reactive,
   * like `snapshot()`.
   */
  baseline(storeName) {
    const lastGood = this._find(storeName)?.lastGood;
    return lastGood ? clone(lastGood) : void 0;
  }
  /**
   * Returns `true` if a store with the provided name exists.
   */
  has(storeName) {
    return this._find(storeName) !== void 0;
  }
  /**
   * Returns the status object for a store, or `undefined`. Available store
   * status properties are `syncing`, `error`, `lastSync`, `dirty`, and `dirtyRoots`.
   */
  status(storeName) {
    return this._find(storeName)?.status;
  }
  /**
   * Returns `true` when the store has unsaved changes. Pass a root key to ask
   * about that key alone, the same question `@name::status.dirtyRoots.key` answers
   * in HTML.
   *
   * The answer comes from the store's status, which updates a microtask after an
   * edit.
   */
  isDirty(storeName, root) {
    const entry = this._getStore(storeName);
    if (!entry) {
      return false;
    }
    if (!root) {
      return entry.status.dirty;
    }
    const key = getPathRoot(root);
    key !== root && warn(
      `Store '${storeName}': isDirty() takes a root key, not a path. Checking '${key}' for '${root}'.`
    );
    return entry.status.dirtyRoots[key] === true;
  }
  /**
   * Returns the root keys that hold unsaved changes, or an empty array when there
   * are none. The array is a copy, so changing it leaves the store's status alone.
   *
   * Like `isDirty()`, the answer updates a microtask after an edit.
   */
  dirtyRoots(storeName) {
    const entry = this._getStore(storeName);
    return entry ? Object.keys(entry.status.dirtyRoots) : [];
  }
  /**
   * Patches `SyncPolicy` for a store. Warns if the store is missing.
   */
  config(storeName, config) {
    const entry = this._getStore(storeName, "configure");
    if (!entry) return;
    this._setConfig(entry, config);
  }
  /**
   * Sends the store's data to the server.
   *
   * If the store already has a request in flight, the push waits for it, and once that
   * request succeeds, it's sent if the data still differs from what the server holds.
   * The promise resolves when the push's request finishes or, if it had to wait, once
   * the store has nothing in flight and nothing left to send. It never rejects: read
   * `status(name).error` to see whether a push failed.
   *
   * Options apply to this push only and take precedence over the store's own config,
   * for example `push('user', { indicator: '#save', timeout: 5000 })`. A push is
   * always a `PATCH` carrying the whole store, so there is no `method` or `body`.
   */
  async push(storeName, options) {
    options?.abortKey && warn(
      `Store '${storeName}': abortKey is ignored on a push. A store sends one push at a time, so there is nothing to abort.`
    );
    return this._push(storeName, options);
  }
  /** `push()` without the call-site warning, so a held push's follow-up doesn't repeat it. */
  _push(storeName, options) {
    const entry = this._find(storeName);
    if (entry?.status.syncing) {
      this._deferPush(storeName, () => this._push(storeName, options));
      return this._whenIdle(entry);
    }
    return this._request(storeName, "push", options);
  }
  /**
   * Holds a push made while the store has a request in flight, to send once that
   * request succeeds, unless it brings nothing the request isn't already carrying.
   * A later push replaces it.
   *
   * @internal
   */
  _deferPush(storeName, send) {
    const entry = this._find(storeName);
    const flight = entry?.inFlight;
    if (!entry || !flight) return;
    if (deepEqual(entry.data, this._expectedBaseline(entry, flight))) {
      return;
    }
    entry.pendingPush = send;
  }
  /** Returns a promise that settles once the store has nothing in flight and nothing left to send. */
  _whenIdle(entry) {
    entry.idle ??= Promise.withResolvers();
    return entry.idle.promise;
  }
  /** Settles held `push()` calls. */
  _settleIdle(entry) {
    entry.idle?.resolve();
    entry.idle = void 0;
  }
  /** Returns what the server will hold if the request in flight succeeds. */
  _expectedBaseline(entry, flight) {
    return entry.status.syncing === "push" ? flight.snapshot : entry.lastGood;
  }
  /**
   * Pulls fresh store data from the server, unless a push is currently in flight.
   *
   * Options apply to this pull only and take precedence over the store's own config.
   * Pass `url` to pull from somewhere other than the store's endpoint:
   * `pull('user', { url: '/api/user?fields=name' })`.
   */
  async pull(storeName, options) {
    if (this.status(storeName)?.syncing === "push") return;
    return this._request(storeName, "pull", options);
  }
  /**
   * Restores the store to its initial state, and makes that the new baseline,
   * so nothing reads as dirty afterward.
   *
   * To restore the last state the server confirmed instead, use `revert()`.
   */
  reset(storeName) {
    const entry = this._getStore(storeName, "reset");
    if (!entry) return;
    const { data, initial } = entry;
    this._withPatchGuard(entry, () => patchState(data, clone(initial), "replace"));
    this._updateLastGood(entry, data);
  }
  /**
   * Discards unsaved changes, restoring the store to the last synced state, which
   * `baseline()` returns. Pass a dot path to revert a single field or branch
   * instead of the whole store. Returns `true` if anything changed.
   *
   * To restore the state the store started with, use `reset()`.
   */
  revert(storeName, path) {
    const entry = this._getStore(storeName, "revert");
    if (!entry) return false;
    if (!this._isSliceDirty(entry, path)) {
      return false;
    }
    const value = clone(sliceAt(entry.lastGood, path));
    this._withPatchGuard(
      entry,
      () => {
        if (path) {
          setNestedVal(entry.data, path, value);
        } else {
          patchState(entry.data, value, "replace");
        }
      },
      rootsFor(path)
    );
    return true;
  }
  /**
   * Marks the store's current data as the new baseline, so nothing reads as dirty.
   * Does not send anything to the server. Use it when state reached the server by
   * some means Rouse did not perform, such as a native form submit or a socket
   * acknowledgement.
   */
  commit(storeName) {
    const entry = this._getStore(storeName, "commit");
    if (!entry) return;
    this._updateLastGood(entry, entry.data);
  }
  /**
   * Drops all per-store state from the manager. Intended for tear-down of
   * dynamically-created stores.
   *
   * Existing references to the proxy keep working but desync: edits through them
   * won't fire `edit` triggers, and an in-flight request won't
   * apply its response.
   */
  remove(storeName) {
    const entry = this._find(storeName);
    if (!entry) return;
    this._settleIdle(entry);
    entry.pendingPush = void 0;
    entry.listeners = void 0;
    entry.touched = void 0;
    this._pendingFlush.delete(entry);
    this._stores.delete(entry.name);
  }
};

// src/core/app.ts
var NETWORK_DIRECTIVES = [rzFetch, rzPush, rzPull, rzSse];
var appInstances = /* @__PURE__ */ new WeakMap();
var bannerLogged = false;
function logBuildBanner() {
  if (bannerLogged) return;
  bannerLogged = true;
  info(`v${"0.15.0"} development build. Switch to rouse.min.js in production.`);
}
function withAppSignal(appSignal, signal2) {
  return signal2 ? AbortSignal.any([appSignal, signal2]) : appSignal;
}
registerBoundDirectives(
  rzAttr,
  rzClass,
  rzHtml,
  rzModel,
  rzOn,
  rzProp,
  rzRender,
  rzStyle,
  rzText
);
var RouseApp = class {
  root;
  config;
  stores;
  /** @internal */
  _registry;
  isReady;
  /**
   * Makes a network request using the app's configuration. Registered interceptors,
   * default headers, and credentials all apply, and a relative URL is resolved against
   * the configured `baseUrl`. Inside a scope, pass `signal: term` to abort the request
   * when the scope is destroyed.
   *
   * @example
   * const { data, error } = await app.fetch('/api/user');
   * const { data } = await app.fetch('/api/search', { signal: term });
   */
  fetch;
  /**
   * Opens a server-sent events stream, or joins one already open at the same URL.
   * The stream closes when the app is destroyed, when `options.signal` aborts, or
   * when the returned closer is called. Inside a scope, pass `signal: term` to close
   * it with the scope.
   *
   * @example
   * const close = app.sse('/api/feed');
   * app.on('rz:sse:message:html', (e) => app.place(feedEl, e.detail.data, { position: 'beforeend' }));
   */
  sse;
  /**
   * Adds an event listener that is auto-removed when the app is destroyed. Listens
   * on `app.root` unless an `EventTarget` is passed first. Inside a scope, pass the
   * host and `signal: term` to listen on the scope's element until it is destroyed.
   *
   * @returns A teardown closure that removes the listener early.
   *
   * @example
   * app.on('click', onClick, { debounce: 300 });
   * app.on(window, 'online', sync);
   * app.on({ interval: '30s' }, refresh);
   * app.on(host, 'input', search, { signal: term });
   */
  on;
  /** @internal */
  _interceptors;
  _hasStarted = false;
  _destroyed = false;
  _observer;
  _abortController;
  /**
   * Resolves the root, marks it with `data-rouse-app`, and wires the stores, scopes,
   * interceptors, and app-lifetime `AbortController`.
   *
   * @throws If the root cannot be found, or already has an app attached.
   */
  constructor(config = {}) {
    logBuildBanner();
    const rootEl = typeof config.root === "string" ? document.querySelector(config.root) : config.root ?? document.documentElement;
    if (!rootEl) {
      fail("Root element not found.");
    }
    if (appInstances.has(rootEl)) {
      fail("An app instance is already attached to this element.");
    }
    this.root = rootEl;
    this.config = {
      root: rootEl,
      baseUrl: config.baseUrl ?? "",
      headers: config.headers ?? {},
      credentials: config.credentials,
      timeout: config.timeout ?? 0,
      wake: config.wake?.trim() || "ready"
    };
    this._interceptors = {
      request: /* @__PURE__ */ new Set(),
      response: /* @__PURE__ */ new Set(),
      error: /* @__PURE__ */ new Set()
    };
    this.stores = new StoreManager(this);
    this._registry = new ScopeRegistry();
    this.isReady = false;
    const parentRoot = rootEl.parentElement?.closest("[data-rouse-app]");
    const parent = parentRoot ? appInstances.get(parentRoot) : void 0;
    if (parent?._hasStarted) {
      releaseSubtree(rootEl, parent);
    }
    this.root.setAttribute("data-rouse-app", "");
    appInstances.set(this.root, this);
    this.fetch = this._fetch.bind(this);
    this._abortController = new AbortController();
    this.on = (...args) => {
      const implied = typeof args[0] === "string" || isPlainObject(args[0]);
      const target = implied ? this.root : args[0];
      const event = implied ? args[0] : args[1];
      const callback = implied ? args[1] : args[2];
      const options = (implied ? args[2] : args[3]) ?? {};
      if (typeof target?.addEventListener !== "function") {
        fail(
          `app.on expected an EventTarget, but got ${target === null ? "null" : typeof target}.`,
          TypeError
        );
      }
      const signal2 = withAppSignal(this._abortController.signal, options.signal);
      return on(target, event, callback, { ...options, signal: signal2 }, this);
    };
    this.sse = (resource, options = {}) => {
      const signal2 = withAppSignal(this._abortController.signal, options.signal);
      return openBoundStream(this, resource, options, signal2);
    };
  }
  /**
   * Registers a scope setup function by name. `data-rz-scope="counter"` resolves
   * against the names registered here.
   *
   * Elements are wired as they are scanned, and a name that is not registered before
   * `start()` is skipped with a warning rather than picked up once it arrives.
   *
   * @param name - Unique name. Referenced by `rz-scope`.
   * @param setup - The setup function.
   * @returns The app, so calls can be chained.
   * @throws If the setup is not a function.
   *
   * @example
   * app.scope('counter', ({ host, app }) => { ... });
   */
  scope(name, setup) {
    if (typeof setup !== "function") {
      fail(`Scope '${name}' must be a setup function.`);
    }
    this._registry.register(name, setup);
    return this;
  }
  /**
   * Creates a reactive store and returns its data proxy.
   *
   * A store is one flat object. Data, getters, and methods live side by side.
   * Getters are cached as computeds bound to the proxy and must stay pure. Work
   * that needs cleanup belongs in a scope instead.
   *
   * Only plain, JSON-serializable data is synced. Methods and getters are untouched
   * by snapshots, push bodies, `reset()`, and incoming server state.
   *
   * @template T - Shape of the store's data, getters, and methods.
   * @param name - Unique name. Referenced as `@name` in directives.
   * @param data - Initial state. Made reactive, and kept as the snapshot `reset()` restores.
   * @param config - Standing sync config: the endpoint URL, headers, and other transport options.
   * @returns The store's reactive proxy.
   * @throws If a store of this name already exists.
   *
   * @example
   * const cart = app.store('cart', {
   *   items: [],
   *   get total() {
   *     return this.items.reduce((sum, item) => sum + item.price, 0);
   *   },
   *   clear() {
   *     this.items = [];
   *   },
   * }, { url: '/api/cart' });
   *
   * cart.items.push(item);
   */
  store(name, data, config) {
    return this.stores._create(name, data, config);
  }
  /**
   * Places an HTML string into the page, the programmatic counterpart to `rz-place`.
   * A selector is matched within the app root, including the root itself, and every
   * match receives the content.
   *
   * The position defaults to `innerHTML`. `outerHTML` replaces the target, `delete`
   * removes it (pass `''` as the content), and positions such as `beforeend` insert
   * next to or inside it. Each placement fires `rz:dom:place:before`, which can
   * cancel it or change the content, and then `rz:dom:place`. Those events reach
   * `app.on` listeners only when the target is inside the app root.
   *
   * @returns `true` if the content was placed into at least one element, `false` if nothing matched or every placement was canceled.
   *
   * @example
   * app.place('#feed', html, { position: 'beforeend' });
   * app.place(el, html);
   * app.place('#item-4', '', { position: 'delete' });
   */
  place(target, content, options) {
    return placeContent(this, target, content, options);
  }
  interceptor(phase, fn, { signal: signal2 } = {}) {
    const set = this._interceptors[phase];
    if (!set) {
      fail(
        `Invalid interceptor: '${phase}'. Expected 'request', 'response', or 'error'.`
      );
    }
    if (typeof fn !== "function") {
      fail(`Interceptor for '${phase}' must be a function.`);
    }
    if (!signal2) {
      set.add(fn);
      return () => set.delete(fn);
    }
    if (signal2.aborted) {
      return () => {
      };
    }
    const entry = (...args) => fn(...args);
    const remove = () => set.delete(entry);
    set.add(entry);
    signal2.addEventListener("abort", remove, { once: true });
    return () => {
      signal2.removeEventListener("abort", remove);
      remove();
    };
  }
  /**
   * Triggers a Rouse network request. `options.triggerEl` marks an originating
   * element; without one nothing is read from the DOM and the `rz:fetch:*`
   * events fire from the app root.
   */
  async _fetch(url, options = {}) {
    return runFetch(this, { ...options, url });
  }
  /**
   * Brings the app to life: reads the markup under `root`, creates stores, mounts
   * scopes, binds directives, and starts watching for elements added later.
   *
   * Fires `rz:app:start` before reading anything, and `rz:app:ready` on the next
   * animation frame, once the initial bindings have run and `isReady` is true.
   * Calling it a second time, or after `destroy()`, warns and does nothing.
   *
   * @example
   * document.addEventListener('DOMContentLoaded', () => app.start());
   */
  start() {
    if (this._destroyed) {
      warn(
        `'start()' called on a destroyed app. Ignoring. Create a new instance instead.`
      );
      return;
    }
    if (this._hasStarted) {
      warn(`'start()' called multiple times. Ignoring.`);
      return;
    }
    this._hasStarted = true;
    dispatch(this.root, "rz:app:start", { app: this });
    initPayloadRouters(this, this._abortController.signal);
    this._observer = initObserver(this);
    this._observer.observe(this.root, { childList: true, subtree: true });
    mountSubtree(this.root, this);
    requestAnimationFrame(() => {
      if (this._destroyed) return;
      this.isReady = true;
      dispatch(this.root, "rz:app:ready", { app: this });
    });
  }
  /**
   * Shuts the app down: stops watching the DOM, unmounts every scope, unbinds
   * every directive, then fires `rz:app:destroy` and aborts the app's signal.
   *
   * This is final. Aborting drops `app.on` listeners and any request still in
   * flight, and `start()` will not run again. Does nothing if the app never
   * started or is already gone.
   */
  destroy() {
    if (!this._hasStarted || this._destroyed) return;
    this._destroyed = true;
    this._observer?.disconnect();
    unmountSubtree(this.root);
    teardownGlobalBindings(this.root);
    dispatch(this.root, "rz:app:destroy", { app: this });
    this.root.removeAttribute("data-rouse-app");
    appInstances.delete(this.root);
    this._abortController.abort();
  }
};
function getApp(el, expected) {
  const root = el.closest("[data-rouse-app]");
  if (!root) {
    warn("Element is not inside an app instance.", el);
    return void 0;
  }
  const found = appInstances.get(root);
  if (expected && found !== expected) {
    return void 0;
  }
  return found;
}
function rouse(config = {}) {
  return new RouseApp(config);
}
export {
  RouseApp,
  computed,
  createKey,
  rouse as default,
  dispatch,
  effect,
  reactive,
  rouse,
  signal
};
//# sourceMappingURL=rouse.js.map