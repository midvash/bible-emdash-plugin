// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";

import { CLIENT_JS } from "../src/client/bundle.ts";
import { buildClientPattern } from "../src/lib/pattern.ts";
import { buildNameToSlug } from "../src/lib/pattern.ts";
import { getClientStrings } from "../src/lib/i18n.ts";

/** Evaluate the client IIFE in the happy-dom global scope with given settings. */
function loadClient(overrides: Record<string, unknown> = {}) {
	const { pattern, flags } = buildClientPattern("pt-br");
	const settings = {
		enabled: true,
		selectors: "article",
		theme: "auto",
		showVersionBadge: true,
		showReadMore: true,
		strings: getClientStrings("pt-br"),
		pattern,
		patternFlags: flags,
		language: "pt-br",
		defaultVersion: "naa",
		nameToSlug: buildNameToSlug("pt-br"),
		...overrides,
	};
	const js = CLIENT_JS.replace("__SETTINGS__", JSON.stringify(settings));
	// eslint-disable-next-line no-new-func
	new Function(js)();
}

function versePayload() {
	return {
		ok: true,
		json: async () => ({
			data: {
				reference: "João 3:16",
				text: "Porque Deus amou o mundo de tal maneira...",
				version: "naa",
				readMoreUrl: "https://midvash.com/pt-br/naa/joao/3/16",
			},
		}),
	};
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
	document.body.innerHTML = "";
	document.querySelectorAll(".midvash-tooltip").forEach((e) => e.remove());
	(globalThis as any).fetch = vi.fn(async () => versePayload());
});

describe("client bundle (DOM)", () => {
	it("wraps detected references inside the configured selector", () => {
		document.body.innerHTML = "<article><p>Veja João 3:16 hoje.</p></article>";
		loadClient();
		const refs = document.querySelectorAll(".midvash-ref");
		expect(refs.length).toBe(1);
		expect(refs[0].getAttribute("data-ref")).toBe("João 3:16");
		expect(refs[0].textContent).toBe("João 3:16");
	});

	it("does not scan content outside the configured selectors", () => {
		document.body.innerHTML = "<div class='other'>João 3:16</div>";
		loadClient();
		expect(document.querySelectorAll(".midvash-ref").length).toBe(0);
	});

	it("fetches and renders the verse on hover", async () => {
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const ref = document.querySelector(".midvash-ref")!;
		ref.dispatchEvent(new Event("mouseover", { bubbles: true }));
		await tick();
		await tick();
		expect((globalThis as any).fetch).toHaveBeenCalled();
		const tip = document.querySelector(".midvash-tooltip");
		expect(tip).toBeTruthy();
		expect(tip!.textContent).toContain("Porque Deus amou o mundo");
		expect(tip!.textContent).toContain("Ler mais");
	});

	it("attaches to pre-existing SSR anchors without re-scanning", async () => {
		document.body.innerHTML =
			'<article><a class="midvash-ref" data-ref="João 3:16">João 3:16</a></article>';
		loadClient();
		// SSR anchors present → no client-side wrapping pass; count stays 1.
		expect(document.querySelectorAll(".midvash-ref").length).toBe(1);
		document.querySelector(".midvash-ref")!.dispatchEvent(new Event("mouseover", { bubbles: true }));
		await tick();
		expect((globalThis as any).fetch).toHaveBeenCalled();
	});

	it("does nothing when disabled", () => {
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient({ enabled: false });
		expect(document.querySelectorAll(".midvash-ref").length).toBe(0);
	});
});

describe("client bundle (accessibility)", () => {
	it("links the trigger to the tooltip via aria-describedby on hover", async () => {
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const ref = document.querySelector(".midvash-ref")!;
		ref.dispatchEvent(new Event("mouseover", { bubbles: true }));
		await tick();
		const tip = document.querySelector(".midvash-tooltip")!;
		expect(tip.id).toBe("midvash-tooltip");
		expect(ref.getAttribute("aria-describedby")).toBe("midvash-tooltip");
	});

	it("closes on Escape and clears aria-describedby", async () => {
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const ref = document.querySelector(".midvash-ref")!;
		ref.dispatchEvent(new Event("mouseover", { bubbles: true }));
		await tick();
		const tip = document.querySelector(".midvash-tooltip")! as HTMLElement;
		expect(tip.style.display).toBe("block");

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		expect(tip.style.display).toBe("none");
		expect(ref.hasAttribute("aria-describedby")).toBe(false);
	});

	it("marks the tooltip body as a polite live region so screen readers announce the loaded verse (#38)", async () => {
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const ref = document.querySelector(".midvash-ref")!;
		ref.dispatchEvent(new Event("mouseover", { bubbles: true }));
		await tick();
		await tick();
		const body = document.querySelector(".midvash-tooltip__body")!;
		expect(body.getAttribute("aria-live")).toBe("polite");
		expect(body.getAttribute("aria-atomic")).toBe("true");
	});
});

describe("client bundle (SEO — issue #49)", () => {
	// The client-only fallback (no SSR middleware registered) must still produce
	// real <a href> anchors so Googlebot sees the link in the rendered HTML and
	// link equity flows to midvash.com — same as the SSR path.

	it("wraps text matches as <a href> elements, not <span>", () => {
		document.body.innerHTML = "<article><p>Veja João 3:16 hoje.</p></article>";
		loadClient();
		const refs = document.querySelectorAll(".midvash-ref");
		expect(refs.length).toBe(1);
		expect(refs[0].tagName).toBe("A");
	});

	it("client-built href matches the SSR URL shape (midvash.com/{lang}/{version}/{slug}/{cap}/{verse})", () => {
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const a = document.querySelector(".midvash-ref") as HTMLAnchorElement;
		expect(a.getAttribute("href")).toBe("https://midvash.com/pt-br/naa/joao/3/16");
	});

	it("client anchor carries rel=noopener and NO nofollow (link juice must pass)", () => {
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const a = document.querySelector(".midvash-ref") as HTMLAnchorElement;
		const rel = a.getAttribute("rel") || "";
		expect(rel).toContain("noopener");
		expect(rel).not.toContain("nofollow");
	});

	it("client anchor carries title=<reference> for crawler context", () => {
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const a = document.querySelector(".midvash-ref") as HTMLAnchorElement;
		expect(a.getAttribute("title")).toBe("João 3:16");
	});

	it("client anchor does NOT carry target=_blank (same-tab navigation, as designed)", () => {
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const a = document.querySelector(".midvash-ref") as HTMLAnchorElement;
		expect(a.hasAttribute("target")).toBe(false);
	});

	it("ranges (3:16-18) produce a valid range URL", () => {
		document.body.innerHTML = "<article><p>João 3:16-18</p></article>";
		loadClient();
		const a = document.querySelector(".midvash-ref") as HTMLAnchorElement;
		expect(a.getAttribute("href")).toBe("https://midvash.com/pt-br/naa/joao/3/16-18");
	});

	it("chapter-only references (Salmos 23) produce a chapter URL", () => {
		document.body.innerHTML = "<article><p>Salmos 23</p></article>";
		loadClient();
		const a = document.querySelector(".midvash-ref") as HTMLAnchorElement;
		expect(a.getAttribute("href")).toBe("https://midvash.com/pt-br/naa/salmos/23");
	});
});

describe("client bundle (touch / mobile — issue #36)", () => {
	// Touch users tap a .midvash-ref — first tap should OPEN the tooltip without
	// navigating (preventDefault). A subsequent tap on the SAME ref (while the
	// tooltip is open) should let the click through so the user reaches
	// midvash.com. This preserves the SEO link AND fixes mobile UX.

	function mockPointer(pointer: "coarse" | "fine") {
		// Vitest+happy-dom doesn't ship matchMedia; mock it.
		window.matchMedia = ((q: string) => ({
			matches: q.includes(pointer),
			media: q,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		})) as unknown as typeof window.matchMedia;
	}

	it("on touch: first tap opens the tooltip and prevents navigation", async () => {
		mockPointer("coarse");
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const a = document.querySelector(".midvash-ref") as HTMLAnchorElement;
		const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
		a.dispatchEvent(evt);
		expect(evt.defaultPrevented).toBe(true);
		await tick();
		const tip = document.querySelector(".midvash-tooltip") as HTMLElement;
		expect(tip).toBeTruthy();
		expect(tip.style.display).toBe("block");
	});

	it("on touch: second tap on the same ref (tooltip already open) lets the click navigate", async () => {
		mockPointer("coarse");
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const a = document.querySelector(".midvash-ref") as HTMLAnchorElement;

		// First tap → opens tooltip, blocks navigation.
		const first = new MouseEvent("click", { bubbles: true, cancelable: true });
		a.dispatchEvent(first);
		await tick();
		expect(first.defaultPrevented).toBe(true);

		// Second tap on the SAME element → tooltip already open → navigation proceeds.
		const second = new MouseEvent("click", { bubbles: true, cancelable: true });
		a.dispatchEvent(second);
		expect(second.defaultPrevented).toBe(false);
	});

	it("on touch: tap outside the ref closes the tooltip", async () => {
		mockPointer("coarse");
		document.body.innerHTML = "<article><p>João 3:16</p><span class='other'>x</span></article>";
		loadClient();
		const a = document.querySelector(".midvash-ref") as HTMLElement;
		a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		await tick();
		const tip = document.querySelector(".midvash-tooltip") as HTMLElement;
		expect(tip.style.display).toBe("block");

		const other = document.querySelector(".other") as HTMLElement;
		other.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		expect(tip.style.display).toBe("none");
	});

	it("on mouse (pointer:fine): click is NOT intercepted (navigation works normally)", () => {
		mockPointer("fine");
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const a = document.querySelector(".midvash-ref") as HTMLAnchorElement;
		const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
		a.dispatchEvent(evt);
		expect(evt.defaultPrevented).toBe(false);
	});
});

describe("client bundle (defense-in-depth — issue #42)", () => {
	// readMoreUrl comes back from /lookup over the wire. Even though today it's
	// always built server-side by buildReadMoreUrl, the client must verify the
	// scheme before placing it in an href — otherwise a future server bug could
	// turn the tooltip into a DOM-XSS sink.

	it("drops the 'Ler mais' link when readMoreUrl uses a javascript: scheme", async () => {
		(globalThis as any).fetch = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				data: {
					reference: "João 3:16",
					text: "Porque Deus amou o mundo de tal maneira...",
					version: "naa",
					// eslint-disable-next-line no-script-url
					readMoreUrl: "javascript:alert(1)",
				},
			}),
		}));
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const ref = document.querySelector(".midvash-ref")!;
		ref.dispatchEvent(new Event("mouseover", { bubbles: true }));
		await tick();
		await tick();
		const tip = document.querySelector(".midvash-tooltip")!;
		expect(tip.querySelector(".midvash-tooltip__link")).toBeNull();
		// And the verse text still renders — the guard only skips the link.
		expect(tip.textContent).toContain("Porque Deus amou o mundo");
	});

	it("drops the 'Ler mais' link when readMoreUrl uses a data: scheme", async () => {
		(globalThis as any).fetch = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				data: {
					reference: "João 3:16",
					text: "Porque Deus amou o mundo de tal maneira...",
					version: "naa",
					readMoreUrl: "data:text/html,<script>alert(1)</script>",
				},
			}),
		}));
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const ref = document.querySelector(".midvash-ref")!;
		ref.dispatchEvent(new Event("mouseover", { bubbles: true }));
		await tick();
		await tick();
		const tip = document.querySelector(".midvash-tooltip")!;
		expect(tip.querySelector(".midvash-tooltip__link")).toBeNull();
	});

	it("keeps the 'Ler mais' link when readMoreUrl is https://midvash.com/…", async () => {
		// Default fetch mock from beforeEach already returns https://. Just confirm.
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const ref = document.querySelector(".midvash-ref")!;
		ref.dispatchEvent(new Event("mouseover", { bubbles: true }));
		await tick();
		await tick();
		const tip = document.querySelector(".midvash-tooltip")!;
		const link = tip.querySelector(".midvash-tooltip__link") as HTMLAnchorElement;
		expect(link).toBeTruthy();
		expect(link.getAttribute("href")).toBe("https://midvash.com/pt-br/naa/joao/3/16");
	});
});

describe("client bundle (error UX — issue #41)", () => {
	// /lookup now returns either { text, … } (success) or { error: "not-found"
	// | "fetch-error", reference, version } (failure). The client must render
	// a distinct message so authors can tell a typo'd reference apart from a
	// transient load failure.

	it("shows the 'verse not found' string when /lookup returns error=not-found", async () => {
		(globalThis as any).fetch = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				data: {
					error: "not-found",
					reference: "João 99:99",
					version: "naa",
				},
			}),
		}));
		document.body.innerHTML = "<article><p>João 99:99</p></article>";
		loadClient();
		const ref = document.querySelector(".midvash-ref")!;
		ref.dispatchEvent(new Event("mouseover", { bubbles: true }));
		await tick();
		await tick();
		const body = document.querySelector(".midvash-tooltip__body")!;
		expect(body.textContent).toContain("não existe");
		expect(body.textContent).not.toContain("Não foi possível carregar");
	});

	it("shows the generic load-failure string when /lookup returns error=fetch-error", async () => {
		(globalThis as any).fetch = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				data: {
					error: "fetch-error",
					reference: "João 3:16",
					version: "naa",
				},
			}),
		}));
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const ref = document.querySelector(".midvash-ref")!;
		ref.dispatchEvent(new Event("mouseover", { bubbles: true }));
		await tick();
		await tick();
		const body = document.querySelector(".midvash-tooltip__body")!;
		expect(body.textContent).toContain("Não foi possível carregar");
	});

	it("falls back to generic error when fetch itself rejects", async () => {
		(globalThis as any).fetch = vi.fn(async () => {
			throw new Error("network down");
		});
		document.body.innerHTML = "<article><p>João 3:16</p></article>";
		loadClient();
		const ref = document.querySelector(".midvash-ref")!;
		ref.dispatchEvent(new Event("mouseover", { bubbles: true }));
		await tick();
		await tick();
		const body = document.querySelector(".midvash-tooltip__body")!;
		expect(body.textContent).toContain("Não foi possível carregar");
	});
});
