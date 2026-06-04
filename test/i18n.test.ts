import { describe, it, expect } from "vitest";

import { getClientStrings, DEFAULT_CLIENT_STRINGS } from "../src/lib/i18n.ts";

describe("getClientStrings", () => {
	it("returns the pt-br set", () => {
		const s = getClientStrings("pt-br");
		expect(s.loading).toBe("Carregando…");
		expect(s.readMore).toBe("Ler mais ↗");
		expect(s.on).toBe("no Midvash");
	});

	it("returns the en set (no longer mixing PT into English tooltips)", () => {
		const s = getClientStrings("en");
		expect(s.loading).toBe("Loading…");
		expect(s.readMore).toBe("Read more ↗");
		expect(s.on).toBe("on Midvash");
	});

	it("returns the es set", () => {
		const s = getClientStrings("es");
		expect(s.error).toBe("No se pudo cargar este versículo.");
		expect(s.on).toBe("en Midvash");
	});

	it("falls back to pt-br for an unknown language", () => {
		expect(getClientStrings("xx" as never)).toEqual(DEFAULT_CLIENT_STRINGS);
	});

	it("defines all four tooltip keys for every supported language", () => {
		for (const lang of ["pt-br", "en", "es"] as const) {
			const s = getClientStrings(lang);
			for (const key of ["loading", "error", "readMore", "on"] as const) {
				expect(typeof s[key]).toBe("string");
				expect(s[key].length).toBeGreaterThan(0);
			}
		}
	});
});
