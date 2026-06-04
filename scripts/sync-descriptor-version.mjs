#!/usr/bin/env node
/**
 * Keep the plugin descriptor's `version` (hard-coded in src/index.ts, read by
 * EmDash and the marketplace manifest) in sync with package.json.
 *
 * Runs as part of `npm run version-packages` (after `changeset version` bumps
 * package.json). The drift-guard test in test/descriptor.test.ts fails the build
 * if these ever disagree, so this script closes the loop automatically.
 */
import { readFileSync, writeFileSync } from "node:fs";

const pkgUrl = new URL("../package.json", import.meta.url);
const indexUrl = new URL("../src/index.ts", import.meta.url);

const { version } = JSON.parse(readFileSync(pkgUrl, "utf8"));
const src = readFileSync(indexUrl, "utf8");

const next = src.replace(/(\bversion:\s*")[^"]+(")/, `$1${version}$2`);

if (next === src) {
	console.log(`[sync-descriptor-version] already at ${version}`);
} else {
	writeFileSync(indexUrl, next);
	console.log(`[sync-descriptor-version] src/index.ts → ${version}`);
}
