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
 *   GET  /lookup?ref=&v=&lang=   public — resolve a single reference (cached 5 min)
 *   GET  /passages?refs=&v=&lang= public — batch-resolve refs (`;`-separated) in
 *                                 one upstream call; same envelope as /lookup
 *   GET  /versions?lang=         public — list versions (cached 1 h)
 *   GET  /settings               admin  — read all settings
 *   POST /settings/save          admin  — patch settings
 *        admin                   admin  — Block Kit settings form
 *        scan                    admin  — diagnostic: detect refs in text
 *                                         (plugins:manage; also an MCP tool)
 */

import { z } from "zod";

import type { PluginContext, SandboxedPlugin } from "emdash/plugin";

import { displayName, type Language } from "./lib/books.ts";
import { findReferences, parseReference } from "./lib/parser.ts";
import { buildReadMoreUrl, fetchVerse, fetchPassages, fetchVersions } from "./lib/midvash.ts";
import type { VerseResult } from "./lib/midvash.ts";
import { buildClientAssets } from "./lib/client-assets.ts";
import {
	DEFAULTS,
	type Settings,
	buildAdminFields,
	coerceSetting,
	loadSettings as loadSettingsFromKv,
} from "./lib/settings.ts";

const SETTINGS_PREFIX = "settings:";

/** A parsed reference paired with its language-aware display string. */
type ParsedRef = ReturnType<typeof parseReference>;

/**
 * Build the language-aware display reference (e.g. "João 3:16"), preferring the
 * author's exact matched name over the canonical name in `language`.
 */
function displayReference(parsed: NonNullable<ParsedRef>, language: Language): string {
	const versePart =
		parsed.verse !== undefined
			? `:${parsed.verse}${parsed.verseEnd && parsed.verseEnd !== parsed.verse ? `-${parsed.verseEnd}` : ""}`
			: "";
	return `${parsed.matchedName || displayName(parsed.slug, language)} ${parsed.chapter}${versePart}`.trim();
}

/**
 * Shape a single {@link VerseResult} into the JSON the client tooltip expects —
 * shared by the `lookup` (single) and `passages` (batch) routes so both return
 * the identical envelope.
 */
function toLookupPayload(
	parsed: NonNullable<ParsedRef>,
	result: VerseResult,
	version: string,
	language: Language,
): Record<string, unknown> {
	const reference = displayReference(parsed, language);
	if (!result.ok) {
		// Issue #41: distinguish "verse not found" (404) from "couldn't load".
		return { error: result.kind, reference, version };
	}
	const verse = result.data;
	return {
		reference,
		text: verse.data.text,
		version,
		readMoreUrl: buildReadMoreUrl(parsed, version, language),
		// `truncated` — the API capped a whole-chapter preview; the client shows
		// an ellipsis and leans on the read-more link.
		truncated: verse.meta.truncated === true,
		meta: { cached: verse.meta.cached, upstreamReference: verse.meta.reference },
	};
}

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
				if (!(k in DEFAULTS)) continue;
				// Validate/coerce against the schema; ignore corrupt values.
				const coerced = coerceSetting(k, value);
				if (coerced !== undefined) (out as unknown as Record<string, unknown>)[k] = coerced;
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
			// EmDash ≥0.30 sets this Cache-Control on successful GET responses
			// (public routes only). Short TTL on purpose: the client tooltip
			// omits ?v=/&lang, so a defaultVersion/language change in the admin
			// must reach visitors within minutes. Verse text itself never
			// changes — stale-while-revalidate keeps repeat hovers instant.
			cacheControl: "public, max-age=300, stale-while-revalidate=3600",
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

				const result = await fetchVerse(
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

				return toLookupPayload(parsed, result, version, language);
			},
		},

		// Batch sibling of /lookup: resolve many refs in ONE upstream call
		// (GET /v1/passages) so the client can pre-warm every reference on a page
		// at once instead of paying per-hover latency. `?refs=` is a
		// semicolon-separated list; results come back in input order, each in the
		// same envelope as /lookup (unparseable refs become {error:"unrecognized"}).
		passages: {
			public: true,
			cacheControl: "public, max-age=300, stale-while-revalidate=3600",
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const url = new URL(routeCtx.request.url);
				const refsRaw = url.searchParams.get("refs");
				if (!refsRaw) throw new Error("Missing ?refs");

				const settings = await loadSettings(ctx);
				const version = url.searchParams.get("v") || settings.defaultVersion;
				const language = (url.searchParams.get("lang") as Language) || settings.language;
				if (!ctx.http) throw new Error("Network capability missing");

				const tokens = refsRaw.split(";").map((t) => t.trim()).filter(Boolean);
				// Parse up front so unparseable refs keep their slot without a
				// wasted upstream lookup, and the parseable ones batch together.
				const parsed = tokens.map((t) => parseReference(t));
				const resolvable = parsed.filter((p): p is NonNullable<ParsedRef> => p !== null);

				const verseResults = await fetchPassages(
					resolvable,
					{
						version,
						timeoutMs: settings.apiTimeoutMs,
						cacheEnabled: settings.cacheEnabled,
						cacheTtlSeconds: settings.cacheTtlSeconds,
					},
					ctx.kv,
					ctx.http,
				);

				let cursor = 0;
				const results = parsed.map((p) =>
					p === null
						? { error: "unrecognized" as const }
						: toLookupPayload(p, verseResults[cursor++], version, language),
				);
				return { results };
			},
		},

		versions: {
			public: true,
			// The upstream version list changes rarely (already KV-cached daily
			// server-side); let browsers/CDNs hold it for an hour.
			cacheControl: "public, max-age=3600, stale-while-revalidate=86400",
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const url = new URL(routeCtx.request.url);
				const lang = url.searchParams.get("lang") || undefined;
				const settings = await loadSettings(ctx);
				if (!ctx.http) throw new Error("Network capability missing");
				const data = await fetchVersions(lang, settings.apiTimeoutMs, ctx.kv, ctx.http);
				if (!data) throw new Error("Upstream failed");
				// fetchVersions already returns `{ data: [...] }`, and EmDash wraps a
				// route's return value in `{ data: ... }` — returning it whole would
				// double-wrap to `{ data: { data: [...] } }`. Return the inner array so
				// consumers get `{ data: [...] }`, matching /lookup.
				return data.data;
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
		// Explicit RBAC permission (EmDash ≥0.30) — also required for the MCP
		// tool below: the bundle CLI hard-fails on tools referencing a route
		// that is public or permissionless.
		scan: {
			public: false,
			permission: "plugins:manage",
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const text = (routeCtx.input?.text ?? "") as string;
				const includeText = routeCtx.input?.includeText === true;
				const matches = [];
				for (const m of findReferences(text)) matches.push(m);

				// Opt-in: resolve verse text for every match in ONE batch call
				// (GET /v1/passages) so an agent gets the text without N follow-up
				// lookups. Best-effort — a failed lookup just omits `text` for that
				// match; the coordinates are always returned.
				if (includeText && matches.length > 0 && ctx.http) {
					const settings = await loadSettings(ctx);
					const verseResults = await fetchPassages(
						matches,
						{
							version: settings.defaultVersion,
							timeoutMs: settings.apiTimeoutMs,
							cacheEnabled: settings.cacheEnabled,
							cacheTtlSeconds: settings.cacheTtlSeconds,
						},
						ctx.kv,
						ctx.http,
					);
					return {
						matches: matches.map((m, i) => {
							const r = verseResults[i];
							return r?.ok ? { ...m, text: r.data.data.text } : m;
						}),
					};
				}

				return { matches };
			},
		},
	},

	// EmDash ≥0.30: routes exposed as agent-callable MCP tools. Lets an admin
	// agent (Claude, etc.) detect Bible references in arbitrary text through
	// the CMS's MCP endpoint. Older hosts ignore this block.
	mcp: {
		tools: {
			scan: {
				description:
					"Detect Bible references (PT-BR, EN, ES) in a text. Returns each match with its canonical book slug, chapter and verse range — the same parser the tooltip plugin uses on rendered pages. Set includeText to also fetch the verse text (one batched API call).",
				route: "scan",
				destructive: false,
				input: z.object({
					text: z.string().min(1).describe("The text to scan for Bible references"),
					includeText: z
						.boolean()
						.optional()
						.describe("When true, resolve and include each verse's text (default false)"),
				}),
				output: z.object({
					matches: z.array(
						z.object({
							slug: z.string(),
							chapter: z.number(),
							verse: z.number().optional(),
							verseEnd: z.number().optional(),
							matchedName: z.string().optional(),
							text: z.string().optional(),
						}),
					),
				}),
			},
		},
	},
} satisfies SandboxedPlugin;
