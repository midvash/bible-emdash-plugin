/**
 * Client-side bundle (JavaScript + CSS) served by the plugin.
 *
 * Both are template-literal strings so the plugin works without any build
 * step — sandbox-entry just serves them as-is. The `__SETTINGS__` token is
 * replaced at request time with the user's persisted settings JSON.
 *
 * Keep these strings as plain ES2017+ code: they run directly in the
 * browser. No imports, no TypeScript syntax (the literal isn't compiled).
 */

export const CLIENT_JS = String.raw`
(function () {
	"use strict";
	var SETTINGS = __SETTINGS__;
	if (!SETTINGS || SETTINGS.enabled === false) return;

	// Localized UI strings, injected server-side from the content language.
	// PT-BR fallback in case an older server build didn't provide them.
	var STRINGS = SETTINGS.strings || {
		loading: "Carregando…",
		error: "Não foi possível carregar este versículo.",
		notFound: "Este versículo não existe nesta versão.",
		readMore: "Ler mais ↗",
		on: "no Midvash",
	};

	var API_PREFIX = "/_emdash/api/plugins/bible-by-midvash";
	var TOOLTIP_ID = "midvash-tooltip";
	var PROCESSED = new WeakSet();
	var SESSION_CACHE = new Map();
	var ACTIVE_TOOLTIP = null;
	var ACTIVE_TRIGGER = null;
	var HIDE_TIMER = null;

	// --- URL building (client-only fallback — issue #49 / SEO-A) -----------
	// When the SSR middleware isn't registered, the client has to produce
	// real <a href> anchors so Googlebot sees the link. The server passes
	// language, defaultVersion and a small nameToSlug map so we can build
	// the same URL shape as the SSR linkifier without shipping the books
	// table.

	var LANG = SETTINGS.language || "pt-br";
	var VERSION = SETTINGS.defaultVersion || "naa";
	var NAME_TO_SLUG = SETTINGS.nameToSlug || {};

	function normalizeName(s) {
		return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
	}

	function resolveSlug(name) {
		var key = normalizeName(name);
		// Accent-aware override for "Jó" → job (vs accent-stripped "jo" → john).
		// The server's resolveSlug() handles this too; we replicate the single
		// override case the books table needs here so the client URL matches.
		var raw = String(name).toLowerCase();
		if (raw === "jó") return "job";
		return NAME_TO_SLUG[key] || null;
	}

	function localizedSlug(slug) {
		// midvash.com accepts the English slug and 307-redirects, so this is
		// purely cosmetic — but it makes the URL look right when crawled.
		// For en we already have the right slug; for pt-br/es the server-
		// passed nameToSlug always returns the English slug, so we lower-
		// case for safety.
		return (slug || "").toLowerCase();
	}

	function buildHref(name, chapter, verse, verseEnd) {
		var slug = resolveSlug(name);
		if (!slug) return null;
		var versePath = verse === undefined || verse === null
			? String(chapter)
			: (verseEnd && verseEnd !== verse)
				? chapter + "/" + verse + "-" + verseEnd
				: chapter + "/" + verse;
		return "https://midvash.com/" + LANG + "/" + VERSION + "/" + localizedSlug(slug) + "/" + versePath;
	}

	function safeHttpUrl(u) {
		// Defense-in-depth (#42): readMoreUrl arrives over /lookup; only
		// pass http(s) schemes into an href. Anything else (javascript:,
		// data:, vbscript:, file:, …) gets dropped — the tooltip still
		// renders the verse, just without the "Ler mais" link.
		try {
			var p = new URL(String(u), "https://example.com").protocol;
			return (p === "https:" || p === "http:") ? String(u) : null;
		} catch (e) {
			return null;
		}
	}

	// --- DOM scanning -----------------------------------------------------

	var selectors = (SETTINGS.selectors || "article")
		.split(/\r?\n/)
		.map(function (s) { return s.trim(); })
		.filter(Boolean);

	function shouldSkip(node) {
		if (!node || node.nodeType !== 1) return true;
		var tag = node.tagName;
		if (tag === "A" || tag === "CODE" || tag === "PRE" || tag === "SCRIPT" || tag === "STYLE") return true;
		if (node.classList && node.classList.contains("midvash-ref")) return true;
		return false;
	}

	function walkText(root, onMatch) {
		var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode: function (n) {
				if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
				var p = n.parentElement;
				while (p && p !== root) {
					if (shouldSkip(p)) return NodeFilter.FILTER_REJECT;
					p = p.parentElement;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});
		var node;
		var batch = [];
		while ((node = walker.nextNode())) batch.push(node);
		batch.forEach(onMatch);
	}

	function wrapMatchesInTextNode(textNode, pattern) {
		var text = textNode.nodeValue;
		var fragments = null;
		var lastIndex = 0;
		var m;
		pattern.lastIndex = 0;
		while ((m = pattern.exec(text)) !== null) {
			fragments = fragments || document.createDocumentFragment();
			if (m.index > lastIndex) {
				fragments.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
			}
			// Strip trailing whitespace from the matched substring (the regex
			// allows whitespace between the book name and the chapter number).
			var matchedText = m[0].replace(/\s+$/, "");
			var matchedLen = matchedText.length;
			var name = m[1];
			var chapter = parseInt(m[2], 10);
			var verse = m[3] === undefined ? null : parseInt(m[3], 10);
			var verseEnd = m[4] === undefined ? null : parseInt(m[4], 10);
			var href = buildHref(name, chapter, verse, verseEnd);

			// SEO (#49): render a real <a href> so Googlebot sees the link
			// even when the SSR middleware wasn't registered.
			var el;
			if (href) {
				el = document.createElement("a");
				el.setAttribute("href", href);
				el.setAttribute("rel", "noopener");
				el.setAttribute("title", matchedText);
			} else {
				// Unknown name (shouldn't happen — the regex used the same
				// names — but stay safe). Fall back to a span so behavior
				// degrades gracefully.
				el = document.createElement("span");
			}
			el.className = "midvash-ref";
			el.setAttribute("data-ref", matchedText);
			el.tabIndex = 0;
			el.textContent = matchedText;
			fragments.appendChild(el);
			lastIndex = m.index + matchedLen;
		}
		if (fragments) {
			if (lastIndex < text.length) {
				fragments.appendChild(document.createTextNode(text.slice(lastIndex)));
			}
			textNode.parentNode.replaceChild(fragments, textNode);
		}
	}

	// --- Tooltip ----------------------------------------------------------

	function ensureTooltip() {
		if (ACTIVE_TOOLTIP) return ACTIVE_TOOLTIP;
		var el = document.createElement("div");
		el.className = "midvash-tooltip";
		el.id = TOOLTIP_ID;
		el.setAttribute("role", "tooltip");
		el.setAttribute("data-theme", SETTINGS.theme || "auto");
		el.style.display = "none";
		el.addEventListener("mouseenter", function () { clearTimeout(HIDE_TIMER); });
		el.addEventListener("mouseleave", scheduleHide);
		document.body.appendChild(el);
		ACTIVE_TOOLTIP = el;
		return el;
	}

	function positionTooltip(target, tip) {
		var r = target.getBoundingClientRect();
		var tipRect = tip.getBoundingClientRect();
		var top = window.scrollY + r.bottom + 8;
		var left = window.scrollX + r.left;
		if (left + tipRect.width > window.scrollX + window.innerWidth - 8) {
			left = window.scrollX + window.innerWidth - tipRect.width - 8;
		}
		if (left < window.scrollX + 8) left = window.scrollX + 8;
		// Flip above if not enough space below
		if (r.bottom + tipRect.height + 16 > window.innerHeight) {
			top = window.scrollY + r.top - tipRect.height - 8;
		}
		tip.style.top = top + "px";
		tip.style.left = left + "px";
	}

	function escapeHtml(s) {
		// IMPORTANT: do NOT write a forward-slash-LT-forward-slash-g regex
		// literal here. Astro/EmDash rewrite every literal LT-slash inside
		// script content to LT-backslash-slash (XSS hardening so a stray
		// closing-script tag cannot break out). That rewrite corrupts any
		// regex literal that contains the two-char LT-slash sequence,
		// throwing SyntaxError at parse time and killing the whole IIFE
		// silently. Use a character class instead: /[<]/g has no LT-slash
		// sequence and survives the escape unchanged.
		return String(s)
			.replace(/&/g, "&amp;")
			.replace(/[<]/g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	function renderTooltip(tip, payload) {
		var version = (payload.version || "").toUpperCase();
		var versionSlug = (payload.version || "").toLowerCase();
		// Build the version index URL on midvash.com — same shape as the
		// verse anchor, just truncated to /lang/version. Another in-document
		// SEO link distinct from the article-body anchor (different target,
		// passes additional juice to the version's page).
		var versionHref = versionSlug
			? safeHttpUrl("https://midvash.com/" + LANG + "/" + versionSlug)
			: null;
		var badge = SETTINGS.showVersionBadge && version && versionHref
			? '<a class="midvash-tooltip__badge" href="' + escapeHtml(versionHref) +
				'" title="' + escapeHtml(version) + ' on Midvash" rel="noopener">' +
				escapeHtml(version) + "</a>"
			: SETTINGS.showVersionBadge && version
				? '<span class="midvash-tooltip__badge">' + escapeHtml(version) + "</span>"
				: "";
		var ref = escapeHtml(payload.reference || "");
		var text = escapeHtml(payload.text || "");
		// Whole-chapter previews are truncated at a verse boundary by the API;
		// append an ellipsis so the reader knows there's more (the read-more
		// link carries them to the full chapter).
		if (payload.truncated && text) text += " …";
		// #42: only render the read-more link when readMoreUrl is http(s).
		var safeMore = SETTINGS.showReadMore ? safeHttpUrl(payload.readMoreUrl) : null;
		var more = safeMore
			? '<a class="midvash-tooltip__link" href="' + escapeHtml(safeMore) +
				'" target="_blank" rel="noopener">' + escapeHtml(STRINGS.readMore) + "</a>"
			: "";
		tip.innerHTML =
			'<header class="midvash-tooltip__header">' +
				'<span class="midvash-tooltip__ref">' + ref + " " +
					'<span class="midvash-tooltip__on">' + escapeHtml(STRINGS.on) + "</span>" +
				"</span>" +
				badge +
			"</header>" +
			// #38: aria-live="polite" so screen readers announce the verse
			// when it replaces "Carregando…". aria-atomic re-announces the
			// whole body, not just the diff.
			'<div class="midvash-tooltip__body" aria-live="polite" aria-atomic="true">' + text + "</div>" +
			(more ? '<footer class="midvash-tooltip__footer">' + more + "</footer>" : "");
	}

	function renderError(tip, ref, kind) {
		// kind ∈ {"not-found", "fetch-error"} — issue #41. "not-found" means
		// the reference parses but the verse doesn't exist in this version
		// (e.g. "John 99:99"). Anything else is a transient load failure.
		var msg = kind === "not-found"
			? (STRINGS.notFound || STRINGS.error)
			: STRINGS.error;
		tip.innerHTML =
			'<header class="midvash-tooltip__header">' +
				'<span class="midvash-tooltip__ref">' + escapeHtml(ref) + "</span>" +
			"</header>" +
			'<div class="midvash-tooltip__body midvash-tooltip__body--error" aria-live="polite" aria-atomic="true">' +
				escapeHtml(msg) +
			"</div>";
	}

	function renderLoading(tip, ref) {
		tip.innerHTML =
			'<header class="midvash-tooltip__header">' +
				'<span class="midvash-tooltip__ref">' + escapeHtml(ref) + "</span>" +
			"</header>" +
			'<div class="midvash-tooltip__body midvash-tooltip__body--loading" aria-live="polite" aria-atomic="true">' +
				escapeHtml(STRINGS.loading) + "</div>";
	}

	function hideTooltip() {
		if (ACTIVE_TOOLTIP) ACTIVE_TOOLTIP.style.display = "none";
		// Drop the aria link so the reference isn't described by a hidden tooltip.
		if (ACTIVE_TRIGGER) {
			ACTIVE_TRIGGER.removeAttribute("aria-describedby");
			ACTIVE_TRIGGER = null;
		}
	}

	function scheduleHide() {
		clearTimeout(HIDE_TIMER);
		HIDE_TIMER = setTimeout(hideTooltip, 200);
	}

	function tooltipIsVisible() {
		return ACTIVE_TOOLTIP && ACTIVE_TOOLTIP.style.display !== "none";
	}

	// --- Lookup -----------------------------------------------------------

	function lookup(ref) {
		if (SESSION_CACHE.has(ref)) return Promise.resolve(SESSION_CACHE.get(ref));
		var url = API_PREFIX + "/lookup?ref=" + encodeURIComponent(ref);
		return fetch(url, { headers: { Accept: "application/json" } })
			.then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
			.then(function (raw) {
				// EmDash wraps route returns in { data: ... }. Unwrap if the
				// inner object looks like our payload (has 'text' OR 'error'
				// — both are valid /lookup responses per issue #41).
				var data = raw && typeof raw === "object" && raw.data &&
					(raw.data.text || raw.data.error)
					? raw.data
					: raw;
				// Don't cache the error responses — a fix-and-retry should
				// hit the upstream again.
				if (data && data.text) SESSION_CACHE.set(ref, data);
				return data;
			});
	}

	// Batch pre-warm: collect every reference already on the page and resolve
	// them in ONE /passages call, seeding SESSION_CACHE so the first hover of
	// any ref is instant. Results come back in input order (see the passages
	// route), so we map them back to the exact data-ref keys hover uses. Capped
	// at the API's 50-ref batch limit; deduped. Best-effort — any failure just
	// leaves hover to fetch per-ref as before.
	//
	// Whole-chapter refs ("Salmos 23" — no verse) are skipped: the batch
	// endpoint returns their full text (a chapter can be ~13 KB), while a hover
	// fetches them via /lookup with ?preview to stay small. Batching them would
	// both bloat this request and seed the cache with full text, so a later
	// hover would show the untruncated chapter. Letting chapters fetch on hover
	// keeps the payload — and the tooltip — consistently small.
	function prewarm() {
		var nodes = document.querySelectorAll(".midvash-ref");
		if (!nodes.length) return;
		var refs = [];
		var seen = {};
		for (var i = 0; i < nodes.length && refs.length < 50; i++) {
			var ref = nodes[i].getAttribute("data-ref");
			// Only prewarm refs that carry a verse (": " or ".") — skip chapters.
			if (ref && !seen[ref] && /\d[:.]\d/.test(ref)) { seen[ref] = 1; refs.push(ref); }
		}
		if (!refs.length) return;
		var url = API_PREFIX + "/passages?refs=" + encodeURIComponent(refs.join(";"));
		fetch(url, { headers: { Accept: "application/json" } })
			.then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
			.then(function (raw) {
				var results = raw && raw.data && raw.data.results ? raw.data.results
					: raw && raw.results ? raw.results : null;
				if (!results) return;
				for (var j = 0; j < refs.length; j++) {
					var d = results[j];
					if (d && d.text) SESSION_CACHE.set(refs[j], d);
				}
			})
			.catch(function () { /* hover falls back to per-ref /lookup */ });
	}

	// --- Event wiring -----------------------------------------------------

	function showFor(target) {
		var ref = target.getAttribute("data-ref");
		if (!ref) return;
		var tip = ensureTooltip();
		clearTimeout(HIDE_TIMER);
		// Associate the trigger with the tooltip so screen readers announce the
		// verse text; move the link if switching from a previous reference.
		if (ACTIVE_TRIGGER && ACTIVE_TRIGGER !== target) {
			ACTIVE_TRIGGER.removeAttribute("aria-describedby");
		}
		ACTIVE_TRIGGER = target;
		target.setAttribute("aria-describedby", TOOLTIP_ID);
		renderLoading(tip, ref);
		tip.style.display = "block";
		positionTooltip(target, tip);
		lookup(ref).then(function (payload) {
			if (payload && payload.text) {
				renderTooltip(tip, payload);
			} else if (payload && payload.error) {
				// Issue #41: server distinguishes "verse not found" (404)
				// from "couldn't load" (network/timeout/5xx).
				renderError(tip, ref, payload.error);
			} else {
				renderError(tip, ref, "fetch-error");
			}
			positionTooltip(target, tip);
		}).catch(function () {
			renderError(tip, ref, "fetch-error");
			positionTooltip(target, tip);
		});
	}

	function isTouchDevice() {
		// Issue #36: on coarse-pointer devices the tooltip can't appear on
		// hover, so we open it on tap. We re-evaluate per event because
		// hybrid devices (Surface, iPad with magic keyboard) may switch.
		try {
			return window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
		} catch (e) {
			// Fallback: no PointerEvent → assume mouse; with touch points → coarse.
			return ("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0;
		}
	}

	function attachListeners() {
		document.addEventListener("mouseover", function (e) {
			var t = e.target.closest && e.target.closest(".midvash-ref");
			if (t) showFor(t);
		});
		document.addEventListener("mouseout", function (e) {
			var t = e.target.closest && e.target.closest(".midvash-ref");
			if (t) scheduleHide();
		});
		document.addEventListener("focusin", function (e) {
			if (e.target.classList && e.target.classList.contains("midvash-ref")) showFor(e.target);
		});
		document.addEventListener("focusout", function (e) {
			if (e.target.classList && e.target.classList.contains("midvash-ref")) scheduleHide();
		});

		// Touch / click handling (#36).
		// On coarse-pointer devices:
		//   - First tap on a .midvash-ref opens the tooltip; navigation blocked.
		//   - Second tap on the SAME .midvash-ref (tooltip still active) is
		//     allowed through, so the user reaches midvash.com.
		//   - Tap anywhere else closes the tooltip.
		// On mouse devices: click is NOT intercepted — hover already shows
		// the tooltip, and clicking through is the desktop UX users expect.
		document.addEventListener("click", function (e) {
			if (!isTouchDevice()) return;
			var t = e.target.closest && e.target.closest(".midvash-ref");
			if (t) {
				var sameRef = ACTIVE_TRIGGER === t && tooltipIsVisible();
				if (!sameRef) {
					e.preventDefault();
					showFor(t);
				}
				// else: second tap → let the click navigate (no preventDefault).
				return;
			}
			// Tap outside any ref → close the tooltip.
			if (tooltipIsVisible()) {
				clearTimeout(HIDE_TIMER);
				hideTooltip();
			}
		});

		// Escape closes the tooltip immediately (focus stays on the trigger).
		document.addEventListener("keydown", function (e) {
			if ((e.key === "Escape" || e.key === "Esc") && tooltipIsVisible()) {
				clearTimeout(HIDE_TIMER);
				hideTooltip();
			}
		});
		window.addEventListener("scroll", function () {
			hideTooltip();
		}, { passive: true });
	}

	// --- Boot -------------------------------------------------------------

	function buildPattern() {
		// Server provides the compiled regex source so the client doesn't ship
		// the full books table. The pattern is escaped server-side.
		try {
			return new RegExp(SETTINGS.pattern, SETTINGS.patternFlags || "giu");
		} catch (e) {
			console.warn("[bible-by-midvash] invalid pattern:", e);
			return null;
		}
	}

	function scan(root) {
		if (!root || PROCESSED.has(root)) return;
		PROCESSED.add(root);
		var pattern = buildPattern();
		if (!pattern) return;
		walkText(root, function (textNode) { wrapMatchesInTextNode(textNode, pattern); });
	}

	function init() {
		// References are linkified at SSR time by the Astro middleware, so the
		// .midvash-ref anchors already exist in the HTML (good for SEO).
		// We only need to attach hover/focus/tap listeners.
		// As a safety net for content that bypassed the middleware (dynamic
		// inserts, client-only renders, or sites that simply forgot to register
		// the middleware), we also scan once if the page has NO server-side
		// anchors. The fallback now produces real <a href> elements too — see
		// wrapMatchesInTextNode (issue #49).
		var hasSsrLinks = !!document.querySelector(".midvash-ref");
		if (!hasSsrLinks) {
			selectors.forEach(function (sel) {
				document.querySelectorAll(sel).forEach(scan);
			});
		}
		attachListeners();
		// Pre-warm the tooltips for every ref on the page once the browser is
		// idle, so the first hover is a cache hit. Runs after the (optional)
		// client scan so client-inserted anchors are batched too.
		var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1); };
		idle(prewarm);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
`;

export const CLIENT_CSS = String.raw`
.midvash-ref {
	/* Defaults inherit from the host site so the plugin doesn't override
	   link styles unless the admin opts in (useCustomColors). The runtime
	   only emits these custom properties when the toggle is on. */
	color: var(--midvash-link-color, inherit);
	text-decoration-line: var(--midvash-underline-line, none);
	text-decoration-color: var(--midvash-underline-color, currentColor);
	text-decoration-style: var(--midvash-underline-style, solid);
	text-decoration-thickness: 1px;
	text-underline-offset: 2px;
	cursor: pointer;
	transition: background-color 0.15s ease;
	border-radius: 2px;
}
.midvash-ref:hover,
.midvash-ref:focus-visible {
	background: rgba(232, 180, 90, 0.15);
	outline: none;
}

.midvash-tooltip {
	position: absolute;
	z-index: 9999;
	max-width: min(28rem, calc(100vw - 1rem));
	padding: 0;
	border-radius: 10px;
	overflow: hidden;
	font-size: 0.9rem;
	line-height: 1.5;
	color: var(--m-ink, #30281D);
	background: var(--m-paper, #FBF5E8);
	border: 1px solid var(--m-border, #E6DFD0);
	box-shadow: 0 12px 32px rgba(48, 40, 29, 0.18), 0 2px 6px rgba(48, 40, 29, 0.08);
	font-family: 'Literata', Georgia, 'Times New Roman', serif;
	animation: midvash-fade-in 0.12s ease-out;
}
@keyframes midvash-fade-in {
	from { opacity: 0; transform: translateY(-4px); }
	to   { opacity: 1; transform: translateY(0); }
}

.midvash-tooltip__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	padding: 0.625rem 0.875rem;
	background: var(--m-ink, #30281D);
	color: var(--m-paper, #FBF5E8);
	font-family: 'Figtree', system-ui, -apple-system, sans-serif;
	font-size: 0.8rem;
	font-weight: 600;
	letter-spacing: 0.01em;
}
.midvash-tooltip__ref { display: inline-flex; align-items: baseline; gap: 0.35rem; }
.midvash-tooltip__on { font-weight: 400; opacity: 0.7; font-size: 0.75rem; }
.midvash-tooltip__badge {
	background: var(--m-honey-glow, #F0CE8A);
	color: var(--m-honey-deep, #B17027);
	padding: 0.125rem 0.4rem;
	border-radius: 4px;
	font-size: 0.7rem;
	font-weight: 700;
	letter-spacing: 0.05em;
	/* The badge is an <a> since v0.4.0 — suppress the default link styling
	   so it still reads as a pill. The hover/focus state is still a link
	   affordance for users (slight brightness shift). */
	text-decoration: none;
	transition: filter 0.15s ease;
}
a.midvash-tooltip__badge:hover,
a.midvash-tooltip__badge:focus-visible {
	filter: brightness(0.95);
	outline: none;
}

.midvash-tooltip__body {
	padding: 0.875rem 1rem;
	font-size: 0.95rem;
}
.midvash-tooltip__body--loading,
.midvash-tooltip__body--error {
	font-family: 'Figtree', system-ui, sans-serif;
	color: var(--m-muted, #827B6E);
	font-style: italic;
	font-size: 0.85rem;
}

.midvash-tooltip__footer {
	border-top: 1px solid var(--m-border, #E6DFD0);
	padding: 0.5rem 0.875rem;
	display: flex;
	justify-content: flex-end;
	background: rgba(240, 206, 138, 0.08);
}
.midvash-tooltip__link {
	color: var(--m-honey-deep, #B17027);
	font-family: 'Figtree', system-ui, sans-serif;
	font-size: 0.8rem;
	font-weight: 600;
	text-decoration: none;
}
.midvash-tooltip__link:hover { text-decoration: underline; }

/* Theme: Pergaminho (light) — default vars above */

.midvash-tooltip[data-theme="dark"],
.midvash-tooltip[data-theme="auto"] {
	/* defaults are already light; auto switches via media query below */
}

@media (prefers-color-scheme: dark) {
	.midvash-tooltip[data-theme="auto"] {
		--m-paper: #302A21;
		--m-ink: #EDE4D3;
		--m-border: #4A4235;
		--m-muted: #B4A994;
	}
}

.midvash-tooltip[data-theme="dark"] {
	--m-paper: #302A21;
	--m-ink: #EDE4D3;
	--m-border: #4A4235;
	--m-muted: #B4A994;
}

.midvash-tooltip[data-theme="sepia"] {
	--m-paper: #F1E0C3;
	--m-ink: #3E2F1B;
	--m-border: #CFB98D;
	--m-muted: #7A6540;
}
`;
