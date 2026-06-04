import { describe, it, expect } from "vitest";

import { BOOKS, buildNameIndex, displayName, normalize } from "../src/lib/books.ts";

describe("BOOKS data", () => {
	it("has the 66 Protestant-canon books", () => {
		expect(BOOKS).toHaveLength(66);
	});

	it("has unique slugs", () => {
		const slugs = BOOKS.map((b) => b.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});

	it("provides names for every language on every book", () => {
		for (const book of BOOKS) {
			expect(book.names["pt-br"].length).toBeGreaterThan(0);
			expect(book.names.en.length).toBeGreaterThan(0);
			expect(book.names.es.length).toBeGreaterThan(0);
		}
	});
});

describe("normalize", () => {
	it("strips diacritics, lowercases, drops periods, collapses spaces", () => {
		expect(normalize("Gênesis")).toBe("genesis");
		expect(normalize("Gn.")).toBe("gn");
		expect(normalize("  1   Coríntios  ")).toBe("1 corintios");
		expect(normalize("João")).toBe("joao");
	});
});

describe("buildNameIndex", () => {
	const index = buildNameIndex();

	it("maps canonical names and abbreviations to slugs", () => {
		expect(index.get(normalize("Gênesis"))).toBe("genesis");
		expect(index.get(normalize("Gn"))).toBe("genesis");
		expect(index.get(normalize("João"))).toBe("john");
		expect(index.get(normalize("Salmos"))).toBe("psalms");
		expect(index.get(normalize("Sl"))).toBe("psalms");
		expect(index.get(normalize("1 Coríntios"))).toBe("1-corinthians");
		expect(index.get(normalize("1Co"))).toBe("1-corinthians");
		expect(index.get(normalize("Apocalipse"))).toBe("revelation");
	});

	it('maps "Jn" to John', () => {
		expect(index.get(normalize("Jn"))).toBe("john");
	});

	// KNOWN LIMITATION: normalize() strips accents, so "Jó" (Job) and "Jo"
	// (abbrev. of João) both collapse to "jo". John is defined after Job in
	// BOOKS, so it wins the key. The unaccented "Job" still resolves correctly.
	it('documents the "Jó"/"Jo" accent collision (resolves to John, not Job)', () => {
		expect(normalize("Jó")).toBe("jo");
		expect(normalize("Jo")).toBe("jo");
		expect(index.get("jo")).toBe("john");
		expect(index.get("job")).toBe("job"); // unaccented "Job" is unaffected
	});
});

describe("displayName", () => {
	it("returns the canonical (first) name per language", () => {
		expect(displayName("john", "pt-br")).toBe("João");
		expect(displayName("john", "en")).toBe("John");
		expect(displayName("john", "es")).toBe("Juan");
		expect(displayName("genesis", "pt-br")).toBe("Gênesis");
	});

	it("falls back to the slug for an unknown book", () => {
		expect(displayName("not-a-book", "en")).toBe("not-a-book");
	});
});
