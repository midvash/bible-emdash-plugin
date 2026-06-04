/**
 * Bible by Midvash — plugin backend (hooks + routes).
 *
 * Hooks:
 *   plugin:install     seed default settings into KV
 *   page:fragments     inject the tooltip <style> + <script> into public pages
 *                      (TRUSTED in-process only — EmDash never runs page:fragments
 *                      for sandboxed plugins, so the tooltip feature requires a
 *                      trusted install. Needs the hooks.page-fragments:register
 *                      capability.)
 *
 * Routes (all JSON — EmDash wraps every plugin route reply as { data: ... }):
 *   GET  /lookup?ref=&v=&lang=   public — resolve a single reference
 *   GET  /versions?lang=         public — list versions (cached daily)
 *   GET  /settings               admin  — read all settings
 *   POST /settings/save          admin  — patch settings
 *        admin                   admin  — Block Kit settings form
 *        scan                    admin  — diagnostic: detect refs in text
 */

import type { PluginContext, SandboxedPlugin } from "emdash/plugin";

import { displayName, type Language } from "./lib/books.ts";
import { findReferences, parseReference } from "./lib/parser.ts";
import { buildReadMoreUrl, fetchVerse, fetchVersions } from "./lib/midvash.ts";
import { buildClientAssets } from "./lib/client-assets.ts";
import {
	DEFAULTS,
	type Settings,
	buildAdminFields,
	loadSettings as loadSettingsFromKv,
} from "./lib/settings.ts";

const SETTINGS_PREFIX = "settings:";

/**
 * Read all settings from this plugin's KV store, falling back to DEFAULTS.
 * Fast path: one `kv.list("settings:")` range read instead of ~15 point reads
 * (this runs on every page render via page:fragments and on every route).
 */
async function loadSettings(ctx: PluginContext): Promise<Settings> {
	if (typeof ctx.kv.list === "function") {
		try {
			const entries = await ctx.kv.list(SETTINGS_PREFIX);
			const out: Settings = { ...DEFAULTS };
			for (const { key, value } of entries) {
				const k = key.slice(SETTINGS_PREFIX.length);
				if (k in DEFAULTS && value !== null && value !== undefined) {
					(out as unknown as Record<string, unknown>)[k] = value;
				}
			}
			return out;
		} catch {
			// Fall through to per-key reads on any list() failure.
		}
	}
	return loadSettingsFromKv((key) => ctx.kv.get(key));
}

async function renderSettingsBlocks(ctx: PluginContext): Promise<unknown[]> {
	const s = await loadSettings(ctx);
	return [
		{ type: "header", text: "Bible by Midvash" },
		{
			type: "context",
			text: "Detecta referências bíblicas no conteúdo e exibe tooltips com o versículo, via api.midvash.com.",
		},
		{
			type: "form",
			block_id: "settings",
			submit: { label: "Salvar", action_id: "save" },
			fields: buildAdminFields(s),
		},
		{ type: "divider" },
		{
			type: "context",
			text: "Powered by Midvash API • https://api.midvash.com",
		},
	];
}

export default {
	hooks: {
		"plugin:install": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				ctx.log.info("Bible by Midvash installed — seeding defaults");
				for (const [k, v] of Object.entries(DEFAULTS)) {
					const existing = await ctx.kv.get(`${SETTINGS_PREFIX}${k}`);
					if (existing === null || existing === undefined) {
						await ctx.kv.set(`${SETTINGS_PREFIX}${k}`, v);
					}
				}
			},
		},

		// Auto-inject the tooltip assets into every public page. EmDash splices
		// these fragments into <head> / before </body> when the site layout uses
		// its <EmDashHead> / <EmDashBodyEnd> components.
		"page:fragments": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				const settings = await loadSettings(ctx);
				if (!settings.enabled) return [];
				const { js, css } = buildClientAssets(settings);
				return [
					{
						kind: "html" as const,
						placement: "head" as const,
						html: `<style>${css}</style>`,
						key: "bible-by-midvash:css",
					},
					{
						kind: "inline-script" as const,
						placement: "body:end" as const,
						code: js,
						key: "bible-by-midvash:js",
					},
				];
			},
		},
	},

	routes: {
		lookup: {
			public: true,
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const url = new URL(routeCtx.request.url);
				const refRaw = url.searchParams.get("ref");
				if (!refRaw) throw new Error("Missing ?ref");

				const settings = await loadSettings(ctx);
				const version = url.searchParams.get("v") || settings.defaultVersion;
				const language = (url.searchParams.get("lang") as Language) || settings.language;

				const parsed = parseReference(refRaw);
				if (!parsed) throw new Error("Unrecognized reference");

				if (!ctx.http) throw new Error("Network capability missing");

				const verse = await fetchVerse(
					parsed,
					{
						version,
						timeoutMs: settings.apiTimeoutMs,
						cacheEnabled: settings.cacheEnabled,
						cacheTtlSeconds: settings.cacheTtlSeconds,
					},
					ctx.kv,
					ctx.http,
				);

				if (!verse) throw new Error("Upstream lookup failed");

				// Build the display reference in the requested language, preferring
				// the author's exact matched name (preserves casing/accents), then
				// the canonical name in `language`.
				const versePart =
					parsed.verse !== undefined
						? `:${parsed.verse}${parsed.verseEnd && parsed.verseEnd !== parsed.verse ? `-${parsed.verseEnd}` : ""}`
						: "";
				const displayRef =
					`${parsed.matchedName || displayName(parsed.slug, language)} ${parsed.chapter}${versePart}`.trim();

				return {
					reference: displayRef,
					text: verse.data.text,
					version,
					readMoreUrl: buildReadMoreUrl(parsed, version, language),
					meta: { cached: verse.meta.cached, upstreamReference: verse.meta.reference },
				};
			},
		},

		versions: {
			public: true,
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const url = new URL(routeCtx.request.url);
				const lang = url.searchParams.get("lang") || undefined;
				const settings = await loadSettings(ctx);
				if (!ctx.http) throw new Error("Network capability missing");
				const data = await fetchVersions(lang, settings.apiTimeoutMs, ctx.kv, ctx.http);
				if (!data) throw new Error("Upstream failed");
				return data;
			},
		},

		// Admin: read settings (for the auto-generated form).
		settings: {
			handler: async (_routeCtx: any, ctx: PluginContext) => {
				return await loadSettings(ctx);
			},
		},

		// Admin: persist settings. Sandboxed routes receive the parsed body as
		// `input` — `request` is a serialized { url, method, headers } with no
		// `.json()` method, so we never call it.
		"settings/save": {
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const body = (routeCtx.input ?? {}) as Record<string, unknown>;
				for (const [k, v] of Object.entries(body)) {
					if (v !== undefined) await ctx.kv.set(`${SETTINGS_PREFIX}${k}`, v);
				}
				return { success: true };
			},
		},

		// Block Kit admin form — rendered at /_emdash/admin/plugins/bible-by-midvash/settings.
		admin: {
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const interaction = (routeCtx.input ?? {}) as {
					type?: string;
					page?: string;
					action_id?: string;
					values?: Record<string, unknown>;
				};

				if (interaction.type === "form_submit" && interaction.action_id === "save") {
					const values = interaction.values ?? {};
					for (const [k, v] of Object.entries(values)) {
						if (v !== undefined) await ctx.kv.set(`${SETTINGS_PREFIX}${k}`, v);
					}
					return {
						blocks: await renderSettingsBlocks(ctx),
						toast: { message: "Configurações salvas", type: "success" },
					};
				}

				return { blocks: await renderSettingsBlocks(ctx) };
			},
		},

		// Diagnostic: scan an arbitrary text and return all detected refs.
		scan: {
			public: false,
			handler: async (routeCtx: any) => {
				const text = (routeCtx.input?.text ?? "") as string;
				const matches = [];
				for (const m of findReferences(text)) matches.push(m);
				return { matches };
			},
		},
	},
} satisfies SandboxedPlugin;
