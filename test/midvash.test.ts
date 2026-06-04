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
