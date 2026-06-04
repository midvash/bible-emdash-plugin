/**
 * Bible reference parser.
 *
 * Recognizes references like:
 *   "João 3:16"          single verse
 *   "Jo 3.16"            alt separator (period)
 *   "João 3:16-18"       verse range (en-dash too: "3:16–18")
 *   "Salmos 23"          whole chapter
 *   "1 Coríntios 13:4-7" numbered books with space
 *   "1Co 13:4"           numbered books concatenated
 *
 * Two entry points:
 *   parseReference(text)  — parse a single reference string
 *   findReferences(text)  — scan free text and yield all matches with offsets
 */

import { BOOKS, buildNameIndex, resolveSlug } from "./books.ts";

export interface ParsedReference {
	/** Canonical Midvash slug (e.g. "1-corinthians"). */
	slug: string;
	/** The exact name as written by the author (preserves accents/case). */
	matchedName: string;
	chapter: number;
	/** Undefined when only a chapter was given (e.g. "Salmos 23"). */
	verse?: number;
	/** Inclusive end of range. Equal to verse for single-verse refs. */
	verseEnd?: number;
}

export interface ReferenceMatch extends ParsedReference {
	/** Start index of the match in the source text. */
	start: number;
	/** End index (exclusive). */
	end: number;
	/** The raw text that matched. */
	raw: string;
}

const NAME_INDEX = buildNameIndex();

/**
 * Build a single regex that matches any known book name followed by
 * chapter[:verse[-end]]. Names are sorted longest-first so "1 João" wins
 * over "João" when both could match.
 */
function buildPattern(): RegExp {
	const allNames = new Set<string>();
	for (const book of BOOKS) {
		for (const lang of Object.keys(book.names) as Array<keyof typeof book.names>) {
			for (const name of book.names[lang]) allNames.add(name);
		}
	}

	const sorted = [...allNames].sort((a, b) => b.length - a.length);
	const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const namePattern = escaped.join("|");

	// Word boundary on the left, then book name, then space(s), chapter,
	// optional :verse(-end). The right side is bounded by non-word OR end.
	// Use negative lookbehind on alphanumerics to avoid matching "ajo 3:16"
	// inside a word, and a non-letter lookahead after the verse number.
	return new RegExp(
		`(?<![\\p{L}\\p{N}])(${namePattern})\\s*(\\d{1,3})(?:\\s*[:.]\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?)?(?![\\p{L}])`,
		"giu",
	);
}

const PATTERN = buildPattern();

function lookupSlug(rawName: string): string | null {
	return resolveSlug(rawName, NAME_INDEX);
}

export function parseReference(text: string): ParsedReference | null {
	const re = new RegExp(PATTERN.source, PATTERN.flags.replace("g", ""));
	const m = re.exec(text.trim());
	if (!m) return null;
	return buildParsed(m);
}

export function* findReferences(text: string): Generator<ReferenceMatch> {
	PATTERN.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = PATTERN.exec(text)) !== null) {
		const parsed = buildParsed(m);
		if (!parsed) continue;
		const raw = m[0];
		// Trim trailing whitespace that the pattern may have absorbed.
		const trimmedLength = raw.replace(/\s+$/, "").length;
		yield {
			...parsed,
			start: m.index,
			end: m.index + trimmedLength,
			raw: raw.slice(0, trimmedLength),
		};
	}
}

function buildParsed(m: RegExpExecArray): ParsedReference | null {
	const matchedName = m[1] ?? "";
	const slug = lookupSlug(matchedName);
	if (!slug) return null;

	const chapter = Number.parseInt(m[2] ?? "", 10);
	if (!Number.isFinite(chapter) || chapter < 1) return null;

	const verseStr = m[3];
	const endStr = m[4];

	const verse = verseStr ? Number.parseInt(verseStr, 10) : undefined;
	const verseEnd = endStr ? Number.parseInt(endStr, 10) : verse;

	if (verse !== undefined && verseEnd !== undefined && verseEnd < verse) return null;

	return { slug, matchedName, chapter, verse, verseEnd };
}
