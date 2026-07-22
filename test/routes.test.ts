import { describe, it, expect } from "vitest";

import plugin from "../src/sandbox-entry.ts";
import type { VerseResponse } from "../src/lib/midvash.ts";

// sandbox-entry imports `emdash/plugin` for types only (elided at runtime), so
// it loads cleanly here. We exercise the hooks + route handlers with a mock ctx.

const def = plugin as any;
const routes = def.routes as Record<string, { handler: (rc: any, ctx: any) => Promise<unknown> }>;
const hooks = def.hooks as Record<string, { handler: (ev: any, ctx: any) => Promise<any> }>;

function makeCtx(opts: { kv?: Record<string, unknown>; http?: unknown; noList?: boolean } = {}) {
	const store = new Map<string, unknown>(Object.entries(opts.kv ?? {}));
	const kv: Record<string, unknown> = {
		async get(k: string) {
			return store.has(k) ? store.get(k) : null;
		},
		async set(k: string, v: unknown) {
			store.set(k, v);
		},
		async delete(k: string) {
			return store.delete(k);
		},
		async list(prefix?: string) {
			const out: Array<{ key: string; value: unknown }> = [];
			for (const [key, value] of store) {
				if (!prefix || key.startsWith(prefix)) out.push({ key, value });
			}
			return out;
		},
	};
	if (opts.noList) delete kv.list;
	return { store, kv, http: opts.http, log: { info() {}, warn() {}, error() {}, debug() {} } };
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

describe("page:fragments hook", () => {
	it("injects a <style> head fragment and an inline-script body:end fragment", async () => {
		const frags = await hooks["page:fragments"].handler({}, makeCtx());
		expect(frags).toHaveLength(2);

		const style = frags.find((f: any) => f.kind === "html");
		expect(style.placement).toBe("head");
		expect(style.html).toContain("<style>");
		expect(style.html).toContain(".midvash-tooltip");

		const script = frags.find((f: any) => f.kind === "inline-script");
		expect(script.placement).toBe("body:end");
		expect(script.code).not.toContain("__SETTINGS__");
		expect(script.code).toContain('"pattern"');
	});

	it("returns no fragments when disabled", async () => {
		const frags = await hooks["page:fragments"].handler({}, makeCtx({ kv: { "settings:enabled": false } }));
		expect(frags).toEqual([]);
	});

	it("localizes the injected strings to the configured language", async () => {
		const frags = await hooks["page:fragments"].handler({}, makeCtx({ kv: { "settings:language": "en" } }));
		const script = frags.find((f: any) => f.kind === "inline-script");
		expect(script.code).toContain('"readMore":"Read more ↗"');
	});

	it("emits color overrides only when useCustomColors is on", async () => {
		const off = await hooks["page:fragments"].handler({}, makeCtx());
		expect(off.find((f: any) => f.kind === "html").html).not.toContain(":root");

		const on = await hooks["page:fragments"].handler(
			{},
			makeCtx({ kv: { "settings:useCustomColors": true, "settings:linkColor": "#abcdef" } }),
		);
		expect(on.find((f: any) => f.kind === "html").html).toContain("--midvash-link-color: #abcdef");
	});
});

describe("plugin:install hook", () => {
	it("seeds defaults into KV", async () => {
		const ctx = makeCtx();
		await hooks["plugin:install"].handler({}, ctx);
		expect(await ctx.kv.get("settings:language")).toBe("pt-br");
		expect(await ctx.kv.get("settings:defaultVersion")).toBe("naa");
		expect(await ctx.kv.get("settings:cacheTtlSeconds")).toBe(2_592_000);
	});

	it("does not overwrite existing settings", async () => {
		const ctx = makeCtx({ kv: { "settings:language": "en" } });
		await hooks["plugin:install"].handler({}, ctx);
		expect(await ctx.kv.get("settings:language")).toBe("en");
	});
});

describe("loadSettings (via the settings route)", () => {
	it("uses the kv.list fast path and ignores non-settings keys", async () => {
		const ctx = makeCtx({ kv: { "settings:language": "en", "cache:verse:x": { junk: true } } });
		const out = (await routes.settings.handler({}, ctx)) as any;
		expect(out.language).toBe("en");
		expect(out.defaultVersion).toBe("naa"); // default kept
		expect(out).not.toHaveProperty("verse:x");
	});

	it("falls back to per-key reads when kv.list is unavailable", async () => {
		const ctx = makeCtx({ kv: { "settings:theme": "dark" }, noList: true });
		const out = (await routes.settings.handler({}, ctx)) as any;
		expect(out.theme).toBe("dark");
		expect(out.language).toBe("pt-br");
	});

	it("validates/coerces corrupt persisted values (kv.list path)", async () => {
		const ctx = makeCtx({
			kv: { "settings:theme": "neon", "settings:enabled": "false", "settings:language": "es" },
		});
		const out = (await routes.settings.handler({}, ctx)) as any;
		expect(out.theme).toBe("auto"); // unknown enum -> default
		expect(out.enabled).toBe(false); // stringy boolean coerced
		expect(out.language).toBe("es"); // valid value kept
	});
});

describe("lookup route", () => {
	it("resolves a reference to verse text and a read-more URL", async () => {
		const http = { async fetch() { return new Response(JSON.stringify(VERSE), { status: 200 }); } };
		const ctx = makeCtx({ http });
		const rc = { request: { url: "http://localhost/lookup?ref=" + encodeURIComponent("João 3:16") } };
		const out = (await routes.lookup.handler(rc, ctx)) as any;
		expect(out.text).toBe(VERSE.data.text);
		expect(out.reference).toBe("João 3:16");
		expect(out.readMoreUrl).toBe("https://midvash.com/pt-br/naa/joao/3/16");
	});

	it("does not call request.json() (sandbox-safe — request has only url)", async () => {
		// The mock request is a bare { url } with no .json(); a passing lookup
		// proves the handler never reaches for body-parsing methods.
		const http = { async fetch() { return new Response(JSON.stringify(VERSE), { status: 200 }); } };
		const rc = { request: { url: "http://localhost/lookup?ref=" + encodeURIComponent("Gn 1:1") } };
		await expect(routes.lookup.handler(rc, makeCtx({ http }))).resolves.toBeTruthy();
	});

	it("throws for a missing ?ref", async () => {
		await expect(routes.lookup.handler({ request: { url: "http://localhost/lookup" } }, makeCtx())).rejects.toThrow(/ref/i);
	});

	it("throws for an unrecognized reference", async () => {
		const http = { async fetch() { return new Response("{}", { status: 200 }); } };
		const rc = { request: { url: "http://localhost/lookup?ref=" + encodeURIComponent("Xyz 1:1") } };
		await expect(routes.lookup.handler(rc, makeCtx({ http }))).rejects.toThrow(/Unrecognized/);
	});

	it("returns error=fetch-error when upstream is 5xx (issue #41)", async () => {
		const http = { async fetch() { return new Response("x", { status: 500 }); } };
		const rc = { request: { url: "http://localhost/lookup?ref=" + encodeURIComponent("João 3:16") } };
		const out = await routes.lookup.handler(rc, makeCtx({ http }));
		expect(out.error).toBe("fetch-error");
		expect(out.reference).toContain("3:16");
	});

	it("returns error=not-found when upstream is 404 (issue #41)", async () => {
		const http = { async fetch() { return new Response("nope", { status: 404 }); } };
		const rc = { request: { url: "http://localhost/lookup?ref=" + encodeURIComponent("João 99:99") } };
		const out = await routes.lookup.handler(rc, makeCtx({ http }));
		expect(out.error).toBe("not-found");
		expect(out.reference).toContain("99:99");
	});
});

describe("versions route", () => {
	it("returns versions from upstream", async () => {
		const payload = { data: [{ slug: "naa", name: "NAA", language: "pt-br" }] };
		const http = { async fetch() { return new Response(JSON.stringify(payload), { status: 200 }); } };
		const out = (await routes.versions.handler({ request: { url: "http://localhost/versions?lang=pt-br" } }, makeCtx({ http }))) as any;
		// Inner array, not double-wrapped — EmDash adds the { data: ... } envelope.
		expect(Array.isArray(out)).toBe(true);
		expect(out.data).toBeUndefined();
		expect(out[0].slug).toBe("naa");
	});

	it("throws when upstream fails", async () => {
		const http = { async fetch() { return new Response("x", { status: 500 }); } };
		await expect(routes.versions.handler({ request: { url: "http://localhost/versions" } }, makeCtx({ http }))).rejects.toThrow(/Upstream/);
	});
});

describe("settings/save route", () => {
	it("persists settings from input only", async () => {
		const ctx = makeCtx();
		const out = (await routes["settings/save"].handler({ input: { theme: "dark", language: "es" } }, ctx)) as any;
		expect(out.success).toBe(true);
		expect(await ctx.kv.get("settings:theme")).toBe("dark");
		expect(await ctx.kv.get("settings:language")).toBe("es");
	});
});

describe("admin route", () => {
	it("returns Block Kit blocks with the settings form", async () => {
		const out = (await routes.admin.handler({ input: {} }, makeCtx())) as any;
		expect(Array.isArray(out.blocks)).toBe(true);
		expect(out.blocks.some((b: any) => b.type === "form")).toBe(true);
	});

	it("persists on form_submit and returns a success toast", async () => {
		const ctx = makeCtx();
		const out = (await routes.admin.handler({ input: { type: "form_submit", action_id: "save", values: { language: "es" } } }, ctx)) as any;
		expect(await ctx.kv.get("settings:language")).toBe("es");
		expect(out.toast.type).toBe("success");
	});
});

describe("scan route", () => {
	it("returns every detected reference in the input text", async () => {
		const out = (await routes.scan.handler({ input: { text: "João 3:16 e Salmos 23" } }, makeCtx())) as any;
		expect(out.matches).toHaveLength(2);
		expect(out.matches[0].slug).toBe("john");
		expect(out.matches[1].slug).toBe("psalms");
	});

	it("returns no matches for empty input", async () => {
		const out = (await routes.scan.handler({ input: {} }, makeCtx())) as any;
		expect(out.matches).toEqual([]);
	});
});

describe("route metadata (EmDash ≥0.30 practices)", () => {
	const meta = def.routes as Record<
		string,
		{ public?: boolean; permission?: string; cacheControl?: string }
	>;

	it("declares Cache-Control on the public routes", () => {
		// New in EmDash 0.30: `cacheControl` sets the Cache-Control header on
		// successful GET responses — honored only on `public: true` routes.
		expect(meta.lookup.public).toBe(true);
		expect(meta.lookup.cacheControl).toMatch(/^public, max-age=\d+/);
		expect(meta.versions.public).toBe(true);
		expect(meta.versions.cacheControl).toMatch(/^public, max-age=\d+/);
	});

	it("keeps the lookup TTL short (client omits ?v/&lang, so settings changes must propagate)", () => {
		const maxAge = Number(/max-age=(\d+)/.exec(meta.lookup.cacheControl!)?.[1]);
		expect(maxAge).toBeLessThanOrEqual(300);
	});

	it("never sets cacheControl on authenticated routes (only honored on public)", () => {
		for (const [name, route] of Object.entries(meta)) {
			if (!route.public) expect(route.cacheControl, `route ${name}`).toBeUndefined();
		}
	});

	it("declares an explicit RBAC permission on the scan route (required for MCP)", () => {
		expect(meta.scan.public).toBe(false);
		expect(meta.scan.permission).toBe("plugins:manage");
	});
});

describe("MCP tools (EmDash ≥0.30 agent-callable routes)", () => {
	const mcp = def.mcp as {
		tools: Record<
			string,
			{
				description: string;
				route: string;
				destructive?: boolean;
				input: { safeParse: (v: unknown) => { success: boolean } };
			}
		>;
	};

	it("exposes the scan route as a non-destructive MCP tool", () => {
		const tool = mcp.tools.scan;
		expect(tool).toBeDefined();
		expect(tool.route).toBe("scan");
		expect(tool.destructive).toBe(false);
		expect(tool.description.length).toBeGreaterThan(10);
	});

	it("validates tool input with a zod schema requiring text", () => {
		const tool = mcp.tools.scan;
		expect(tool.input.safeParse({ text: "João 3:16" }).success).toBe(true);
		expect(tool.input.safeParse({}).success).toBe(false);
	});

	it("only references private permissioned routes (bundle CLI hard-fails otherwise)", () => {
		const routeMeta = def.routes as Record<string, { public?: boolean; permission?: string }>;
		for (const [name, tool] of Object.entries(mcp.tools)) {
			const target = routeMeta[tool.route];
			expect(target, `tool ${name} route`).toBeDefined();
			expect(target.public ?? false, `tool ${name} must not use a public route`).toBe(false);
			expect(target.permission, `tool ${name} route needs a permission`).toBeTruthy();
		}
	});
});

describe("passages route (batch, EmDash ≥0.30 practices)", () => {
	const meta = def.routes as Record<string, { public?: boolean; cacheControl?: string }>;
	const batch = (items: unknown[]) => ({
		data: items,
		meta: { total: items.length, version: "naa", resolved: items.length, failed: 0 },
	});
	const johnItem = {
		version: "naa", book: "john", bookName: "John", chapter: 3,
		verse: 16, verseEnd: 16, text: "Porque Deus amou o mundo...",
		verses: ["Porque Deus amou o mundo..."], reference: "John 3:16",
	};
	const psalmsChapter = {
		version: "naa", book: "psalms", bookName: "Psalms", chapter: 23,
		verses: ["v1", "v2"], reference: "Psalms 23",
	};

	it("is public and cacheable", () => {
		expect(meta.passages.public).toBe(true);
		expect(meta.passages.cacheControl).toMatch(/^public, max-age=\d+/);
	});

	it("resolves multiple refs from ?refs= in one call, matching /lookup shape", async () => {
		let calls = 0;
		const http = { async fetch() { calls++; return new Response(JSON.stringify(batch([johnItem, psalmsChapter])), { status: 200 }); } };
		const ctx = makeCtx({ http });
		const rc = { request: { url: "http://localhost/passages?refs=" + encodeURIComponent("João 3:16;Salmos 23") } };
		const out = (await def.routes.passages.handler(rc, ctx)) as any;
		expect(calls).toBe(1);
		expect(out.results).toHaveLength(2);
		expect(out.results[0].text).toContain("Porque Deus amou");
		expect(out.results[0].reference).toBe("João 3:16");
		expect(out.results[0].readMoreUrl).toBe("https://midvash.com/pt-br/naa/joao/3/16");
		// Whole-chapter ref gets joined text (normalizeVerseData) instead of undefined.
		expect(out.results[1].text).toBe("v1 v2");
	});

	it("reports per-ref not-found without failing the batch", async () => {
		// Both refs PARSE (valid book names); the API rejects the first
		// (nonexistent chapter) via a per-item error, which must map to
		// not-found without dropping the second.
		const http = { async fetch() { return new Response(JSON.stringify(batch([{ ref: "João 99:1", error: "Verse(s) out of range." }, johnItem])), { status: 200 }); } };
		const rc = { request: { url: "http://localhost/passages?refs=" + encodeURIComponent("João 99:1;João 3:16") } };
		const out = (await def.routes.passages.handler(rc, makeCtx({ http }))) as any;
		expect(out.results[0].error).toBe("not-found");
		expect(out.results[1].text).toContain("Porque Deus amou");
	});

	it("skips unparseable refs but keeps positions for the parseable ones", async () => {
		const http = { async fetch() { return new Response(JSON.stringify(batch([johnItem])), { status: 200 }); } };
		const rc = { request: { url: "http://localhost/passages?refs=" + encodeURIComponent("lorem ipsum;João 3:16") } };
		const out = (await def.routes.passages.handler(rc, makeCtx({ http }))) as any;
		expect(out.results).toHaveLength(2);
		expect(out.results[0].error).toBe("unrecognized");
		expect(out.results[1].text).toContain("Porque Deus amou");
	});

	it("throws for a missing ?refs", async () => {
		await expect(def.routes.passages.handler({ request: { url: "http://localhost/passages" } }, makeCtx())).rejects.toThrow(/refs/i);
	});
});

describe("scan MCP tool — includeText option", () => {
	const johnItem = {
		version: "naa", book: "john", bookName: "John", chapter: 3,
		verse: 16, verseEnd: 16, text: "Porque Deus amou o mundo...",
		verses: ["Porque Deus amou o mundo..."], reference: "John 3:16",
	};

	it("returns coordinates only by default (no upstream call)", async () => {
		let calls = 0;
		const http = { async fetch() { calls++; return new Response("{}", { status: 200 }); } };
		const out = (await def.routes.scan.handler({ input: { text: "João 3:16" } }, makeCtx({ http }))) as any;
		expect(calls).toBe(0);
		expect(out.matches[0].slug).toBe("john");
		expect(out.matches[0].text).toBeUndefined();
	});

	it("includes verse text via a single batch call when includeText is true", async () => {
		let calls = 0;
		const http = { async fetch() { calls++; return new Response(JSON.stringify({ data: [johnItem], meta: { total: 1, resolved: 1, failed: 0 } }), { status: 200 }); } };
		const out = (await def.routes.scan.handler({ input: { text: "Leia João 3:16 hoje", includeText: true } }, makeCtx({ http }))) as any;
		expect(calls).toBe(1);
		expect(out.matches[0].slug).toBe("john");
		expect(out.matches[0].text).toContain("Porque Deus amou");
	});
});
