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
		readMore: "Ler mais ↗",
		on: "no Midvash",
	};

	var API_PREFIX = "/_emdash/api/plugins/bible-by-midvash";
	var PROCESSED = new WeakSet();
	var SESSION_CACHE = new Map();
	var ACTIVE_TOOLTIP = null;
	var HIDE_TIMER = null;

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
			var span = document.createElement("span");
			span.className = "midvash-ref";
			span.setAttribute("data-ref", m[0].replace(/\s+$/, ""));
			span.tabIndex = 0;
			span.textContent = m[0].replace(/\s+$/, "");
			fragments.appendChild(span);
			lastIndex = m.index + m[0].replace(/\s+$/, "").length;
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
		return String(s)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	function renderTooltip(tip, payload) {
		var version = (payload.version || "").toUpperCase();
		var badge = SETTINGS.showVersionBadge && version
			? '<span class="midvash-tooltip__badge">' + escapeHtml(version) + "</span>"
			: "";
		var ref = escapeHtml(payload.reference || "");
		var text = escapeHtml(payload.text || "");
		var more = SETTINGS.showReadMore && payload.readMoreUrl
			? '<a class="midvash-tooltip__link" href="' + escapeHtml(payload.readMoreUrl) +
				'" target="_blank" rel="noopener">' + escapeHtml(STRINGS.readMore) + "</a>"
			: "";
		tip.innerHTML =
			'<header class="midvash-tooltip__header">' +
				'<span class="midvash-tooltip__ref">' + ref + " " +
					'<span class="midvash-tooltip__on">' + escapeHtml(STRINGS.on) + "</span>" +
				"</span>" +
				badge +
			"</header>" +
			'<div class="midvash-tooltip__body">' + text + "</div>" +
			(more ? '<footer class="midvash-tooltip__footer">' + more + "</footer>" : "");
	}

	function renderError(tip, ref) {
		tip.innerHTML =
			'<header class="midvash-tooltip__header">' +
				'<span class="midvash-tooltip__ref">' + escapeHtml(ref) + "</span>" +
			"</header>" +
			'<div class="midvash-tooltip__body midvash-tooltip__body--error">' +
				escapeHtml(STRINGS.error) +
			"</div>";
	}

	function renderLoading(tip, ref) {
		tip.innerHTML =
			'<header class="midvash-tooltip__header">' +
				'<span class="midvash-tooltip__ref">' + escapeHtml(ref) + "</span>" +
			"</header>" +
			'<div class="midvash-tooltip__body midvash-tooltip__body--loading">' +
				escapeHtml(STRINGS.loading) + "</div>";
	}

	function scheduleHide() {
		clearTimeout(HIDE_TIMER);
		HIDE_TIMER = setTimeout(function () {
			if (ACTIVE_TOOLTIP) ACTIVE_TOOLTIP.style.display = "none";
		}, 200);
	}

	// --- Lookup -----------------------------------------------------------

	function lookup(ref) {
		if (SESSION_CACHE.has(ref)) return Promise.resolve(SESSION_CACHE.get(ref));
		var url = API_PREFIX + "/lookup?ref=" + encodeURIComponent(ref);
		return fetch(url, { headers: { Accept: "application/json" } })
			.then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
			.then(function (raw) {
				// EmDash wraps route returns in { data: ... }. Unwrap if present.
				var data = raw && typeof raw === "object" && raw.data && raw.data.text
					? raw.data
					: raw;
				SESSION_CACHE.set(ref, data);
				return data;
			});
	}

	// --- Event wiring -----------------------------------------------------

	function showFor(target) {
		var ref = target.getAttribute("data-ref");
		if (!ref) return;
		var tip = ensureTooltip();
		clearTimeout(HIDE_TIMER);
		renderLoading(tip, ref);
		tip.style.display = "block";
		positionTooltip(target, tip);
		lookup(ref).then(function (payload) {
			if (payload && payload.text) {
				renderTooltip(tip, payload);
			} else {
				renderError(tip, ref);
			}
			positionTooltip(target, tip);
		}).catch(function () {
			renderError(tip, ref);
			positionTooltip(target, tip);
		});
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
		window.addEventListener("scroll", function () {
			if (ACTIVE_TOOLTIP) ACTIVE_TOOLTIP.style.display = "none";
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
		// We only need to attach hover/focus listeners.
		// As a safety net for content that bypassed the middleware (dynamic
		// inserts, client-only renders), we also scan once if the page seems
		// to have NO server-side anchors but DOES contain text matching the
		// pattern.
		var hasSsrLinks = !!document.querySelector(".midvash-ref");
		if (!hasSsrLinks) {
			selectors.forEach(function (sel) {
				document.querySelectorAll(sel).forEach(scan);
			});
		}
		attachListeners();
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
