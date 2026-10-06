/**
 * Per-page language resolution.
 *
 * Multilingual sites render pages in several locales, but the plugin has one
 * main `language` setting. This maps the page's locale (Astro's
 * `currentLocale`, or EmDash's `page.locale`) to one of the plugin's languages
 * so an English post links to midvash.com/en with an English version, a
 * Spanish post to /es, and so on. Pages without a supported locale keep the
 * main language.
 */

import type { Language } from "./books.ts";
import type { Settings } from "./settings.ts";

/** Map a BCP-47-ish locale ("en", "en-US", "pt-BR", "es_MX") to a plugin language. */
export function localeToLanguage(locale: string | null | undefined): Language | null {
	const base = (locale ?? "").toLowerCase().split(/[-_]/)[0];
	if (base === "en") return "en";
	if (base === "es") return "es";
	if (base === "pt") return "pt-br";
	return null;
}

type LanguageSettings = Pick<
	Settings,
	"language" | "defaultVersion" | "versionPtBr" | "versionEn" | "versionEs"
>;

const VERSION_KEY: Record<Language, "versionPtBr" | "versionEn" | "versionEs"> = {
	"pt-br": "versionPtBr",
	en: "versionEn",
	es: "versionEs",
};

/**
 * The language and Bible version for a page. Main-language pages use
 * `defaultVersion`; pages in another supported language use that language's
 * version setting.
 */
export function resolvePageLanguage(
	s: LanguageSettings,
	locale: string | null | undefined,
): { language: Language; version: string } {
	const language = localeToLanguage(locale) ?? s.language;
	const version = language === s.language ? s.defaultVersion : s[VERSION_KEY[language]];
	return { language, version };
}
