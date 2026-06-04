/**
 * Runtime helpers for inlining the plugin's client JS/CSS into Astro layouts.
 *
 * Trusted plugins are bundled with the host Astro app, so consuming sites
 * can import these directly in `Base.astro` (or wherever they want the
 * tooltip script to load) instead of fetching the assets via a route.
 *
 * Usage in an Astro frontmatter block:
 *
 *   ---
 *   import { getBibleByMidvashSnippets } from "@midvash/emdash-plugin-bible/runtime";
 *   import { getPluginSetting } from "emdash";
 *
 *   const { js, css, enabled } = await getBibleByMidvashSnippets(getPluginSetting);
 *   ---
 *   {enabled && (
 *     <>
 *       <style is:inline set:html={css}></style>
 *       <script is:inline set:html={js}></script>
 *     </>
 *   )}
 */

import { BOOKS, type Language } from "./lib/books.ts";
import { CLIENT_CSS, CLIENT_JS } from "./client/bundle.ts";
import { DEFAULTS, SETTINGS_FIELDS, coerceSettings, type BibleSettings } from "./lib/settings.ts";

/**
 * Resolved plugin settings. The canonical declaration lives in
 * `./lib/settings`; this alias is kept as the module's public export name
 * (and `DEFAULTS` is re-exported) so existing consumers keep working.
 */
export type BibleByMidvashSettings = BibleSettings;
export { DEFAULTS };

const PLUGIN_ID = "bible-by-midvash";

/**
 * Build the regex (string) that the client uses to scan the DOM.
 * Includes the requested language plus English book names (people often
 * mix languages and Latin abbreviations are universal).
 */
export function buildClientPattern(language: Language): { pattern: string; flags: string } {
	const names = new Set<string>();
	for (const book of BOOKS) {
		for (const n of book.names[language]) names.add(n);
		for (const n of book.names.en) names.add(n);
	}
	const sorted = [...names].sort((a, b) => b.length - a.length);
	const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const namePattern = escaped.join("|");
	return {
		pattern: `(?<![\\p{L}\\p{N}])(?:${namePattern})\\s*\\d{1,3}(?:\\s*[:.]\\s*\\d{1,3}(?:\\s*[-–—]\\s*\\d{1,3})?)?(?![\\p{L}])`,
		flags: "giu",
	};
}

/**
 * Generic per-key getter — `getPluginSetting(pluginId, key)` from `emdash`.
 * Typed loosely so we don't import emdash's type into this module.
 */
type GetSetting = (pluginId: string, key: string) => Promise<unknown>;

/**
 * Batch getter — `getPluginSettings(pluginId)` from `emdash`, which returns
 * every persisted key in a single read. Pass this as the optional second
 * argument to collapse ~15 sequential reads into one.
 */
type GetAllSettings = (pluginId: string) => Promise<Record<string, unknown> | null>;

export interface InlineSnippets {
	enabled: boolean;
	js: string;
	css: string;
}

/**
 * Memoized compiled output, keyed by a hash of the resolved settings. The
 * BOOKS regex (rebuilt by buildClientPattern) and the JS/CSS strings depend
 * only on the settings, so we recompute them only when the settings actually
 * change instead of on every server-rendered request.
 */
let MEMO: { key: string; snippets: InlineSnippets } | null = null;

function compileSnippets(resolved: BibleSettings): InlineSnippets {
	const cacheKey = JSON.stringify(resolved);
	if (MEMO && MEMO.key === cacheKey) return MEMO.snippets;

	let snippets: InlineSnippets;
	if (!resolved.enabled) {
		snippets = { enabled: false, js: "", css: "" };
	} else {
		const { pattern, flags } = buildClientPattern(resolved.language);
		const clientSettings = {
			enabled: resolved.enabled,
			selectors: resolved.selectors,
			theme: resolved.theme,
			showVersionBadge: resolved.showVersionBadge,
			showReadMore: resolved.showReadMore,
			pattern,
			patternFlags: flags,
		};

		const js = CLIENT_JS.replace("__SETTINGS__", JSON.stringify(clientSettings));

		// Only emit color overrides when the admin opted in. Otherwise leave the
		// CSS variables unset so references inherit the host site's link styles.
		const cssVars = resolved.useCustomColors
			? `
:root {
	--midvash-link-color: ${resolved.linkColor};
	--midvash-underline-color: ${resolved.underlineColor};
	--midvash-underline-style: ${resolved.underlineStyle};
	--midvash-underline-line: ${resolved.underlineLinks ? "underline" : "none"};
}
`
			: "";

		snippets = { enabled: true, js, css: CLIENT_CSS + cssVars };
	}

	MEMO = { key: cacheKey, snippets };
	return snippets;
}

/**
 * Resolve settings and return the JS+CSS ready to inline. Pass emdash's
 * `getPluginSetting` (per-key); optionally also pass `getPluginSettings`
 * (batch) so every key is read in one call instead of ~15 sequential reads —
 * worthwhile because this runs from the layout for every request. The compiled
 * output is memoized by settings hash, so the BOOKS regex isn't rebuilt unless
 * the settings change. Missing keys fall back to defaults; persisted values
 * are validated/coerced (see coerceSettings).
 */
export async function getBibleByMidvashSnippets(
	getSetting: GetSetting,
	getAllSettings?: GetAllSettings,
): Promise<InlineSnippets> {
	let raw: Record<string, unknown>;
	if (getAllSettings) {
		raw = (await getAllSettings(PLUGIN_ID)) ?? {};
	} else {
		raw = {};
		for (const key of Object.keys(SETTINGS_FIELDS)) {
			const v = await getSetting(PLUGIN_ID, key);
			if (v !== null && v !== undefined) raw[key] = v;
		}
	}
	return compileSnippets(coerceSettings(raw));
}
