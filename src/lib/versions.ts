/**
 * Bible versions the Midvash API actually serves.
 *
 * In October 2026 api.midvash.com stopped serving versions without an open
 * license (NVT, NAA, NIV, NLT, NTV…). A request for one of them still returns
 * 200, but with the text of a free version in the same language, and
 * `data.version` names the version that came back. Sites that kept NVT saved
 * showed "NVT" in the tooltip over Open Nova Bíblia Viva text.
 *
 * `RETIRED_VERSIONS` mirrors the API's own aliases, so the links, the lookups
 * and the admin form all use the version readers actually get. Probed from the
 * live API (`GET /v1/{slug}/john/3/16` → `data.version`).
 */

export const RETIRED_VERSIONS: Readonly<Record<string, string>> = {
	// Portuguese
	naa: "almeida-livre",
	ara: "almeida-livre",
	arc: "alm1911",
	acf: "almeida-livre",
	nvi: "onbv",
	nvt: "onbv",
	ntlh: "onbv",
	as21: "almeida-livre",
	jfaa: "almeida-livre",
	kja: "onbv",
	kjf: "onbv",
	msgpt: "onbv",
	nbv: "onbv",
	aa: "almeida-livre",
	// English
	esv: "bsb",
	niv: "bsb",
	nkjv: "kjv",
	nlt: "bsb",
	msg: "bsb",
	// Spanish
	rvr1960: "rvr1909",
	nvies: "pdt",
	ntv: "onbv-es",
};

/** The version the API serves for `slug`: its free replacement if it was dropped. */
export function servedVersion(slug: string): string {
	const key = String(slug).toLowerCase();
	return RETIRED_VERSIONS[key] ?? key;
}

/**
 * Pull the license out of the lines of a copyright notice: a CC token like
 * "CC BY-SA 4.0" or "CC0", a CC BY license spelled out in words, or the public
 * domain.
 */
function licenseOf(lines: string[]): string | undefined {
	for (const line of lines) {
		const token = /\b(CC0|CC BY(?:-[A-Z]{2})*(?: \d\.\d)?)(?![\w.])/.exec(line);
		if (token) return token[1];
		const words = /Creative Commons Atribui(?:ção|ción) (\d\.\d)/.exec(line);
		if (words) return `CC BY ${words[1]}`;
		const publicDomain = /^(Public Domain|Dom[ií]nio público)/i.exec(line);
		if (publicDomain) return publicDomain[1];
	}
	return undefined;
}

/**
 * A one-line credit for the tooltip from the API's `meta.copyright`: the
 * version's title plus its license, e.g.
 * "Biblica® Open Nova Bíblia Viva™ (ONBV) · CC BY-SA 4.0". CC BY versions
 * require this attribution next to the text.
 */
export function creditLine(copyright: string | undefined): string | undefined {
	const lines = String(copyright ?? "")
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	if (lines.length === 0) return undefined;
	const license = licenseOf(lines.slice(1));
	return license ? `${lines[0]} · ${license}` : lines[0];
}
