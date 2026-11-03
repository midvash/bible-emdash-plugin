/**
 * Bible by Midvash — plugin backend, TRUSTED (npm) edition.
 *
 * Everything in the store edition (`plugin.ts`: routes, admin form, MCP tool,
 * "Insert verse" panel route) plus the `page:fragments` hook that injects the
 * tooltip <style> + <script> into public pages. EmDash runs page:fragments
 * only for trusted in-process plugins, which is why the marketplace bundle
 * (built from `plugin.ts`) leaves it out. Needs the
 * hooks.page-fragments:register capability (declared in `index.ts`).
 *
 * The npm descriptor (`biblePlugin()`) points its entrypoint here via the
 * package's `./sandbox` export.
 */

import type { PluginContext, SandboxedPlugin } from "emdash/plugin";

import store from "./plugin.ts";
import { buildClientAssets } from "./lib/client-assets.ts";
import { loadPluginSettings } from "./lib/kv-settings.ts";

export default {
	...store,
	hooks: {
		...store.hooks,

		// Auto-inject the tooltip assets into every public page. EmDash splices
		// these fragments into <head> / before </body> when the site layout uses
		// its <EmDashHead> / <EmDashBodyEnd> components.
		"page:fragments": {
			handler: async (event: { page?: { locale?: string | null } }, ctx: PluginContext) => {
				const settings = await loadPluginSettings(ctx.kv);
				if (!settings.enabled) return [];
				const { js, css } = buildClientAssets(settings, event?.page?.locale);
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
} satisfies SandboxedPlugin;
