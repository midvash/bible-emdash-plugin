/**
 * Bible by Midvash — plugin backend, STORE (sandboxed) edition.
 *
 * This is the entry the marketplace bundle builds (`emdash-plugin bundle`
 * always reads `src/plugin.ts`), so it uses only hooks a sandboxed install can
 * run. The trusted npm install adds the `page:fragments` tooltip hook on top of
 * this in `trusted.ts`.
 *
 * Hooks:
 *   plugin:install     seed default settings into KV
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
 *        editor/insert-verse     editor — "Insert verse" saved-entry panel:
 *                                         appends a passage as a blockquote to
 *                                         the draft (admin.editor-draft:*)
 */

import { z } from "zod";

import type { PluginContext, SandboxedPlugin } from "emdash/plugin";

import { displayName, type Language } from "./lib/books.ts";
import { findReferences, parseReference } from "./lib/parser.ts";
import { buildReadMoreUrl, fetchVerse, fetchPassages, fetchVersions } from "./lib/midvash.ts";
import type { VerseResult } from "./lib/midvash.ts";
import {
	INSERT_FIELD,
	MAX_FIELD_BYTES,
	appendBlocks,
	buildQuoteBlocks,
	jsonBytes,
	panelStrings,
	referenceLabel,
	renderInsertPanel,
} from "./lib/insert-verse.ts";
import { SETTINGS_PREFIX, loadPluginSettings } from "./lib/kv-settings.ts";
import { localeToLanguage } from "./lib/locale.ts";
import { DEFAULTS, type Settings, buildAdminFields, versionName } from "./lib/settings.ts";
import { creditLine, servedVersion } from "./lib/versions.ts";

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
	// Label and link the version the API actually served: it may swap a
	// version it no longer serves for a free one (see versions.ts).
	const served = verse.data.version || version;
	return {
		reference,
		text: verse.data.text,
		version: served,
		versionName: versionName(served),
		readMoreUrl: buildReadMoreUrl(parsed, served, language),
		// `credit` — one line (title · license) the tooltip shows under the
		// text; `copyright` — the full notice, shown on hover.
		credit: creditLine(verse.meta.copyright),
		copyright: verse.meta.copyright,
		// `truncated` — the API capped a whole-chapter preview; the client shows
		// an ellipsis and leans on the read-more link.
		truncated: verse.meta.truncated === true,
		meta: { cached: verse.meta.cached, upstreamReference: verse.meta.reference },
	};
}

function loadSettings(ctx: PluginContext): Promise<Settings> {
	return loadPluginSettings(ctx.kv);
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
	},

	routes: {
		lookup: {
			public: true,
			// EmDash ≥0.30 sets this Cache-Control on successful GET responses
			// (public routes only). Short TTL on purpose: the client tooltip
			// sends ?v=/&lang from the page's injected settings, so a
			// defaultVersion/language change in the admin reaches visitors as
			// soon as the page re-renders. Verse text itself never
			// changes — stale-while-revalidate keeps repeat hovers instant.
			cacheControl: "public, max-age=300, stale-while-revalidate=3600",
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const url = new URL(routeCtx.request.url);
				const refRaw = url.searchParams.get("ref");
				if (!refRaw) throw new Error("Missing ?ref");

				const settings = await loadSettings(ctx);
				// Pages cached before an upgrade may still send a dropped ?v=nvt.
				const version = servedVersion(url.searchParams.get("v") || settings.defaultVersion);
				const language = localeToLanguage(url.searchParams.get("lang")) ?? settings.language;

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
				// Pages cached before an upgrade may still send a dropped ?v=nvt.
				const version = servedVersion(url.searchParams.get("v") || settings.defaultVersion);
				const language = localeToLanguage(url.searchParams.get("lang")) ?? settings.language;
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

		// "Insert verse" saved-entry panel (emdash-plugin.jsonc
		// `admin.editorPanels`). panel_load renders the form; submitting it
		// fetches the passage and returns an `editor-draft-patch` that sets the
		// `content` field to its current draft value + a blockquote at the end
		// (patches replace whole fields; the host gives no cursor position).
		// The host previews the patch and marks the form dirty; nothing is saved
		// until the author saves.
		"editor/insert-verse": {
			public: false,
			permission: "content:edit_own",
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const settings = await loadSettings(ctx);
				// Panel copy follows the admin locale; the inserted reference
				// follows the content's locale.
				const uiLanguage = localeToLanguage(routeCtx.ui?.locale) ?? settings.language;
				const contentLanguage =
					localeToLanguage(routeCtx.ui?.contentLocale ?? routeCtx.ui?.entry?.locale) ?? settings.language;
				const t = panelStrings(uiLanguage);

				const input = (routeCtx.input ?? {}) as {
					type?: string;
					action_id?: string;
					values?: Record<string, unknown>;
					draft?: { fields?: Record<string, unknown> };
				};
				if (input.type !== "form_submit" || input.action_id !== "insert") {
					return { blocks: renderInsertPanel(uiLanguage, { version: settings.defaultVersion }) };
				}

				const values = input.values ?? {};
				const refRaw = typeof values.ref === "string" ? values.ref.trim() : "";
				const version = servedVersion(
					typeof values.version === "string" && values.version ? values.version : settings.defaultVersion,
				);
				const form = { ref: refRaw, version };
				const fail = (message: string) => ({ blocks: renderInsertPanel(uiLanguage, form, message) });

				const parsed = parseReference(refRaw);
				if (!parsed) return fail(t.unrecognized);
				const draftFields = input.draft?.fields;
				if (!draftFields || !(INSERT_FIELD in draftFields)) return fail(t.noField);
				if (!ctx.http) throw new Error("Network capability missing");

				const result = await fetchVerse(
					parsed,
					{
						version,
						timeoutMs: settings.apiTimeoutMs,
						cacheEnabled: settings.cacheEnabled,
						cacheTtlSeconds: settings.cacheTtlSeconds,
						fullChapter: true,
					},
					ctx.kv,
					ctx.http,
				);
				if (!result.ok) return fail(result.kind === "not-found" ? t.notFound : t.fetchError);

				const verse = result.data;
				const served = verse.data.version || version;
				const reference = referenceLabel(parsed, displayName(parsed.slug, contentLanguage));
				const quote = buildQuoteBlocks({
					reference,
					text: verse.data.text ?? "",
					// CC BY versions require the credit next to the text.
					attribution: creditLine(verse.meta.copyright) ?? versionName(served),
					href: settings.showReadMore ? buildReadMoreUrl(parsed, served, contentLanguage) : undefined,
				});
				const value = appendBlocks(draftFields[INSERT_FIELD], quote);
				if (jsonBytes(value) > MAX_FIELD_BYTES) return fail(t.tooLarge);

				return {
					blocks: renderInsertPanel(uiLanguage, { version: served }),
					toast: { message: t.inserted(reference), type: "success" as const },
					patch: {
						type: "editor-draft-patch" as const,
						operations: [{ op: "set" as const, field: INSERT_FIELD, value }],
					},
				};
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
