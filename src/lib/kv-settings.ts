/**
 * Read all settings from the plugin's KV store, falling back to DEFAULTS.
 * Fast path: one `kv.list("settings:")` range read instead of ~15 point reads
 * (this runs on every page render via page:fragments and on every route).
 * Shared by the store edition (`plugin.ts`) and the trusted one (`trusted.ts`).
 */

import { DEFAULTS, type Settings, coerceSetting, loadSettings } from "./settings.ts";

export const SETTINGS_PREFIX = "settings:";

export interface SettingsKv {
	get(key: string): Promise<unknown>;
	list?(prefix: string): Promise<Array<{ key: string; value: unknown }>>;
}

export async function loadPluginSettings(kv: SettingsKv): Promise<Settings> {
	if (typeof kv.list === "function") {
		try {
			const entries = await kv.list(SETTINGS_PREFIX);
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
	return loadSettings((key) => kv.get(key));
}
