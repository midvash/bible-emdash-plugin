import { describe, it, expect } from "vitest";

import { buildClientAssets } from "../src/lib/client-assets.ts";
import { DEFAULTS } from "../src/lib/settings.ts";

describe("buildClientAssets", () => {
	it("substitutes the settings token and injects pattern + selectors", () => {
		const { js } = buildClientAssets(DEFAULTS);
		expect(js).not.toContain("__SETTINGS__");
		expect(js).toContain('"pattern"');
		expect(js).toContain('"selectors"');
	});

	it("injects pt-br tooltip strings by default", () => {
		expect(buildClientAssets(DEFAULTS).js).toContain('"readMore":"Ler mais ↗"');
	});

	it("localizes strings by language", () => {
		expect(buildClientAssets({ ...DEFAULTS, language: "es" }).js).toContain('"readMore":"Leer más ↗"');
		expect(buildClientAssets({ ...DEFAULTS, language: "en" }).js).toContain('"readMore":"Read more ↗"');
	});

	it("ships the base tooltip CSS", () => {
		expect(buildClientAssets(DEFAULTS).css).toContain(".midvash-tooltip");
	});

	it("omits the :root color override unless useCustomColors is set", () => {
		expect(buildClientAssets(DEFAULTS).css).not.toContain(":root");
		const custom = buildClientAssets({ ...DEFAULTS, useCustomColors: true, linkColor: "#abcdef" });
		expect(custom.css).toContain("--midvash-link-color: #abcdef");
	});

	it("sanitizes color values so they can't break out of the <style> tag", () => {
		const evil = buildClientAssets({
			...DEFAULTS,
			useCustomColors: true,
			linkColor: "red;}</style><script>alert(1)</script>",
		});
		expect(evil.css).not.toContain("</style>");
		expect(evil.css).not.toContain("<script>");
		// The override block itself carries no stray braces from the payload.
		expect(evil.css.split(":root")[1]).not.toContain("}</style>");
	});
});
