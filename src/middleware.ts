/**
 * Astro middleware that linkifies Bible references in the SSR HTML.
 *
 * Usage in the consuming Astro project:
 *
 *   // src/middleware.ts
 *   import { sequence } from "astro:middleware";
 *   import { bibleLinkifier } from "@midvash/emdash-plugin-bible/middleware";
 *
 *   export const onRequest = sequence(bibleLinkifier());
 *
 * The middleware runs after the page renders, intercepts HTML responses,
 * and transforms text content (outside <a>, <code>, <pre>, etc.) by
 * wrapping recognized Bible references in real <a href> anchors. The
 * client-side script then attaches hover tooltips to those anchors.
 */

import type { MiddlewareHandler } from "astro";

import type { Language } from "./lib/books.ts";
import { linkifyHtml } from "./lib/linkify.ts";
import { resolvePageLanguage } from "./lib/locale.ts";
import { DEFAULTS } from "./lib/settings.ts";

interface BibleLinkifierOptions {
	/**
	 * Force one language for every page. By default the language comes from
	 * the page's `Astro.currentLocale`, falling back to the plugin's
	 * configured language.
	 */
	language?: Language;
	/** Override the version. Falls back to plugin settings. */
	version?: string;
}

const PLUGIN_ID = "bible-by-midvash";

export function bibleLinkifier(options: BibleLinkifierOptions = {}): MiddlewareHandler {
	return async (context, next) => {
		const response = await next();

		// Only touch HTML responses. Skip API routes, _emdash, _astro, etc.
		const ct = response.headers.get("content-type") || "";
		if (!ct.includes("text/html")) return response;

		const url = new URL(context.request.url);
		if (url.pathname.startsWith("/_emdash") || url.pathname.startsWith("/_astro")) {
			return response;
		}

		// Resolve settings lazily so this module doesn't import emdash at
		// build time (avoids edge cases when the plugin runs in isolated
		// sandbox contexts).
		const { getPluginSetting } = await import("emdash");

		const enabled = (await getPluginSetting(PLUGIN_ID, "enabled")) as boolean | null;
		if (enabled === false) return response;

		// Explicit options win; otherwise the page's locale picks the language
		// and version (multilingual sites), falling back to the main settings.
		const setting = async <T>(key: string, fallback: T): Promise<T> =>
			((await getPluginSetting(PLUGIN_ID, key)) as T | null) ?? fallback;
		const page = resolvePageLanguage(
			{
				language: options.language ?? (await setting("language", DEFAULTS.language)),
				defaultVersion: await setting("defaultVersion", DEFAULTS.defaultVersion),
				versionPtBr: await setting("versionPtBr", DEFAULTS.versionPtBr),
				versionEn: await setting("versionEn", DEFAULTS.versionEn),
				versionEs: await setting("versionEs", DEFAULTS.versionEs),
			},
			options.language ? null : context.currentLocale,
		);
		const language = page.language;
		const version = options.version ?? page.version;

		const html = await response.text();
		const transformed = linkifyHtml(html, { language, version });

		const headers = new Headers(response.headers);
		// Body length changed, drop any pre-set content-length.
		headers.delete("content-length");

		return new Response(transformed, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	};
}
