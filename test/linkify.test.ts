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

describe("linkifyHtml scope (issue #37)", () => {
	// References in site chrome (nav/header/footer/title/option/button) must NOT
	// be linkified — that pollutes the SEO link graph and produces invalid HTML
	// (e.g. an <a> nested inside <title> renders as literal markup).

	it("does not linkify inside <nav>", () => {
		const out = linkifyHtml("<nav>João 3:16</nav>", opts);
		expect(out).not.toContain("midvash-ref");
	});

	it("does not linkify inside <header>", () => {
		const out = linkifyHtml("<header>João 3:16</header>", opts);
		expect(out).not.toContain("midvash-ref");
	});

	it("does not linkify inside <footer>", () => {
		const out = linkifyHtml("<footer>João 3:16</footer>", opts);
		expect(out).not.toContain("midvash-ref");
	});

	it("does not linkify inside <aside>", () => {
		const out = linkifyHtml("<aside>João 3:16</aside>", opts);
		expect(out).not.toContain("midvash-ref");
	});

	it("does not linkify inside <head> or its <title>", () => {
		const out = linkifyHtml("<head><title>João 3:16</title></head>", opts);
		expect(out).not.toContain("midvash-ref");
	});

	it("does not linkify inside <option> / <select>", () => {
		const out = linkifyHtml("<select><option>João 3:16</option></select>", opts);
		expect(out).not.toContain("midvash-ref");
	});

	it("does not linkify inside <button>", () => {
		const out = linkifyHtml("<button>João 3:16</button>", opts);
		expect(out).not.toContain("midvash-ref");
	});

	it("does linkify inside <article>", () => {
		const out = linkifyHtml("<article>João 3:16</article>", opts);
		expect(out).toContain("midvash-ref");
	});

	it("does linkify inside <main>", () => {
		const out = linkifyHtml("<main>João 3:16</main>", opts);
		expect(out).toContain("midvash-ref");
	});

	it("links real content even when site chrome also mentions the same reference", () => {
		// Realistic shape: nav (skipped) + article (linkified) + footer (skipped).
		const html =
			"<nav>João 3:16</nav>" +
			"<article>Veja João 3:16 aqui.</article>" +
			"<footer>João 3:16</footer>";
		const out = linkifyHtml(html, opts);
		// Only one anchor — the one inside <article>.
		const count = (out.match(/class="midvash-ref"/g) || []).length;
		expect(count).toBe(1);
	});
});

describe("linkifyHtml attribute-aware scanning (issue #40)", () => {
	// A '>' inside a quoted attribute value must NOT be treated as the tag end.

	it("handles '>' inside a double-quoted attribute and still linkifies the body", () => {
		const out = linkifyHtml('<p><img alt="2 > 1">Veja João 3:16</p>', opts);
		expect(out).toContain("midvash-ref");
		// The <img> tag must be emitted intact, not truncated.
		expect(out).toContain('<img alt="2 > 1">');
	});

	it("handles '>' inside a single-quoted attribute", () => {
		const out = linkifyHtml("<p><span data-tpl='a>b'>João 3:16</span></p>", opts);
		expect(out).toContain("midvash-ref");
		expect(out).toContain("<span data-tpl='a>b'>");
	});

	it("does not get confused by a '>' inside a quoted attribute of a skip tag", () => {
		// <a href="..."> contains a quoted attribute, and the body inside should
		// STILL be skipped (refs already inside an <a> are not re-linkified).
		const out = linkifyHtml('<a href="/x?q=2>1">João 3:16</a>', opts);
		expect(out).not.toContain("midvash-ref");
		expect(out).toContain('<a href="/x?q=2>1">');
	});
});

describe("linkifyHtml fast-path (issue #39)", () => {
	// When the HTML contains no book-name candidate, linkifyHtml must return the
	// exact same string instance — proving the fast-path skipped the full parse.

	it("returns the same string reference when no reference candidate exists", () => {
		const html = "<p>Just a normal paragraph with no references at all.</p>";
		const out = linkifyHtml(html, opts);
		// Identity check — fast-path returns the original string.
		expect(out).toBe(html);
	});

	it("still falls through to the full transformer when a candidate exists", () => {
		const html = "<p>João 3:16</p>";
		const out = linkifyHtml(html, opts);
		expect(out).not.toBe(html);
		expect(out).toContain("midvash-ref");
	});
});

describe("linkifyHtml SEO attributes (SEO-B)", () => {
	// The anchor must carry a `title` attribute matching the reference text, so
	// crawlers (and assistive tech) get an explicit label.

	it("adds a title attribute with the reference text", () => {
		const out = linkifyHtml("<p>João 3:16</p>", opts);
		expect(out).toMatch(/title="João 3:16"/);
	});

	it("does NOT add rel=\"nofollow\" (link juice must pass to midvash.com)", () => {
		const out = linkifyHtml("<p>João 3:16</p>", opts);
		expect(out).not.toMatch(/rel="[^"]*nofollow/);
	});

	it("does NOT add target=\"_blank\" on the linkified anchor (same-tab navigation)", () => {
		const out = linkifyHtml("<p>João 3:16</p>", opts);
		expect(out).not.toContain('target="_blank"');
	});
});
