/**
 * SSR linkifier — turns plain Bible references in HTML text into real
 * <a href="..."> links.
 *
 * Implementation is a small streaming-style state machine over the HTML
 * string that tracks "skip" tags so we never wrap a reference that's already
 * inside a link, a code block, the page chrome, or a non-content widget.
 * Inside eligible text content we run the same regex that the parser uses,
 * then replace matches with anchor tags whose href points to midvash.com (in
 * the configured language/version).
 *
 * This runs once per request in Astro middleware, so the rendered HTML
 * shipped to crawlers contains real anchors — Google can index the link
 * juice. The transformer adds a `title` attribute for crawler context and
 * deliberately does NOT add `rel="nofollow"` or `target="_blank"` (the
 * primary SEO goal of this plugin is to pass equity to midvash.com).
 *
 * Performance: pages with zero reference candidates skip the full streaming
 * parse via a precompiled probe regex and return the original HTML string
 * unchanged.
 */

import { BOOKS, normalize, resolveSlug, type Language } from "./books.ts";
import { buildReadMoreUrl } from "./midvash.ts";

/**
 * Tags whose text content must NEVER be linkified.
 *
 * Two reasons to skip:
 *   1. Markup correctness — wrapping <a> inside <title> / <option> renders
 *      the literal markup, breaks the page (issue #37 part 2).
 *   2. SEO hygiene — references in the page chrome (nav, header, footer,
 *      aside) produce sitewide-repeated links, which Google treats as
 *      over-optimization. The plugin's goal is link juice from real article
 *      content to midvash.com, not from boilerplate.
 *
 * In practice this scopes linkification to article-body content: anything
 * not in the chrome and not in a non-content widget gets processed — which
 * matches the client scanner's default `selectors` of `article`, `.prose`,
 * `.post-content`, `main`.
 */
const SKIP_TAGS = new Set([
	// Already-anchored / code-ish content.
	"a", "code", "pre", "script", "style", "kbd", "samp", "textarea",
	// Non-content widgets where a nested <a> renders broken markup.
	"title", "option", "select", "optgroup", "button",
	// Page chrome — keep references confined to article content (issue #37).
	"nav", "header", "footer", "aside", "head",
	// Embedded subtrees we shouldn't traverse.
	"svg", "math", "noscript", "iframe",
]);

const NAME_INDEX_BY_LANG = new Map<string, Map<string, string>>();

function getNameIndex(language: Language): Map<string, string> {
	const cached = NAME_INDEX_BY_LANG.get(language);
	if (cached) return cached;
	const idx = new Map<string, string>();
	for (const book of BOOKS) {
		for (const n of book.names[language]) idx.set(normalize(n), book.slug);
		for (const n of book.names.en) idx.set(normalize(n), book.slug);
	}
	NAME_INDEX_BY_LANG.set(language, idx);
	return idx;
}

const PATTERN_BY_LANG = new Map<string, RegExp>();

function getPattern(language: Language): RegExp {
	const cached = PATTERN_BY_LANG.get(language);
	if (cached) return new RegExp(cached.source, cached.flags);
	const names = new Set<string>();
	for (const book of BOOKS) {
		for (const n of book.names[language]) names.add(n);
		for (const n of book.names.en) names.add(n);
	}
	const sorted = [...names].sort((a, b) => b.length - a.length);
	const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const re = new RegExp(
		`(?<![\\p{L}\\p{N}])(${escaped.join("|")})\\s*(\\d{1,3})(?:\\s*[:.]\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?)?(?![\\p{L}])`,
		"giu",
	);
	PATTERN_BY_LANG.set(language, re);
	return re;
}

/**
 * Cheap probe regex — does the HTML contain ANY book-name candidate (book
 * name immediately followed by a number, with whitespace allowed)? If not,
 * we can skip the full streaming parse entirely (issue #39).
 *
 * Uses the same name alternation as `getPattern` but without the boundary
 * lookarounds / chapter-verse capture, so a single linear scan over the raw
 * HTML decides "definitely no refs" vs "maybe a ref, parse properly". False
 * positives are OK (we fall through to the full parser); false negatives
 * would be incorrect, so we keep the alternation identical.
 */
const PROBE_BY_LANG = new Map<string, RegExp>();

function getProbe(language: Language): RegExp {
	const cached = PROBE_BY_LANG.get(language);
	if (cached) return cached;
	const names = new Set<string>();
	for (const book of BOOKS) {
		for (const n of book.names[language]) names.add(n);
		for (const n of book.names.en) names.add(n);
	}
	const sorted = [...names].sort((a, b) => b.length - a.length);
	const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	// Just "any book name immediately followed by whitespace and a digit". We
	// don't need boundaries here — we're only deciding fast-path vs full parse.
	const re = new RegExp(`(?:${escaped.join("|")})\\s*\\d`, "iu");
	PROBE_BY_LANG.set(language, re);
	return re;
}

export interface LinkifyOptions {
	language: Language;
	version: string;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Wrap matches in a single text segment with anchor tags. The text is
 * assumed to already be HTML-escaped (it came from inside an HTML doc),
 * so we pass it through unchanged and only escape the *attribute values*
 * we inject.
 */
function transformText(text: string, opts: LinkifyOptions): string {
	const re = getPattern(opts.language);
	const idx = getNameIndex(opts.language);
	re.lastIndex = 0;
	let result = "";
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		const fullMatch = m[0];
		const matchedName = m[1] ?? "";
		const slug = resolveSlug(matchedName, idx);
		if (!slug) continue;
		const chapter = Number.parseInt(m[2] ?? "", 10);
		if (!Number.isFinite(chapter) || chapter < 1) continue;
		const verseStr = m[3];
		const endStr = m[4];
		const verse = verseStr ? Number.parseInt(verseStr, 10) : undefined;
		const verseEnd = endStr ? Number.parseInt(endStr, 10) : verse;
		if (verse !== undefined && verseEnd !== undefined && verseEnd < verse) continue;

		const href = buildReadMoreUrl({ slug, matchedName, chapter, verse, verseEnd }, opts.version, opts.language);
		const versePart =
			verse !== undefined
				? `:${verse}${verseEnd && verseEnd !== verse ? `-${verseEnd}` : ""}`
				: "";
		const dataRef = `${matchedName} ${chapter}${versePart}`;

		result += text.slice(last, m.index);
		result +=
			`<a class="midvash-ref" href="${escapeHtml(href)}" data-ref="${escapeHtml(dataRef)}" title="${escapeHtml(dataRef)}" rel="noopener">` +
			fullMatch +
			"</a>";
		last = m.index + fullMatch.length;
	}
	result += text.slice(last);
	return result;
}

/**
 * Find the end of an HTML tag starting at `tagOpen`. Quote-aware: a `>`
 * inside a `"..."` or `'...'` attribute value is ignored (issue #40).
 * Returns the index of the closing `>`, or -1 if the tag never closes.
 */
function findTagEnd(html: string, tagOpen: number): number {
	let quote: '"' | "'" | null = null;
	for (let j = tagOpen + 1; j < html.length; j++) {
		const ch = html[j];
		if (quote) {
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (ch === ">") return j;
	}
	return -1;
}

/**
 * Walk the HTML string, transforming text content that lives outside of
 * SKIP_TAGS. Returns the rewritten HTML — or the exact same string instance
 * if the cheap probe says no reference candidate exists (issue #39).
 */
export function linkifyHtml(html: string, opts: LinkifyOptions): string {
	// Fast-path: probe for any book name immediately followed by a digit.
	// Returning `html` directly preserves referential identity so consumers
	// (and tests) can verify the parser was skipped.
	if (!getProbe(opts.language).test(html)) return html;

	let out = "";
	let i = 0;
	const len = html.length;
	const skipStack: string[] = [];

	while (i < len) {
		const tagOpen = html.indexOf("<", i);
		if (tagOpen === -1) {
			const text = html.slice(i);
			out += skipStack.length > 0 ? text : transformText(text, opts);
			break;
		}

		const text = html.slice(i, tagOpen);
		out += skipStack.length > 0 ? text : transformText(text, opts);

		const tagEnd = findTagEnd(html, tagOpen);
		if (tagEnd === -1) {
			out += html.slice(tagOpen);
			break;
		}
		const raw = html.slice(tagOpen, tagEnd + 1);
		out += raw;

		// Comment / doctype / cdata — skip.
		if (raw.startsWith("<!") || raw.startsWith("<?")) {
			i = tagEnd + 1;
			continue;
		}

		const tagMatch = raw.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/);
		if (tagMatch) {
			const isClosing = tagMatch[1] === "/";
			const tagName = tagMatch[2].toLowerCase();
			const selfClosing = raw.endsWith("/>");
			if (SKIP_TAGS.has(tagName)) {
				if (isClosing) {
					if (skipStack[skipStack.length - 1] === tagName) skipStack.pop();
				} else if (!selfClosing) {
					skipStack.push(tagName);
				}
			}
		}

		i = tagEnd + 1;
	}

	return out;
}
