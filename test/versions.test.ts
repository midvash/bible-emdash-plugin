import { describe, it, expect } from "vitest";

import { RETIRED_VERSIONS, creditLine, servedVersion } from "../src/lib/versions.ts";

// Real `meta.copyright` strings from api.midvash.com (Oct 2026).
const ONBV =
	"Biblica® Open Nova Bíblia Viva™ (ONBV)\n© 2007, 2010 Biblica, Inc.\nLicença Creative Commons Atribuição-CompartilhaIgual 4.0 (CC BY-SA 4.0).\nA obra original está disponível gratuitamente em www.biblica.com e open.bible.\n“Biblica” é uma marca registrada nos Estados Unidos por Biblica, Inc. Usado com permissão.";
const ONBV_ES =
	"Biblica® Open Nueva Biblia Viva™ (ONBV)\nCopyright © 2006, 2008 by Biblica, Inc.\n“Biblica” es una marca registrada en la oficina de Patentes y Marcas de los Estados Unidos por Biblica, Inc. Usado con permiso.\nLicencia Creative Commons Atribución-CompartirIgual 4.0 Internacional (CC BY-SA 4.0).\nOriginal work available for free at www.biblica.com and open.bible.\nSource: eBible.org.";
const ALMEIDA_LIVRE =
	"Bíblia Livre (BLIVRE)\nCopyright © 2018 Diego Santos, Mario Sérgio e Marco Teles.\nAtualizada a partir da tradução de 1819 de João Ferreira de Almeida (edição Textus Receptus).\nLicença Creative Commons Atribuição 4.0 Brasil: uso livre, com menção obrigatória da obra.\nhttp://sites.google.com/site/biblialivre/";
const BSB =
	"Berean Standard Bible (BSB)\nPublic Domain.\nThe Berean Standard Bible was dedicated to the public domain on April 30, 2023, and may be freely copied, distributed and used.";
const RVR1909 =
	"Reina-Valera 1909 (RVR1909)\nDominio público.\nLa revisión de 1909 de la Biblia Reina-Valera es de dominio público y puede usarse libremente, incluso para generación de audio.";
const WEB =
	"World English Bible (WEB)\nPublic Domain (CC0).\nThe World English Bible has been dedicated to the public domain by its translators and may be freely used and distributed.";

describe("servedVersion", () => {
	it("maps a version the API dropped to the free one it serves instead", () => {
		expect(servedVersion("nvt")).toBe("onbv");
		expect(servedVersion("nlt")).toBe("bsb");
		expect(servedVersion("ntv")).toBe("onbv-es");
		expect(servedVersion("naa")).toBe("almeida-livre");
		expect(servedVersion("rvr1960")).toBe("rvr1909");
	});

	it("is case-insensitive", () => {
		expect(servedVersion("NVT")).toBe("onbv");
	});

	it("passes served and unknown versions through", () => {
		expect(servedVersion("kjv")).toBe("kjv");
		expect(servedVersion("onbv")).toBe("onbv");
		expect(servedVersion("something-new")).toBe("something-new");
	});

	it("never maps to another dropped version (no chains)", () => {
		for (const target of Object.values(RETIRED_VERSIONS)) {
			expect(RETIRED_VERSIONS[target], target).toBeUndefined();
		}
	});
});

describe("creditLine", () => {
	it("joins the version title and its Creative Commons license", () => {
		expect(creditLine(ONBV)).toBe("Biblica® Open Nova Bíblia Viva™ (ONBV) · CC BY-SA 4.0");
		expect(creditLine(ONBV_ES)).toBe("Biblica® Open Nueva Biblia Viva™ (ONBV) · CC BY-SA 4.0");
	});

	it("names CC BY when the license is only spelled out in words", () => {
		expect(creditLine(ALMEIDA_LIVRE)).toBe("Bíblia Livre (BLIVRE) · CC BY 4.0");
	});

	it("names the public domain", () => {
		expect(creditLine(BSB)).toBe("Berean Standard Bible (BSB) · Public Domain");
		expect(creditLine(RVR1909)).toBe("Reina-Valera 1909 (RVR1909) · Dominio público");
		expect(creditLine(WEB)).toBe("World English Bible (WEB) · CC0");
	});

	it("falls back to the title alone when no license is recognized", () => {
		expect(creditLine("Some Bible (SB)\nAll rights reserved.")).toBe("Some Bible (SB)");
	});

	it("returns undefined without a copyright", () => {
		expect(creditLine(undefined)).toBeUndefined();
		expect(creditLine("")).toBeUndefined();
		expect(creditLine("  \n ")).toBeUndefined();
	});
});
