import { describe, it, expect } from "vitest";

import { buildReadMoreUrl, fetchVerse, fetchVersions } from "../src/lib/midvash.ts";
import type { KVLike, HttpLike, VerseResponse } from "../src/lib/midvash.ts";

function makeKV(initial: Record<string, unknown> = {}): KVLike & { store: Map<string, unknown> } {
	const store = new Map<string, unknown>(Object.entries(initial));
	return {
		store,
		async get<T>(key: string) {
			return (store.has(key) ? (store.get(key) as T) : null);
		},
		async set(key: string, value: unknown) {
			store.set(key, value);
		},
	};
}

function makeHttp(impl: (url: string) => Response): HttpLike & { calls: number; lastUrl: string } {
	const state = { calls: 0, lastUrl: "" };
	return {
		get calls() {
			return state.calls;
		},
		get lastUrl() {
			return state.lastUrl;
		},
		async fetch(url: string) {
			state.calls++;
			state.lastUrl = url;
			return impl(url);
		},
	} as HttpLike & { calls: number; lastUrl: string };
}

const VERSE: VerseResponse = {
	data: {
		version: "naa",
		book: "john",
		bookName: "João",
		chapter: 3,
		verse: 16,
		verseEnd: 16,
		text: "Porque Deus amou o mundo...",
		verses: ["Porque Deus amou o mundo..."],
	},
	meta: { reference: "John 3:16", total: 1, cached: false },
};

const OPTS = { version: "naa", timeoutMs: 5000, cacheEnabled: true, cacheTtlSeconds: 2_592_000 };

describe("buildReadMoreUrl", () => {
	it("builds an English URL with the raw slug", () => {
		const url = buildReadMoreUrl({ slug: "john", matchedName: "John", chapter: 3, verse: 16, verseEnd: 16 }, "niv", "en");
		expect(url).toBe("https://midvash.com/en/niv/john/3/16");
	});

	it("localizes the slug for pt-br", () => {
		const url = buildReadMoreUrl({ slug: "john", matchedName: "João", chapter: 3, verse: 16, verseEnd: 16 }, "naa", "pt-br");
		expect(url).toBe("https://midvash.com/pt-br/naa/joao/3/16");
	});

	it("omits the verse for a whole-chapter reference", () => {
		const url = buildReadMoreUrl({ slug: "psalms", matchedName: "Salmos", chapter: 23 }, "naa", "pt-br");
		expect(url).toBe("https://midvash.com/pt-br/naa/salmos/23");
	});

	it("renders a verse range", () => {
		const url = buildReadMoreUrl({ slug: "1-corinthians", matchedName: "1 Cor", chapter: 13, verse: 4, verseEnd: 7 }, "niv", "en");
		expect(url).toBe("https://midvash.com/en/niv/1-corinthians/13/4-7");
	});
});

describe("fetchVerse", () => {
	const ref = { slug: "john", matchedName: "João", chapter: 3, verse: 16, verseEnd: 16 };

	it("hits the upstream API once, then serves from cache (ok=true)", async () => {
		const kv = makeKV();
		const http = makeHttp(() => new Response(JSON.stringify(VERSE), { status: 200 }));

		const first = await fetchVerse(ref, OPTS, kv, http);
		expect(first.ok).toBe(true);
		if (first.ok) expect(first.data.data.text).toBe(VERSE.data.text);
		expect(http.calls).toBe(1);
		expect(http.lastUrl).toBe("https://api.midvash.com/v1/naa/john/3/16");

		const second = await fetchVerse(ref, OPTS, kv, http);
		expect(second.ok).toBe(true);
		expect(http.calls).toBe(1); // served from cache, no new request
	});

	it("heals a pre-fix cached chapter payload (no text) on read", async () => {
		// A KV entry written before normalizeVerseData existed: chapter shape
		// with only verses[], no text/verse/verseEnd. Serving it as-is would
		// re-break the tooltip; fetchVerse must normalize on cache read too.
		const staleChapter = {
			at: Date.now(),
			data: {
				data: { version: "naa", book: "psalms", bookName: "Salmos", chapter: 23, verses: ["a", "b"] },
				meta: { reference: "Psalms 23", total: 2 },
			},
		};
		const kv = makeKV({ "cache:verse:naa:psalms:23:0-0": staleChapter });
		const http = makeHttp(() => new Response("{}", { status: 500 }));
		const res = await fetchVerse({ slug: "psalms", chapter: 23 } as never, OPTS, kv, http);
		expect(http.calls).toBe(0); // still a cache hit, no refetch
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data.data.text).toBe("a b");
			expect(res.data.data.verse).toBe(1);
			expect(res.data.data.verseEnd).toBe(2);
		}
	});

	it("builds a range URL", async () => {
		const kv = makeKV();
		const http = makeHttp(() => new Response(JSON.stringify(VERSE), { status: 200 }));
		await fetchVerse({ slug: "john", matchedName: "João", chapter: 3, verse: 16, verseEnd: 18 }, OPTS, kv, http);
		expect(http.lastUrl).toBe("https://api.midvash.com/v1/naa/john/3/16-18");
	});

	it("builds a chapter-only URL", async () => {
		const kv = makeKV();
		const http = makeHttp(() => new Response(JSON.stringify(VERSE), { status: 200 }));
		await fetchVerse({ slug: "psalms", matchedName: "Salmos", chapter: 23 }, OPTS, kv, http);
		expect(http.lastUrl).toBe("https://api.midvash.com/v1/naa/psalms/23");
	});

	it("returns kind=not-found on an upstream 404 (issue #41)", async () => {
		const kv = makeKV();
		const http = makeHttp(() => new Response("nope", { status: 404 }));
		const r = await fetchVerse(ref, OPTS, kv, http);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.kind).toBe("not-found");
	});

	it("returns kind=fetch-error on an upstream 5xx (issue #41)", async () => {
		const kv = makeKV();
		const http = makeHttp(() => new Response("oops", { status: 503 }));
		const r = await fetchVerse(ref, OPTS, kv, http);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.kind).toBe("fetch-error");
	});

	it("returns kind=fetch-error when the request throws", async () => {
		const kv = makeKV();
		const http: HttpLike = {
			async fetch() {
				throw new Error("network down");
			},
		};
		const r = await fetchVerse(ref, OPTS, kv, http);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.kind).toBe("fetch-error");
	});

	it("bypasses the cache when cacheEnabled is false", async () => {
		const kv = makeKV();
		const http = makeHttp(() => new Response(JSON.stringify(VERSE), { status: 200 }));
		const opts = { ...OPTS, cacheEnabled: false };
		await fetchVerse(ref, opts, kv, http);
		await fetchVerse(ref, opts, kv, http);
		expect(http.calls).toBe(2);
		expect(kv.store.size).toBe(0);
	});

	it("does NOT cache a not-found result (so a fix-and-retry works)", async () => {
		const kv = makeKV();
		let n = 0;
		const http = makeHttp(() => {
			n++;
			return n === 1
				? new Response("nope", { status: 404 })
				: new Response(JSON.stringify(VERSE), { status: 200 });
		});
		const first = await fetchVerse(ref, OPTS, kv, http);
		expect(first.ok).toBe(false);
		const second = await fetchVerse(ref, OPTS, kv, http);
		expect(second.ok).toBe(true);
		expect(http.calls).toBe(2);
	});
});

describe("fetchVersions", () => {
	it("requests the unfiltered endpoint and caches the result", async () => {
		const kv = makeKV();
		const payload = { data: [{ slug: "naa", name: "NAA", language: "pt-br" }] };
		const http = makeHttp(() => new Response(JSON.stringify(payload), { status: 200 }));

		const out = await fetchVersions(undefined, 5000, kv, http);
		expect(out?.data[0].slug).toBe("naa");
		expect(http.lastUrl).toBe("https://api.midvash.com/v1/versions");

		await fetchVersions(undefined, 5000, kv, http);
		expect(http.calls).toBe(1); // cached
	});

	it("passes the language filter as a query param", async () => {
		const kv = makeKV();
		const http = makeHttp(() => new Response(JSON.stringify({ data: [] }), { status: 200 }));
		await fetchVersions("en", 5000, kv, http);
		expect(http.lastUrl).toBe("https://api.midvash.com/v1/versions?language=en");
	});

	it("returns null on a non-OK response", async () => {
		const kv = makeKV();
		const http = makeHttp(() => new Response("x", { status: 503 }));
		expect(await fetchVersions(undefined, 5000, kv, http)).toBeNull();
	});

	it("returns null when the request throws", async () => {
		const kv = makeKV();
		const http: HttpLike = {
			async fetch() {
				throw new Error("network down");
			},
		};
		expect(await fetchVersions(undefined, 5000, kv, http)).toBeNull();
	});
});

describe("normalizeVerseData (whole-chapter shape, API inconsistency)", () => {
	it("synthesizes text/verse/verseEnd when upstream sends only verses[]", async () => {
		const { normalizeVerseData } = await import("../src/lib/midvash.ts");
		const data = normalizeVerseData({
			version: "naa",
			book: "psalms",
			bookName: "Salmos",
			chapter: 23,
			verses: ["v1", "v2", "v3"],
		} as never);
		expect(data.text).toBe("v1 v2 v3");
		expect(data.verse).toBe(1);
		expect(data.verseEnd).toBe(3);
	});

	it("leaves complete verse payloads untouched", async () => {
		const { normalizeVerseData } = await import("../src/lib/midvash.ts");
		expect(normalizeVerseData(VERSE.data)).toEqual(VERSE.data);
	});
});

describe("fetchVerse — whole-chapter refs get text (upstream shape gap)", () => {
	it("returns joined text for a chapter-only reference", async () => {
		const chapterPayload = {
			data: {
				version: "naa",
				book: "psalms",
				bookName: "Salmos",
				chapter: 23,
				verses: ["O SENHOR é o meu pastor;", "Ele me faz repousar."],
			},
			meta: { reference: "Psalms 23", total: 2 },
		};
		const http = makeHttp(() => new Response(JSON.stringify(chapterPayload), { status: 200 }));
		const res = await fetchVerse(
			{ slug: "psalms", chapter: 23 } as never,
			OPTS,
			makeKV(),
			http,
		);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data.data.text).toBe("O SENHOR é o meu pastor; Ele me faz repousar.");
			expect(res.data.data.verse).toBe(1);
			expect(res.data.data.verseEnd).toBe(2);
		}
	});
});

describe("fetchPassages (batch via /v1/passages)", () => {
	const batchEnvelope = (items: unknown[]) => ({
		data: items,
		meta: { total: items.length, version: "naa", resolved: items.length, failed: 0 },
	});
	const johnItem = {
		version: "naa", book: "john", bookName: "John", chapter: 3,
		verse: 16, verseEnd: 16, text: "Porque Deus amou o mundo...",
		verses: ["Porque Deus amou o mundo..."], reference: "John 3:16",
	};
	const psalmsChapterItem = {
		version: "naa", book: "psalms", bookName: "Psalms", chapter: 23,
		verses: ["v1", "v2"], reference: "Psalms 23",
	};

	const REFS = [
		{ slug: "john", chapter: 3, verse: 16 },
		{ slug: "psalms", chapter: 23 },
	] as never[];

	it("resolves N refs with ONE upstream call, using slug notation", async () => {
		const { fetchPassages } = await import("../src/lib/midvash.ts");
		const http = makeHttp(() =>
			new Response(JSON.stringify(batchEnvelope([johnItem, psalmsChapterItem])), { status: 200 }),
		);
		const results = await fetchPassages(REFS, OPTS, makeKV(), http);
		expect(http.calls).toBe(1);
		expect(http.lastUrl).toContain("/v1/passages?");
		expect(decodeURIComponent(http.lastUrl)).toContain("john 3:16");
		expect(decodeURIComponent(http.lastUrl)).toContain("psalms 23");
		expect(http.lastUrl).toContain("version=naa");
		expect(results).toHaveLength(2);
		expect(results[0].ok).toBe(true);
		if (results[0].ok) expect(results[0].data.data.text).toContain("Porque Deus amou");
		// Chapter item gets normalized (joined text) like fetchVerse does.
		expect(results[1].ok).toBe(true);
		if (results[1].ok) expect(results[1].data.data.text).toBe("v1 v2");
	});

	it("seeds the same KV cache keys fetchVerse reads", async () => {
		const { fetchPassages } = await import("../src/lib/midvash.ts");
		const kv = makeKV();
		const http = makeHttp(() =>
			new Response(JSON.stringify(batchEnvelope([johnItem, psalmsChapterItem])), { status: 200 }),
		);
		await fetchPassages(REFS, OPTS, kv, http);
		expect(kv.store.has("cache:verse:naa:john:3:16-0")).toBe(true);
		expect(kv.store.has("cache:verse:naa:psalms:23:0-0")).toBe(true);
		// And a subsequent fetchVerse is a pure cache hit (no extra upstream call).
		const res = await fetchVerse({ slug: "john", chapter: 3, verse: 16 } as never, OPTS, kv, http);
		expect(res.ok).toBe(true);
		expect(http.calls).toBe(1);
	});

	it("serves KV hits without fetching at all", async () => {
		const { fetchPassages } = await import("../src/lib/midvash.ts");
		const kv = makeKV({
			"cache:verse:naa:john:3:16-0": { at: Date.now(), data: VERSE },
			"cache:verse:naa:psalms:23:0-0": { at: Date.now(), data: VERSE },
		});
		const http = makeHttp(() => new Response("{}", { status: 500 }));
		const results = await fetchPassages(REFS, OPTS, kv, http);
		expect(http.calls).toBe(0);
		expect(results.every((r) => r.ok)).toBe(true);
	});

	it("heals a pre-fix cached chapter payload (no text) on read", async () => {
		const { fetchPassages } = await import("../src/lib/midvash.ts");
		const kv = makeKV({
			"cache:verse:naa:psalms:23:0-0": {
				at: Date.now(),
				data: {
					data: { version: "naa", book: "psalms", bookName: "Salmos", chapter: 23, verses: ["a", "b"] },
					meta: { reference: "Psalms 23", total: 2 },
				},
			},
		});
		const http = makeHttp(() => new Response("{}", { status: 500 }));
		const [res] = await fetchPassages([{ slug: "psalms", chapter: 23 }] as never[], OPTS, kv, http);
		expect(http.calls).toBe(0);
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.data.data.text).toBe("a b");
	});

	it("maps per-item error strings to not-found without failing the batch", async () => {
		const { fetchPassages } = await import("../src/lib/midvash.ts");
		const http = makeHttp(() =>
			new Response(
				JSON.stringify(batchEnvelope([{ ref: "notabook 99", error: 'Book "notabook" not found.' }, johnItem])),
				{ status: 200 },
			),
		);
		const results = await fetchPassages(
			[{ slug: "notabook", chapter: 99 }, { slug: "john", chapter: 3, verse: 16 }] as never[],
			OPTS, makeKV(), http,
		);
		expect(results[0]).toEqual({ ok: false, kind: "not-found" });
		expect(results[1].ok).toBe(true);
	});

	it("partitions requests above the API's 50-ref limit", async () => {
		const { fetchPassages } = await import("../src/lib/midvash.ts");
		const many = Array.from({ length: 60 }, (_, i) => ({ slug: "john", chapter: 3, verse: i + 1 }));
		const http = makeHttp((url) => {
			const refs = decodeURIComponent(new URL(url).searchParams.get("refs") ?? "").split(",");
			return new Response(
				JSON.stringify(batchEnvelope(refs.map((r) => ({
					...johnItem, verse: Number(r.split(":")[1]), verseEnd: Number(r.split(":")[1]),
				})))),
				{ status: 200 },
			);
		});
		const results = await fetchPassages(many as never[], { ...OPTS, cacheEnabled: false }, makeKV(), http);
		expect(http.calls).toBe(2);
		expect(results).toHaveLength(60);
		expect(results.every((r) => r.ok)).toBe(true);
	});

	it("degrades every miss to fetch-error when the batch request fails", async () => {
		const { fetchPassages } = await import("../src/lib/midvash.ts");
		const http = makeHttp(() => new Response("{}", { status: 500 }));
		const results = await fetchPassages(REFS, { ...OPTS, cacheEnabled: false }, makeKV(), http);
		expect(results).toEqual([
			{ ok: false, kind: "fetch-error" },
			{ ok: false, kind: "fetch-error" },
		]);
	});

	it("degrades to fetch-error when the batch request throws (timeout/network)", async () => {
		const { fetchPassages } = await import("../src/lib/midvash.ts");
		const http: HttpLike = {
			async fetch() {
				throw new Error("aborted");
			},
		};
		const results = await fetchPassages(REFS, { ...OPTS, cacheEnabled: false }, makeKV(), http);
		expect(results).toEqual([
			{ ok: false, kind: "fetch-error" },
			{ ok: false, kind: "fetch-error" },
		]);
	});
});
