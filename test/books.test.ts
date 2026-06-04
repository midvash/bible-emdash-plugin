import { describe, it, expect } from "vitest";

import {
	BOOKS,
	buildNameIndex,
	displayName,
	normalize,
	resolveSlug,
	softNormalize,
} from "../src/lib/books.ts";

describe("BOOKS data", () => {
	it("has the 66 Protestant-canon books", () => {
		expect(BOOKS).toHaveLength(66);
	});

	it("has unique slugs", () => {
		const slugs = BOOKS.map((b) => b.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});

	it("has no two books sharing an accent-aware (softNormalize) abbreviation", () => {
		// A same-exact-text abbreviation on two books can't be disambiguated.
		// (This guard caught "Mc" being listed on both Micah and Mark.)
		const byKey = new Map<string, Set<string>>();
		for (const b of BOOKS) {
			for (const lang of Object.keys(b.names) as Array<keyof typeof b.names>) {
				for (const n of b.names[lang]) {
					const k = softNormalize(n);
					let set = byKey.get(k);
					if (!set) byKey.set(k, (set = new Set()));
					set.add(b.slug);
				}
			}
		}
		const ambiguous = [...byKey.entries()].filter(([, s]) => s.size > 1).map(([k]) => k);
		expect(ambiguous).toEqual([]);
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

	it('disambiguates "Jó" → Job vs "Jo" → John (accent-aware override)', () => {
		// The flat index alone still collides ("jo" → john, inserted last)…
		expect(normalize("Jó")).toBe("jo");
		expect(index.get("jo")).toBe("john");
		// …but resolveSlug checks the accent before falling back to the index.
		expect(resolveSlug("Jó", index)).toBe("job");
		expect(resolveSlug("Jo", index)).toBe("john");
		expect(resolveSlug("João", index)).toBe("john");
		expect(resolveSlug("Job", index)).toBe("job");
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
