import { describe, it, expect } from "vitest";

import { buildClientPattern } from "../src/lib/pattern.ts";

describe("buildClientPattern", () => {
	it("returns a usable regex string with unicode flags", () => {
		const { pattern, flags } = buildClientPattern("pt-br");
		expect(flags).toBe("giu");
		expect(() => new RegExp(pattern, flags)).not.toThrow();
	});

	it("matches references in the configured language and in English", () => {
		const { pattern, flags } = buildClientPattern("pt-br");
		const re = new RegExp(pattern, flags);
		expect("João 3:16".match(re)?.[0]).toBe("João 3:16");
		re.lastIndex = 0;
		expect("Genesis 1:1".match(re)?.[0]).toBe("Genesis 1:1"); // English names included
	});

	it("is non-capturing (only the full match, no extra groups)", () => {
		const { pattern, flags } = buildClientPattern("pt-br");
		const re = new RegExp(pattern, flags.replace("g", ""));
		const m = re.exec("Salmos 23");
		expect(m).not.toBeNull();
		expect(m?.length).toBe(1);
	});

	it("does not match unknown words", () => {
		const { pattern, flags } = buildClientPattern("pt-br");
		const re = new RegExp(pattern, flags);
		expect(re.test("Hello 3:16")).toBe(false);
	});
});
