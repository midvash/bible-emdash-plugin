import { describe, it, expect } from "vitest";

import { biblePlugin } from "../src/index.ts";
import { DEFAULTS, SETTINGS_SCHEMA } from "../src/lib/settings.ts";
import pkg from "../package.json";

describe("biblePlugin descriptor", () => {
	it("returns a standard-format descriptor", () => {
		const d = biblePlugin();
		expect(d.id).toBe("bible-by-midvash");
		expect(d.format).toBe("standard");
		expect(d.entrypoint).toBe("@midvash/emdash-plugin-bible/sandbox");
	});

	it("keeps the descriptor version in sync with package.json (no drift)", () => {
		expect(biblePlugin().version).toBe(pkg.version);
	});

	it("declares the current network + page-fragments capabilities", () => {
		// "network:fetch" is deprecated (hard-fails publish); page:fragments needs
		// the register capability or the hook is silently skipped.
		expect(biblePlugin().capabilities).toEqual([
			"network:request",
			"hooks.page-fragments:register",
		]);
	});

	it("restricts network access to the Midvash API host", () => {
		expect(biblePlugin().allowedHosts).toEqual(["api.midvash.com"]);
	});

	it("declares the Block Kit settings admin page", () => {
		expect(biblePlugin().adminPages?.[0]?.path).toBe("/settings");
	});

	it("allows overriding the plugin id", () => {
		expect(biblePlugin({ id: "custom-bible" }).id).toBe("custom-bible");
	});
});

describe("descriptor settingsSchema (EmDash ≥0.30 auto-generated settings form)", () => {
	// EmDash 0.30 renders a settings form straight from the descriptor's
	// `settingsSchema` and persists values under `plugin:{id}:settings:{key}` —
	// the exact keys this plugin already reads via `ctx.kv.get("settings:{key}")`.

	it("declares a settingsSchema with one field per setting", () => {
		const schema = biblePlugin().settingsSchema;
		expect(schema).toBeDefined();
		expect(Object.keys(schema!).sort()).toEqual(Object.keys(DEFAULTS).sort());
	});

	it("derives every field from SETTINGS_SCHEMA (labels and types match)", () => {
		const schema = biblePlugin().settingsSchema!;
		for (const [key, src] of Object.entries(SETTINGS_SCHEMA)) {
			expect(schema[key]?.type).toBe(src.type);
			expect(schema[key]?.label).toBe(src.label);
		}
	});

	it("keeps defaults in sync with DEFAULTS (single source of truth)", () => {
		const schema = biblePlugin().settingsSchema!;
		for (const [key, value] of Object.entries(DEFAULTS)) {
			expect((schema[key] as { default?: unknown }).default).toBe(value);
		}
	});

	it("emits plain mutable options arrays (assignable to SettingField)", () => {
		const schema = biblePlugin().settingsSchema!;
		const language = schema.language as { options: Array<{ value: string; label: string }> };
		expect(Array.isArray(language.options)).toBe(true);
		expect(language.options.map((o) => o.value)).toContain("pt-br");
		// Must be a copy, not the frozen `as const` array from SETTINGS_SCHEMA.
		expect(language.options).not.toBe((SETTINGS_SCHEMA.language as { options: unknown }).options);
	});
});
