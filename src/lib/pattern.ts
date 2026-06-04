/**
 * Builds the regex (as a serializable string) that the browser client uses to
 * scan the DOM for Bible references.
 *
 * Unlike the capturing pattern in `parser.ts`/`linkify.ts` (which the server
 * uses to extract slug/chapter/verse), this one is NON-capturing — the client
 * only needs to know *where* a reference is, then ships the raw text to the
 * `/lookup` route. Returning a string keeps the full book table on the server:
 * the browser receives a compiled pattern, not the 66-book name list.
 *
 * The pattern includes the configured language's names PLUS English (authors
 * often mix languages, and Latin abbreviations like "Gn"/"Jo" are universal).
 *
 * Previously this function was copy-pasted into `runtime.ts` and
 * `sandbox-entry.ts`; both now import it from here.
 */

import { BOOKS, type Language } from "./books.ts";

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
		pattern: `(?<![\\p{L}\\p{N}])(?:${namePattern})\\s*\\d{1,3}(?:\\s*[:.]\\s*\\d{1,3}(?:\\s*[-–—]\\s*\\d{1,3})?)?(?![\\p{L}])`,
		flags: "giu",
	};
}
