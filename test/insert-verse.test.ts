import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";
import { validateBlockResponse, validateEditorDraftPatchEffect } from "@emdash-cms/blocks/server";

import store from "../src/plugin.ts";
import trusted from "../src/trusted.ts";
import {
	INSERT_FIELD,
	INSERT_PANEL_ROUTE,
	appendBlocks,
	buildQuoteBlocks,
	panelStrings,
	referenceLabel,
	renderInsertPanel,
} from "../src/lib/insert-verse.ts";
import type { VerseResponse } from "../src/lib/midvash.ts";

const route = (store as any).routes[INSERT_PANEL_ROUTE] as {
	public?: boolean;
	permission?: string;
	handler: (rc: any, ctx: any) => Promise<any>;
};

function makeCtx(opts: { kv?: Record<string, unknown>; http?: unknown } = {}) {
	const store = new Map<string, unknown>(Object.entries(opts.kv ?? {}));
	return {
		kv: {
			async get(k: string) {
				return store.has(k) ? store.get(k) : null;
			},
			async set(k: string, v: unknown) {
				store.set(k, v);
			},
			async list(prefix: string) {
				return [...store].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value }));
			},
		},
		http: opts.http,
		log: { info() {}, warn() {}, error() {}, debug() {} },
	};
}

function httpReturning(body: unknown, status = 200) {
	const urls: string[] = [];
	return {
		urls,
		async fetch(url: string) {
			urls.push(url);
			return new Response(JSON.stringify(body), { status });
		},
	};
}

const PSALM: VerseResponse = {
	data: {
		version: "almeida-livre",
		book: "psalms",
		bookName: "Salmos",
		chapter: 23,
		verses: ["O Senhor é o meu pastor; nada me faltará.", "Deitar-me faz em verdes pastos."],
	},
	meta: {
		reference: "Psalms 23",
		total: 2,
		copyright: "Almeida Livre (ALM)\nCC BY 4.0",
	},
};

const UI = { surface: "content-editor-panel", locale: "pt-BR", entry: { collection: "posts", id: "e1", locale: null, version: 1 } };

function submit(ref: string, content: unknown, extra: Record<string, unknown> = {}) {
	return {
		ui: UI,
		input: {
			type: "form_submit",
			action_id: "insert",
			values: { ref, version: "almeida-livre", ...extra },
			draft: { fields: { [INSERT_FIELD]: content } },
		},
	};
}

const EXISTING = [
	{ _type: "block", _key: "b0", style: "normal", markDefs: [], children: [{ _type: "span", _key: "s0", text: "Meu post.", marks: [] }] },
];

describe("store vs trusted edition", () => {
	it("the store entry has no trusted-only page:fragments hook", () => {
		expect(Object.keys((store as any).hooks)).toEqual(["plugin:install"]);
	});

	it("the trusted entry is the store plus page:fragments", () => {
		expect(Object.keys((trusted as any).hooks).sort()).toEqual(["page:fragments", "plugin:install"]);
		expect((trusted as any).routes).toBe((store as any).routes);
	});

	it("the store manifest asks for editor-draft access, not page-fragments", () => {
		const jsonc = readFileSync(new URL("../emdash-plugin.jsonc", import.meta.url), "utf8");
		expect(jsonc).not.toContain('"hooks.page-fragments:register"');
		expect(jsonc).toContain('"admin.editor-draft:read"');
		expect(jsonc).toContain('"admin.editor-draft:patch"');
		expect(jsonc).toContain(`"route": "${INSERT_PANEL_ROUTE}"`);
	});
});

describe("insert-verse panel route", () => {
	it("is a private editor route", () => {
		expect(route.public).toBe(false);
		expect(route.permission).toBe("content:edit_own");
	});

	it("renders a valid Block Kit form on panel_load", async () => {
		const res = await route.handler({ ui: UI, input: { type: "panel_load" } }, makeCtx());
		expect(validateBlockResponse(res, {}).errors).toEqual([]);
		const form = res.blocks.find((b: any) => b.type === "form");
		expect(form.fields.map((f: any) => f.action_id)).toEqual(["ref", "version"]);
		expect(form.fields[1].initial_value).toBe("almeida-livre");
	});

	it("follows the admin locale for the panel copy", async () => {
		const res = await route.handler({ ui: { ...UI, locale: "es" }, input: { type: "panel_load" } }, makeCtx());
		expect(JSON.stringify(res.blocks)).toContain(panelStrings("es").submit);
	});

	it("appends the passage as a blockquote at the END of the draft field", async () => {
		const http = httpReturning(PSALM);
		const res = await route.handler(submit("Salmos 23", EXISTING), makeCtx({ http }));

		expect(validateBlockResponse(res, {}).errors).toEqual([]);
		expect(validateEditorDraftPatchEffect(res.patch).errors).toEqual([]);
		// Full chapter, not the tooltip's truncated preview.
		expect(http.urls[0]).toBe("https://api.midvash.com/v1/almeida-livre/psalms/23");

		const [op] = res.patch.operations;
		expect(op).toMatchObject({ op: "set", field: INSERT_FIELD });
		expect(op.value[0]).toBe(EXISTING[0]);
		const [quote, credit] = op.value.slice(1);
		expect(quote.style).toBe("blockquote");
		expect(quote.children[0].text).toContain("O Senhor é o meu pastor");
		expect(credit.style).toBe("blockquote");
		expect(credit.children.map((c: any) => c.text).join("")).toBe("Salmos 23 · Almeida Livre (ALM) · CC BY 4.0");
		expect(credit.markDefs[0].href).toBe("https://midvash.com/pt-br/almeida-livre/salmos/23");
		expect(res.toast.type).toBe("success");
	});

	it("works on an empty field", async () => {
		const res = await route.handler(submit("Salmos 23", null), makeCtx({ http: httpReturning(PSALM) }));
		expect(res.patch.operations[0].value).toHaveLength(2);
	});

	it("omits the midvash.com link when 'read more' is off", async () => {
		const ctx = makeCtx({ http: httpReturning(PSALM), kv: { "settings:showReadMore": false } });
		const res = await route.handler(submit("Salmos 23", []), ctx);
		expect(res.patch.operations[0].value[1].markDefs).toEqual([]);
	});

	it("shows an error and no patch for an unknown reference", async () => {
		const http = httpReturning(PSALM);
		const res = await route.handler(submit("Livro 99", []), makeCtx({ http }));
		expect(res.patch).toBeUndefined();
		expect(res.blocks[0]).toMatchObject({ type: "banner", variant: "error", description: panelStrings("pt-br").unrecognized });
		expect(http.urls).toHaveLength(0);
	});

	it("keeps what the author typed after an error", async () => {
		const res = await route.handler(submit("Livro 99", []), makeCtx({ http: httpReturning(PSALM) }));
		const form = res.blocks.find((b: any) => b.type === "form");
		expect(form.fields[0].initial_value).toBe("Livro 99");
	});

	it("maps a 404 to 'not found' and other failures to 'fetch error'", async () => {
		const notFound = await route.handler(submit("João 99:99", []), makeCtx({ http: httpReturning({}, 404) }));
		expect(notFound.blocks[0].description).toBe(panelStrings("pt-br").notFound);
		const failed = await route.handler(submit("João 3:16", []), makeCtx({ http: httpReturning({}, 500) }));
		expect(failed.blocks[0].description).toBe(panelStrings("pt-br").fetchError);
	});

	it("refuses when the entry has no content field in the draft", async () => {
		const rc = submit("João 3:16", []);
		rc.input.draft = { fields: {} };
		const res = await route.handler(rc, makeCtx({ http: httpReturning(PSALM) }));
		expect(res.blocks[0].description).toBe(panelStrings("pt-br").noField);
	});

	it("refuses a result over the editor's field size limit", async () => {
		const big = [{ _type: "block", _key: "big", style: "normal", markDefs: [], children: [{ _type: "span", _key: "s", text: "x".repeat(70_000), marks: [] }] }];
		const res = await route.handler(submit("Salmos 23", big), makeCtx({ http: httpReturning(PSALM) }));
		expect(res.patch).toBeUndefined();
		expect(res.blocks[0].description).toBe(panelStrings("pt-br").tooLarge);
	});

	it("throws when the network capability is missing", async () => {
		await expect(route.handler(submit("João 3:16", []), makeCtx())).rejects.toThrow(/Network/);
	});
});

describe("insert-verse helpers", () => {
	it("labels references with the author's book name", () => {
		expect(referenceLabel({ slug: "john", matchedName: "Jo", chapter: 3, verse: 16, verseEnd: 18 }, "João")).toBe("Jo 3:16-18");
		expect(referenceLabel({ slug: "john", matchedName: "", chapter: 3, verse: 16, verseEnd: 16 }, "João")).toBe("João 3:16");
	});

	it("builds unique-keyed blockquote blocks without a link when no href", () => {
		const blocks = buildQuoteBlocks({ reference: "João 3:16", text: "t", attribution: "ALM" });
		const keys = JSON.stringify(blocks).match(/"_key":"[^"]+"/g) ?? [];
		expect(new Set(keys).size).toBe(keys.length);
		expect((blocks[1] as any).markDefs).toEqual([]);
	});

	it("appends to a non-array value as if empty", () => {
		expect(appendBlocks(undefined, [1])).toEqual([1]);
	});

	it("falls back to pt-br strings for an unknown language", () => {
		expect(panelStrings("xx" as never)).toBe(panelStrings("pt-br"));
		expect(renderInsertPanel("en", { version: "kjv" })).toHaveLength(2);
	});
});
