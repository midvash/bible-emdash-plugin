import { describe, it, expect } from "vitest";

import { localeToLanguage, resolvePageLanguage } from "../src/lib/locale.ts";
import { DEFAULTS } from "../src/lib/settings.ts";

describe("localeToLanguage", () => {
	it("maps BCP-47 locales to the plugin's languages", () => {
		expect(localeToLanguage("en")).toBe("en");
		expect(localeToLanguage("en-US")).toBe("en");
		expect(localeToLanguage("es")).toBe("es");
		expect(localeToLanguage("es_MX")).toBe("es");
		expect(localeToLanguage("pt-br")).toBe("pt-br");
		expect(localeToLanguage("pt-BR")).toBe("pt-br");
		expect(localeToLanguage("pt")).toBe("pt-br");
	});

	it("returns null for unknown or missing locales", () => {
		expect(localeToLanguage("fr")).toBeNull();
		expect(localeToLanguage("")).toBeNull();
		expect(localeToLanguage(null)).toBeNull();
		expect(localeToLanguage(undefined)).toBeNull();
	});
});

describe("resolvePageLanguage", () => {
	const s = { ...DEFAULTS, language: "pt-br" as const, defaultVersion: "onbv", versionEn: "bsb", versionEs: "onbv-es" };

	it("keeps the main language and defaultVersion when there is no locale", () => {
		expect(resolvePageLanguage(s, null)).toEqual({ language: "pt-br", version: "onbv" });
	});

	it("keeps defaultVersion for pages in the main language", () => {
		expect(resolvePageLanguage(s, "pt-br")).toEqual({ language: "pt-br", version: "onbv" });
	});

	it("switches language and uses the per-language version on other-locale pages", () => {
		expect(resolvePageLanguage(s, "en")).toEqual({ language: "en", version: "bsb" });
		expect(resolvePageLanguage(s, "es")).toEqual({ language: "es", version: "onbv-es" });
	});

	it("uses versionPtBr when Portuguese is not the main language", () => {
		const en = { ...s, language: "en" as const, defaultVersion: "web", versionPtBr: "bpm" };
		expect(resolvePageLanguage(en, "pt-br")).toEqual({ language: "pt-br", version: "bpm" });
		expect(resolvePageLanguage(en, "en")).toEqual({ language: "en", version: "web" });
	});

	it("falls back to the main language for unsupported locales", () => {
		expect(resolvePageLanguage(s, "fr")).toEqual({ language: "pt-br", version: "onbv" });
	});

	it("swaps a version the API dropped for the one it serves (raw settings, e.g. middleware)", () => {
		const old = { ...s, defaultVersion: "nvt", versionEn: "nlt", versionEs: "ntv" };
		expect(resolvePageLanguage(old, "pt-br")).toEqual({ language: "pt-br", version: "onbv" });
		expect(resolvePageLanguage(old, "en")).toEqual({ language: "en", version: "bsb" });
		expect(resolvePageLanguage(old, "es")).toEqual({ language: "es", version: "onbv-es" });
	});
});
