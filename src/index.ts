/**
 * Bible by Midvash — EmDash plugin descriptor.
 *
 * Auto-detects Bible references (PT-BR, EN, ES) in rendered pages and turns
 * them into hover tooltips that pull verse text from the public Midvash API
 * (https://api.midvash.com).
 *
 * Imported in `astro.config.mjs`:
 *   import { biblePlugin } from "@midvash/emdash-plugin-bible";
 *   emdash({ plugins: [biblePlugin()] })
 */

import type { PluginDescriptor } from "emdash";

import { buildSettingsSchemaFields } from "./lib/settings.ts";

export interface BiblePluginOptions {
	/**
	 * Override the plugin id. Useful only when running multiple instances
	 * of the same plugin (rare). Defaults to "bible-by-midvash".
	 */
	id?: string;
}

export function biblePlugin(options: BiblePluginOptions = {}): PluginDescriptor {
	return {
		id: options.id ?? "bible-by-midvash",
		version: "0.7.0",
		format: "standard",
		entrypoint: "@midvash/emdash-plugin-bible/sandbox",
		options: {},
		// "network:request" — gates ctx.http (was "network:fetch", deprecated).
		// "hooks.page-fragments:register" — required to register the page:fragments
		// hook that injects the tooltip <script>/<style>. EmDash skips the hook
		// silently without this capability (and only runs it for trusted installs).
		capabilities: ["network:request", "hooks.page-fragments:register"],
		allowedHosts: ["api.midvash.com"],

		// Admin page rendered by the `admin` route via Block Kit.
		adminPages: [{ path: "/settings", label: "Bible by Midvash", icon: "book" }],

		// EmDash ≥0.30 renders an auto-generated settings form from this schema
		// and persists values under `plugin:{id}:settings:{key}` — the exact keys
		// the backend reads via `ctx.kv.get("settings:{key}")`, so both settings
		// UIs (this and the Block Kit admin page above, kept for hosts <0.30)
		// write to the same store. Older hosts ignore the field.
		// Cast via unknown: lib/settings.ts deliberately never imports emdash
		// types, so its return type is structural, not the SettingField union.
		settingsSchema: buildSettingsSchemaFields() as unknown as PluginDescriptor["settingsSchema"],
	};
}

/**
 * Settings schema metadata — re-exported from the single source of truth in
 * `lib/settings.ts`. Used by the Block Kit admin route at runtime and by the
 * descriptor's `settingsSchema` above (EmDash ≥0.30 auto settings form).
 */
export { SETTINGS_SCHEMA, DEFAULTS, type Settings } from "./lib/settings.ts";

// NOTE: intentionally no `export default`. The `emdash plugin bundle` CLI
// extracts a standard-format manifest by probing the backend (sandbox-entry)
// for routes/hooks — but only when the main entry has NO default-export factory
// (a default function makes it take a descriptor-only path that omits routes).
// Consumers import the named `biblePlugin` per the README.
