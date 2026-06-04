import { describe, it, expect } from "vitest";

import { parseReference, findReferences } from "../src/lib/parser.ts";

describe("parseReference", () => {
	it("parses a single verse", () => {
		expect(parseReference("João 3:16")).toMatchObject({
			slug: "john",
			matchedName: "João",
			chapter: 3,
			verse: 16,
			verseEnd: 16,
		});
	});

	it("accepts a period as the chapter:verse separator", () => {
		expect(parseReference("Jo 3.16")).toMatchObject({ slug: "john", chapter: 3, verse: 16 });
	});

	it("parses a verse range with a hyphen", () => {
		expect(parseReference("João 3:16-18")).toMatchObject({ chapter: 3, verse: 16, verseEnd: 18 });
	});

	it("parses a verse range with an en dash", () => {
		expect(parseReference("João 3:16–18")).toMatchObject({ verse: 16, verseEnd: 18 });
	});

	it("parses a whole-chapter reference (no verse)", () => {
		const r = parseReference("Salmos 23");
		expect(r).toMatchObject({ slug: "psalms", chapter: 23 });
		expect(r?.verse).toBeUndefined();
	});

	it("parses numbered books, spaced and concatenated", () => {
		expect(parseReference("1 Coríntios 13:4-7")).toMatchObject({
			slug: "1-corinthians",
			chapter: 13,
			verse: 4,
			verseEnd: 7,
		});
		expect(parseReference("1Co 13:4")).toMatchObject({ slug: "1-corinthians", chapter: 13, verse: 4 });
	});

	it("recognizes abbreviations", () => {
		expect(parseReference("Gn 1:1")).toMatchObject({ slug: "genesis", chapter: 1, verse: 1 });
	});

	it("recognizes English book names", () => {
		expect(parseReference("Genesis 1:1")).toMatchObject({ slug: "genesis", chapter: 1, verse: 1 });
		expect(parseReference("Revelation 22:21")).toMatchObject({ slug: "revelation", chapter: 22 });
	});

	it("returns null for unknown books", () => {
		expect(parseReference("Hello 3:16")).toBeNull();
		expect(parseReference("Xyz 1")).toBeNull();
	});

	it("returns null when the range end precedes the start", () => {
		expect(parseReference("João 3:16-10")).toBeNull();
	});

	it("returns null for chapter zero", () => {
		expect(parseReference("João 0:1")).toBeNull();
	});
});

describe("findReferences", () => {
	it("yields every match with correct offsets and trimmed raw text", () => {
		const text = "Veja João 3:16 e também Salmos 23 hoje.";
		const matches = [...findReferences(text)];
		expect(matches).toHaveLength(2);

		const [first, second] = matches;
		expect(first.slug).toBe("john");
		expect(first.raw).toBe("João 3:16");
		expect(text.slice(first.start, first.end)).toBe("João 3:16");

		expect(second.slug).toBe("psalms");
		expect(second.raw).toBe("Salmos 23");
		expect(text.slice(second.start, second.end)).toBe("Salmos 23");
	});

	it("does not match a book name embedded inside a larger word", () => {
		expect([...findReferences("trajo 3:16")]).toHaveLength(0);
	});

	it("returns nothing for text with no references", () => {
		expect([...findReferences("just some ordinary prose, nothing here")]).toHaveLength(0);
	});

	it("skips a candidate whose range end precedes its start", () => {
		// "João 3:16-10" matches the pattern but is rejected by buildParsed.
		expect([...findReferences("ref João 3:16-10 here")]).toHaveLength(0);
	});

	it("captures the matched name exactly as written (accents/case preserved)", () => {
		const [m] = [...findReferences("Em GÊNESIS 1:1 lemos")];
		expect(m.slug).toBe("genesis");
		expect(m.raw).toBe("GÊNESIS 1:1");
	});
});

describe("ambiguous-abbreviation disambiguation", () => {
	it('resolves "Jó" → Job and "Jo" → João/John by accent', () => {
		expect(parseReference("Jó 1:1")?.slug).toBe("job");
		expect(parseReference("JÓ 1:1")?.slug).toBe("job"); // accent + uppercase
		expect(parseReference("Jo 3:16")?.slug).toBe("john");
		expect(parseReference("João 3:16")?.slug).toBe("john");
		expect(parseReference("Job 1:1")?.slug).toBe("job");
	});

	it('resolves "Mc" → Mark and "Mq" → Micah (no longer ambiguous)', () => {
		expect(parseReference("Mc 1:1")?.slug).toBe("mark");
		expect(parseReference("Mq 3:1")?.slug).toBe("micah");
	});

	it("disambiguates by accent inside free text too", () => {
		const matches = [...findReferences("Leia Jó 1:1 e Mc 2:2")];
		expect(matches.map((m) => m.slug)).toEqual(["job", "mark"]);
	});
});
