/**
 * Single source of truth for the plugin's settings.
 *
 * Everything that needs to know about a setting — its TypeScript type, its
 * default value, its admin label/description, and (for selects) its options —
 * is declared here exactly once:
 *
 *   • `Settings`         — the TypeScript shape used across the runtime.
 *   • `DEFAULTS`         — the canonical default values (the ONE place).
 *   • `SETTINGS_SCHEMA`  — admin/marketplace metadata; its `default` fields
 *                          reference `DEFAULTS` so the two can never drift.
 *   • `buildAdminFields` — derives the Block Kit admin form from the schema,
 *                          so the form can't fall out of sync either.
 *
 * Previously the schema lived in `index.ts`, the defaults were duplicated in
 * `runtime.ts` and `sandbox-entry.ts`, and the admin form was hand-written —
 * which let the three drift (e.g. `underlineLinks` defaulted to `true` in the
 * schema but `false` everywhere else, and `useCustomColors` was missing from
 * the schema entirely). Centralizing them here removes that whole class of bug.
 */

import type { Language } from "./books.ts";

export interface Settings {
	enabled: boolean;
	language: Language;
	defaultVersion: string;
	selectors: string;
	theme: "auto" | "light" | "dark" | "sepia";
	/**
	 * When false (default), the plugin does NOT override link/underline styles
	 * — references inherit the site's existing link color and decoration. When
	 * true, the linkColor / underline* values below take effect.
	 */
	useCustomColors: boolean;
	linkColor: string;
	underlineLinks: boolean;
	underlineColor: string;
	underlineStyle: "solid" | "dashed" | "dotted" | "wavy";
	showVersionBadge: boolean;
	showReadMore: boolean;
	cacheEnabled: boolean;
	cacheTtlSeconds: number;
	apiTimeoutMs: number;
}

/** The canonical default values — the single place defaults are defined. */
export const DEFAULTS: Settings = {
	enabled: true,
	language: "pt-br",
	defaultVersion: "naa",
	selectors: "article\n.prose\n.post-content\nmain",
	theme: "auto",
	useCustomColors: false,
	linkColor: "#B17027",
	underlineLinks: false,
	underlineColor: "#E8B45A",
	underlineStyle: "solid",
	showVersionBadge: true,
	showReadMore: true,
	cacheEnabled: true,
	cacheTtlSeconds: 2_592_000,
	apiTimeoutMs: 5000,
};

/** Keys that are relevant to client-side rendering (no server-only fields). */
export const CLIENT_SETTING_KEYS = [
	"enabled",
	"language",
	"defaultVersion",
	"selectors",
	"theme",
	"useCustomColors",
	"linkColor",
	"underlineLinks",
	"underlineColor",
	"underlineStyle",
	"showVersionBadge",
	"showReadMore",
] as const;

/**
 * Versions offered in the admin "default version" select, grouped by language.
 * Curated from the live Midvash API (api.midvash.com/v1/versions) for the three
 * languages whose book names the plugin detects (pt-br / en / es). The API hosts
 * many more (86 across 33 languages); the complete live list is available via
 * the plugin's own `/versions` route.
 */
const VERSION_OPTIONS = [
	// Portuguese-BR (20)
	{ value: "naa", label: "NAA — Nova Almeida Atualizada" },
	{ value: "ara", label: "ARA — Almeida Revista e Atualizada" },
	{ value: "arc", label: "ARC — Almeida Revista e Corrigida" },
	{ value: "acf", label: "ACF — Almeida Corrigida Fiel" },
	{ value: "nvi", label: "NVI — Nova Versão Internacional" },
	{ value: "nvt", label: "NVT — Nova Versão Transformadora" },
	{ value: "ntlh", label: "NTLH — Nova Tradução na Linguagem de Hoje" },
	{ value: "as21", label: "AS21 — Almeida Século 21" },
	{ value: "jfaa", label: "JFAA — João Ferreira de Almeida Atualizada" },
	{ value: "kja", label: "KJA — King James Atualizada" },
	{ value: "kjf", label: "KJF — King James Fiel" },
	{ value: "msgpt", label: "MSGPT — A Mensagem" },
	{ value: "nbv", label: "NBV — Nova Bíblia Viva" },
	{ value: "aa", label: "AA — Almeida e Atualizada" },
	{ value: "almeida-livre", label: "BL — Bíblia Livre (Almeida 1819)" },
	{ value: "bpm", label: "BPM — Bíblia Portuguesa Mundial" },
	{ value: "onbv", label: "ONBV — Open Nova Bíblia Viva" },
	{ value: "nva", label: "NVA — Bíblia Nova Versão de Acesso Livre" },
	{ value: "blpt", label: "BLPT — Bíblia Livre Para Todos" },
	{ value: "tft", label: "TFT — Tradução para Tradutores" },
	// English (12)
	{ value: "esv", label: "ESV — English Standard Version" },
	{ value: "kjv", label: "KJV — King James Version" },
	{ value: "niv", label: "NIV — New International Version" },
	{ value: "nkjv", label: "NKJV — New King James Version" },
	{ value: "nlt", label: "NLT — New Living Translation" },
	{ value: "msg", label: "MSG — The Message" },
	{ value: "web", label: "WEB — World English Bible" },
	{ value: "asv", label: "ASV — American Standard Version" },
	{ value: "ylt", label: "YLT — Young's Literal Translation" },
	{ value: "dra", label: "DRA — Douay-Rheims American Edition" },
	{ value: "bbe", label: "BBE — Bible in Basic English" },
	{ value: "geneva1599", label: "GNV — Geneva Bible 1599" },
	// Spanish (5)
	{ value: "rvr1960", label: "RVR1960 — Reina-Valera 1960" },
	{ value: "nvies", label: "NVI — Nueva Versión Internacional" },
	{ value: "ntv", label: "NTV — Nueva Traducción Viviente" },
	{ value: "rvr1909", label: "RVR1909 — Reina-Valera 1909" },
	{ value: "rvg", label: "RVG — Reina-Valera Gómez 2010" },
] as const;

/**
 * Admin / marketplace metadata for every setting. `default` references
 * `DEFAULTS` so a default value lives in exactly one place. Kept in the order
 * the admin form should render.
 */
export const SETTINGS_SCHEMA = {
	enabled: {
		type: "boolean",
		label: "Ativar detecção de referências",
		description: "Quando desligado, o script cliente não é injetado.",
		default: DEFAULTS.enabled,
	},
	language: {
		type: "select",
		label: "Idioma",
		description:
			"Define o conjunto de nomes de livros reconhecidos e a URL no midvash.com.",
		options: [
			{ value: "pt-br", label: "Português (Brasil)" },
			{ value: "en", label: "English" },
			{ value: "es", label: "Español" },
		],
		default: DEFAULTS.language,
	},
	defaultVersion: {
		type: "select",
		label: "Versão padrão",
		description: "Versão da Bíblia usada nos tooltips e no link 'Ler mais'.",
		options: VERSION_OPTIONS,
		default: DEFAULTS.defaultVersion,
	},
	selectors: {
		type: "string",
		multiline: true,
		label: "Seletores CSS onde detectar (um por linha)",
		description:
			"O script só procura referências dentro destes elementos. Use seletores específicos para evitar processar a UI inteira.",
		default: DEFAULTS.selectors,
	},
	theme: {
		type: "select",
		label: "Tema do tooltip",
		options: [
			{ value: "auto", label: "Automático (segue prefers-color-scheme)" },
			{ value: "light", label: "Pergaminho (claro)" },
			{ value: "dark", label: "Noite Quente (escuro)" },
			{ value: "sepia", label: "Sépia (modo leitura)" },
		],
		default: DEFAULTS.theme,
	},
	useCustomColors: {
		type: "boolean",
		label: "Usar cores customizadas",
		description:
			"Quando desligado (padrão), as referências herdam a cor e o sublinhado de link do seu site. Ligue para aplicar as cores abaixo.",
		default: DEFAULTS.useCustomColors,
	},
	linkColor: {
		type: "string",
		label: "Cor do link",
		description: "Hex (#B17027) ou qualquer valor CSS. Só ativa com 'Usar cores customizadas'. Padrão: Honey Deep da Midvash.",
		default: DEFAULTS.linkColor,
	},
	underlineLinks: {
		type: "boolean",
		label: "Sublinhar referências",
		default: DEFAULTS.underlineLinks,
	},
	underlineColor: {
		type: "string",
		label: "Cor do sublinhado",
		description: "Padrão: Honey da Midvash.",
		default: DEFAULTS.underlineColor,
	},
	underlineStyle: {
		type: "select",
		label: "Estilo do sublinhado",
		options: [
			{ value: "solid", label: "Sólido" },
			{ value: "dashed", label: "Tracejado" },
			{ value: "dotted", label: "Pontilhado" },
			{ value: "wavy", label: "Ondulado" },
		],
		default: DEFAULTS.underlineStyle,
	},
	showVersionBadge: {
		type: "boolean",
		label: "Mostrar badge da versão no tooltip",
		default: DEFAULTS.showVersionBadge,
	},
	showReadMore: {
		type: "boolean",
		label: "Mostrar link 'Ler mais' no tooltip",
		default: DEFAULTS.showReadMore,
	},
	cacheEnabled: {
		type: "boolean",
		label: "Ativar cache",
		description: "Armazena versículos no KV pra reduzir chamadas à API.",
		default: DEFAULTS.cacheEnabled,
	},
	cacheTtlSeconds: {
		type: "number",
		label: "Duração do cache (segundos)",
		description: "Padrão: 2.592.000 = 30 dias. Texto bíblico não muda; pode aumentar.",
		default: DEFAULTS.cacheTtlSeconds,
		min: 60,
		max: 31_536_000,
	},
	apiTimeoutMs: {
		type: "number",
		label: "Timeout da API (ms)",
		description: "Tempo máximo de espera por resposta da api.midvash.com.",
		default: DEFAULTS.apiTimeoutMs,
		min: 500,
		max: 30_000,
	},
} as const;

type SchemaField = (typeof SETTINGS_SCHEMA)[keyof typeof SETTINGS_SCHEMA];

function coerceValue(def: SchemaField, raw: unknown): unknown {
	switch (def.type) {
		case "boolean":
			if (typeof raw === "boolean") return raw;
			if (raw === "true") return true;
			if (raw === "false") return false;
			return undefined;
		case "number": {
			const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
			if (!Number.isFinite(n)) return undefined;
			return Math.min(def.max, Math.max(def.min, n));
		}
		case "select":
			return typeof raw === "string" && def.options.some((o) => o.value === raw)
				? raw
				: undefined;
		case "string":
			return typeof raw === "string" ? raw : undefined;
	}
}

/**
 * Validate and coerce one persisted setting against its schema field: type
 * checks, enum membership for selects, and min/max clamping for numbers.
 * Returns the coerced value, or `undefined` when the stored value can't be
 * salvaged (a wrong type, an unknown enum, a non-numeric number) so the caller
 * keeps the default. Used by both `loadSettings` here and the backend's
 * `kv.list` fast path, so a corrupt KV value can never reach the client
 * settings or the regex build.
 */
export function coerceSetting(key: string, raw: unknown): unknown {
	if (raw === null || raw === undefined) return undefined;
	const def = (SETTINGS_SCHEMA as Record<string, SchemaField>)[key];
	return def ? coerceValue(def, raw) : undefined;
}

/**
 * Read all settings from the plugin KV store, falling back to `DEFAULTS` for
 * any key that hasn't been persisted yet — or whose stored value fails
 * validation. The getter is typed loosely so this module never imports
 * emdash's `PluginContext`.
 */
export async function loadSettings(
	get: (key: string) => Promise<unknown>,
): Promise<Settings> {
	const out: Settings = { ...DEFAULTS };
	for (const key of Object.keys(DEFAULTS) as Array<keyof Settings>) {
		const coerced = coerceSetting(key, await get(`settings:${key}`));
		if (coerced !== undefined) (out as unknown as Record<string, unknown>)[key] = coerced;
	}
	return out;
}

/**
 * Derive the descriptor's `settingsSchema` (EmDash ≥0.30) from
 * `SETTINGS_SCHEMA`. EmDash renders an auto-generated settings form from this
 * and persists values under `plugin:{id}:settings:{key}` — the same keys
 * `loadSettings` already reads — so the auto form, the Block Kit admin page
 * and the runtime can never disagree. Returns fresh mutable objects because
 * emdash's `SettingField` type takes mutable `options` arrays, while
 * `SETTINGS_SCHEMA` is `as const`.
 */
export function buildSettingsSchemaFields(): Record<string, Record<string, unknown>> {
	return Object.fromEntries(
		Object.entries(SETTINGS_SCHEMA).map(([key, def]) => [
			key,
			{
				...def,
				...("options" in def ? { options: def.options.map((o) => ({ ...o })) } : {}),
			},
		]),
	);
}

/**
 * Derive the Block Kit form fields for the admin page from `SETTINGS_SCHEMA`,
 * pre-filled with the current values. Keeping this derived means the form,
 * the defaults, and the marketplace schema can never list different fields.
 */
export function buildAdminFields(current: Settings): unknown[] {
	const values = current as unknown as Record<string, unknown>;
	return Object.entries(SETTINGS_SCHEMA).map(([key, def]) => {
		const base = { action_id: key, label: def.label, initial_value: values[key] };
		switch (def.type) {
			case "boolean":
				return { type: "toggle", ...base };
			case "select":
				return { type: "select", ...base, options: def.options };
			case "number":
				return { type: "number_input", ...base, min: def.min, max: def.max };
			case "string":
				return {
					type: "text_input",
					...base,
					multiline: "multiline" in def ? def.multiline : false,
				};
		}
	});
}
