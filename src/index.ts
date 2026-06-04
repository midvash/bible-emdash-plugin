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
		version: "0.2.1",
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
	};
}

/**
 * Settings schema metadata — re-exported from the single source of truth in
 * `lib/settings.ts`. Used by the Block Kit admin route at runtime and intended
 * for marketplace bundling (manifest.json `admin.settingsSchema`). Not part of
 * PluginDescriptor (standard format has no top-level settingsSchema field).
 */
export { SETTINGS_SCHEMA, DEFAULTS, type Settings } from "./lib/settings.ts";

// NOTE: intentionally no `export default`. The `emdash plugin bundle` CLI
// extracts a standard-format manifest by probing the backend (sandbox-entry)
// for routes/hooks — but only when the main entry has NO default-export factory
// (a default function makes it take a descriptor-only path that omits routes).
// Consumers import the named `biblePlugin` per the README.
