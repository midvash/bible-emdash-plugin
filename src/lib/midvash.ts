/**
 * Midvash API client with KV cache layer.
 *
 * Endpoint: https://api.midvash.com/v1/{version}/{book}/{chapter}[/{verse}[-{end}]]
 *
 * Cache key shape: `cache:verse:{version}:{slug}:{chapter}:{verse}-{end}`
 * (chapter-only refs use `:0-0` as the verse segment)
 */

import { BOOKS, type Language } from "./books.ts";
import type { ParsedReference } from "./parser.ts";

/**
 * Convert an English book slug to the localized slug used by midvash.com
 * frontend URLs (e.g. "leviticus" → "levitico" for pt-br).
 *
 * Derived from the canonical book name in the target language by stripping
 * diacritics, lowercasing, and replacing spaces with hyphens. The midvash
 * site also accepts the English slug and 307-redirects, so this is purely
 * cosmetic — but it makes the "Ler mais" link look right on hover.
 */
function localizedSlug(slug: string, language: Language): string {
	if (language === "en") return slug;
	const book = BOOKS.find((b) => b.slug === slug);
	if (!book) return slug;
	const canonical = book.names[language][0];
	return canonical
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/\s+/g, "-");
}

export interface VerseResponse {
	data: {
		version: string;
		book: string;
		bookName: string;
		chapter: number;
		verse: number;
		verseEnd: number;
		text: string;
		verses: string[];
	};
	meta: {
		reference: string;
		total: number;
		cached: boolean;
	};
}

export interface VersionsResponse {
	data: Array<{
		slug: string;
		name: string;
		language: string;
		[key: string]: unknown;
	}>;
}

export interface FetchOptions {
	version: string;
	timeoutMs: number;
	cacheEnabled: boolean;
	cacheTtlSeconds: number;
}

export interface KVLike {
	get<T>(key: string): Promise<T | null>;
	set(key: string, value: unknown): Promise<void>;
}

export interface HttpLike {
	fetch(url: string, init?: RequestInit): Promise<Response>;
}

/**
 * Tagged result for {@link fetchVerse} so callers can distinguish "the
 * reference doesn't exist on midvash.com" from "the request failed in some
 * other way" (issue #41). Previously both collapsed to `null` and the
 * tooltip showed a generic "couldn't load" error.
 *
 * - `ok: true`  — `data` is the upstream verse payload.
 * - `kind: "not-found"`    — upstream returned 404 (e.g. "John 99:99"). Surface
 *                            a typo'd-reference message to the user; don't
 *                            cache.
 * - `kind: "fetch-error"`  — network failure, timeout, 5xx, or any other
 *                            non-404 non-OK status. Generic error.
 */
export type VerseResult =
	| { ok: true; data: VerseResponse }
	| { ok: false; kind: "not-found" | "fetch-error" };

/**
 * Resolve a parsed reference to a verse, using KV cache when possible.
 *
 * Returns a {@link VerseResult} that distinguishes "verse doesn't exist"
 * (upstream 404) from "request failed" (network/timeout/5xx). 404s are
 * intentionally NOT cached so a corrected reference reaches the upstream
 * the next time it's queried.
 */
export async function fetchVerse(
	ref: ParsedReference,
	opts: FetchOptions,
	kv: KVLike,
	http: HttpLike,
): Promise<VerseResult> {
	const verseStart = ref.verse ?? 0;
	const verseEnd = ref.verseEnd ?? 0;
	const cacheKey = `cache:verse:${opts.version}:${ref.slug}:${ref.chapter}:${verseStart}-${verseEnd}`;

	if (opts.cacheEnabled) {
		const cached = await kv.get<{ at: number; data: VerseResponse }>(cacheKey);
		if (cached && Date.now() - cached.at < opts.cacheTtlSeconds * 1000) {
			return { ok: true, data: cached.data };
		}
	}

	const versePath =
		ref.verse === undefined
			? ""
			: ref.verseEnd && ref.verseEnd !== ref.verse
				? `/${ref.verse}-${ref.verseEnd}`
				: `/${ref.verse}`;

	const url = `https://api.midvash.com/v1/${encodeURIComponent(opts.version)}/${ref.slug}/${ref.chapter}${versePath}`;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

	try {
		const res = await http.fetch(url, {
			signal: controller.signal,
			headers: { Accept: "application/json" },
		});
		if (res.status === 404) return { ok: false, kind: "not-found" };
		if (!res.ok) return { ok: false, kind: "fetch-error" };
		const data = (await res.json()) as VerseResponse;
		if (opts.cacheEnabled) {
			await kv.set(cacheKey, { at: Date.now(), data });
		}
		return { ok: true, data };
	} catch {
		return { ok: false, kind: "fetch-error" };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * List available Bible versions, optionally filtered by language.
 * Cached separately under `cache:versions:{language}` with a shorter TTL.
 */
export async function fetchVersions(
	language: string | undefined,
	timeoutMs: number,
	kv: KVLike,
	http: HttpLike,
): Promise<VersionsResponse | null> {
	const cacheKey = `cache:versions:${language ?? "all"}`;
	const cached = await kv.get<{ at: number; data: VersionsResponse }>(cacheKey);
	const ONE_DAY = 86_400_000;
	if (cached && Date.now() - cached.at < ONE_DAY) return cached.data;

	const url = language
		? `https://api.midvash.com/v1/versions?language=${encodeURIComponent(language)}`
		: "https://api.midvash.com/v1/versions";

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const res = await http.fetch(url, {
			signal: controller.signal,
			headers: { Accept: "application/json" },
		});
		if (!res.ok) return null;
		const data = (await res.json()) as VersionsResponse;
		await kv.set(cacheKey, { at: Date.now(), data });
		return data;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Build a public-facing midvash.com URL for a reference, used as the
 * "Ler mais" link in the tooltip footer.
 */
export function buildReadMoreUrl(ref: ParsedReference, version: string, language: string): string {
	const lang = (language || "pt-br") as Language;
	const slug = localizedSlug(ref.slug, lang);
	const versePath =
		ref.verse === undefined
			? `${ref.chapter}`
			: ref.verseEnd && ref.verseEnd !== ref.verse
				? `${ref.chapter}/${ref.verse}-${ref.verseEnd}`
				: `${ref.chapter}/${ref.verse}`;
	return `https://midvash.com/${lang}/${version}/${slug}/${versePath}`;
}
