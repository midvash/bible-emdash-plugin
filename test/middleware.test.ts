import { describe, it, expect, beforeEach, vi } from "vitest";

// Mutable settings backing the mocked `getPluginSetting` (hoisted so the
// vi.mock factory can close over it).
const { settings } = vi.hoisted(() => ({
	settings: {} as Record<string, unknown>,
}));

vi.mock("emdash", () => ({
	getPluginSetting: async (_pluginId: string, key: string) =>
		key in settings ? settings[key] : null,
}));

import { bibleLinkifier } from "../src/middleware.ts";

beforeEach(() => {
	for (const k of Object.keys(settings)) delete settings[k];
	settings.enabled = true;
	settings.language = "pt-br";
	settings.defaultVersion = "naa";
});

function htmlResponse(body: string) {
	return new Response(body, {
		status: 200,
		headers: { "content-type": "text/html; charset=utf-8" },
	});
}

function context(url: string) {
	return { request: new Request(url) } as never;
}

describe("bibleLinkifier", () => {
	it("linkifies references in HTML responses", async () => {
		const mw = bibleLinkifier();
		const res = await mw(context("http://site/post"), async () => htmlResponse("<p>João 3:16</p>"));
		const html = await res.text();
		expect(html).toContain('class="midvash-ref"');
		expect(html).toContain("https://midvash.com/pt-br/naa/joao/3/16");
		expect(res.headers.get("content-length")).toBeNull(); // dropped after rewrite
	});

	it("passes non-HTML responses through untouched", async () => {
		const mw = bibleLinkifier();
		const json = new Response("{}", { headers: { "content-type": "application/json" } });
		const res = await mw(context("http://site/api"), async () => json);
		expect(res).toBe(json);
	});

	it("skips internal /_emdash and /_astro paths", async () => {
		const mw = bibleLinkifier();
		const passed = htmlResponse("<p>João 3:16</p>");
		expect(await mw(context("http://site/_emdash/admin"), async () => passed)).toBe(passed);
		expect(await mw(context("http://site/_astro/x.js"), async () => passed)).toBe(passed);
	});

	it("does nothing when the plugin is disabled", async () => {
		settings.enabled = false;
		const mw = bibleLinkifier();
		const passed = htmlResponse("<p>João 3:16</p>");
		expect(await mw(context("http://site/post"), async () => passed)).toBe(passed);
	});

	it("honors explicit language/version options over settings", async () => {
		const mw = bibleLinkifier({ language: "en", version: "niv" });
		const res = await mw(context("http://site/post"), async () => htmlResponse("<p>John 3:16</p>"));
		const html = await res.text();
		expect(html).toContain("https://midvash.com/niv/john/3/16");
	});

	it("falls back to pt-br/naa when settings are unset", async () => {
		delete settings.language;
		delete settings.defaultVersion;
		const mw = bibleLinkifier();
		const res = await mw(context("http://site/post"), async () => htmlResponse("<p>João 3:16</p>"));
		expect(await res.text()).toContain("/pt-br/naa/");
	});
});

describe("bibleLinkifier per-page locale", () => {
	function localeContext(url: string, currentLocale: string | undefined) {
		return { request: new Request(url), currentLocale } as never;
	}

	it("links English pages to the English site and versionEn", async () => {
		settings.versionEn = "nlt";
		const mw = bibleLinkifier();
		const res = await mw(localeContext("http://site/post", "en"), async () => htmlResponse("<p>John 3:16</p>"));
		expect(await res.text()).toContain("https://midvash.com/nlt/john/3/16");
	});

	it("links Spanish pages to the Spanish site and versionEs", async () => {
		settings.versionEs = "ntv";
		const mw = bibleLinkifier();
		const res = await mw(localeContext("http://site/es/post", "es"), async () => htmlResponse("<p>Juan 3:16</p>"));
		expect(await res.text()).toContain("https://midvash.com/es/ntv/");
	});

	it("keeps the main language and defaultVersion on main-language pages", async () => {
		const mw = bibleLinkifier();
		const res = await mw(localeContext("http://site/pt-br/post", "pt-br"), async () => htmlResponse("<p>João 3:16</p>"));
		expect(await res.text()).toContain("https://midvash.com/pt-br/naa/joao/3/16");
	});

	it("an explicit language option still wins over the page locale", async () => {
		const mw = bibleLinkifier({ language: "pt-br", version: "ara" });
		const res = await mw(localeContext("http://site/post", "en"), async () => htmlResponse("<p>João 3:16</p>"));
		expect(await res.text()).toContain("https://midvash.com/pt-br/ara/joao/3/16");
	});
});
