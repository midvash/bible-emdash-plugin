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
		// Absent on the API's whole-chapter payload; backfilled by
		// normalizeVerseData so downstream code can always read them.
		verse?: number;
		verseEnd?: number;
		text?: string;
		verses: string[];
	};
	meta: {
		reference: string;
		total: number;
		// The API's `meta` has no `cached` field — cache state is this plugin's
		// own KV layer, surfaced separately by the route handler.
		cached?: boolean;
	};
}

/**
 * A batch item from `GET /v1/passages`. Either a resolved verse/chapter
 * payload (same `data` keys as {@link VerseResponse}, flattened) or a
 * per-item error object — one bad ref never fails the whole batch.
 */
type PassageItem =
	| (VerseResponse["data"] & { reference?: string; error?: undefined })
	| { ref: string; error: string };

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
 * Cache key for a parsed reference, shared by {@link fetchVerse} and
 * {@link fetchPassages} so a batch pre-warm and a single hover hit the same
 * KV entry. Chapter-only refs use `:0-0` as the verse segment.
 */
function verseCacheKey(version: string, slug: string, chapter: number, verseStart: number, verseEnd: number): string {
	return `cache:verse:${version}:${slug}:${chapter}:${verseStart}-${verseEnd}`;
}

/**
 * Normalize an upstream verse `data` payload to always carry `text`, `verse`
 * and `verseEnd`.
 *
 * The API's whole-chapter endpoint (`/v1/{version}/{book}/{chapter}`) returns
 * only `verses[]` — no `text`/`verse`/`verseEnd` — unlike the verse and range
 * endpoints. A consumer reading `data.text` would get `undefined` for a
 * chapter ref (the tooltip for "Salmos 23" rendered an error). The API was
 * asked to make this shape consistent; until that ships (and old chapter
 * responses can persist in the edge cache for up to a year), we backfill
 * client-side: join `verses[]` into `text` and set `verse:1`/`verseEnd:len`.
 * A payload that already has `text` is returned untouched.
 */
export function normalizeVerseData(data: VerseResponse["data"]): VerseResponse["data"] {
	if (typeof data.text === "string" && data.text.length > 0) return data;
	const verses = Array.isArray(data.verses) ? data.verses : [];
	return {
		...data,
		text: verses.join(" "),
		verse: data.verse ?? 1,
		verseEnd: data.verseEnd ?? verses.length,
	};
}

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
	const cacheKey = verseCacheKey(opts.version, ref.slug, ref.chapter, verseStart, verseEnd);

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
		const raw = (await res.json()) as VerseResponse;
		const data: VerseResponse = { ...raw, data: normalizeVerseData(raw.data) };
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

/** Max refs per `/v1/passages` request (API-enforced); larger inputs partition. */
const PASSAGES_BATCH_LIMIT = 50;

/** Build the free-text ref token `/v1/passages` expects, e.g. `john 3:16-18`. */
function passageRefToken(ref: ParsedReference): string {
	if (ref.verse === undefined) return `${ref.slug} ${ref.chapter}`;
	const range = ref.verseEnd && ref.verseEnd !== ref.verse ? `-${ref.verseEnd}` : "";
	return `${ref.slug} ${ref.chapter}:${ref.verse}${range}`;
}

/**
 * Resolve MANY references in one `GET /v1/passages` call, seeding the same KV
 * cache keys {@link fetchVerse} reads — so a single per-page pre-warm turns
 * every later hover into a cache hit. Results come back in input order; a KV
 * hit for a ref is served without hitting the network, and only the misses go
 * upstream (partitioned into ≤50-ref requests). A per-item upstream error maps
 * to `not-found`; a failed batch request degrades all its misses to
 * `fetch-error`. Never throws — degrade gracefully, like {@link fetchVerse}.
 */
export async function fetchPassages(
	refs: ParsedReference[],
	opts: FetchOptions,
	kv: KVLike,
	http: HttpLike,
): Promise<VerseResult[]> {
	const results = new Array<VerseResult | undefined>(refs.length);
	const misses: Array<{ index: number; ref: ParsedReference }> = [];

	// 1) Serve KV hits up front; collect the rest.
	for (let i = 0; i < refs.length; i++) {
		const ref = refs[i];
		const key = verseCacheKey(opts.version, ref.slug, ref.chapter, ref.verse ?? 0, ref.verseEnd ?? 0);
		if (opts.cacheEnabled) {
			const cached = await kv.get<{ at: number; data: VerseResponse }>(key);
			if (cached && Date.now() - cached.at < opts.cacheTtlSeconds * 1000) {
				results[i] = { ok: true, data: cached.data };
				continue;
			}
		}
		misses.push({ index: i, ref });
	}

	// 2) Fetch the misses in ≤50-ref batches.
	for (let start = 0; start < misses.length; start += PASSAGES_BATCH_LIMIT) {
		const chunk = misses.slice(start, start + PASSAGES_BATCH_LIMIT);
		const refsParam = chunk.map((m) => passageRefToken(m.ref)).join(",");
		const url = `https://api.midvash.com/v1/passages?refs=${encodeURIComponent(refsParam)}&version=${encodeURIComponent(opts.version)}`;

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
		let items: PassageItem[] | null = null;
		try {
			const res = await http.fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
			if (res.ok) {
				const body = (await res.json()) as { data: PassageItem[] };
				items = Array.isArray(body.data) ? body.data : null;
			}
		} catch {
			items = null;
		} finally {
			clearTimeout(timer);
		}

		for (let j = 0; j < chunk.length; j++) {
			const { index, ref } = chunk[j];
			const item = items?.[j];
			if (!item) {
				// Whole batch failed (network/timeout/5xx) or shape mismatch.
				results[index] = { ok: false, kind: "fetch-error" };
				continue;
			}
			if ("error" in item && item.error) {
				results[index] = { ok: false, kind: "not-found" };
				continue;
			}
			const data: VerseResponse = {
				data: normalizeVerseData(item as VerseResponse["data"]),
				meta: { reference: (item as { reference?: string }).reference ?? "", total: 0 },
			};
			if (opts.cacheEnabled) {
				const key = verseCacheKey(opts.version, ref.slug, ref.chapter, ref.verse ?? 0, ref.verseEnd ?? 0);
				await kv.set(key, { at: Date.now(), data });
			}
			results[index] = { ok: true, data };
		}
	}

	// Any slot left unset means the batch produced no item for it.
	return results.map((r) => r ?? { ok: false, kind: "fetch-error" });
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
