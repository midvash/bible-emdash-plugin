/**
 * SSR linkifier — turns plain Bible references in HTML text into real
 * <a href="..."> links.
 *
 * Implementation is a small streaming-style state machine over the HTML
 * string that tracks "skip" tags (<a>, <code>, <pre>, <script>, <style>,
 * <kbd>, <samp>) so we never wrap a reference that's already inside a
 * link or a code block. Inside text content we run the same regex that
 * the parser uses, then replace matches with anchor tags whose href
 * points to midvash.com (in the configured language/version).
 *
 * This runs once per request in Astro middleware, so the rendered HTML
 * shipped to crawlers contains real anchors — Google can index the link
 * juice.
 */

import { BOOKS, normalize, resolveSlug, type Language } from "./books.ts";
import { buildReadMoreUrl } from "./midvash.ts";

const SKIP_TAGS = new Set(["a", "code", "pre", "script", "style", "kbd", "samp", "textarea"]);

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
			`<a class="midvash-ref" href="${escapeHtml(href)}" data-ref="${escapeHtml(dataRef)}" rel="noopener">` +
			fullMatch +
			"</a>";
		last = m.index + fullMatch.length;
	}
	result += text.slice(last);
	return result;
}

/**
 * Walk the HTML string, transforming text content that lives outside of
 * SKIP_TAGS. Returns the rewritten HTML.
 */
export function linkifyHtml(html: string, opts: LinkifyOptions): string {
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

		const tagEnd = html.indexOf(">", tagOpen);
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
