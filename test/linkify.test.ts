import { describe, it, expect } from "vitest";

import { linkifyHtml } from "../src/lib/linkify.ts";

const opts = { language: "pt-br", version: "naa" } as const;

describe("linkifyHtml", () => {
	it("wraps a bare reference in a midvash-ref anchor", () => {
		const out = linkifyHtml("<p>Veja João 3:16 hoje.</p>", opts);
		expect(out).toContain('<a class="midvash-ref"');
		expect(out).toContain('href="https://midvash.com/pt-br/naa/joao/3/16"');
		expect(out).toContain('data-ref="João 3:16"');
		expect(out).toContain(">João 3:16</a>");
		expect(out).toContain('rel="noopener"');
	});

	it("does not wrap references already inside an <a>", () => {
		const html = '<a href="/x">João 3:16</a>';
		expect(linkifyHtml(html, opts)).toBe(html);
	});

	it("skips <code> and <pre> blocks", () => {
		expect(linkifyHtml("<code>João 3:16</code>", opts)).toBe("<code>João 3:16</code>");
		expect(linkifyHtml("<pre>Salmos 23</pre>", opts)).toBe("<pre>Salmos 23</pre>");
	});

	it("leaves text without references untouched", () => {
		const html = "<p>nothing to see here</p>";
		expect(linkifyHtml(html, opts)).toBe(html);
	});

	it("wraps multiple references in the same text node", () => {
		const out = linkifyHtml("<p>João 3:16 e Salmos 23</p>", opts);
		const count = (out.match(/class="midvash-ref"/g) || []).length;
		expect(count).toBe(2);
	});

	it("preserves surrounding markup and attributes", () => {
		const out = linkifyHtml('<p class="prose" data-x="1">Gn 1:1</p>', opts);
		expect(out.startsWith('<p class="prose" data-x="1">')).toBe(true);
		expect(out.endsWith("</p>")).toBe(true);
		expect(out).toContain("midvash-ref");
	});

	it("uses the English slug in the href when language is en", () => {
		const out = linkifyHtml("<p>1 Corinthians 13:4-7</p>", { language: "en", version: "niv" });
		expect(out).toContain('href="https://midvash.com/en/niv/1-corinthians/13/4-7"');
	});
});

describe("linkifyHtml edge cases", () => {
	it("emits HTML comments verbatim without linkifying their contents", () => {
		const out = linkifyHtml("<!-- João 3:16 --><p>x</p>", opts);
		expect(out).toContain("<!-- João 3:16 -->");
		expect(out).not.toContain("midvash-ref");
	});

	it("leaves DOCTYPE intact and still linkifies the body", () => {
		const out = linkifyHtml("<!DOCTYPE html><p>João 3:16</p>", opts);
		expect(out).toContain("<!DOCTYPE html>");
		expect(out).toContain("midvash-ref");
	});

	it("handles an unclosed final tag without throwing", () => {
		const out = linkifyHtml("<p>João 3:16</p><span", opts);
		expect(out).toContain("midvash-ref");
		expect(out.endsWith("<span")).toBe(true);
	});

	it("does not transform trailing text inside an unclosed skip tag", () => {
		const out = linkifyHtml("<code>João 3:16", opts);
		expect(out).not.toContain("midvash-ref");
	});

	it("escapes injected attribute values", () => {
		// The matched name can't contain quotes, but the href is escaped anyway —
		// confirm the anchor attributes are well-formed.
		const out = linkifyHtml("<p>Gn 1:1</p>", opts);
		expect(out).not.toContain('href=""');
		expect(out).toMatch(/data-ref="Gn 1:1"/);
	});
});
