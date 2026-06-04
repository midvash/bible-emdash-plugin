/**
 * Localized UI strings.
 *
 * Currently covers the browser tooltip (the only end-user-facing copy). The
 * strings are picked server-side from the configured content `language` and
 * injected into the client bundle, so the browser never ships all three sets.
 *
 * The admin Block Kit form labels live in `lib/settings.ts` and are still PT
 * only — localizing those is a separate, larger effort (the admin operator's
 * locale can differ from the site's content language).
 */

import type { Language } from "./books.ts";

export interface ClientStrings {
	/** Shown in the tooltip body while the verse is being fetched. */
	loading: string;
	/** Shown when the lookup fails for network/timeout/5xx reasons. */
	error: string;
	/**
	 * Shown when the upstream returns 404 — the reference parses but doesn't
	 * exist (e.g. "John 99:99"). Distinguished from a transient `error` so
	 * authors can spot a typo'd reference vs a load failure (issue #41).
	 */
	notFound: string;
	/** The "read more" footer link label. */
	readMore: string;
	/** The connective in the header: `<reference> <on> Midvash`. */
	on: string;
}

const STRINGS: Record<Language, ClientStrings> = {
	"pt-br": {
		loading: "Carregando…",
		error: "Não foi possível carregar este versículo.",
		notFound: "Este versículo não existe nesta versão.",
		readMore: "Ler mais ↗",
		on: "no Midvash",
	},
	en: {
		loading: "Loading…",
		error: "Could not load this verse.",
		notFound: "This verse does not exist in this version.",
		readMore: "Read more ↗",
		on: "on Midvash",
	},
	es: {
		loading: "Cargando…",
		error: "No se pudo cargar este versículo.",
		notFound: "Este versículo no existe en esta versión.",
		readMore: "Leer más ↗",
		on: "en Midvash",
	},
};

/** The PT-BR set, also used as the in-browser fallback if none is injected. */
export const DEFAULT_CLIENT_STRINGS: ClientStrings = STRINGS["pt-br"];

/** Resolve the tooltip strings for a content language (falls back to pt-br). */
export function getClientStrings(language: Language): ClientStrings {
	return STRINGS[language] ?? DEFAULT_CLIENT_STRINGS;
}
