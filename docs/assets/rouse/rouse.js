// node_modules/.pnpm/alien-signals@3.2.1/node_modules/alien-signals/esm/system.mjs
function createReactiveSystem({ update, notify, unwatched }) {
	return {
		link,
		unlink,
		propagate,
		checkDirty,
		shallowPropagate
	};
	function link(dep, sub, version) {
		const prevDep = sub.depsTail;
		if (prevDep !== void 0 && prevDep.dep === dep) return;
		const nextDep = prevDep !== void 0 ? prevDep.nextDep : sub.deps;
		if (nextDep !== void 0 && nextDep.dep === dep) {
			nextDep.version = version;
			sub.depsTail = nextDep;
			return;
		}
		const prevSub = dep.subsTail;
		if (prevSub !== void 0 && prevSub.version === version && prevSub.sub === sub) return;
		const newLink = sub.depsTail = dep.subsTail = {
			version,
			dep,
			sub,
			prevDep,
			nextDep,
			prevSub,
			nextSub: void 0
		};
		if (nextDep !== void 0) nextDep.prevDep = newLink;
		if (prevDep !== void 0) prevDep.nextDep = newLink;
		else sub.deps = newLink;
		if (prevSub !== void 0) prevSub.nextSub = newLink;
		else dep.subs = newLink;
	}
	function unlink(link, sub = link.sub) {
		const { dep, prevDep, nextDep, nextSub, prevSub } = link;
		if (nextDep !== void 0) nextDep.prevDep = prevDep;
		else sub.depsTail = prevDep;
		if (prevDep !== void 0) prevDep.nextDep = nextDep;
		else sub.deps = nextDep;
		if (nextSub !== void 0) nextSub.prevSub = prevSub;
		else dep.subsTail = prevSub;
		if (prevSub !== void 0) prevSub.nextSub = nextSub;
		else if ((dep.subs = nextSub) === void 0) unwatched(dep);
		return nextDep;
	}
	function propagate(link, innerWrite) {
		let next = link.nextSub;
		let stack;
		top: do {
			const sub = link.sub;
			let flags = sub.flags;
			if (!(flags & 60)) {
				sub.flags = flags | 32;
				if (innerWrite) sub.flags |= 8;
			} else if (!(flags & 12)) flags = 0;
			else if (!(flags & 4)) sub.flags = flags & -9 | 32;
			else if (!(flags & 48) && isValidLink(link, sub)) {
				sub.flags = flags | 40;
				flags &= 1;
			} else flags = 0;
			if (flags & 2) notify(sub);
			if (flags & 1) {
				const subSubs = sub.subs;
				if (subSubs !== void 0) {
					const nextSub = (link = subSubs).nextSub;
					if (nextSub !== void 0) {
						stack = {
							value: next,
							prev: stack
						};
						next = nextSub;
					}
					continue;
				}
			}
			if ((link = next) !== void 0) {
				next = link.nextSub;
				continue;
			}
			while (stack !== void 0) {
				link = stack.value;
				stack = stack.prev;
				if (link !== void 0) {
					next = link.nextSub;
					continue top;
				}
			}
			break;
		} while (true);
	}
	function checkDirty(link, sub) {
		let stack;
		let checkDepth = 0;
		let dirty = false;
		top: do {
			const dep = link.dep;
			const flags = dep.flags;
			if (sub.flags & 16) dirty = true;
			else if ((flags & 17) === 17) {
				const subs = dep.subs;
				if (update(dep)) {
					if (subs.nextSub !== void 0) shallowPropagate(subs);
					dirty = true;
				}
			} else if ((flags & 33) === 33) {
				stack = {
					value: link,
					prev: stack
				};
				link = dep.deps;
				sub = dep;
				++checkDepth;
				continue;
			}
			if (!dirty) {
				const nextDep = link.nextDep;
				if (nextDep !== void 0) {
					link = nextDep;
					continue;
				}
			}
			while (checkDepth--) {
				link = stack.value;
				stack = stack.prev;
				if (dirty) {
					const subs = sub.subs;
					if (update(sub)) {
						if (subs.nextSub !== void 0) shallowPropagate(subs);
						sub = link.sub;
						continue;
					}
					dirty = false;
				} else sub.flags &= -33;
				sub = link.sub;
				const nextDep = link.nextDep;
				if (nextDep !== void 0) {
					link = nextDep;
					continue top;
				}
			}
			return dirty && !!sub.flags;
		} while (true);
	}
	function shallowPropagate(link) {
		do {
			const sub = link.sub;
			const flags = sub.flags;
			if ((flags & 48) === 32) {
				sub.flags = flags | 16;
				if ((flags & 6) === 2) notify(sub);
			}
		} while ((link = link.nextSub) !== void 0);
	}
	function isValidLink(checkLink, sub) {
		let link = sub.depsTail;
		while (link !== void 0) {
			if (link === checkLink) return true;
			link = link.prevDep;
		}
		return false;
	}
}

// node_modules/.pnpm/alien-signals@3.2.1/node_modules/alien-signals/esm/index.mjs
const HasChildEffect = 64;
let cycle = 0;
let runDepth = 0;
let batchDepth = 0;
let notifyIndex = 0;
let queuedLength = 0;
let activeSub;
const queued = [];
const { link, unlink, propagate, checkDirty, shallowPropagate } = createReactiveSystem({
	update(node) {
		if ("getter" in node) return updateComputed(node);
		if ("currentValue" in node) return updateSignal(node);
		node.flags = 1;
		return true;
	},
	notify(effect) {
		let insertIndex = queuedLength;
		let firstInsertedIndex = insertIndex;
		do {
			queued[insertIndex++] = effect;
			effect.flags &= -3;
			effect = effect.subs?.sub;
			if (effect === void 0 || !(effect.flags & 2)) break;
		} while (true);
		queuedLength = insertIndex;
		while (firstInsertedIndex < --insertIndex) {
			const left = queued[firstInsertedIndex];
			queued[firstInsertedIndex++] = queued[insertIndex];
			queued[insertIndex] = left;
		}
	},
	unwatched(node) {
		if ("getter" in node) {
			if (node.depsTail !== void 0) {
				node.flags = 17;
				disposeAllDepsInReverse(node);
			}
		} else if ("currentValue" in node) {} else if ("fn" in node) effectOper.call(node);
		else effectScopeOper.call(node);
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
	if (!--batchDepth) flush();
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
		cleanup: void 0,
		subs: void 0,
		subsTail: void 0,
		deps: void 0,
		depsTail: void 0,
		flags: 6
	};
	const prevSub = setActiveSub(e);
	if (prevSub !== void 0) {
		link(e, prevSub, 0);
		prevSub.flags |= HasChildEffect;
	}
	try {
		++runDepth;
		e.cleanup = e.fn();
	} finally {
		--runDepth;
		activeSub = prevSub;
		e.flags &= -5;
	}
	return effectOper.bind(e);
}
function effectScope(fn) {
	const e = {
		deps: void 0,
		depsTail: void 0,
		subs: void 0,
		subsTail: void 0,
		flags: 1
	};
	const prevSub = setActiveSub(e);
	if (prevSub !== void 0) {
		link(e, prevSub, 0);
		prevSub.flags |= HasChildEffect;
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
		sub.flags = 0;
		let link = sub.deps;
		while (link !== void 0) {
			const dep = link.dep;
			link = unlink(link, sub);
			const subs = dep.subs;
			if (subs !== void 0) {
				propagate(subs, !!runDepth);
				shallowPropagate(subs);
			}
		}
		if (!batchDepth) flush();
	}
}
function updateComputed(c) {
	if (c.flags & HasChildEffect) {
		let link = c.depsTail;
		while (link !== void 0) {
			const prev = link.prevDep;
			const dep = link.dep;
			if (!("getter" in dep) && !("currentValue" in dep)) unlink(link, c);
			link = prev;
		}
	}
	c.depsTail = void 0;
	c.flags = 5;
	const prevSub = setActiveSub(c);
	try {
		++cycle;
		const oldValue = c.value;
		return oldValue !== (c.value = c.getter(oldValue));
	} finally {
		activeSub = prevSub;
		c.flags &= -5;
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
		if (flags & HasChildEffect) {
			let link = e.depsTail;
			while (link !== void 0) {
				const prev = link.prevDep;
				const dep = link.dep;
				if (!("getter" in dep) && !("currentValue" in dep)) unlink(link, e);
				link = prev;
			}
		}
		if (e.cleanup) {
			runCleanup(e);
			if (!e.flags) return;
		}
		e.depsTail = void 0;
		e.flags = 6;
		const prevSub = setActiveSub(e);
		try {
			++cycle;
			++runDepth;
			e.cleanup = e.fn();
		} finally {
			--runDepth;
			activeSub = prevSub;
			e.flags &= -5;
			purgeDeps(e);
		}
	} else if (e.deps !== void 0) e.flags = 2 | flags & HasChildEffect;
}
function flush() {
	try {
		while (notifyIndex < queuedLength) {
			const effect = queued[notifyIndex];
			queued[notifyIndex++] = void 0;
			run(effect);
		}
	} finally {
		while (notifyIndex < queuedLength) {
			const effect = queued[notifyIndex];
			queued[notifyIndex++] = void 0;
			effect.flags |= 10;
		}
		notifyIndex = 0;
		queuedLength = 0;
	}
}
function computedOper() {
	const flags = this.flags;
	if (flags & 16 || flags & 32 && (checkDirty(this.deps, this) || (this.flags = flags & -33, false))) {
		if (updateComputed(this)) {
			const subs = this.subs;
			if (subs !== void 0) shallowPropagate(subs);
		}
	} else if (!flags) {
		this.flags = 5;
		const prevSub = setActiveSub(this);
		try {
			this.value = this.getter();
		} finally {
			activeSub = prevSub;
			this.flags &= -5;
		}
	}
	const sub = activeSub;
	if (sub !== void 0) link(this, sub, cycle);
	return this.value;
}
function signalOper(...value) {
	if (value.length) {
		if (this.pendingValue !== (this.pendingValue = value[0])) {
			this.flags = 17;
			const subs = this.subs;
			if (subs !== void 0) {
				propagate(subs, !!runDepth);
				if (!batchDepth) flush();
			}
		}
	} else {
		if (this.flags & 16) {
			if (updateSignal(this)) {
				const subs = this.subs;
				if (subs !== void 0) shallowPropagate(subs);
			}
		}
		const sub = activeSub;
		if (sub !== void 0) link(this, sub, cycle);
		return this.currentValue;
	}
}
function runCleanup(e) {
	const cleanup = e.cleanup;
	e.cleanup = void 0;
	const prevSub = activeSub;
	activeSub = void 0;
	try {
		cleanup();
	} finally {
		activeSub = prevSub;
	}
}
function effectOper() {
	effectScopeOper.call(this);
	if (this.cleanup) runCleanup(this);
}
function effectScopeOper() {
	this.flags = 0;
	disposeAllDepsInReverse(this);
	const sub = this.subs;
	if (sub !== void 0) unlink(sub);
}
function disposeAllDepsInReverse(sub) {
	let link = sub.depsTail;
	while (link !== void 0) {
		const prev = link.prevDep;
		unlink(link, sub);
		link = prev;
	}
}
function purgeDeps(sub) {
	const depsTail = sub.depsTail;
	let dep = depsTail !== void 0 ? depsTail.nextDep : sub.deps;
	while (dep !== void 0) dep = unlink(dep, sub);
}

// src/core/constants.ts
const DIRECTIVE_SLUGS = [
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
const APP_ROOT_SELECTOR = "[data-rouse-app]";
const ITEM_NAMESPACES = ["index", "position"];
function isItemNamespace(key) {
	return ITEM_NAMESPACES.includes(key);
}
const KEY_BLOCKLIST = [
	"__proto__",
	"constructor",
	"prototype"
];
const RENDER_FRAME = Symbol("rz.renderFrame");
const PLACE_POSITIONS = [
	"innerHTML",
	"outerHTML",
	"beforebegin",
	"afterbegin",
	"beforeend",
	"afterend",
	"delete"
];
const DEFAULT_PLACE_POSITION = "innerHTML";
function isPlacePosition(key) {
	return PLACE_POSITIONS.includes(key);
}
const HTTP_METHODS = [
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
const SAFE_METHODS = [
	"GET",
	"HEAD",
	"OPTIONS",
	"QUERY"
];
function isSafeMethod(key) {
	return SAFE_METHODS.includes(key?.toUpperCase());
}
const FLAG_MODIFIERS = [
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
const isFlagModifier = (val) => FLAG_MODIFIERS.includes(val);
const LISTEN_TARGETS = [
	"window",
	"document",
	"root"
];
const isListenTarget = (val) => LISTEN_TARGETS.includes(val);

// src/core/elements.ts
const PREFIX = "data-rz-";
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
	return el.getAttributeNames().filter((name) => name.startsWith(PREFIX) && !isDirectiveSlug(name.slice(8)));
}
function queryTargets(el, selector) {
	try {
		const targets = Array.from(el.querySelectorAll(selector));
		if (el.matches(selector)) targets.unshift(el);
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
const closers = {
	")": "(",
	"}": "{",
	"]": "["
};
const openers = new Set(Object.values(closers));
const isCloser = (char) => Object.hasOwn(closers, char);
const isOpener = (char) => openers.has(char);
function parseDirectiveValue(value) {
	let cleanedValue = value?.trim();
	if (!cleanedValue) return [];
	if (cleanedValue.endsWith(",")) cleanedValue = cleanedValue.slice(0, -1).trim();
	const parsed = [];
	let start = 0;
	const scanResult = forEachSafeChar(cleanedValue, (i, char) => {
		if (char === "," && hasTrailingWhitespace(cleanedValue, i)) {
			parseSegment(cleanedValue.slice(start, i), parsed);
			start = i + 1;
		}
		return false;
	});
	if (!scanResult.mismatched && (scanResult.depth > 0 || scanResult.quote)) warn(`Malformed directive value: '${value}'.`);
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
		if (key) pairs.push([key, val]);
	} else if (trimmed.endsWith(":")) warn(`Ignoring '${trimmed}': trailing colon has no value.`);
	else {
		const key = stripQuotes(trimmed);
		if (key) pairs.push([key, null]);
	}
}
function parseTriggerSubjectPairs(value) {
	return parseDirectiveValue(value).flatMap(([keyStr, subjectStr]) => {
		const subject = subjectStr || null;
		return parseTriggers(keyStr).map((trigger) => ({
			trigger,
			subject
		}));
	});
}
function parseArgToken(token) {
	if (!token.endsWith("]")) return null;
	const open = token.indexOf("-[");
	return open > 0 ? [token.slice(0, open), token.slice(open + 2, -1).trim()] : null;
}
function normalizeModifiers(tokens, trigger) {
	const options = {};
	const keys = [];
	for (const token of tokens) {
		const argToken = parseArgToken(token);
		if (argToken) {
			const [name, arg] = argToken;
			if (!arg) {
				warn(`Empty argument on modifier '${name}' in trigger '${trigger}'.`);
				continue;
			}
			if (name === "key") {
				const key = arg.toLowerCase();
				keys.push(key === "space" ? " " : key);
			} else if (name === "debounce" || name === "throttle") options[name] = arg;
			else warn(`Unknown modifier '${name}' in trigger '${trigger}'.`);
			continue;
		}
		if (isFlagModifier(token)) options[token === "stop-immediate" ? "stopImmediate" : token] = true;
		else if (isListenTarget(token)) options.listenOn = token;
		else if (token === "debounce" || token === "throttle") options[token] = true;
		else warn(`Unknown modifier '${token}' in trigger '${trigger}'.`);
	}
	if (keys.length > 0) options.key = keys;
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
	for (const trigger of triggers) {
		if (!trigger) continue;
		const [event = "", modifierGroup, ...extraGroups] = splitOnSafeDelimiter(trigger, "|");
		if (!event || modifierGroup === "" || extraGroups.length > 0) {
			warn(`Malformed trigger: '${trigger}'. Use a single '|' after the event, followed by dot-separated modifiers.`);
			continue;
		}
		const modifiers = modifierGroup ? splitOnSafeDelimiter(modifierGroup, ".").filter(Boolean) : [];
		const argToken = parseArgToken(event);
		const def = {
			event: argToken ? argToken[0] : event,
			options: normalizeModifiers(modifiers, trigger)
		};
		if (argToken) def.arg = argToken[1];
		parsed.push(def);
	}
	return parsed;
}
function parseFetchSubject(subject) {
	const ws = subject.search(/\s/);
	const head = ws === -1 ? subject : subject.slice(0, ws);
	if (isHttpMethod(head)) return {
		method: head.toUpperCase(),
		url: ws === -1 ? void 0 : subject.slice(ws + 1).trim()
	};
	return { url: subject };
}
function parseStoreValue(value) {
	const pairs = parseDirectiveValue(value);
	const [first] = pairs;
	if (!first) return null;
	const [name, url] = first;
	if (pairs.length > 1) warn(`rz-store: only one store can be initialized per element. Using '${name}'.`);
	return {
		name,
		url: url || null
	};
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
	if (dotIndex === -1) return {
		source: path,
		namespace: null,
		nestedPath: ""
	};
	return {
		source: path.slice(0, dotIndex),
		namespace: null,
		nestedPath: path.slice(dotIndex + 1)
	};
}
function parseStoreRef(ref, slug) {
	const { source, namespace, nestedPath } = parseDataSourcePath(ref);
	if (namespace) {
		warn(`${slug ? `rz-${slug}: ` : ""}'${ref}' references the '${namespace}' namespace. Use '@${source}' to reference store data.`);
		return null;
	}
	return {
		source,
		nestedPath
	};
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
			return;
		}
		return value;
	});
}
function forEachSafeChar(text, callback) {
	const depths = {
		"(": 0,
		"{": 0,
		"[": 0
	};
	let totalDepth = 0;
	let quote = null;
	let mismatched = false;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		const prev = text[i - 1];
		if (quote) {
			if (char === quote && prev !== "\\") quote = null;
		} else if (char === "'" || char === "\"") quote = char;
		else if (isOpener(char)) {
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
			if (callback(i, char, text)) return {
				depth: totalDepth,
				quote,
				mismatched
			};
		}
	}
	return {
		depth: totalDepth,
		quote,
		mismatched
	};
}
function isInQuotes(val) {
	if (val.length < 2) return false;
	const first = val[0];
	const last = val[val.length - 1];
	return (first === "\"" || first === "'") && first === last;
}
function stripQuotes(val) {
	if (isInQuotes(val)) return val.slice(1, -1).trim();
	return val;
}
function hasTrailingWhitespace(text, index) {
	return index + 1 < text.length && /\s/.test(text.charAt(index + 1));
}

// src/reactivity/arrays.ts
const methodIntercepts = {};
const DATA_ARG_METHODS = /* @__PURE__ */ new Set([
	"concat",
	"with",
	"toSpliced"
]);
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
	if (wrapResult && Array.isArray(result)) return result.map(reactive);
	return result;
}
function trackedRaw(proxy) {
	const raw = getRaw(proxy);
	getSignal(raw, ITERATION_KEY)();
	return raw;
}
for (const key of [
	"copyWithin",
	"fill",
	"pop",
	"push",
	"reverse",
	"shift",
	"sort",
	"splice",
	"unshift"
]) methodIntercepts[key] = function(...args) {
	startBatch();
	try {
		const raw = getRaw(this);
		const result = raw[key].apply(raw, args);
		getSignal(raw, "length")(raw.length);
		trigger(getSignal(raw, ITERATION_KEY));
		const tracker = dirtyTrackers.get(raw);
		if (tracker) tracker(objectRootKeys.get(raw) ?? "root");
		return result;
	} finally {
		endBatch();
	}
};
for (const key of [
	"includes",
	"indexOf",
	"lastIndexOf"
]) methodIntercepts[key] = function(...args) {
	const raw = trackedRaw(this);
	let result = raw[key](...args);
	if (result === -1 || result === false) {
		const rawArgs = args.map(getRaw);
		result = raw[key](...rawArgs);
	}
	return result;
};
const ITERATORS = [
	"entries",
	"keys",
	"values",
	Symbol.iterator
];
for (const key of ITERATORS) methodIntercepts[key] = function* () {
	const iterator = trackedRaw(this)[key]();
	for (const val of iterator) yield reactive(val);
};
for (const key of [
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
]) methodIntercepts[key] = function(...args) {
	const result = runOnRaw(this, key, args);
	return reactive(result);
};
for (const key of [
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
]) methodIntercepts[key] = function(...args) {
	return runOnRaw(this, key, args, true);
};
for (const key of [
	"join",
	"toString",
	"toLocaleString"
]) methodIntercepts[key] = function(...args) {
	return trackedRaw(this)[key](...args);
};

// src/reactivity/handlers.ts
const ITERATION_KEY = Symbol("rz.iteration");
const signalCache = /* @__PURE__ */ new WeakMap();
const computedCache = /* @__PURE__ */ new WeakMap();
const handlers = {
	get(target, key, receiver) {
		if (key === "__proto__") return target;
		const isArray = Array.isArray(target);
		if (isArray && Object.hasOwn(methodIntercepts, key)) return Reflect.get(methodIntercepts, key, receiver);
		const desc = Object.getOwnPropertyDescriptor(target, key);
		if (desc?.get) {
			const comp = getComputed(target, key, desc.get, receiver)();
			return reactive(comp);
		}
		let value;
		if (isArray && isIndex(key)) {
			getSignal(target, ITERATION_KEY)();
			value = Reflect.get(target, key);
		} else value = getSignal(target, key)();
		if (proxiable(value)) {
			const parentTracker = dirtyTrackers.get(target);
			if (parentTracker) propagateTracker(target, key, value, parentTracker, desc);
			return reactive(value);
		}
		return value;
	},
	set(target, key, value, receiver) {
		const desc = Object.getOwnPropertyDescriptor(target, key);
		if (desc?.get || desc?.set) return Reflect.set(target, key, value, receiver);
		const hadKey = Object.hasOwn(target, key);
		const oldValue = target[key];
		value = getRaw(value);
		const result = Reflect.set(target, key, value, receiver);
		if (value !== oldValue) {
			const sig = getSignal(target, key);
			if (value !== untracked(sig)) sig(value);
			else trigger(sig);
			const tracker = dirtyTrackers.get(target);
			if (tracker) {
				tracker(getRootKey(target, key));
				if (proxiable(value)) propagateTracker(target, key, value, tracker, desc);
			}
			if (!hadKey || Array.isArray(target)) trigger(getSignal(target, ITERATION_KEY));
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
			if (tracker) tracker(getRootKey(target, key));
		}
		return result;
	},
	has(target, key) {
		getSignal(target, Array.isArray(target) && isIndex(key) ? ITERATION_KEY : key)();
		return Reflect.has(target, key);
	}
};
function isIndex(key) {
	return typeof key === "string" && key !== "4294967295" && String(+key >>> 0) === key;
}
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
const proxyCache = /* @__PURE__ */ new WeakMap();
const rawCache = /* @__PURE__ */ new WeakMap();
const dirtyTrackers = /* @__PURE__ */ new WeakMap();
const objectRootKeys = /* @__PURE__ */ new WeakMap();
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
	const proto = Object.getPrototypeOf(target);
	return proto === Object.prototype || proto === null;
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
	return frame ? {
		item: frame.item ?? null,
		index: frame.index
	} : {
		item: null,
		index: null
	};
}

// src/core/path.ts
const MAX_CACHE_SIZE = 500;
const pathCache = /* @__PURE__ */ new Map();
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
		if (!(part in current) || current[part] == null) current[part] = {};
		else if (typeof current[part] !== "object") {
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
const EMPTY_SCOPE = {};
const warnedWrites = /* @__PURE__ */ new Set();
function resolveState(path, scope, storeManager) {
	const isItem = path.startsWith("%");
	if (!isItem && !path.startsWith("@")) return getNestedVal(scope, path);
	const { source, namespace, nestedPath } = parseDataSourcePath(path);
	if (isItem && source) return void 0;
	let resolved;
	if (isItem) resolved = namespace ? resolveItemNamespace(namespace, scope) : renderItem(scope);
	else resolved = namespace ? resolveStoreNamespace(source, namespace, storeManager) : storeManager.get(source);
	return nestedPath ? getNestedVal(resolved, nestedPath) : resolved;
}
function resolveItemNamespace(namespace, scope) {
	const frame = renderFrame(scope);
	if (!frame || !isItemNamespace(namespace)) return;
	return namespace === "index" ? frame.index : frame.index + 1;
}
function resolveStoreNamespace(storeName, namespace, storeManager) {
	return namespace !== "status" ? void 0 : storeManager.status(storeName);
}
function writeState(path, value, scope, storeManager) {
	const isItem = path.startsWith("%");
	if (isItem || path.startsWith("@")) {
		const { source, namespace, nestedPath } = parseDataSourcePath(path);
		if (isItem && source) return;
		if (namespace) {
			warnWriteOnce(path, `rz-model: cannot write to '${path}'. The '${namespace}' namespace is read-only.`);
			return;
		}
		if (!nestedPath) {
			warnWriteOnce(path, `rz-model: cannot use '${path}' because it overwrites the entire ${isItem ? "render item" : "store"}. Bind to a field instead.`);
			return;
		}
		const target = isItem ? renderItem(scope) : storeManager.get(source);
		if (!hasNestedKey(target, nestedPath)) {
			warnWriteOnce(path, isItem ? `rz-model: '${path}' could not be resolved. Field does not exist on the render item.` : `rz-model: cannot resolve '${path}' on '${source}'. One or both may be undefined.`);
			return;
		}
		setNestedVal(target, nestedPath, value);
		return;
	}
	if (renderParent(scope) === EMPTY_SCOPE) {
		warnWriteOnce(path, `rz-model: '${path}' used outside of a scope. Use '@' to target a store.`);
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
		if (current == null || typeof current !== "object") return false;
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
	const onError = (error) => {
		err(`Failed to execute '${name}()'.`, el, error);
	};
	try {
		const args = {
			el,
			e,
			render: renderCtxOf(scope)
		};
		const result = method.call(context, args);
		return typeof result?.then === "function" ? result.then(void 0, onError) : result;
	} catch (error) {
		return onError(error);
	}
}
function resolveBoundValue(raw, scope, storeManager, el, slug) {
	const key = raw.trim();
	const state = resolveState(key, scope, storeManager);
	if (typeof state === "function") return invokeHandler(state, key.startsWith("@") ? storeManager.get(parseDataSourcePath(key).source) : scope, key, scope, el, new CustomEvent(`rz:${slug}`));
	return state;
}

// src/dom/updater.ts
const prevHtml = /* @__PURE__ */ new WeakMap();
const prevClasses = /* @__PURE__ */ new WeakMap();
const prevStyles = /* @__PURE__ */ new WeakMap();
const warnedProps = /* @__PURE__ */ new WeakMap();
const toKebab = (k) => k.startsWith("--") ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const WS = /\s+/;
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
		if (el.type === "checkbox") el.checked = !!value;
		else if (el.type === "radio") el.checked = el.value === String(value);
		else setStringValue(el, "value", value);
		return;
	}
	if (el instanceof HTMLSelectElement) {
		if (el.multiple && Array.isArray(value)) {
			const vals = new Set(value.map(String));
			for (const opt of el.options) opt.selected = vals.has(opt.value);
		} else el.value = value == null ? "" : String(value);
		return;
	}
	if (el instanceof HTMLTextAreaElement) {
		setStringValue(el, "value", value);
		return;
	}
	if ("value" in el) el.value = value;
}
function getModelableValue(el) {
	if (!(el instanceof HTMLElement)) return;
	if (el.isContentEditable) return el.innerText;
	if (el instanceof HTMLInputElement) {
		if (el.type === "checkbox") return el.checked;
		if (el.type === "number" || el.type === "range") return Number.isNaN(el.valueAsNumber) ? void 0 : el.valueAsNumber;
		return el.value;
	}
	if (el instanceof HTMLSelectElement) return el.multiple ? Array.from(el.selectedOptions).map((o) => o.value) : el.value;
	return "value" in el ? el.value : void 0;
}
function updateClass(el, value) {
	if (value && typeof value === "object") for (const [cls, active] of Object.entries(value)) {
		const classes = cls.trim().split(WS).filter(Boolean);
		if (classes.length > 0) {
			if (active) el.classList.add(...classes);
			else el.classList.remove(...classes);
		}
	}
	else {
		const newClass = String(value ?? "").trim();
		const oldClass = prevClasses.get(el);
		if (oldClass) el.classList.remove(...oldClass.split(WS));
		if (newClass) {
			el.classList.add(...newClass.split(WS));
			prevClasses.set(el, newClass);
		} else prevClasses.delete(el);
	}
}
function applyStyles(el, decl, active) {
	if (!canBeStyled(el)) return;
	for (const [prop, value] of parseDeclarations(decl)) if (active) el.style.setProperty(prop, value);
	else el.style.removeProperty(prop);
}
function setStyleProperty(el, prop, value) {
	if (!canBeStyled(el)) return;
	if (value == null) el.style.removeProperty(prop);
	else el.style.setProperty(prop, String(value));
}
function updateStyle(el, value) {
	if (!canBeStyled(el)) return;
	for (const prop of prevStyles.get(el) ?? []) el.style.removeProperty(prop);
	const entries = value && typeof value === "object" ? Object.entries(value).filter(([, v]) => v != null).map(([k, v]) => [toKebab(k), String(v)]) : parseDeclarations(String(value ?? ""));
	for (const [prop, v] of entries) el.style.setProperty(prop, v);
	if (entries.length) prevStyles.set(el, entries.map(([prop]) => prop));
	else prevStyles.delete(el);
}
function updateAttr(el, attr, value) {
	if (typeof value === "boolean" && attr.toLowerCase().startsWith("aria-")) el.setAttribute(attr, String(value));
	else if (value === false || value == null) el.removeAttribute(attr);
	else el.setAttribute(attr, value === true ? "" : String(value));
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
	if (el[prop] !== strVal) el[prop] = strVal;
}

// src/directives/rz-attr.ts
function bind$5(el, scope, app, key, value) {
	const name = key.toLowerCase();
	if (name === "class" || name === "style") {
		warn(`rz-attr: '${key}' belongs on data-rz-${name}. Ignoring.`, el);
		return;
	}
	return effect(() => {
		updateAttr(el, key, resolveBoundValue(value || key, scope, app.stores, el, "attr"));
	});
}
const rzAttr = {
	slug: "attr",
	selector: directiveSelector("attr"),
	bind: bind$5
};

// src/directives/rz-class.ts
function bind$4(el, scope, app, key, val) {
	return effect(() => {
		const resolvedValue = resolveBoundValue(val || key, scope, app.stores, el, "class");
		updateClass(el, val === "" ? resolvedValue : { [key]: !!resolvedValue });
	});
}
const rzClass = {
	slug: "class",
	selector: directiveSelector("class"),
	bind: bind$4
};

// src/directives/rz-close.ts
function getConfig$10(el) {
	return parseTriggers(getDirectiveValue(el, "close"));
}
const rzClose = { getConfig: getConfig$10 };

// src/directives/rz-deposit.ts
function getConfig$9(el, overrideValue) {
	const value = overrideValue || getDirectiveValue(el, "deposit");
	const label = overrideValue ? "Rouse-Deposit" : "rz-deposit";
	return parseDirectiveValue(value).flatMap(([key]) => {
		if (!key.startsWith("@")) {
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
const rzDeposit = { getConfig: getConfig$9 };

// src/directives/rz-disable.ts
function getConfig$8(el) {
	const value = getDirectiveValue(el, "disable");
	if (value === null) return void 0;
	return stripQuotes(value.trim());
}
const rzDisable = { getConfig: getConfig$8 };

// src/core/timing.ts
const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_THROTTLE_MS = 150;
const TIME_REGEX = /^(\d*\.?\d+)(ms|s|m)?$/;
function getTimingConfig(options) {
	const { debounce: debounceOpt, throttle: throttleOpt } = options;
	const strategy = debounceOpt !== void 0 ? "debounce" : throttleOpt !== void 0 ? "throttle" : void 0;
	const value = debounceOpt ?? throttleOpt;
	const wait = (value === void 0 || value === true ? void 0 : parseTime(value)) ?? (strategy === "throttle" ? DEFAULT_THROTTLE_MS : DEFAULT_DEBOUNCE_MS);
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
	return {
		strategy,
		wait,
		leading,
		trailing
	};
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
		} else clearTimeout(timer);
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
	const run = (args) => {
		fn(...args);
		lastRun = Date.now();
		clearTimeout(timer);
		timer = lastArgs = void 0;
	};
	const throttled = (...args) => {
		const elapsed = Date.now() - lastRun;
		lastArgs = args;
		if (elapsed >= wait) {
			if (leading) run(args);
			else if (trailing && !timer) timer = setTimeout(() => run(lastArgs), wait);
		} else if (trailing && !timer) timer = setTimeout(() => run(lastArgs), wait - elapsed);
	};
	throttled.cancel = () => {
		clearTimeout(timer);
		timer = lastArgs = void 0;
	};
	return throttled;
}
function applyTiming(fn, options) {
	const config = getTimingConfig(options);
	if (config.strategy === "debounce") return debounce(fn, config);
	if (config.strategy === "throttle") return throttle(fn, config);
	const timed = (...args) => fn(...args);
	timed.cancel = () => {};
	return timed;
}
function parseTime(val) {
	if (!val) return 0;
	if (typeof val === "number") return val;
	const match = String(val).trim().toLowerCase().match(TIME_REGEX);
	if (!match) {
		warn(`Invalid time value: '${val}'.`);
		return 0;
	}
	const [, amountStr = "0", unit] = match;
	const amount = parseFloat(amountStr);
	if (unit === "m") return amount * 6e4;
	return unit === "s" ? amount * 1e3 : amount;
}

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
function dispatchFrom(el, root, name, detail, options) {
	return dispatch(el.isConnected ? el : root, name, detail, options);
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
	if (obj === null || typeof obj !== "object") return obj;
	if (seen.has(obj)) return seen.get(obj);
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
		warn(`Non-serializable value at '${path}'. Use plain objects, arrays, or primitives.`);
		return {};
	}
	const result = {};
	seen.set(obj, result);
	for (const key in obj) {
		if (!isOwnDataProp(obj, key)) continue;
		const val = obj[key];
		if (val !== void 0) result[key] = clone(val, seen, `${path}.${key}`);
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
	if (a === b) return true;
	if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	if (seen.has(a)) return seen.get(a) === b;
	seen.set(a, b);
	if (a.constructor !== b.constructor) return false;
	if (a instanceof Date) return a.getTime() === b.getTime();
	if (a instanceof RegExp) return a.toString() === b.toString();
	if (Array.isArray(a)) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) if (!deepEqual(typeof a[i] === "function" || a[i] === void 0 ? null : a[i], typeof b[i] === "function" || b[i] === void 0 ? null : b[i], seen)) return false;
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
		if (b[key] !== void 0) validKeysB++;
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
		if (hasAccessor(target, sourceKey) || isPlainObject(shape) && hasAccessor(shape, sourceKey)) continue;
		if (sourceVal === null) {
			delete target[sourceKey];
			continue;
		}
		const targetVal = target[sourceKey];
		const nestedShape = isPlainObject(shape) ? shape[sourceKey] : void 0;
		if (isPlainObject(sourceVal)) {
			if (isPlainObject(targetVal)) patchState(targetVal, sourceVal, "merge", nestedShape);
			else {
				target[sourceKey] = {};
				patchState(target[sourceKey], sourceVal, "merge", nestedShape);
			}
		} else target[sourceKey] = sourceVal;
	}
}
function isPlainObject(val) {
	if (typeof val !== "object" || val === null || Array.isArray(val)) return false;
	const proto = Object.getPrototypeOf(val);
	return proto === null || proto === Object.prototype;
}

// src/net/payload.ts
function resolveUrl(url, baseUrl) {
	try {
		if (isAbsoluteUrl(url)) return new URL(url);
		const base = baseUrl ? new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`, document.baseURI) : document.baseURI;
		return new URL(url, base);
	} catch (err) {
		fail(`Failed to construct URL: '${url}'.`, TypeError, { cause: err });
	}
}
function preparePayload(options, baseUrl) {
	const { url, headers = {}, body, params, ...restOptions } = options;
	const method = (options.method || "GET").toUpperCase();
	if (body != null && (method === "GET" || method === "HEAD")) fail(`A ${method} request can't have a body. Pass query values as 'params', or use a method that takes a body.`, TypeError);
	const urlObj = resolveUrl(url, baseUrl);
	if (params) for (const [key, val] of Object.entries(params)) {
		if (val == null) continue;
		urlObj.searchParams.delete(key);
		for (const v of Array.isArray(val) ? val : [val]) urlObj.searchParams.append(key, String(v));
	}
	const reqHeaders = new Headers();
	reqHeaders.set("Rouse-Request", "true");
	reqHeaders.set("Accept", "application/json, text/html, image/svg+xml, */*;q=0.8");
	for (const [key, val] of Object.entries(headers)) if (val == null) reqHeaders.delete(key);
	else reqHeaders.set(key, String(val));
	let finalBody = null;
	let contentType = null;
	if (body != null) {
		if (isNativeBinaryBody(body) || typeof body === "string") finalBody = body;
		else if (body instanceof URLSearchParams) {
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
	if (contentType && !reqHeaders.has("Content-Type")) reqHeaders.set("Content-Type", contentType);
	return {
		finalUrl: urlObj.toString(),
		method,
		reqHeaders,
		finalBody,
		restOptions
	};
}
function isNativeBinaryBody(body) {
	return body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body) || body instanceof ReadableStream;
}
function isAbsoluteUrl(url) {
	if (/^(blob|data):/.test(url)) fail(`Unsupported URL scheme: '${url}'.`, TypeError);
	return /^https?:\/\//i.test(url);
}

// src/net/sse-engine.ts
const DEFAULT_EVENT = "message";
const entries = /* @__PURE__ */ new Map();
const subscribedNames = /* @__PURE__ */ new Set();
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
	if (dispatchFrom(el, app.root, "rz:sse:config", { config }, { cancelable: true }).defaultPrevented) return null;
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
	const ref = {
		el,
		root: app.root,
		config
	};
	entry.refs.add(ref);
	if (!entry.source && (!entry.closed || revive)) {
		entry.attempt = 0;
		connect(entry);
	} else if (entry.source?.readyState === EventSource.OPEN) dispatchFrom(el, app.root, "rz:sse:open", { config });
	return (reason = "released") => release(key, ref, reason);
}
function openBoundStream(app, resource, options, signal) {
	if (signal.aborted) return () => {};
	const release = openStream(app, resource, options, true);
	if (!release) return () => {};
	const onAbort = () => release("teardown");
	signal.addEventListener("abort", onAbort, { once: true });
	return () => {
		signal.removeEventListener("abort", onAbort);
		release("released");
	};
}
function subscribeNamed(name) {
	if (!name || name === DEFAULT_EVENT || subscribedNames.has(name)) return;
	subscribedNames.add(name);
	entries.forEach((entry) => attachNamed(entry, name));
}
function connect(entry) {
	const source = new EventSource(entry.url, { withCredentials: entry.withCredentials });
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
		const base = {
			config: ref.config,
			event,
			raw,
			lastEventId: e.lastEventId
		};
		if (routable) {
			if (Array.isArray(data) || isPlainObject(data)) dispatchFrom(ref.el, ref.root, "rz:sse:message:json", {
				...base,
				data
			});
			else dispatchFrom(ref.el, ref.root, "rz:sse:message:html", {
				...base,
				data: raw
			});
		}
		dispatchFrom(ref.el, ref.root, "rz:sse:message", {
			...base,
			data
		});
	}
}
function onError(entry) {
	const { source } = entry;
	if (!source) return;
	entry.attempt += 1;
	const willRetry = source.readyState !== EventSource.CLOSED;
	const prevented = emit(entry, "rz:sse:error", { attempt: entry.attempt }, true);
	if (!willRetry) finalize(entry, "failed");
	else if (prevented) finalize(entry, "canceled");
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
	if (!announced) dispatchFrom(ref.el, ref.root, "rz:sse:close", {
		config: ref.config,
		reason
	});
}
function emit(entry, name, detail, cancelable = false) {
	let prevented = false;
	for (const ref of entry.refs) {
		const event = dispatchFrom(ref.el, ref.root, name, {
			config: ref.config,
			...detail
		}, { cancelable });
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

// src/directives/rz-scope.ts
function getConfig$7(el) {
	return getDirectiveValue(el, "scope");
}
const SCOPE_SELECTOR = directiveSelector("scope");
const rzScope = { getConfig: getConfig$7 };

// src/dom/binder.ts
const globalBindings = /* @__PURE__ */ new WeakMap();
const scopeBindings = /* @__PURE__ */ new WeakMap();
const renderOwned = /* @__PURE__ */ new WeakMap();
let boundDirectiveList = [];
let boundSelector = "";
const awakeScopes = /* @__PURE__ */ new WeakMap();
const appInstances = /* @__PURE__ */ new WeakMap();
const APP_ROOT_ATTR = "data-rouse-app";
function attachApp(root, app) {
	root.setAttribute(APP_ROOT_ATTR, "");
	appInstances.set(root, app);
}
function detachApp(root) {
	root.removeAttribute(APP_ROOT_ATTR);
	appInstances.delete(root);
}
function appAt(root) {
	return appInstances.get(root);
}
function getApp(el, expected) {
	const root = el.closest(APP_ROOT_SELECTOR);
	if (!root) {
		warn("Element is not inside an app instance.", el);
		return;
	}
	const found = appInstances.get(root);
	if (expected && found !== expected) return;
	return found;
}
function closestScope(el, app) {
	const scopeEl = el.closest(SCOPE_SELECTOR);
	return scopeEl && app.root.contains(scopeEl) ? scopeEl : null;
}
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
		if (ctx) return ctx;
		if (node.matches(SCOPE_SELECTOR)) return awakeScopes.get(node) ?? EMPTY_SCOPE;
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
			warn(`rz-${directive.slug}: accepts a single value, but received ${parsed.length}. Ignoring extra values.`, el);
			parsed.length = 1;
		}
		for (const [key, val] of parsed) {
			const cleanup = directive.bind(el, scope, app, key, val ?? "");
			if (cleanup) cleanups.push(cleanup);
		}
	}
	return cleanups;
}
function walkBoundElements(root, callback, options) {
	if (!options?.acceptScopeRoot && root.matches(SCOPE_SELECTOR)) return;
	if (renderOwned.has(root)) return;
	if (root.matches(boundSelector)) callback(root);
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, { acceptNode(node) {
		const el = node;
		if (el.matches(SCOPE_SELECTOR) || el.matches("[data-rouse-app]") || renderOwned.has(el)) return NodeFilter.FILTER_REJECT;
		return el.matches(boundSelector) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
	} });
	let node = walker.nextNode();
	while (node !== null) {
		callback(node);
		node = walker.nextNode();
	}
}
function mountGlobalBinding(el, app) {
	if (globalBindings.has(el)) return;
	const cleanups = bindDirectives(el, EMPTY_SCOPE, app);
	if (cleanups.length) globalBindings.set(el, cleanups);
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
			if (owner) found = owner;
		}
	});
	return found;
}
function runCleanups(el, cleanups) {
	for (const cleanup of cleanups) try {
		cleanup();
	} catch (error) {
		err("Cleanup failed for element:", el, error);
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
		if (startEl.closest("[data-rouse-app]") !== app.root) return;
		walkBoundElements(startEl, bindNode, { acceptScopeRoot: startEl === root });
	}
	function teardown(removedEl) {
		if (elementCleanups.has(removedEl)) runCleanup(removedEl);
		const walker = document.createTreeWalker(removedEl, NodeFilter.SHOW_ELEMENT);
		let node = walker.nextNode();
		while (node !== null) {
			const el = node;
			if (elementCleanups.has(el)) runCleanup(el);
			node = walker.nextNode();
		}
	}
	scan(root);
	runHook(instance, "connect", root);
	awakeScopes.set(root, instance);
	dispatchFrom(root, app.root, "rz:scope:connect", {
		instance,
		host: root
	});
	function unbindDom() {
		for (const el of elementCleanups.keys()) runCleanup(el);
		runHook(instance, "disconnect", root);
		awakeScopes.delete(root);
		dispatchFrom(root, app.root, "rz:scope:disconnect", {
			instance,
			host: root
		});
	}
	return {
		unbindDom,
		scan,
		teardown
	};
}

// src/dom/modifiers.ts
const sysModifierMap = {
	ctrl: "ctrlKey",
	alt: "altKey",
	shift: "shiftKey",
	meta: "metaKey"
};
const SYS_MODIFIERS = Object.keys(sysModifierMap);
const SYS_MODIFIER_FLAGS = Object.values(sysModifierMap);
function expectedKeys(key) {
	if (key === void 0) return [];
	return (Array.isArray(key) ? key : [key]).map((k) => k.toLowerCase());
}
function resolveListenerTarget(el, options, app) {
	if (options.listenOn === "window") return window;
	if (options.listenOn === "document") return document;
	if (options.listenOn === "root") return app.root;
	if (options.outside) return document;
	return el;
}
function applyModifiers(e, el, options) {
	if (options.self && e.target !== e.currentTarget) return false;
	if (options.outside && el instanceof Element) {
		if (el.contains(e.target)) return false;
	}
	if (e instanceof KeyboardEvent || e instanceof MouseEvent) {
		const expectedSysModifiers = SYS_MODIFIERS.filter((m) => options[m]);
		for (const mod of expectedSysModifiers) if (!e[sysModifierMap[mod]]) return false;
		const keys = e instanceof KeyboardEvent ? expectedKeys(options.key) : [];
		if (e instanceof KeyboardEvent && expectedSysModifiers.length > 0 && keys.length === 0) return false;
		if (!options.loose && (expectedSysModifiers.length > 0 || keys.length > 0)) {
			const pressed = e instanceof KeyboardEvent ? e.key.toLowerCase() : "";
			const selfFlag = sysModifierMap[pressed === "control" ? "ctrl" : pressed];
			const expectedFlags = expectedSysModifiers.map((m) => sysModifierMap[m]);
			if (SYS_MODIFIER_FLAGS.filter((key) => e[key] && (key !== selfFlag || expectedFlags.includes(key))).length !== expectedFlags.length) return false;
		}
		if (e instanceof KeyboardEvent && keys.length > 0) {
			const pressedKey = e.key.toLowerCase();
			const pressedCode = e.code.toLowerCase();
			if (!keys.some((expected) => {
				if (!expected) return false;
				if (pressedKey === expected) return true;
				if (expected.length === 1) {
					if (expected === " ") return pressedCode === "space";
					return pressedCode === `key${expected}` || pressedCode === `digit${expected}`;
				}
				return false;
			})) return false;
		}
	}
	if (options.prevent) e.preventDefault();
	if (options.stop) e.stopPropagation();
	if (options.stopImmediate) e.stopImmediatePropagation();
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
		if (once) cleanup();
		callback(e);
	};
	const target = resolveListenerTarget(el, triggerOptions, app);
	const cleanup = () => {
		target.removeEventListener(name, listener, capture);
	};
	target.addEventListener(name, listener, {
		capture,
		passive
	});
	return cleanup;
}
function on(target, event, callback, options, app) {
	const { signal, ...modifiers } = options;
	if (signal?.aborted) return () => {};
	let name;
	let arg;
	if (typeof event === "string") {
		name = event.trim();
		if (/\||-\[/.test(name)) warn(`'${name}' looks like Rouse trigger syntax, which isn't parsed in app.on. Pass a trigger's argument with its name and modifiers as options: app.on({ sse: 'late' }, fn, { once: true }).`, target);
	} else {
		const keys = Object.keys(event);
		const [key] = keys;
		if (key === void 0 || keys.length > 1) {
			warn(`app.on expected a trigger source with its argument, such as { interval: '10s' }, but got an object with ${keys.length} keys.`, target);
			return () => {};
		}
		name = key;
		arg = event[key];
	}
	const cleanup = dispatchTrigger({
		event: name,
		options: modifiers
	}, {
		el: target,
		app,
		arg,
		action: typeof callback === "function" ? (e) => callback(e ?? new CustomEvent(name)) : (e) => callback.handleEvent(e ?? new CustomEvent(name)),
		suppressNavigation: false
	});
	signal?.addEventListener("abort", cleanup, { once: true });
	return cleanup;
}
function dispatchTrigger(trigger, base) {
	const timed = applyTiming(base.action, trigger.options);
	const suppressNavigation = base.suppressNavigation ?? true;
	const wrapCleanup = (cleanup) => {
		return () => {
			timed.cancel();
			cleanup?.();
		};
	};
	const source = triggerSources[trigger.event];
	if (source) {
		let arg = base.arg;
		if (trigger.arg !== void 0) {
			const resolved = source.fromArg ? source.fromArg(trigger.arg, base.el) : trigger.arg;
			if (resolved === null) return () => {};
			arg = resolved;
		}
		return wrapCleanup(attachTriggerSource(source.attach, {
			...base,
			arg,
			options: trigger.options,
			action: timed
		}));
	}
	return wrapCleanup(attachListener(base.el, trigger.event, (e) => {
		if (suppressNavigation && isNativeNavigation(base.el, e)) e.preventDefault();
		timed(e);
	}, trigger.options, base.app));
}
function attachTriggerSource(handler, ctx) {
	if (!ctx.options.once) return handler(ctx);
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
	if (fired) cleanup?.();
	return cleanup;
}
function attachWakeStrategies(el, app, triggers, onWake) {
	let pending = triggers.length;
	if (pending === 0) {
		onWake();
		return () => {};
	}
	let isAwake = false;
	let cleanups = [];
	const teardown = () => cleanups.forEach((cleanup) => cleanup());
	const satisfy = () => {
		pending--;
		if (pending === 0) {
			isAwake = true;
			teardown();
			onWake();
		}
	};
	cleanups = triggers.map((trigger) => {
		let satisfied = false;
		return dispatchTrigger(trigger, {
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
	if (isAwake) teardown();
	return () => {
		if (!isAwake) teardown();
	};
}
const triggerSources = {
	ready: { attach: ({ app, action }) => {
		if (app.isReady) {
			action();
			return null;
		}
		app.root.addEventListener("rz:app:ready", action, { once: true });
		return () => app.root.removeEventListener("rz:app:ready", action);
	} },
	wake: { attach: ({ el, app, action }) => {
		const scopeEl = closestScope(el, app);
		if (!scopeEl) {
			warn(`The 'wake' trigger requires an enclosing scope element.`, el);
			return null;
		}
		if (!getApp(scopeEl, app)) return null;
		if (scopeEl === el && gatesOnWake(el)) warn(`The 'wake' trigger can't be used to wake its own scope element.`, el);
		if (isScopeAwake(scopeEl)) action();
		const onConnect = (e) => {
			if (e.target === scopeEl) action(e);
		};
		scopeEl.addEventListener("rz:scope:connect", onConnect);
		return () => scopeEl.removeEventListener("rz:scope:connect", onConnect);
	} },
	none: { attach: () => null },
	timeout: { attach: (ctx) => attachTimingSource("timeout", ctx) },
	interval: { attach: (ctx) => attachTimingSource("interval", ctx) },
	media: { attach: ({ el, arg: query, action }) => {
		if (typeof query !== "string" || !query) {
			warn(`The 'media' trigger requires a query: 'media-[(min-width: 640px)]' in HTML, or { media: '(min-width: 640px)' } from app.on.`, el);
			return null;
		}
		const mql = window.matchMedia(query);
		if (mql.media === "not all" && query !== "not all") warn(`Invalid media query '${query}'. It will never match.`, el);
		if (mql.matches) action();
		const changeHandler = (e) => {
			if (e.matches) action();
		};
		mql.addEventListener("change", changeHandler);
		return () => mql.removeEventListener("change", changeHandler);
	} },
	intersect: {
		fromArg: (arg) => Number.parseFloat(arg),
		attach: ({ el, arg, action }) => {
			let threshold = arg ?? 0;
			if (typeof threshold !== "number" || !(threshold >= 0 && threshold <= 1)) {
				warn(`Invalid intersect threshold '${arg}'. Use a number from 0 to 1.`, el);
				threshold = 0;
			}
			const observer = new IntersectionObserver((entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting || entry.intersectionRatio < threshold) continue;
					action();
					break;
				}
			}, { threshold });
			observer.observe(el);
			return () => observer.disconnect();
		}
	},
	interact: { attach: ({ el, action }) => {
		const events = ["pointerover", "focusin"];
		events.forEach((evt) => el.addEventListener(evt, action, { passive: true }));
		return () => events.forEach((evt) => el.removeEventListener(evt, action));
	} },
	sse: { attach: ({ el, app, arg: name, options, action }) => {
		if (typeof name !== "string" || !name) {
			warn(`The 'sse' trigger requires an event name: 'sse-[cart-updated]' in HTML, or { sse: 'cart-updated' } from app.on.`, el);
			return null;
		}
		subscribeNamed(name);
		const target = resolveListenerTarget(el, options, app);
		const handler = (e) => {
			const { detail } = e;
			if (detail.event === name) action(e);
		};
		target.addEventListener("rz:sse:message", handler);
		return () => target.removeEventListener("rz:sse:message", handler);
	} },
	idle: { attach: ({ action }) => {
		if (typeof window.requestIdleCallback === "function") {
			const id = window.requestIdleCallback(() => action());
			return () => window.cancelIdleCallback(id);
		}
		const id = window.setTimeout(action, 1);
		return () => window.clearTimeout(id);
	} },
	edit: {
		fromArg: (arg) => arg.startsWith("@") ? arg.slice("@".length) : void 0,
		attach: ({ el, app, arg: path, action }) => {
			if (typeof path !== "string" || !path) {
				warn(`The 'edit' trigger requires a store, e.g. 'edit-[@cart]' in HTML, or { edit: 'cart' } from app.on.`, el);
				return null;
			}
			if (path.startsWith("@")) {
				warn(`The 'edit' trigger takes a store without '${"@"}' from app.on: { edit: '${path.slice("@".length)}' }.`, el);
				return null;
			}
			const ref = parseStoreRef(`${"@"}${path}`);
			if (!ref) return null;
			const rootKey = getPathRoot(ref.nestedPath);
			return app.stores._onEdit(ref.source, (roots) => {
				if (!rootKey || roots.has(rootKey)) action();
			});
		}
	}
};
function attachTimingSource(type, ctx) {
	const delay = ctx.arg;
	if (delay === void 0 || delay === "") {
		warn(`The '${type}' trigger requires a delay: '${type}-[5s]' in HTML, or { ${type}: '5s' } from app.on.`, ctx.el);
		return null;
	}
	const ms = parseTime(delay);
	if (ms <= 0) return null;
	const setup = type === "timeout" ? window.setTimeout : window.setInterval;
	const clear = type === "timeout" ? window.clearTimeout : window.clearInterval;
	const id = setup(ctx.action, ms);
	return () => clear(id);
}
function gatesOnWake(el) {
	const value = getDirectiveValue(el, "wake");
	return !!value && parseTriggers(value).some((trigger) => trigger.event === "wake");
}

// src/core/keys.ts
const session = Date.now().toString(36);
let count = 46656;
function createKey(prefix = "rz_") {
	return prefix + session + (count++).toString(36);
}

// src/dom/forms.ts
const BUTTON_TYPES = /* @__PURE__ */ new Set([
	"submit",
	"button",
	"reset",
	"image"
]);
function isField(el) {
	return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
}
function isFieldContainer(el) {
	return el instanceof HTMLFormElement || el instanceof HTMLFieldSetElement;
}
function readField(field) {
	if (field.type === "radio" && field.name) {
		const checked = (field.closest("form") || document).querySelector(`input[type="radio"][name="${CSS.escape(field.name)}"]:checked`);
		return checked ? submittedValue(checked) : null;
	}
	return submittedValue(field);
}
function collectFields(elements) {
	const fields = /* @__PURE__ */ new Set();
	for (const el of elements) for (const member of isFieldContainer(el) ? el.elements : [el]) if (isField(member) && !BUTTON_TYPES.has(member.type)) fields.add(member);
	const pairs = {};
	const named = /* @__PURE__ */ new Set();
	const shared = /* @__PURE__ */ new Set();
	for (const field of fields) {
		if (field.name && field.type !== "radio") (named.has(field.name) ? shared : named).add(field.name);
		const value = submittedValue(field);
		if (value !== null) appendValue(pairs, field.name, value);
	}
	for (const name of shared) {
		const value = pairs[name];
		if (value !== void 0 && !Array.isArray(value)) pairs[name] = [value];
	}
	return pairs;
}
function readTriggerValues(el, submitter = null) {
	if (isField(el)) {
		const value = readField(el);
		return value === null ? null : { [el.name]: value };
	}
	return isFieldContainer(el) ? {
		...collectFields([el]),
		...readSubmitter(submitter)
	} : null;
}
function readSubmitter(submitter) {
	return (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) && submitter.name ? { [submitter.name]: submitter.value } : {};
}
function submittedValue(field) {
	if (!field.name || field.matches(":disabled")) return null;
	if (field instanceof HTMLInputElement) {
		if ((field.type === "checkbox" || field.type === "radio") && !field.checked) return null;
		if (field.type === "file") {
			const files = Array.from(field.files ?? []);
			if (!files.length) return null;
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
function getConfig$6(el, app, submitter = null) {
	const scope = resolveOwnerState(el, app.root);
	const payload = { ...readTriggerValues(el, submitter) };
	for (const [entry, val] of parseDirectiveValue(getDirectiveValue(el, "send"))) if (val === null) Object.assign(payload, readSource(entry, el, scope, app));
	else if (entry === "selector") Object.assign(payload, readSelector(val, el, app));
	else warn(`rz-send: unknown key '${entry}'. The only key is 'selector'.`, el);
	return payload;
}
function readSource(entry, el, scope, app) {
	const lead = entry[0];
	if (lead === "{") return readJson(entry, el);
	if (lead === "@") return parseStoreRef(entry, "send") ? readState(entry, el, scope, app) : null;
	if (lead === "%") {
		if (parseDataSourcePath(entry).namespace) {
			warn(`rz-send: '${entry}' is render metadata, not item data. Use '%' or a field like '%.id'.`, el);
			return null;
		}
		return readState(entry, el, scope, app);
	}
	if (/^[A-Za-z_$]/.test(entry)) return readState(entry, el, scope, app);
	warn(/^[#.[:*]/.test(entry) ? `rz-send: '${entry}' looks like a selector. Write 'selector: ${entry}'.` : `rz-send: '${entry}' is not a source.`, el);
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
	if ((path[0] === "@" || path[0] === "%") && !parseDataSourcePath(path).nestedPath) {
		if (isPlainObject(data)) return data;
		warn(`rz-send: '${path}' has no fields to send.`, el);
		return null;
	}
	return { [path.slice(path.lastIndexOf(".") + 1)]: data };
}
function readSelector(selector, el, app) {
	if (/^[@%{]/.test(selector)) {
		warn(`rz-send: '${selector}' isn't a selector. Write state references and JSON without 'selector:'.`, el);
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
	for (const match of matches) if (isField(match) ? !match.name : !isFieldContainer(match)) warn(isField(match) ? `rz-send: '${selector}' matched a field with no name to send its value under.` : `rz-send: '${selector}' matched an element that isn't a field, form, or fieldset.`, match);
}
const rzSend = { getConfig: getConfig$6 };

// src/directives/rz-indicator.ts
function getConfig$5(el) {
	const value = getDirectiveValue(el, "indicator")?.trim();
	if (!value) return void 0;
	if (value === "null") return null;
	return stripQuotes(value) || void 0;
}
const rzIndicator = { getConfig: getConfig$5 };

// src/net/lifecycle.ts
const PREVENTED = Symbol("rz.prevented");
const REQUEST_CLASS = "rouse-request";
const inFlight = /* @__PURE__ */ new WeakMap();
const heldDisabled = /* @__PURE__ */ new WeakMap();
async function runRequestLifecycle(opts) {
	const { el, root, prefix, configDetail, terminalDetail, run } = opts;
	if (dispatchFrom(el, root, `${prefix}:config`, configDetail, { cancelable: true }).defaultPrevented) return PREVENTED;
	const indicators = resolveIndicators(el, root, configDetail.config.indicator);
	const disabled = holdDisabled(resolveDisabled(configDetail.config.triggerEl ?? (el === root ? null : el), root));
	trackInFlight(indicators, 1);
	dispatchFrom(el, root, `${prefix}:start`, configDetail);
	let released = false;
	const release = () => {
		if (released) return;
		released = true;
		releaseDisabled(disabled);
	};
	let settled = false;
	const settle = (result) => {
		if (settled) return;
		settled = true;
		release();
		if (result.error?.code === "CANCELED") {
			dispatchFrom(el, root, `${prefix}:abort`, configDetail);
			return;
		}
		if (result.error) {
			dispatchFrom(el, root, `${prefix}:error`, terminalDetail(result));
			return;
		}
		dispatchFrom(el, root, `${prefix}:success`, terminalDetail(result));
		const trigger = result.headers?.["rouse-trigger"];
		if (trigger) dispatchFrom(el, root, trigger, result);
	};
	try {
		return await run({ settle });
	} finally {
		trackInFlight(indicators, -1);
		release();
		dispatchFrom(el, root, `${prefix}:end`, configDetail);
	}
}
function resolveIndicators(el, root, indicator) {
	const resolved = indicator === void 0 ? rzIndicator.getConfig(el) : indicator;
	if (resolved === void 0) return [el];
	if (resolved === null) return [];
	if (typeof resolved === "string") {
		const els = queryTargets(root, resolved);
		if (!els.length) warn(`No request indicator applied. Selector '${resolved}' does not match any elements.`, ...el === root ? [] : [el]);
		return els;
	}
	if (resolved?.nodeType === Node.ELEMENT_NODE) return [resolved];
	warn(`No request indicator applied. Expected an element, a selector, or null. Got: ${Array.isArray(resolved) ? "array" : typeof resolved}.`, ...el === root ? [] : [el]);
	return [];
}
function resolveDisabled(host, root) {
	if (!host) return [];
	const selector = rzDisable.getConfig(host);
	if (selector === void 0) return [];
	const els = selector === "" ? [host] : queryTargets(root, selector);
	if (!els.length) warn(`rz-disable: selector '${selector}' does not match any elements.`, host);
	return els.filter((match) => {
		if ("disabled" in match) return true;
		warn(`rz-disable: <${match.localName}> can't be disabled. Name a form control or a fieldset.`, match, host);
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
function getConfig$4(el) {
	const value = getDirectiveValue(el, "headers");
	if (!value) return {};
	const headers = {};
	if (value.startsWith("{")) {
		try {
			for (const [k, v] of Object.entries(safeJSONParse(value))) headers[k] = v == null ? null : String(v);
		} catch {
			warn(`rz-headers: value is not valid JSON: ${value}`, el);
		}
		return headers;
	}
	for (const [key, val] of parseDirectiveValue(value)) {
		if (val === null) {
			warn(`rz-headers: header '${key}' has no value. Write '${key}: <value>', or '${key}: null' to remove it.`, el);
			continue;
		}
		headers[key] = val === "null" ? null : val;
	}
	return headers;
}
const rzHeaders = { getConfig: getConfig$4 };

// src/directives/rz-request.ts
const KEYS = {
	timeout: "duration",
	"abort-key": "string",
	credentials: "string",
	keepalive: "boolean",
	redirect: "string",
	cache: "string"
};
function getConfig$3(el) {
	const value = getDirectiveValue(el, "request");
	if (!value) return {};
	const config = {};
	for (const [key, rawVal] of parseDirectiveValue(value)) {
		const type = KEYS[key];
		if (!type) {
			warn(key === "headers" || key === "indicator" ? `rz-request: '${key}' belongs on data-rz-${key}. Ignoring.` : key === "method" ? `rz-request: 'method' belongs in the data-rz-fetch subject, as in 'click: POST /save'. Ignoring.` : `rz-request: unknown key '${key}'. Ignoring.`, el);
			continue;
		}
		const val = rawVal ?? "";
		config[kebabToCamel(key)] = type === "boolean" ? val === "true" || val === "" : type === "duration" ? parseTime(val) : val;
	}
	return config;
}
function kebabToCamel(str) {
	return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
const rzRequest = { getConfig: getConfig$3 };

// src/net/response.ts
async function normalizeResponse(response, config) {
	let data = null;
	let error = null;
	const parsedHeaders = Object.fromEntries(response.headers.entries());
	try {
		const contentType = response.headers.get("Content-Type") || "";
		const contentLength = response.headers.get("Content-Length");
		if (!(response.status === 204 || response.status === 205 || contentLength === "0")) {
			if (contentType.includes("text/event-stream")) {
				response.body?.cancel();
				error = {
					message: "Cannot read an event stream as a response. Open it with rz-sse.",
					code: "PARSE_ERROR"
				};
			} else if (isJsonType(contentType)) {
				const text = await response.text();
				if (text) data = JSON.parse(text);
			} else if (contentType.includes("text/") || contentType.includes("xml")) data = await response.text();
			else data = await response.blob();
		}
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		data = null;
		error = {
			message: errorMessage,
			code: "PARSE_ERROR"
		};
	}
	if (!response.ok) error = {
		message: response.statusText || "Request failed",
		code: response.status,
		body: data ?? void 0,
		parseError: error?.code === "PARSE_ERROR" ? error.message : void 0
	};
	return {
		data,
		error,
		response,
		headers: parsedHeaders,
		status: response.status,
		config
	};
}
function mapCatchError(error, abortCode = null) {
	const code = abortCode ?? "NETWORK_ERROR";
	return {
		message: code === "TIMEOUT" ? "Request timed out" : code === "CANCELED" ? "Request canceled" : error instanceof Error && error.message || "Network error",
		code,
		original: error
	};
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
	return errorResponse(config, {
		message,
		code
	});
}
function isJsonType(val) {
	return val.includes("application/json") || val.includes("+json");
}
function isFileType(data) {
	return data instanceof Blob || data instanceof ArrayBuffer;
}

// src/net/request.ts
const abortRegistry = /* @__PURE__ */ new Map();
async function request(config, app) {
	if (!config.skipInterceptors) try {
		for (const fn of app._interceptors.request) Object.assign(config, await fn(config));
	} catch (e) {
		const error = await runErrorInterceptors(mapCatchError(e), config, app);
		return errorResponse(config, error);
	}
	const { finalUrl, method, reqHeaders, finalBody, restOptions } = preparePayload(config, app.config.baseUrl);
	const { timeout = 0, abortKey, triggerEl: _triggerEl, signal: externalSignal, method: _method, ...fetchOptions } = restOptions;
	let controller = null;
	if (abortKey) {
		abortRegistry.get(abortKey)?.abort("Replacement request started");
		controller = new AbortController();
		abortRegistry.set(abortKey, controller);
	}
	const cancelSignals = [controller?.signal, externalSignal].filter((s) => s != null);
	const isCanceled = () => cancelSignals.some((s) => s.aborted);
	const combinedSignal = AbortSignal.any(timeout > 0 ? [...cancelSignals, AbortSignal.timeout(timeout)] : cancelSignals);
	try {
		const response = await fetch(finalUrl, {
			method,
			headers: reqHeaders,
			signal: combinedSignal,
			...fetchOptions,
			...finalBody != null ? { body: finalBody } : {}
		});
		const normalized = await normalizeResponse(response, config);
		if (!config.skipInterceptors) {
			if (normalized.error) normalized.error = await runErrorInterceptors(normalized.error, config, app);
			else for (const fn of app._interceptors.response) normalized.data = await fn(normalized.data, normalized.response, config);
		}
		return normalized;
	} catch (err) {
		const abortCode = isCanceled() ? "CANCELED" : combinedSignal.aborted ? "TIMEOUT" : null;
		let errorPayload = mapCatchError(err, abortCode);
		if (!config.skipInterceptors) errorPayload = await runErrorInterceptors(errorPayload, config, app);
		return errorResponse(config, errorPayload);
	} finally {
		if (abortKey && abortRegistry.get(abortKey) === controller) abortRegistry.delete(abortKey);
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
	for (const fn of app._interceptors.error) error = await fn(error, config);
	return error;
}

// src/net/fetch-engine.ts
const abortKeys = /* @__PURE__ */ new WeakMap();
const writesInFlight = /* @__PURE__ */ new Set();
async function runFetch(app, options) {
	const triggerEl = options.triggerEl ?? null;
	const hostEl = triggerEl ?? app.root;
	try {
		if (triggerEl) {
			if (!triggerEl.isConnected) {
				abortKeys.delete(triggerEl);
				return fallbackResponse(options, "Element disconnected from DOM");
			}
			if (isDisabled(triggerEl)) return fallbackResponse(options, "Element is disabled");
		}
		const submitter = triggerEl instanceof HTMLFormElement ? options.submitter ?? null : null;
		const rawUrl = submitter?.getAttribute("formaction") ?? options.url;
		if (!rawUrl) {
			warn("Invalid or missing URL for the fetch request.", ...triggerEl ? [triggerEl] : []);
			return fallbackResponse(options, "Invalid or missing URL for the fetch request.", "INTERNAL_ERROR");
		}
		const url = resolveUrl(rawUrl, app.config.baseUrl).href;
		const finalRequestInit = resolveRequestConfig(triggerEl, app);
		const formMethod = triggerEl instanceof HTMLFormElement ? triggerEl.getAttribute("method") : void 0;
		const method = (submitter?.getAttribute("formmethod") || options.method || formMethod || "GET").toUpperCase();
		const abortKey = options.abortKey || finalRequestInit.abortKey || (triggerEl ? getAbortKey(triggerEl) : void 0);
		if (abortKey && writesInFlight.has(abortKey)) return fallbackResponse(options, "A write is in flight for this abort key");
		const headers = {
			...finalRequestInit.headers,
			...options.headers
		};
		const hasExplicitBody = options.body !== void 0;
		const payload = triggerEl && !hasExplicitBody ? resolvePayload(triggerEl, submitter, method, headers, app) : {};
		if (triggerEl && hasExplicitBody && hasDirective(triggerEl, "send")) warn("rz-send: ignored because a body was passed to app.fetch().", triggerEl);
		const finalOptions = {
			...finalRequestInit,
			...options,
			...payload,
			url,
			method,
			headers: payload.headers ?? headers,
			params: {
				...payload.params,
				...options.params
			},
			abortKey
		};
		if (!triggerEl && finalOptions.indicator === void 0) finalOptions.indicator = null;
		const outcome = await runRequestLifecycle({
			el: hostEl,
			root: app.root,
			prefix: "rz:fetch",
			configDetail: { config: finalOptions },
			terminalDetail: (result) => result,
			run: async (handle) => {
				const key = finalOptions.abortKey;
				const marked = key && !isSafeMethod(finalOptions.method) && !writesInFlight.has(key) ? key : null;
				if (marked) writesInFlight.add(marked);
				try {
					return await sendAndRoute(hostEl, triggerEl, finalOptions, app, handle);
				} finally {
					if (marked) writesInFlight.delete(marked);
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
		if (rouseHeaders.place) result.placeOverride = rouseHeaders.place;
		if (rouseHeaders.deposit) result.depositOverride = rouseHeaders.deposit;
		handle.settle(result);
		if (result.error) {
			const { code } = result.error;
			if (code !== "CANCELED" && code !== "REDIRECTED" && result.response) routePayload(hostEl, app, result, "error");
			return result;
		}
		if (result.response) routePayload(hostEl, app, result, "success");
		return result;
	} catch (error) {
		err("Fetch failed unexpectedly.", hostEl, error);
		const fallback = fallbackResponse(options, error.message || "Internal Error", "INTERNAL_ERROR");
		handle.settle(fallback);
		return fallback;
	}
}
function resolvePayload(el, submitter, method, headers, app) {
	const payload = hasDirective(el, "send") ? rzSend.getConfig(el, app, submitter) : readTriggerValues(el, submitter);
	if (!payload) return {};
	if (method === "GET" || method === "HEAD") return { params: toParams(toFormPairs(payload, el, false)) };
	const encoding = resolveEncoding(el, submitter, headers);
	if (encoding === "json") return { body: dropFiles(payload, el) };
	const pairs = toFormPairs(payload, el, encoding === "multipart");
	if (encoding === "urlencoded") return { body: new URLSearchParams(pairs) };
	const body = new FormData();
	pairs.forEach(([key, val]) => body.append(key, val));
	return {
		body,
		headers: withoutContentType(headers)
	};
}
function resolveEncoding(el, submitter, headers) {
	const declared = declaredContentType(headers);
	if (declared) {
		const mime = declared.replace(/;.*$/s, "").trim().toLowerCase();
		if (isJsonType(mime)) return "json";
		if (mime === "multipart/form-data") return "multipart";
		if (mime !== "application/x-www-form-urlencoded") warn(`Content-Type '${declared}' isn't an encoding Rouse can build. Sending form data under it.`, el);
		return "urlencoded";
	}
	if (!(el instanceof HTMLFormElement)) return "urlencoded";
	return ((submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) && submitter.hasAttribute("formenctype") ? submitter.formEnctype : el.enctype) === "multipart/form-data" ? "multipart" : "urlencoded";
}
function declaredContentType(headers) {
	let type = null;
	for (const [key, val] of Object.entries(headers)) if (key.toLowerCase() === "content-type") type = val;
	return type;
}
function withoutContentType(headers) {
	return Object.fromEntries(Object.entries(headers).map(([key, val]) => [key, key.toLowerCase() === "content-type" ? null : val]));
}
function toFormPairs(payload, el, keepFiles) {
	return Object.entries(payload).flatMap(([key, val]) => (Array.isArray(val) ? val : [val]).flatMap((item) => {
		if (item == null) return [];
		if (item instanceof File) {
			if (keepFiles) return [[key, item]];
			warn(`File in '${key}' needs a multipart encoding to be sent. Sending its name.`, el);
			return [[key, item.name]];
		}
		if (typeof item === "object") {
			warn(`'${key}' holds an object, which form data can't carry. Ignoring it.`, el);
			return [];
		}
		return [[key, String(item)]];
	}));
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
	return Object.fromEntries(Object.entries(payload).flatMap(([key, val]) => {
		const items = Array.isArray(val) ? val : [val];
		if (!items.some((item) => item instanceof File)) return [[key, val]];
		warn(`File in '${key}' can't be sent as JSON. Ignoring it.`, el);
		const rest = items.filter((item) => !(item instanceof File));
		return Array.isArray(val) && rest.length ? [[key, rest]] : [];
	}));
}
function followRedirect(el, url) {
	if (el) abortKeys.delete(el);
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
function routePayload(hostEl, app, result, type) {
	const data = result.data;
	const kind = data == null && result.placeOverride ? "html" : payloadKind(data);
	if (kind === null) {
		if (data != null) warn(`Unsupported payload: '${data?.constructor?.name || typeof data}'.`);
		return;
	}
	if (result.placeOverride && kind !== "html") warn(`Rouse-Place applies only to HTML responses, but this one was routed as ${kind === "json" ? "JSON" : "a file"}. Ignoring it.`, hostEl);
	if (result.depositOverride && kind !== "json") warn(`Rouse-Deposit applies only to JSON responses, but this one was routed as ${kind === "html" ? "HTML" : "a file"}. Ignoring it.`, hostEl);
	if (typeof data === "string") {
		const contentType = result.response?.headers.get("Content-Type") || "";
		if (isJsonType(contentType)) warn(`Content-Type is JSON but data is a string. Defaulting to HTML.`);
	}
	dispatchFrom(hostEl, app.root, `rz:fetch:${type}:${kind}`, result);
}
function payloadKind(data) {
	if (isFileType(data)) return "file";
	if (Array.isArray(data) || isPlainObject(data)) return "json";
	if (typeof data === "string") return "html";
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
	if (pushUrl && replaceUrl) warn(`Both 'Rouse-Push-Url' and 'Rouse-Replace-Url' present. Using Push.`);
	if (!isSameOrigin(url)) {
		warn(`'${pushUrl ? "Rouse-Push-Url" : "Rouse-Replace-Url"}' rejected: cross-origin URL '${url}'.`);
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
			if (cleanups.length > 0) elementCleanups.set(el, cleanups);
		},
		teardown(el) {
			elementCleanups.get(el)?.forEach((fn) => fn());
			elementCleanups.delete(el);
		}
	};
}

// src/directives/rz-fetch.ts
function nativeUrl(el) {
	if (el instanceof HTMLAnchorElement) return el.getAttribute("href") ?? "";
	if (el instanceof HTMLFormElement) return el.getAttribute("action") ?? "";
	return "";
}
function warnMissingUrl(el) {
	warn(`rz-fetch: no URL found. Configure it using data-rz-fetch (with at least one leading trigger), or a native 'href', 'action', or 'formaction' attribute.`, el);
}
function bindFetchPairs(el, app, pairs) {
	const elementUrl = nativeUrl(el);
	const deferUrl = el instanceof HTMLFormElement;
	let warnedMissingUrl = false;
	return pairs.flatMap(({ trigger, subject }) => {
		const parsed = subject ? parseFetchSubject(subject) : {};
		const url = parsed.url || elementUrl;
		if (!url && !deferUrl) {
			if (!warnedMissingUrl) {
				warnMissingUrl(el);
				warnedMissingUrl = true;
			}
			return [];
		}
		return [dispatchTrigger(trigger, {
			el,
			app,
			action: (e) => {
				const submitter = e instanceof SubmitEvent ? e.submitter : null;
				if (!url && !submitter?.getAttribute("formaction")) {
					warnMissingUrl(el);
					return;
				}
				runFetch(app, {
					...parsed,
					url,
					triggerEl: el,
					submitter
				});
			}
		})];
	});
}
const rzFetch = defineNetworkOpDirective("fetch", bindFetchPairs);

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
const rzHtml = defineBoundWriterDirective("html", (el, _key, val) => updateHtml(el, val), { singleValue: true });

// src/directives/rz-key.ts
function getConfig$2(el) {
	return getDirectiveValue(el, "key")?.trim() || null;
}
const rzKey = { getConfig: getConfig$2 };

// src/directives/rz-model.ts
function modelDefaultTrigger(el) {
	const def = (event) => ({
		event,
		options: {}
	});
	if (el instanceof HTMLTextAreaElement || el.isContentEditable) return def("input");
	if (el instanceof HTMLInputElement) return el.type === "checkbox" || el.type === "radio" ? def("change") : def("input");
	if (el instanceof HTMLSelectElement) return def("change");
	return null;
}
function bind$3(el, scope, app, key, value) {
	const subject = value || key;
	let triggers;
	if (value) triggers = parseTriggers(key);
	else {
		const def = modelDefaultTrigger(el);
		if (!def) {
			warn(`rz-model: an explicit trigger is required when used on <${el.tagName.toLowerCase()}> (e.g., data-rz-model="input: value").`, el);
			return;
		}
		triggers = [def];
	}
	const action = () => writeState(subject, getModelableValue(el), scope, app.stores);
	const cleanups = [effect(() => {
		setModelableValue(el, resolveState(subject, scope, app.stores));
	}), ...triggers.map((trigger) => dispatchTrigger(trigger, {
		el,
		app,
		action
	}))];
	return (() => cleanups.forEach((fn) => fn()));
}
const rzModel = {
	slug: "model",
	selector: directiveSelector("model"),
	singleValue: true,
	bind: bind$3
};

// src/directives/rz-on.ts
function bind$2(el, scope, app, key, value) {
	if (!value) {
		warn(`rz-on: value '${key}' is incomplete; at least one trigger and a handler are required.`, el);
		return;
	}
	const methodName = value.trim();
	let method;
	let context;
	if (methodName.startsWith("@")) {
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
	const cleanups = parseTriggers(key).map((trigger) => dispatchTrigger(trigger, {
		el,
		app,
		action: (e) => invokeHandler(method, context, methodName, scope, el, e ?? new CustomEvent(trigger.event))
	}));
	return (() => cleanups.forEach((fn) => fn()));
}
const rzOn = {
	slug: "on",
	selector: directiveSelector("on"),
	bind: bind$2
};

// src/directives/rz-place.ts
function getConfig$1(el, appRoot, overrideValue) {
	const value = overrideValue || getDirectiveValue(el, "place");
	if (value?.trim() === "null") return [];
	return resolvePlacements(value, el, appRoot, !!overrideValue);
}
function resolvePlacements(value, hostEl, appRoot, fromOverride) {
	const parsed = value?.trim() ? parseDirectiveValue(value) : [];
	if (parsed.length === 0) {
		if (hostEl instanceof HTMLScriptElement) return [];
		return [{
			targets: [hostEl],
			position: DEFAULT_PLACE_POSITION
		}];
	}
	const placements = [];
	for (const [key, val] of parsed) {
		const store = key.startsWith("@") ? key : val;
		if (store?.startsWith("@")) {
			warn(`${placeLabel(fromOverride)}: '${store}' names a store. Use ${fromOverride ? "Rouse-Deposit" : "data-rz-deposit"} for store targets.`, hostEl);
			continue;
		}
		if (val) {
			const position = isPlacePosition(key) ? key : DEFAULT_PLACE_POSITION;
			if (position !== key) warn(`${placeLabel(fromOverride)}: unknown position '${key}'. Using '${DEFAULT_PLACE_POSITION}'. Positions are case-sensitive: ${PLACE_POSITIONS.join(", ")}.`, hostEl);
			placements.push({
				position,
				targets: queryPlaceTargets(appRoot, val, hostEl, fromOverride)
			});
		} else if (isPlacePosition(key)) placements.push({
			targets: [hostEl],
			position: key
		});
		else placements.push({
			targets: queryPlaceTargets(appRoot, key, hostEl, fromOverride),
			position: DEFAULT_PLACE_POSITION
		});
	}
	return placements;
}
function queryPlaceTargets(root, selector, hostEl, fromOverride = false) {
	const targets = queryTargets(root, selector);
	if (targets.length === 0) {
		if (hostEl) warn(`${placeLabel(fromOverride)}: no targets found for '${selector}'.`, hostEl);
		else warn(`No targets found for '${selector}' in app.place().`);
	}
	return targets;
}
function placeLabel(fromOverride) {
	return fromOverride ? "Rouse-Place" : "rz-place";
}
const rzPlace = { getConfig: getConfig$1 };

// src/directives/rz-prop.ts
const rzProp = defineBoundWriterDirective("prop", (el, key, val) => updateProp(el, key, val));

// src/directives/bind-store-pairs.ts
function bindStorePairs(op, el, app, pairs) {
	if (!hasDirective(el, "fetch") && !hasDirective(el, "store")) {
		if (hasDirective(el, "headers")) warn(`rz-${op}: data-rz-headers is ignored. Set headers on the store's <script> element.`, el);
		if (hasDirective(el, "request")) warn(`rz-${op}: data-rz-request is ignored. It only applies to rz-fetch.`, el);
		if (hasDirective(el, "send")) warn(`rz-${op}: data-rz-send is ignored. It only applies to rz-fetch.`, el);
	}
	return pairs.flatMap(({ trigger, subject }) => {
		const storeName = resolveTarget(el, op, subject);
		if (!storeName) return [];
		const isEdit = trigger.event === "edit";
		const sync = () => triggerStoreSync(op, el, app, storeName);
		return [dispatchTrigger(trigger, {
			el,
			app,
			action: isEdit ? () => {
				if (app.stores.isDirty(storeName)) sync();
			} : sync
		})];
	});
}
function resolveTarget(el, op, subject) {
	if (!subject) {
		warn(`rz-${op}: missing store reference. Name the store, as in 'click: @cart'.`, el);
		return null;
	}
	if (!subject.startsWith("@")) {
		warn(`rz-${op}: target '${subject}' must be a store reference (e.g., '@cart').`);
		return null;
	}
	const target = parseStoreRef(subject, op);
	if (!target) return null;
	const { source: storeName, nestedPath } = target;
	if (!storeName) {
		warn(`rz-${op}: invalid store reference '${subject}'.`);
		return null;
	}
	if (nestedPath) {
		warn(`rz-${op}: '${subject}' names a path, but a store syncs as a whole. Use '@${storeName}'.`, el);
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
		if (op === "push") app.stores._deferPush(storeName, () => triggerStoreSync(op, triggerEl, app, storeName));
		return;
	}
	app.stores[op](storeName, { triggerEl });
}

// src/directives/rz-pull.ts
const rzPull = defineNetworkOpDirective("pull", (el, app, pairs) => bindStorePairs("pull", el, app, pairs));

// src/directives/rz-push.ts
const rzPush = defineNetworkOpDirective("push", (el, app, pairs) => bindStorePairs("push", el, app, pairs));

// src/dom/renderer.ts
function normalize(value) {
	if (Array.isArray(value)) return {
		mode: "array",
		items: value.map((item, index) => ({
			item,
			index
		}))
	};
	if (typeof value === "number") {
		const n = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
		return {
			mode: "number",
			items: Array.from({ length: n }, (_, index) => ({
				item: value,
				index
			}))
		};
	}
	if (isPlainObject(value)) return {
		mode: "object",
		items: [{
			item: value,
			index: 0
		}]
	};
	return {
		mode: "boolean",
		items: value ? [{
			item: value,
			index: 0
		}] : []
	};
}
function keyFor(plan, mode, keyPath, onMissing) {
	if (mode === "boolean" || mode === "number" || !keyPath) return plan.index;
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
		if (ref.nextSibling !== node) parent.insertBefore(node, ref.nextSibling);
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
		const elementRoots = roots.filter((n) => n.nodeType === Node.ELEMENT_NODE);
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
		const ctx = new Proxy(parentState, { get(t, k) {
			return k === RENDER_FRAME ? frame : Reflect.get(t, k, t);
		} });
		elementRoots.forEach((root) => markRenderOwned(root, ctx));
		const cleanups = untracked(() => collected.flatMap((e) => bindDirectives(e, ctx, app)));
		const item = plan.item;
		const rt = item && typeof item === "object" ? getRaw(item).renderTarget : void 0;
		let target = null;
		if (typeof rt === "string" && rt) {
			target = app.root.querySelector(rt);
			if (!target) warn(`rz-render: render target '${rt}' not found.`);
		} else if (rt instanceof Element) {
			if (app.root.contains(rt)) target = rt;
			else warn(`rz-render: render target is outside the app root; ignoring.`, rt);
		}
		target?.append(...roots);
		const teardown = () => {
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
			teardown
		};
	}
	function teardownAll() {
		for (const rec of records.values()) rec.teardown();
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
		const onMissing = () => missing++;
		const seen = /* @__PURE__ */ new Set();
		for (const plan of normalized.items) {
			const instanceKey = keyFor(plan, normalized.mode, keyPath, onMissing);
			if (seen.has(instanceKey)) {
				dups++;
				firstDup ??= instanceKey;
				continue;
			}
			seen.add(instanceKey);
			let rec = records.get(instanceKey);
			if (rec) {
				if (rec.item !== plan.item) {
					rec.item = plan.item;
					rec.itemSig(reactive(plan.item));
				}
				if (rec.indexSig() !== plan.index) rec.indexSig(plan.index);
			} else {
				rec = buildInstance(plan);
				records.set(instanceKey, rec);
			}
			if (!rec.target) prev = placeAfter(parent, rec.roots, prev);
		}
		if (missing > 0 && !keyWarned) {
			keyWarned = true;
			warn(`rz-key: '${keyPath}' could not be resolved on ${missing} item(s). Positional keys used.`);
		}
		if (dups > 0 && !dupWarned) {
			dupWarned = true;
			warn(`rz-key: skipped ${dups} item(s) with duplicate '${keyPath}' values. First collision: '${firstDup}'.`);
		}
		for (const [k, rec] of records) if (!seen.has(k)) {
			rec.teardown();
			records.delete(k);
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
function bind$1(el, scope, app, key, value) {
	if (!(el instanceof HTMLTemplateElement)) {
		warn(`rz-render: must be placed on a <template> element.`, el);
		return;
	}
	const raw = value || key;
	const keyPath = rzKey.getConfig(el);
	return renderTemplate(el, () => resolveBoundValue(raw, scope, app.stores, el, "render"), {
		app,
		parentState: scope,
		keyPath
	});
}
const rzRender = {
	slug: "render",
	selector: directiveSelector("render"),
	singleValue: true,
	bind: bind$1
};

// src/directives/rz-sse.ts
const activeStreams = /* @__PURE__ */ new WeakMap();
function openFor(el, app, url) {
	if (activeStreams.has(el)) return;
	const release = openStream(app, url, { triggerEl: el });
	if (release) activeStreams.set(el, release);
}
function closeFor(el, reason) {
	const release = activeStreams.get(el);
	if (!release) return;
	activeStreams.delete(el);
	release(reason);
}
function bindSsePairs(el, app, pairs) {
	const url = pairs[0]?.subject;
	if (!url) {
		warn(`rz-sse: no URL found. Configure it using data-rz-sse with at least one leading trigger (e.g. data-rz-sse="ready: /events").`, el);
		return [];
	}
	const shared = pairs.filter((pair) => pair.subject === url);
	if (shared.length !== pairs.length) warn(`rz-sse: a single element can only carry one stream.`, el);
	return [
		...shared.map(({ trigger }) => dispatchTrigger(trigger, {
			el,
			app,
			action: () => openFor(el, app, url)
		})),
		...rzClose.getConfig(el).map((trigger) => dispatchTrigger(trigger, {
			el,
			app,
			action: () => closeFor(el, "released")
		})),
		() => closeFor(el, "teardown")
	];
}
const rzSse = defineNetworkOpDirective("sse", bindSsePairs);

// src/directives/rz-store.ts
const initialized = /* @__PURE__ */ new WeakSet();
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
	if (url) declared.url = url;
	if (Object.keys(headers).length) declared.headers = headers;
	app.stores._declare(el, storeName, state, declared);
	initialized.add(el);
}
function teardown(el) {
	initialized.delete(el);
}
const rzStore = {
	selector: directiveSelector("store", "script"),
	initialize,
	teardown
};

// src/directives/rz-style.ts
function bind(el, scope, app, key, val) {
	return effect(() => {
		const resolved = resolveBoundValue(val === "" ? key : val, scope, app.stores, el, "style");
		if (val === "") updateStyle(el, resolved);
		else if (key.includes(":")) applyStyles(el, key, !!resolved);
		else setStyleProperty(el, key, resolved);
	});
}
const rzStyle = {
	slug: "style",
	selector: directiveSelector("style"),
	bind
};

// src/directives/rz-text.ts
const rzText = defineBoundWriterDirective("text", (el, _key, val) => updateText(el, val), { singleValue: true });

// src/directives/rz-wake.ts
function getConfig(el, app) {
	const wakeTriggers = parseTriggers(getDirectiveValue(el, "wake"));
	if (wakeTriggers.length === 0) {
		const wakeTriggersConfig = parseTriggers(app.config.wake);
		return wakeTriggersConfig.length === 0 ? [{
			event: "ready",
			options: {}
		}] : wakeTriggersConfig;
	}
	return wakeTriggers;
}
const rzWake = { getConfig };

// src/directives/index.ts
const NETWORK_DIRECTIVES = [
	rzFetch,
	rzPush,
	rzPull,
	rzSse
];

// src/dom/scope.ts
const instanceMap = /* @__PURE__ */ new WeakMap();
const pendingWakes = /* @__PURE__ */ new WeakMap();
function initScopeElement(el, app) {
	const scopeName = rzScope.getConfig(el);
	if (scopeName === null) return;
	let setup;
	if (scopeName === "") setup = () => ({});
	else {
		const scope = app._registry.get(scopeName);
		if (!scope) {
			warn(`Scope '${scopeName}' is not defined.`);
			return;
		}
		setup = scope;
	}
	const strategies = rzWake.getConfig(el, app);
	let waked = false;
	const cancel = attachWakeStrategies(el, app, strategies, () => {
		waked = true;
		pendingWakes.delete(el);
		initScopeInstance(el, app, setup);
	});
	if (!waked) pendingWakes.set(el, cancel);
}
function initScopeInstance(el, app, setup) {
	if (instanceMap.has(el)) return;
	instanceMap.set(el, createScope(el, app, setup));
}
function destroyInstance(el) {
	pendingWakes.get(el)?.();
	pendingWakes.delete(el);
	const inst = instanceMap.get(el);
	if (inst) {
		inst._destroy();
		dispatchFrom(el, inst.root, "rz:scope:destroy", {
			instance: inst.instance,
			host: el
		});
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
		dispatchFrom(el, app.root, "rz:scope:init", {
			context,
			instance
		});
		const stopBindingScope = effectScope(() => {
			const { unbindDom, scan, teardown } = bindScope(el, instance, app);
			binding = {
				scan,
				teardown
			};
			cleanups.push(unbindDom);
		});
		cleanups.push(stopBindingScope);
	}
	return {
		instance,
		root: app.root,
		_scan: (node) => binding?.scan(node),
		_teardown: (node) => binding?.teardown(node),
		_destroy: destroy
	};
}

// src/dom/observer.ts
function warnUnknownDirectives(root, app) {
	for (const el of queryTargets(root, "*")) {
		if (!getApp(el, app)) continue;
		unknownDirectiveNames(el).forEach((name) => warn(`'${name}' isn't a Rouse directive. The data-rz- prefix is reserved for directives.`, el));
	}
}
function forEachOwned(root, selector, app, fn) {
	for (const el of queryTargets(root, selector)) if (getApp(el, app)) fn(el);
}
function mountSubtree(root, app) {
	warnUnknownDirectives(root, app);
	forEachOwned(root, rzStore.selector, app, (el) => rzStore.initialize(el, app));
	forEachOwned(root, SCOPE_SELECTOR, app, (el) => initScopeElement(el, app));
	const ownerScope = closestScope(root, app);
	if (ownerScope && !hasDirective(root, "scope") && getApp(ownerScope, app)) scanScopeNode(ownerScope, root);
	for (const directive of NETWORK_DIRECTIVES) forEachOwned(root, directive.selector, app, (el) => directive.initialize(el, app));
	if (!ownerScope) walkBoundElements(root, (el) => {
		if (getApp(el, app)) mountGlobalBinding(el, app);
	});
}
function unmountSubtree(root) {
	queryTargets(root, rzStore.selector).forEach((el) => rzStore.teardown(el));
	queryTargets(root, SCOPE_SELECTOR).forEach(destroyInstance);
	for (const directive of NETWORK_DIRECTIVES) queryTargets(root, directive.selector).forEach((el) => directive.teardown(el));
}
function releaseSubtree(root, app) {
	forEachOwned(root, rzStore.selector, app, (el) => rzStore.teardown(el));
	forEachOwned(root, SCOPE_SELECTOR, app, (el) => destroyInstance(el));
	for (const directive of NETWORK_DIRECTIVES) forEachOwned(root, directive.selector, app, (el) => directive.teardown(el));
	const ownerScope = closestScope(root, app);
	if (ownerScope && !hasDirective(root, "scope") && getApp(ownerScope, app)) teardownScopeNode(ownerScope, root);
	if (!ownerScope) teardownGlobalBindings(root, (el) => !!getApp(el, app));
}
function initObserver(app) {
	return new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) if (node.nodeType === Node.ELEMENT_NODE && node.isConnected) mountSubtree(node, app);
			for (const node of mutation.removedNodes) {
				if (node.nodeType !== Node.ELEMENT_NODE) continue;
				const removedEl = node;
				unmountSubtree(removedEl);
				const ownerScope = resolveRemovedOwner(removedEl);
				if (!ownerScope) teardownGlobalBindings(removedEl);
				else if (!hasDirective(removedEl, "scope")) teardownScopeNode(ownerScope, removedEl);
			}
		}
	});
}

// src/dom/placer.ts
function placeContent(app, target, content, options = {}) {
	const requested = options.position ?? "innerHTML";
	const position = isPlacePosition(requested) ? requested : DEFAULT_PLACE_POSITION;
	if (position !== requested) warn(`Unknown position '${requested}' in app.place(). Using '${DEFAULT_PLACE_POSITION}'. Positions are case-sensitive: ${PLACE_POSITIONS.join(", ")}.`);
	let targets = [];
	if (typeof target === "string") targets = queryPlaceTargets(app.root, target);
	else if (target instanceof Element) targets = [target];
	else warn(`Targets in app.place() must be an element or a selector. Got '${target}'.`);
	let placed = false;
	for (const el of targets) if (placeInto(el, app.root, content, position, "programmatic")) placed = true;
	return placed;
}
function placeInto(target, root, content, position, source) {
	const dispatcherEl = position === "outerHTML" || position === "delete" ? target.parentElement || target : target;
	const beforeEvent = dispatchFrom(dispatcherEl, root, "rz:dom:place:before", {
		target,
		position,
		payload: content,
		source
	}, { cancelable: true });
	if (beforeEvent.defaultPrevented) return false;
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
		default: target.insertAdjacentHTML(position, finalContent);
	}
	dispatchFrom(dispatcherEl, root, "rz:dom:place", {
		target,
		position,
		payload: finalContent,
		source
	});
	return true;
}

// src/dom/payload-router.ts
function initPayloadRouters(app, signal) {
	listenForPayloads(app, signal, "html", "placeOverride", (detail, source, host) => {
		const { data, placeOverride } = detail;
		const content = data == null && placeOverride ? "" : data;
		if (typeof content !== "string") return;
		for (const { targets, position } of rzPlace.getConfig(host, app.root, placeOverride)) targets.forEach((targetEl) => placeInto(targetEl, app.root, content, position, source));
	});
	listenForPayloads(app, signal, "json", "depositOverride", (detail, operation, host) => {
		const { data, depositOverride } = detail;
		const stores = rzDeposit.getConfig(host, depositOverride);
		if (stores.length === 0) return;
		if (!isPlainObject(data)) {
			warn("Cannot route JSON payload to a store. Expected a JSON object.", data);
			return;
		}
		const response = operation === "fetch" ? detail : void 0;
		stores.forEach((storeName) => app.stores.deposit(storeName, data, {
			response,
			operation
		}));
	});
}
function listenForPayloads(app, signal, kind, override, route) {
	const listen = (name, source) => {
		app.root.addEventListener(name, (e) => {
			if (!getApp(e.target, app)) return;
			const { detail } = e;
			const triggerEl = detail.config?.triggerEl;
			if (!detail[override]) {
				if (e.type.includes("error")) return;
				if (!triggerEl) return;
			}
			route(detail, source, triggerEl ?? app.root);
		}, { signal });
	};
	listen(`rz:fetch:success:${kind}`, "fetch");
	listen(`rz:fetch:error:${kind}`, "fetch");
	listen(`rz:sse:message:${kind}`, "sse");
}

// src/core/scope-registry.ts
const warnedDuplicates = /* @__PURE__ */ new Set();
function warnDuplicateOnce(name) {
	if (warnedDuplicates.has(name)) return;
	warnedDuplicates.add(name);
	warn(`Scope '${name}' is already registered. The new setup replaces it for elements scanned from now on.`);
}
var ScopeRegistry = class {
	scopes = /* @__PURE__ */ new Map();
	register(name, setup) {
		if (this.scopes.has(name)) warnDuplicateOnce(name);
		this.scopes.set(name, setup);
	}
	get(name) {
		return this.scopes.get(name);
	}
};

// src/store.ts
function sliceAt(obj, path) {
	return path ? getNestedVal(obj, path) : obj;
}
function storeError(error) {
	return error && {
		code: error.code,
		message: error.message
	};
}
function rootsFor(path) {
	return path ? [getPathRoot(path)] : void 0;
}
function syncHeaders(operation, storeName) {
	const headers = {
		"Rouse-Sync": operation,
		"Rouse-Store": storeName
	};
	if (operation === "push") headers["Content-Type"] = "application/merge-patch+json";
	return headers;
}
function assertStoreState(storeName, state) {
	if (typeof state !== "object" || state === null || Array.isArray(state)) fail(`Store '${storeName}' must be an object, not ${Array.isArray(state) ? "an array" : String(state)}.`);
}
function warnNullFields(storeName, state) {
	nullPaths(state).forEach((path) => warn(`Store '${storeName}': '${path}' is null. Sync reads null as a delete (RFC 7396), so it cannot rest as a value. Use '' or omit the key.`));
}
var StoreManager = class {
	app;
	_stores = /* @__PURE__ */ new Map();
	_pendingFlush = /* @__PURE__ */ new Set();
	_isPatching = false;
	constructor(app) {
		this.app = app;
	}
	_setConfig(entry, partial) {
		entry.config = {
			url: "",
			...entry.config,
			...partial
		};
	}
	_elementOf(entry) {
		return entry.el?.isConnected ? entry.el : void 0;
	}
	_isRegistered(entry) {
		return this._stores.get(entry.name) === entry;
	}
	_find(storeName) {
		return storeName == null ? void 0 : this._stores.get(storeName);
	}
	_getStore(storeName, action) {
		const entry = this._find(storeName);
		if (!entry) warn(!storeName ? "Store name is missing." : action ? `Cannot ${action} store '${storeName}': store not found.` : `Store '${storeName}' not found.`);
		return entry;
	}
	_updateLastGood(entry, source) {
		entry.lastGood = clone(source);
		this._reconcileDirty(entry);
	}
	_patchBaseline(entry, payload) {
		entry.lastGood ??= {};
		patchState(entry.lastGood, clone(payload), "merge", entry.data);
		this._reconcileDirty(entry);
	}
	_reconcileDirty(entry, roots) {
		const { data, status } = entry;
		const baseline = entry.lastGood ?? {};
		const keys = roots ?? /* @__PURE__ */ new Set([
			...Object.keys(data),
			...Object.keys(baseline),
			...Object.keys(status.dirtyRoots)
		]);
		for (const key of keys) {
			if (hasAccessor(data, key)) continue;
			if (deepEqual(data[key], baseline[key])) delete status.dirtyRoots[key];
			else status.dirtyRoots[key] = true;
		}
		status.dirty = Object.keys(status.dirtyRoots).length > 0;
	}
	_isSliceDirty(entry, path) {
		return !deepEqual(sliceAt(entry.data, path), sliceAt(entry.lastGood, path));
	}
	_dispatchPatchEvent(entry, eventName, detail, options) {
		const target = entry.el ?? this.app.root;
		return dispatchFrom(target, this.app.root, eventName, detail, options);
	}
	async _request(storeName, operation, options = {}) {
		const entry = this._getStore(storeName);
		if (!entry) return;
		const { data, config, name } = entry;
		const { url: policyUrl, headers: policyHeaders, ...transport } = config ?? {};
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
			abortKey: operation === "push" ? void 0 : options.abortKey ?? transport.abortKey ?? `pull_${name}`
		};
		const snapshot = clone(data);
		if (operation === "push") requestOptions.body = JSON.stringify(snapshot);
		const storeEl = this._elementOf(entry);
		const firingEl = options.triggerEl ?? storeEl ?? this.app.root;
		if (!options.triggerEl && !storeEl && requestOptions.indicator === void 0) requestOptions.indicator = null;
		let outcome;
		await runRequestLifecycle({
			el: firingEl,
			root: this.app.root,
			prefix: operation === "push" ? "rz:push" : "rz:pull",
			configDetail: {
				storeName: name,
				config: requestOptions
			},
			terminalDetail: (result) => ({
				storeName: name,
				result
			}),
			run: async (handle) => {
				outcome = await this._sendAndApply(entry, operation, requestOptions, snapshot, handle);
				return outcome.result;
			}
		});
		if (!outcome) return;
		if (outcome.followUp && this._isSliceDirty(entry)) outcome.followUp();
		if (!entry.status.syncing) this._settleIdle(entry);
	}
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
			if (entry.inFlight !== flight || !this._isRegistered(entry)) return done(result);
			if (result.error) {
				if (result.error.code !== "CANCELED") status.error = storeError(result.error);
				return done(result);
			}
			this._applyServerResponse(entry, operation, result, snapshot);
			succeeded = true;
			return done(result);
		} catch (error) {
			err(`Store '${entry.name}' ${operation} failed.`, error);
			const fallback = fallbackResponse(requestOptions, error.message || "Internal error", "INTERNAL_ERROR");
			if (entry.inFlight === flight) status.error = storeError(fallback.error);
			handle.settle(fallback);
			return done(fallback);
		} finally {
			if (entry.inFlight === flight) {
				status.syncing = false;
				entry.inFlight = void 0;
				const pending = entry.pendingPush;
				entry.pendingPush = void 0;
				if (succeeded) outcome.followUp = pending;
			}
		}
	}
	_applyServerResponse(entry, operation, result, snapshot) {
		const { name: storeName, data, status } = entry;
		if (operation === "push") {
			status.lastSync = Date.now();
			this._updateLastGood(entry, snapshot);
		}
		const beforeEvent = this._dispatchPatchEvent(entry, "rz:store:patch:before", {
			storeName,
			operation,
			data,
			payload: result.data
		}, { cancelable: true });
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
		if (operation === "pull") status.lastSync = Date.now();
		this._dispatchPatchEvent(entry, "rz:store:patch", {
			storeName,
			operation,
			data,
			response: result,
			payload
		});
	}
	_patchPayload(entry, payload) {
		this._withPatchGuard(entry, () => patchState(entry.data, payload, "merge"));
	}
	_withPatchGuard(entry, fn, roots) {
		this._isPatching = true;
		try {
			fn();
		} finally {
			this._isPatching = false;
			this._reconcileDirty(entry, roots);
		}
	}
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
	_onEdit(storeName, callback) {
		const entry = this._getStore(storeName);
		if (!entry) return () => {};
		let listeners = entry.listeners;
		if (!listeners) {
			listeners = /* @__PURE__ */ new Set();
			entry.listeners = listeners;
			if (entry.data) seedPropagation(entry.data);
		}
		listeners.add(callback);
		return () => {
			listeners.delete(callback);
			if (listeners.size === 0 && entry.listeners === listeners) entry.listeners = void 0;
		};
	}
	_create(storeName, state, config, el) {
		if (this._stores.has(storeName)) fail(`A store named '${storeName}' already exists.`);
		assertStoreState(storeName, state);
		if (storeName.includes(".")) warn(`Store name '${storeName}' contains a dot, so '@${storeName}' and { edit: '${storeName}' } read as store '${storeName.slice(0, storeName.indexOf("."))}'. Use a name without dots.`);
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
		if (config) this._setConfig(entry, config);
		if (el) entry.el = el;
		this._updateLastGood(entry, state);
		return entry.data;
	}
	_declare(el, storeName, state, declared) {
		const entry = this._stores.get(storeName);
		if (!entry) {
			this._create(storeName, state ?? {}, declared, el);
			return;
		}
		if (!entry.el || entry.el !== el && entry.el.isConnected) {
			warn(entry.el ? `rz-store: store '${storeName}' is already declared by another <script> on the page. This one is ignored.` : `rz-store: store '${storeName}' was created in JS, so this <script> is ignored.`, el);
			return;
		}
		if (state) {
			warnNullFields(storeName, state);
			this._reseed(entry, state);
		}
		entry.el = el;
		const config = {
			...entry.config,
			url: declared.url ?? ""
		};
		if (declared.headers) config.headers = declared.headers;
		else delete config.headers;
		entry.config = config;
	}
	update(storeName, state) {
		const entry = this._find(storeName);
		if (!entry) fail(storeName ? `Store '${storeName}' does not exist.` : "Store name is missing.");
		assertStoreState(entry.name, state);
		warnNullFields(entry.name, state);
		this._reseed(entry, state);
		return entry.data;
	}
	_reseed(entry, state) {
		this._withPatchGuard(entry, () => patchState(entry.data, state, "replace"));
		entry.initial = clone(entry.data);
		this._updateLastGood(entry, entry.data);
	}
	deposit(storeName, payload, options) {
		const entry = this._getStore(storeName);
		if (!entry) return false;
		const { data, name } = entry;
		const response = options?.response;
		const operation = options?.operation ?? "fetch";
		const beforeEvent = this._dispatchPatchEvent(entry, "rz:store:patch:before", {
			storeName: name,
			operation,
			data,
			payload
		}, { cancelable: true });
		if (beforeEvent.defaultPrevented) return false;
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
	get(storeName) {
		return this._find(storeName)?.data;
	}
	snapshot(storeName) {
		const data = this._find(storeName)?.data;
		return data ? clone(data) : void 0;
	}
	baseline(storeName) {
		const lastGood = this._find(storeName)?.lastGood;
		return lastGood ? clone(lastGood) : void 0;
	}
	has(storeName) {
		return this._find(storeName) !== void 0;
	}
	status(storeName) {
		return this._find(storeName)?.status;
	}
	isDirty(storeName, root) {
		const entry = this._getStore(storeName);
		if (!entry) return false;
		if (!root) return entry.status.dirty;
		const key = getPathRoot(root);
		if (key !== root) warn(`Store '${storeName}': isDirty() takes a root key, not a path. Checking '${key}' for '${root}'.`);
		return entry.status.dirtyRoots[key] === true;
	}
	dirtyRoots(storeName) {
		const entry = this._getStore(storeName);
		return entry ? Object.keys(entry.status.dirtyRoots) : [];
	}
	config(storeName, config) {
		const entry = this._getStore(storeName, "configure");
		if (!entry) return;
		this._setConfig(entry, config);
	}
	async push(storeName, options) {
		if (options?.abortKey) warn(`Store '${storeName}': abortKey is ignored on a push. A store sends one push at a time, so nothing can replace it. Cancel a push with 'signal'.`);
		return this._push(storeName, options);
	}
	_push(storeName, options) {
		const entry = this._find(storeName);
		if (entry?.status.syncing) {
			this._deferPush(storeName, () => this._push(storeName, options));
			return this._whenIdle(entry);
		}
		return this._request(storeName, "push", options);
	}
	_deferPush(storeName, send) {
		const entry = this._find(storeName);
		const flight = entry?.inFlight;
		if (!entry || !flight) return;
		if (deepEqual(entry.data, this._expectedBaseline(entry, flight))) return;
		entry.pendingPush = send;
	}
	_whenIdle(entry) {
		entry.idle ??= Promise.withResolvers();
		return entry.idle.promise;
	}
	_settleIdle(entry) {
		entry.idle?.resolve();
		entry.idle = void 0;
	}
	_expectedBaseline(entry, flight) {
		return entry.status.syncing === "push" ? flight.snapshot : entry.lastGood;
	}
	async pull(storeName, options) {
		if (this.status(storeName)?.syncing === "push") return;
		return this._request(storeName, "pull", options);
	}
	reset(storeName) {
		const entry = this._getStore(storeName, "reset");
		if (!entry) return;
		this._reseed(entry, clone(entry.initial));
	}
	revert(storeName, path) {
		const entry = this._getStore(storeName, "revert");
		if (!entry) return false;
		if (!this._isSliceDirty(entry, path)) return false;
		const value = clone(sliceAt(entry.lastGood, path));
		this._withPatchGuard(entry, () => {
			if (path) setNestedVal(entry.data, path, value);
			else patchState(entry.data, value, "replace");
		}, rootsFor(path));
		return true;
	}
	commit(storeName) {
		const entry = this._getStore(storeName, "commit");
		if (!entry) return;
		this._updateLastGood(entry, entry.data);
	}
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

// src/app.ts
let bannerLogged = false;
function logBuildBanner() {
	if (bannerLogged) return;
	bannerLogged = true;
	info(`v0.17.0 development build. Switch to rouse.min.js in production.`);
}
function withAppSignal(appSignal, signal) {
	return signal ? AbortSignal.any([appSignal, signal]) : appSignal;
}
registerBoundDirectives(rzAttr, rzClass, rzHtml, rzModel, rzOn, rzProp, rzRender, rzStyle, rzText);
var RouseApp = class {
	root;
	config;
	stores;
	_registry;
	isReady;
	fetch;
	sse;
	on;
	_interceptors;
	_hasStarted = false;
	_destroyed = false;
	_observer;
	_abortController;
	constructor(config = {}) {
		logBuildBanner();
		const rootEl = typeof config.root === "string" ? document.querySelector(config.root) : config.root ?? document.documentElement;
		if (!rootEl) fail("Root element not found.");
		if (appAt(rootEl)) fail("An app instance is already attached to this element.");
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
		const parentRoot = rootEl.parentElement?.closest(APP_ROOT_SELECTOR);
		const parent = parentRoot ? appAt(parentRoot) : void 0;
		if (parent?._hasStarted) releaseSubtree(rootEl, parent);
		attachApp(this.root, this);
		this.fetch = this._fetch.bind(this);
		this._abortController = new AbortController();
		this.on = (...args) => {
			const implied = typeof args[0] === "string" || isPlainObject(args[0]);
			const target = implied ? this.root : args[0];
			const event = implied ? args[0] : args[1];
			const callback = implied ? args[1] : args[2];
			const options = (implied ? args[2] : args[3]) ?? {};
			if (typeof target?.addEventListener !== "function") fail(`app.on expected an EventTarget, but got ${target === null ? "null" : typeof target}.`, TypeError);
			const signal = withAppSignal(this._abortController.signal, options.signal);
			return on(target, event, callback, {
				...options,
				signal
			}, this);
		};
		this.sse = (resource, options = {}) => {
			const signal = withAppSignal(this._abortController.signal, options.signal);
			return openBoundStream(this, resource, options, signal);
		};
	}
	scope(name, setup) {
		if (typeof setup !== "function") fail(`Scope '${name}' must be a setup function.`);
		this._registry.register(name, setup);
		return this;
	}
	store(name, data, config) {
		return this.stores._create(name, data, config);
	}
	place(target, content, options) {
		return placeContent(this, target, content, options);
	}
	interceptor(phase, fn, { signal } = {}) {
		const set = this._interceptors[phase];
		if (!set) fail(`Invalid interceptor: '${phase}'. Expected 'request', 'response', or 'error'.`);
		if (typeof fn !== "function") fail(`Interceptor for '${phase}' must be a function.`);
		if (!signal) {
			set.add(fn);
			return () => set.delete(fn);
		}
		if (signal.aborted) return () => {};
		const entry = (...args) => fn(...args);
		const remove = () => set.delete(entry);
		set.add(entry);
		signal.addEventListener("abort", remove, { once: true });
		return () => {
			signal.removeEventListener("abort", remove);
			remove();
		};
	}
	async _fetch(url, options = {}) {
		return runFetch(this, {
			...options,
			url
		});
	}
	start() {
		if (this._destroyed) {
			warn(`'start()' called on a destroyed app. Ignoring. Create a new instance instead.`);
			return;
		}
		if (this._hasStarted) {
			warn(`'start()' called multiple times. Ignoring.`);
			return;
		}
		this._hasStarted = true;
		dispatchFrom(this.root, this.root, "rz:app:start", { app: this });
		initPayloadRouters(this, this._abortController.signal);
		this._observer = initObserver(this);
		this._observer.observe(this.root, {
			childList: true,
			subtree: true
		});
		mountSubtree(this.root, this);
		requestAnimationFrame(() => {
			if (this._destroyed) return;
			this.isReady = true;
			dispatchFrom(this.root, this.root, "rz:app:ready", { app: this });
		});
	}
	destroy() {
		if (!this._hasStarted || this._destroyed) return;
		this._destroyed = true;
		this._observer?.disconnect();
		unmountSubtree(this.root);
		teardownGlobalBindings(this.root);
		dispatchFrom(this.root, this.root, "rz:app:destroy", { app: this });
		detachApp(this.root);
		this._abortController.abort();
	}
};
function rouse(config = {}) {
	return new RouseApp(config);
}

export { RouseApp, computed, createKey, rouse as default, rouse, dispatch, effect, reactive, signal };
//# sourceMappingURL=rouse.js.map