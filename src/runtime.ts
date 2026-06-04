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

import { buildClientPattern } from "./lib/pattern.ts";
import { buildClientAssets } from "./lib/client-assets.ts";
import { DEFAULTS as ALL_DEFAULTS, CLIENT_SETTING_KEYS, type Settings } from "./lib/settings.ts";

/**
 * The subset of settings relevant to client-side rendering (no server-only
 * fields like cache/timeout). Derived from the canonical `Settings` shape so
 * it can't drift from the full schema.
 */
export type BibleByMidvashSettings = Pick<Settings, (typeof CLIENT_SETTING_KEYS)[number]>;

/** Client-relevant defaults, sourced from the single `lib/settings.ts` table. */
export const DEFAULTS: BibleByMidvashSettings = {
	enabled: ALL_DEFAULTS.enabled,
	language: ALL_DEFAULTS.language,
	defaultVersion: ALL_DEFAULTS.defaultVersion,
	selectors: ALL_DEFAULTS.selectors,
	theme: ALL_DEFAULTS.theme,
	useCustomColors: ALL_DEFAULTS.useCustomColors,
	linkColor: ALL_DEFAULTS.linkColor,
	underlineLinks: ALL_DEFAULTS.underlineLinks,
	underlineColor: ALL_DEFAULTS.underlineColor,
	underlineStyle: ALL_DEFAULTS.underlineStyle,
	showVersionBadge: ALL_DEFAULTS.showVersionBadge,
	showReadMore: ALL_DEFAULTS.showReadMore,
};

const PLUGIN_ID = "bible-by-midvash";

/** Re-exported from `lib/pattern.ts` for back-compat with earlier imports. */
export { buildClientPattern };

/**
 * Generic getter shape — `getPluginSetting(pluginId, key)` from `emdash`.
 * Typed loosely so we don't import emdash's type into this module.
 */
type GetSetting = (pluginId: string, key: string) => Promise<unknown>;

export interface InlineSnippets {
	enabled: boolean;
	js: string;
	css: string;
}

/**
 * Resolve all settings from the plugin's KV store and return the JS+CSS
 * ready to inline. Falls back to defaults for missing keys.
 */
export async function getBibleByMidvashSnippets(getSetting: GetSetting): Promise<InlineSnippets> {
	const resolved = { ...DEFAULTS };
	for (const key of Object.keys(DEFAULTS) as Array<keyof BibleByMidvashSettings>) {
		const v = await getSetting(PLUGIN_ID, key);
		if (v !== null && v !== undefined) (resolved as Record<string, unknown>)[key] = v;
	}

	if (!resolved.enabled) {
		return { enabled: false, js: "", css: "" };
	}

	const { js, css } = buildClientAssets(resolved);
	return { enabled: true, js, css };
}
