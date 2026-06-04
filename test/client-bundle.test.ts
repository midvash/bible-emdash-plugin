// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";

import { CLIENT_JS } from "../src/client/bundle.ts";
import { buildClientPattern } from "../src/lib/pattern.ts";
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
