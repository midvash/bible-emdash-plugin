/**
 * Builds the client-side `{ js, css }` that the plugin injects into pages.
 *
 * This is the single place that turns the persisted settings into the inline
 * script + stylesheet. Two callers use it:
 *
 *   • the `page:fragments` hook in `sandbox-entry.ts` — the primary, zero-config
 *     delivery (EmDash splices the fragments into <head>/<body> automatically),
 *   • `getBibleByMidvashSnippets` in `runtime.ts` — the manual escape hatch for
 *     layouts that don't use EmDash's <EmDashHead>/<EmDashBodyEnd> components.
 *
 * NOTE: EmDash only runs `page:fragments` for TRUSTED (in-process) plugins.
 * Sandboxed/marketplace plugins cannot inject scripts or styles by design
 * (security), so the hover-tooltip feature requires a trusted install.
 */

import { CLIENT_CSS, CLIENT_JS } from "../client/bundle.ts";
import { buildClientPattern, buildNameToSlug } from "./pattern.ts";
import { getClientStrings } from "./i18n.ts";
import { resolvePageLanguage } from "./locale.ts";
import type { Settings } from "./settings.ts";

/** The settings fields that affect client rendering. */
export type ClientAssetSettings = Pick<
	Settings,
	| "language"
	| "defaultVersion"
	| "versionPtBr"
	| "versionEn"
	| "versionEs"
	| "selectors"
	| "theme"
	| "showVersionBadge"
	| "showReadMore"
	| "useCustomColors"
	| "linkColor"
	| "underlineLinks"
	| "underlineColor"
	| "underlineStyle"
>;

export interface ClientAssets {
	js: string;
	css: string;
}

/**
 * Strip characters that could break out of the injected <style> context.
 * The color/style values are admin-controlled, but page:fragments injects them
 * verbatim into a <style> tag, so we defensively drop anything that isn't part
 * of a normal CSS value (no <, >, {, }, ;, quotes, or backslashes).
 */
function cssSafe(value: string): string {
	return String(value).replace(/[<>{};"'\\]/g, "");
}

/**
 * Render the inline JS (with settings + i18n injected) and CSS for the client.
 * `locale` is the page's locale: on a multilingual site it picks the language
 * and version for that page (see `resolvePageLanguage`).
 */
export function buildClientAssets(s: ClientAssetSettings, locale?: string | null): ClientAssets {
	const { language, version } = resolvePageLanguage(s, locale);
	const { pattern, flags } = buildClientPattern(language);
	const clientSettings = {
		enabled: true,
		selectors: s.selectors,
		theme: s.theme,
		showVersionBadge: s.showVersionBadge,
		showReadMore: s.showReadMore,
		strings: getClientStrings(language),
		pattern,
		patternFlags: flags,
		// Issue #49 / SEO-A: the client-only fallback (when the SSR middleware
		// isn't registered) builds real <a href> anchors. It needs language,
		// defaultVersion, and a name→slug map to produce the same URL shape
		// the SSR linkifier emits.
		language,
		defaultVersion: version,
		nameToSlug: buildNameToSlug(language),
	};

	const js = CLIENT_JS.replace("__SETTINGS__", JSON.stringify(clientSettings));

	// Only emit color overrides when the admin opted in. Otherwise leave the CSS
	// variables unset so references inherit the host site's link styles.
	const cssVars = s.useCustomColors
		? `
:root {
	--midvash-link-color: ${cssSafe(s.linkColor)};
	--midvash-underline-color: ${cssSafe(s.underlineColor)};
	--midvash-underline-style: ${cssSafe(s.underlineStyle)};
	--midvash-underline-line: ${s.underlineLinks ? "underline" : "none"};
}
`
		: "";

	return { js, css: CLIENT_CSS + cssVars };
}
