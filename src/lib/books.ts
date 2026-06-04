/**
 * Canonical Bible book data — 66 Protestant canon books.
 *
 * `slug` matches the Midvash API URL segment (e.g. `/v1/nvi/john/3/16`).
 * `names` lists every recognized name and abbreviation per language. The
 * first entry in each list is the canonical/preferred display name.
 *
 * Names are matched case-insensitively and accent-insensitively (the parser
 * normalizes both sides), but accents are preserved here for display.
 *
 * Abbreviation collisions to be aware of:
 *  - "Jó" (accent) is Job and "Jo" is João/John; they'd collide once accents are
 *    stripped, so `resolveSlug`/`ACCENT_OVERRIDES` keep them distinct.
 *  - "Jn" can be João (PT-BR common) or Jonas in some traditions; we map
 *    "Jn" → John here. "Jonas/Jonás" full names disambiguate Jonah.
 *
 * Invariant: no two books may share a `softNormalize` form (an exact, accent-
 * aware abbreviation), since that can't be disambiguated. test/books.test.ts
 * enforces this.
 */

export type Language = "pt-br" | "en" | "es";

export interface BookData {
	/** Midvash API slug. */
	slug: string;
	/** 1, 2, or 3 for numbered books (1 John, 2 Kings…). Undefined otherwise. */
	number?: 1 | 2 | 3;
	/** Recognized names + abbreviations per language. First = canonical display. */
	names: Record<Language, readonly string[]>;
}

export const BOOKS: readonly BookData[] = [
	// ── Old Testament ──────────────────────────────────────────────────────
	{
		slug: "genesis",
		names: {
			"pt-br": ["Gênesis", "Gn", "Gên", "Gen"],
			en: ["Genesis", "Gen", "Gn"],
			es: ["Génesis", "Gn", "Gén", "Gen"],
		},
	},
	{
		slug: "exodus",
		names: {
			"pt-br": ["Êxodo", "Ex", "Êx", "Êxo"],
			en: ["Exodus", "Ex", "Exod"],
			es: ["Éxodo", "Ex", "Éx", "Éxo"],
		},
	},
	{
		slug: "leviticus",
		names: {
			"pt-br": ["Levítico", "Lv", "Lev"],
			en: ["Leviticus", "Lev", "Lv"],
			es: ["Levítico", "Lv", "Lev"],
		},
	},
	{
		slug: "numbers",
		names: {
			"pt-br": ["Números", "Nm", "Núm"],
			en: ["Numbers", "Num", "Nm"],
			es: ["Números", "Nm", "Núm"],
		},
	},
	{
		slug: "deuteronomy",
		names: {
			"pt-br": ["Deuteronômio", "Dt", "Deut"],
			en: ["Deuteronomy", "Deut", "Dt"],
			es: ["Deuteronomio", "Dt", "Deut"],
		},
	},
	{
		slug: "joshua",
		names: {
			"pt-br": ["Josué", "Js", "Jos"],
			en: ["Joshua", "Josh", "Jos"],
			es: ["Josué", "Jos", "Js"],
		},
	},
	{
		slug: "judges",
		names: {
			"pt-br": ["Juízes", "Jz", "Juí", "Juiz"],
			en: ["Judges", "Judg", "Jdg"],
			es: ["Jueces", "Jue", "Jc"],
		},
	},
	{
		slug: "ruth",
		names: {
			"pt-br": ["Rute", "Rt"],
			en: ["Ruth", "Rt"],
			es: ["Rut", "Rt"],
		},
	},
	{
		slug: "1-samuel",
		number: 1,
		names: {
			"pt-br": ["1 Samuel", "1Sm", "1 Sm", "1Sam", "1 Sam", "I Samuel", "I Sm"],
			en: ["1 Samuel", "1Sam", "1 Sam", "1Sa"],
			es: ["1 Samuel", "1Sm", "1 Sm", "1Sam"],
		},
	},
	{
		slug: "2-samuel",
		number: 2,
		names: {
			"pt-br": ["2 Samuel", "2Sm", "2 Sm", "2Sam", "2 Sam", "II Samuel", "II Sm"],
			en: ["2 Samuel", "2Sam", "2 Sam", "2Sa"],
			es: ["2 Samuel", "2Sm", "2 Sm", "2Sam"],
		},
	},
	{
		slug: "1-kings",
		number: 1,
		names: {
			"pt-br": ["1 Reis", "1Rs", "1 Rs", "1Rei", "I Reis"],
			en: ["1 Kings", "1Kgs", "1 Kgs", "1Ki"],
			es: ["1 Reyes", "1Re", "1 Re"],
		},
	},
	{
		slug: "2-kings",
		number: 2,
		names: {
			"pt-br": ["2 Reis", "2Rs", "2 Rs", "2Rei", "II Reis"],
			en: ["2 Kings", "2Kgs", "2 Kgs", "2Ki"],
			es: ["2 Reyes", "2Re", "2 Re"],
		},
	},
	{
		slug: "1-chronicles",
		number: 1,
		names: {
			"pt-br": ["1 Crônicas", "1Cr", "1 Cr", "1Crôn", "I Crônicas"],
			en: ["1 Chronicles", "1Chr", "1 Chr", "1Ch"],
			es: ["1 Crónicas", "1Cr", "1 Cr", "1Crón"],
		},
	},
	{
		slug: "2-chronicles",
		number: 2,
		names: {
			"pt-br": ["2 Crônicas", "2Cr", "2 Cr", "2Crôn", "II Crônicas"],
			en: ["2 Chronicles", "2Chr", "2 Chr", "2Ch"],
			es: ["2 Crónicas", "2Cr", "2 Cr", "2Crón"],
		},
	},
	{
		slug: "ezra",
		names: {
			"pt-br": ["Esdras", "Ed", "Esd"],
			en: ["Ezra", "Ezr"],
			es: ["Esdras", "Esd"],
		},
	},
	{
		slug: "nehemiah",
		names: {
			"pt-br": ["Neemias", "Ne", "Neem"],
			en: ["Nehemiah", "Neh", "Ne"],
			es: ["Nehemías", "Neh", "Ne"],
		},
	},
	{
		slug: "esther",
		names: {
			"pt-br": ["Ester", "Et", "Est"],
			en: ["Esther", "Est", "Es"],
			es: ["Ester", "Est"],
		},
	},
	{
		slug: "job",
		names: {
			"pt-br": ["Jó", "Job"],
			en: ["Job", "Jb"],
			es: ["Job"],
		},
	},
	{
		slug: "psalms",
		names: {
			"pt-br": ["Salmos", "Sl", "Sal", "Salmo"],
			en: ["Psalms", "Psalm", "Ps", "Psa"],
			es: ["Salmos", "Sal", "Sl", "Salmo"],
		},
	},
	{
		slug: "proverbs",
		names: {
			"pt-br": ["Provérbios", "Pv", "Prov"],
			en: ["Proverbs", "Prov", "Pr"],
			es: ["Proverbios", "Prov", "Pr"],
		},
	},
	{
		slug: "ecclesiastes",
		names: {
			"pt-br": ["Eclesiastes", "Ec", "Ecl"],
			en: ["Ecclesiastes", "Eccl", "Ec"],
			es: ["Eclesiastés", "Ec", "Ecl"],
		},
	},
	{
		slug: "song-of-solomon",
		names: {
			"pt-br": ["Cantares", "Ct", "Cant", "Cânticos", "Cântico dos Cânticos"],
			en: ["Song of Solomon", "Song of Songs", "Song", "SOS", "SS"],
			es: ["Cantares", "Cnt", "Cant", "Cantar de los Cantares"],
		},
	},
	{
		slug: "isaiah",
		names: {
			"pt-br": ["Isaías", "Is"],
			en: ["Isaiah", "Isa", "Is"],
			es: ["Isaías", "Is"],
		},
	},
	{
		slug: "jeremiah",
		names: {
			"pt-br": ["Jeremias", "Jr", "Jer"],
			en: ["Jeremiah", "Jer"],
			es: ["Jeremías", "Jer", "Jr"],
		},
	},
	{
		slug: "lamentations",
		names: {
			"pt-br": ["Lamentações", "Lm", "Lam"],
			en: ["Lamentations", "Lam"],
			es: ["Lamentaciones", "Lm", "Lam"],
		},
	},
	{
		slug: "ezekiel",
		names: {
			"pt-br": ["Ezequiel", "Ez", "Eze"],
			en: ["Ezekiel", "Ezek", "Ez"],
			es: ["Ezequiel", "Ez", "Eze"],
		},
	},
	{
		slug: "daniel",
		names: {
			"pt-br": ["Daniel", "Dn", "Dan"],
			en: ["Daniel", "Dan", "Dn"],
			es: ["Daniel", "Dn", "Dan"],
		},
	},
	{
		slug: "hosea",
		names: {
			"pt-br": ["Oséias", "Os"],
			en: ["Hosea", "Hos"],
			es: ["Oseas", "Os"],
		},
	},
	{
		slug: "joel",
		names: {
			"pt-br": ["Joel", "Jl"],
			en: ["Joel", "Jl"],
			es: ["Joel", "Jl"],
		},
	},
	{
		slug: "amos",
		names: {
			"pt-br": ["Amós", "Am"],
			en: ["Amos", "Am"],
			es: ["Amós", "Am"],
		},
	},
	{
		slug: "obadiah",
		names: {
			"pt-br": ["Obadias", "Ob", "Obd"],
			en: ["Obadiah", "Obad", "Ob"],
			es: ["Abdías", "Abd"],
		},
	},
	{
		slug: "jonah",
		names: {
			"pt-br": ["Jonas"],
			en: ["Jonah", "Jon"],
			es: ["Jonás", "Jon"],
		},
	},
	{
		slug: "micah",
		names: {
			"pt-br": ["Miquéias", "Mq", "Miq"],
			// "Mc" removed — it's Marcos/Mark's abbreviation (pt-BR/es); listing it
			// here made "Mc" ambiguous between Micah and Mark.
			en: ["Micah", "Mic"],
			es: ["Miqueas", "Miq"],
		},
	},
	{
		slug: "nahum",
		names: {
			"pt-br": ["Naum", "Na"],
			en: ["Nahum", "Nah"],
			es: ["Nahúm", "Nah"],
		},
	},
	{
		slug: "habakkuk",
		names: {
			"pt-br": ["Habacuque", "Hc", "Hab"],
			en: ["Habakkuk", "Hab"],
			es: ["Habacuc", "Hab"],
		},
	},
	{
		slug: "zephaniah",
		names: {
			"pt-br": ["Sofonias", "Sf", "Sof"],
			en: ["Zephaniah", "Zeph", "Zep"],
			es: ["Sofonías", "Sof"],
		},
	},
	{
		slug: "haggai",
		names: {
			"pt-br": ["Ageu", "Ag"],
			en: ["Haggai", "Hag"],
			es: ["Hageo", "Hag"],
		},
	},
	{
		slug: "zechariah",
		names: {
			"pt-br": ["Zacarias", "Zc", "Zac"],
			en: ["Zechariah", "Zech", "Zec"],
			es: ["Zacarías", "Zac"],
		},
	},
	{
		slug: "malachi",
		names: {
			"pt-br": ["Malaquias", "Ml", "Mal"],
			en: ["Malachi", "Mal"],
			es: ["Malaquías", "Mal"],
		},
	},

	// ── New Testament ──────────────────────────────────────────────────────
	{
		slug: "matthew",
		names: {
			"pt-br": ["Mateus", "Mt"],
			en: ["Matthew", "Matt", "Mt"],
			es: ["Mateo", "Mt", "Mat"],
		},
	},
	{
		slug: "mark",
		names: {
			"pt-br": ["Marcos", "Mc", "Mar"],
			en: ["Mark", "Mk", "Mar"],
			es: ["Marcos", "Mc", "Mar"],
		},
	},
	{
		slug: "luke",
		names: {
			"pt-br": ["Lucas", "Lc", "Luc"],
			en: ["Luke", "Lk", "Luk"],
			es: ["Lucas", "Lc", "Luc"],
		},
	},
	{
		slug: "john",
		names: {
			"pt-br": ["João", "Jo", "Jn"],
			en: ["John", "Jn", "Jhn"],
			es: ["Juan", "Jn", "Jua"],
		},
	},
	{
		slug: "acts",
		names: {
			"pt-br": ["Atos", "At", "Atos dos Apóstolos"],
			en: ["Acts", "Ac"],
			es: ["Hechos", "Hch", "Hch"],
		},
	},
	{
		slug: "romans",
		names: {
			"pt-br": ["Romanos", "Rm", "Rom"],
			en: ["Romans", "Rom", "Ro"],
			es: ["Romanos", "Rom", "Ro"],
		},
	},
	{
		slug: "1-corinthians",
		number: 1,
		names: {
			"pt-br": ["1 Coríntios", "1Co", "1 Co", "1Cor", "1 Cor", "I Coríntios"],
			en: ["1 Corinthians", "1Cor", "1 Cor", "1Co"],
			es: ["1 Corintios", "1Co", "1 Co", "1Cor"],
		},
	},
	{
		slug: "2-corinthians",
		number: 2,
		names: {
			"pt-br": ["2 Coríntios", "2Co", "2 Co", "2Cor", "2 Cor", "II Coríntios"],
			en: ["2 Corinthians", "2Cor", "2 Cor", "2Co"],
			es: ["2 Corintios", "2Co", "2 Co", "2Cor"],
		},
	},
	{
		slug: "galatians",
		names: {
			"pt-br": ["Gálatas", "Gl", "Gál"],
			en: ["Galatians", "Gal", "Ga"],
			es: ["Gálatas", "Gal", "Gá"],
		},
	},
	{
		slug: "ephesians",
		names: {
			"pt-br": ["Efésios", "Ef"],
			en: ["Ephesians", "Eph", "Ep"],
			es: ["Efesios", "Ef", "Efe"],
		},
	},
	{
		slug: "philippians",
		names: {
			"pt-br": ["Filipenses", "Fp", "Fil"],
			en: ["Philippians", "Phil", "Php"],
			es: ["Filipenses", "Fil", "Flp"],
		},
	},
	{
		slug: "colossians",
		names: {
			"pt-br": ["Colossenses", "Cl", "Col"],
			en: ["Colossians", "Col"],
			es: ["Colosenses", "Col"],
		},
	},
	{
		slug: "1-thessalonians",
		number: 1,
		names: {
			"pt-br": ["1 Tessalonicenses", "1Ts", "1 Ts", "1Tes", "I Tessalonicenses"],
			en: ["1 Thessalonians", "1Thess", "1 Thess", "1Th"],
			es: ["1 Tesalonicenses", "1Ts", "1 Ts", "1Tes"],
		},
	},
	{
		slug: "2-thessalonians",
		number: 2,
		names: {
			"pt-br": ["2 Tessalonicenses", "2Ts", "2 Ts", "2Tes", "II Tessalonicenses"],
			en: ["2 Thessalonians", "2Thess", "2 Thess", "2Th"],
			es: ["2 Tesalonicenses", "2Ts", "2 Ts", "2Tes"],
		},
	},
	{
		slug: "1-timothy",
		number: 1,
		names: {
			"pt-br": ["1 Timóteo", "1Tm", "1 Tm", "1Tim", "I Timóteo"],
			en: ["1 Timothy", "1Tim", "1 Tim", "1Ti"],
			es: ["1 Timoteo", "1Tm", "1 Tm", "1Tim"],
		},
	},
	{
		slug: "2-timothy",
		number: 2,
		names: {
			"pt-br": ["2 Timóteo", "2Tm", "2 Tm", "2Tim", "II Timóteo"],
			en: ["2 Timothy", "2Tim", "2 Tim", "2Ti"],
			es: ["2 Timoteo", "2Tm", "2 Tm", "2Tim"],
		},
	},
	{
		slug: "titus",
		names: {
			"pt-br": ["Tito", "Tt"],
			en: ["Titus", "Tit", "Ti"],
			es: ["Tito", "Tit", "Tt"],
		},
	},
	{
		slug: "philemon",
		names: {
			"pt-br": ["Filemom", "Fm", "File"],
			en: ["Philemon", "Phlm", "Phm"],
			es: ["Filemón", "Flm", "Phm"],
		},
	},
	{
		slug: "hebrews",
		names: {
			"pt-br": ["Hebreus", "Hb", "Heb"],
			en: ["Hebrews", "Heb"],
			es: ["Hebreos", "Heb", "Hb"],
		},
	},
	{
		slug: "james",
		names: {
			"pt-br": ["Tiago", "Tg"],
			en: ["James", "Jas", "Jm"],
			es: ["Santiago", "Stg", "St"],
		},
	},
	{
		slug: "1-peter",
		number: 1,
		names: {
			"pt-br": ["1 Pedro", "1Pe", "1 Pe", "1Ped", "I Pedro"],
			en: ["1 Peter", "1Pet", "1 Pet", "1Pe"],
			es: ["1 Pedro", "1Pe", "1 Pe", "1Ped"],
		},
	},
	{
		slug: "2-peter",
		number: 2,
		names: {
			"pt-br": ["2 Pedro", "2Pe", "2 Pe", "2Ped", "II Pedro"],
			en: ["2 Peter", "2Pet", "2 Pet", "2Pe"],
			es: ["2 Pedro", "2Pe", "2 Pe", "2Ped"],
		},
	},
	{
		slug: "1-john",
		number: 1,
		names: {
			"pt-br": ["1 João", "1Jo", "1 Jo", "1Jn", "I João"],
			en: ["1 John", "1Jn", "1 Jn", "1Jo"],
			es: ["1 Juan", "1Jn", "1 Jn", "1Jua"],
		},
	},
	{
		slug: "2-john",
		number: 2,
		names: {
			"pt-br": ["2 João", "2Jo", "2 Jo", "2Jn", "II João"],
			en: ["2 John", "2Jn", "2 Jn", "2Jo"],
			es: ["2 Juan", "2Jn", "2 Jn", "2Jua"],
		},
	},
	{
		slug: "3-john",
		number: 3,
		names: {
			"pt-br": ["3 João", "3Jo", "3 Jo", "3Jn", "III João"],
			en: ["3 John", "3Jn", "3 Jn", "3Jo"],
			es: ["3 Juan", "3Jn", "3 Jn", "3Jua"],
		},
	},
	{
		slug: "jude",
		names: {
			"pt-br": ["Judas", "Jd", "Jud"],
			en: ["Jude"],
			es: ["Judas", "Jud"],
		},
	},
	{
		slug: "revelation",
		names: {
			"pt-br": ["Apocalipse", "Ap", "Apoc"],
			en: ["Revelation", "Rev", "Rv", "Re"],
			es: ["Apocalipsis", "Ap", "Apoc"],
		},
	},
] as const;

/** Strip diacritics + lowercase for fuzzy matching. */
export function normalize(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/\./g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** Lowercase + drop periods/extra spaces but KEEP accents (NFC) — for disambiguation. */
export function softNormalize(s: string): string {
	return s
		.normalize("NFC")
		.toLowerCase()
		.replace(/\./g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Accent-sensitive overrides for abbreviations that collide ONLY after accents
 * are stripped. "Jó" (Job) and "Jo" (João/John) both `normalize()` to "jo"; the
 * accented form wins here so "Jó 1:1" resolves to Job, while plain "Jo 3:16"
 * still falls through to John. Keys are `softNormalize`d (accent preserved).
 */
export const ACCENT_OVERRIDES: Readonly<Record<string, string>> = {
	"jó": "job",
};

/** All recognized name variants → book slug (normalized keys). */
export function buildNameIndex(): Map<string, string> {
	const index = new Map<string, string>();
	for (const book of BOOKS) {
		for (const lang of Object.keys(book.names) as Language[]) {
			for (const name of book.names[lang]) {
				index.set(normalize(name), book.slug);
			}
		}
	}
	return index;
}

/**
 * Resolve a raw (author-written) book name to a slug: accent-aware overrides
 * first, then the accent-insensitive index. Shared by the parser and the SSR
 * linkifier so both disambiguate identically.
 */
export function resolveSlug(rawName: string, index: Map<string, string>): string | null {
	return ACCENT_OVERRIDES[softNormalize(rawName)] ?? index.get(normalize(rawName)) ?? null;
}

/** Display name for a book in a given language (canonical, first entry). */
export function displayName(slug: string, lang: Language): string {
	const book = BOOKS.find((b) => b.slug === slug);
	return book?.names[lang][0] ?? slug;
}
