import { describe, it, expect } from "vitest";

import { biblePlugin } from "../src/index.ts";
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
