/**
 * Builds the regex (as a serializable string) that the browser client uses to
 * scan the DOM for Bible references — and the name→slug map the client uses
 * to build midvash.com URLs without shipping the full books table.
 *
 * Previously the client pattern was non-capturing because the client only
 * needed to know *where* a reference was, then shipped the raw text to
 * `/lookup`. Since v0.3.0 the client also has to build a real `<a href>` in
 * the client-only fallback (SEO — issue #49), so it needs to extract the
 * book name + chapter + verse from the match. The pattern is now CAPTURING,
 * with the same shape as the SSR pattern in `linkify.ts` / `parser.ts`:
 *   m[1] = book name (matched form)
 *   m[2] = chapter
 *   m[3] = verse (optional)
 *   m[4] = verseEnd (optional, for ranges like "3:16-18")
 *
 * The pattern includes the configured language's names PLUS English (authors
 * often mix languages, and Latin abbreviations like "Gn"/"Jo" are universal).
 *
 * The `buildNameToSlug` helper returns a small object keyed by normalized
 * book name (NFD, accent-stripped, lowercased) → English slug. The client
 * uses it to resolve the matched name to the slug for URL construction.
 *
 * Previously `buildClientPattern` was copy-pasted into `runtime.ts` and
 * `plugin.ts`; both now import from here.
 */

import { BOOKS, normalize, type Language } from "./books.ts";

export function buildClientPattern(language: Language): { pattern: string; flags: string } {
	const names = new Set<string>();
	for (const book of BOOKS) {
		for (const n of book.names[language]) names.add(n);
		for (const n of book.names.en) names.add(n);
	}
	const sorted = [...names].sort((a, b) => b.length - a.length);
	const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const namePattern = escaped.join("|");
	return {
		pattern: `(?<![\\p{L}\\p{N}])(${namePattern})\\s*(\\d{1,3})(?:\\s*[:.]\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?)?(?![\\p{L}])`,
		flags: "giu",
	};
}

/**
 * Map of normalized book name → URL slug as midvash.com expects it for the
 * given language, for the configured language plus English. Used by the
 * client to resolve a regex match to a slug when building midvash.com URLs
 * in the client-only fallback. Small (~200 keys), serializes to a few KB.
 *
 * Slugs are pre-localized to match the SSR URL shape: for `pt-br` the slug
 * for "John" is "joao", for `es` it's "juan", etc. midvash.com 307-redirects
 * the English slug, so this is cosmetic — but it matches the SSR linkifier
 * so a page that switches between SSR and client-fallback URLs stays
 * canonical.
 */
export function buildNameToSlug(language: Language): Record<string, string> {
	const out: Record<string, string> = {};
	for (const book of BOOKS) {
		const slug = localizedSlug(book, language);
		for (const n of book.names[language]) out[normalize(n)] = slug;
		for (const n of book.names.en) out[normalize(n)] = slug;
	}
	return out;
}

/**
 * Mirror of midvash.ts:localizedSlug — kept here so the client receives the
 * already-localized slug in `nameToSlug` and doesn't have to do the
 * NFD-strip-accents step itself. For `en` the English slug is used verbatim.
 */
function localizedSlug(book: { slug: string; names: Record<Language, readonly string[]> }, language: Language): string {
	if (language === "en") return book.slug;
	const canonical = book.names[language][0];
	return canonical
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/\s+/g, "-");
}
