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

	it("throws when upstream lookup fails", async () => {
		const http = { async fetch() { return new Response("x", { status: 500 }); } };
		const rc = { request: { url: "http://localhost/lookup?ref=" + encodeURIComponent("João 3:16") } };
		await expect(routes.lookup.handler(rc, makeCtx({ http }))).rejects.toThrow(/Upstream/);
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
