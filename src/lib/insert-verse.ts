/**
 * "Insert verse" editor panel (store edition).
 *
 * A saved-entry Block Kit panel: the author types a reference ("Salmos 23"),
 * picks a version, and the passage is appended to the entry's Portable Text
 * field as a blockquote, through an `editor-draft-patch` (capabilities
 * `admin.editor-draft:read` + `admin.editor-draft:patch`). The patch replaces
 * the whole field, and the host has no cursor position, so the quote always
 * lands at the END of the text. Applying it only marks the form dirty; the
 * author still saves.
 *
 * Pure functions only (no ctx): the route in `plugin.ts` wires them to KV/HTTP.
 */

import type { Language } from "./books.ts";
import type { ParsedReference } from "./parser.ts";
import { VERSION_OPTIONS } from "./settings.ts";

/** Panel id + route, mirrored in emdash-plugin.jsonc `admin.editorPanels`. */
export const INSERT_PANEL_ROUTE = "editor/insert-verse";

/** The field the panel reads and patches (EmDash templates' body field). */
export const INSERT_FIELD = "content";

/**
 * Leave headroom under the host's 64 KB per-field draft limit; a bigger
 * result would be rejected anyway, with a less helpful message.
 */
export const MAX_FIELD_BYTES = 60 * 1024;

interface PanelStrings {
	intro: string;
	refLabel: string;
	refPlaceholder: string;
	versionLabel: string;
	submit: string;
	inserted: (reference: string) => string;
	unrecognized: string;
	notFound: string;
	fetchError: string;
	noField: string;
	tooLarge: string;
}

const STRINGS: Record<Language, PanelStrings> = {
	"pt-br": {
		intro: "Digite uma referência e escolha a versão. O texto entra como citação no fim do conteúdo; depois é só salvar.",
		refLabel: "Referência",
		refPlaceholder: "Salmos 23 ou João 3:16",
		versionLabel: "Versão",
		submit: "Inserir no fim do texto",
		inserted: (r) => `${r} inserido no fim do texto. Salve para manter.`,
		unrecognized: "Não reconheci essa referência. Tente algo como «João 3:16».",
		notFound: "Essa passagem não existe nessa versão.",
		fetchError: "Não consegui buscar o texto agora. Tente de novo.",
		noField: "Este conteúdo não tem um campo de texto «content» para receber a citação.",
		tooLarge: "O texto ficaria grande demais para o editor. Escolha um trecho menor.",
	},
	en: {
		intro: "Type a reference and pick a version. The text is added as a quote at the end of the content; then just save.",
		refLabel: "Reference",
		refPlaceholder: "Psalm 23 or John 3:16",
		versionLabel: "Version",
		submit: "Insert at the end",
		inserted: (r) => `${r} added at the end of the text. Save to keep it.`,
		unrecognized: "I couldn't recognize that reference. Try something like “John 3:16”.",
		notFound: "That passage doesn't exist in this version.",
		fetchError: "Couldn't fetch the text right now. Please try again.",
		noField: "This entry has no “content” text field to receive the quote.",
		tooLarge: "The text would be too large for the editor. Pick a shorter passage.",
	},
	es: {
		intro: "Escribe una referencia y elige la versión. El texto entra como cita al final del contenido; luego solo guarda.",
		refLabel: "Referencia",
		refPlaceholder: "Salmos 23 o Juan 3:16",
		versionLabel: "Versión",
		submit: "Insertar al final",
		inserted: (r) => `${r} añadido al final del texto. Guarda para conservarlo.`,
		unrecognized: "No reconocí esa referencia. Prueba algo como «Juan 3:16».",
		notFound: "Ese pasaje no existe en esta versión.",
		fetchError: "No pude obtener el texto ahora. Inténtalo de nuevo.",
		noField: "Este contenido no tiene un campo de texto «content» para recibir la cita.",
		tooLarge: "El texto quedaría demasiado grande para el editor. Elige un pasaje más corto.",
	},
};

export function panelStrings(language: Language): PanelStrings {
	return STRINGS[language] ?? STRINGS["pt-br"];
}

/** The panel's Block Kit form, optionally with an error banner above it. */
export function renderInsertPanel(
	language: Language,
	values: { ref?: string; version: string },
	error?: string,
): unknown[] {
	const t = panelStrings(language);
	const blocks: unknown[] = [];
	if (error) blocks.push({ type: "banner", variant: "error", description: error });
	blocks.push(
		{ type: "context", text: t.intro },
		{
			type: "form",
			block_id: "insert-verse",
			submit: { label: t.submit, action_id: "insert" },
			fields: [
				{
					type: "text_input",
					action_id: "ref",
					label: t.refLabel,
					placeholder: t.refPlaceholder,
					initial_value: values.ref ?? "",
				},
				{
					type: "select",
					action_id: "version",
					label: t.versionLabel,
					options: VERSION_OPTIONS.map((o) => ({ ...o })),
					initial_value: values.version,
				},
			],
		},
	);
	return blocks;
}

/** Short random Portable Text key (`_key` only needs to be unique per field). */
function key(): string {
	return Math.random().toString(36).slice(2, 12);
}

export interface QuoteInput {
	/** Display reference, e.g. "Salmos 23". */
	reference: string;
	text: string;
	/** Version label or credit line shown after the reference. */
	attribution: string;
	/** Link for the reference (midvash.com reader). */
	href?: string;
}

/**
 * Two blockquote-styled blocks: the passage, then "Reference · attribution".
 * EmDash renders consecutive blockquote blocks as one `<blockquote>`.
 */
export function buildQuoteBlocks(q: QuoteInput): Array<Record<string, unknown>> {
	const linkKey = key();
	return [
		{
			_type: "block",
			_key: key(),
			style: "blockquote",
			markDefs: [],
			children: [{ _type: "span", _key: key(), text: q.text, marks: [] }],
		},
		{
			_type: "block",
			_key: key(),
			style: "blockquote",
			markDefs: q.href ? [{ _type: "link", _key: linkKey, href: q.href }] : [],
			children: [
				{ _type: "span", _key: key(), text: q.reference, marks: q.href ? [linkKey] : [] },
				{ _type: "span", _key: key(), text: ` · ${q.attribution}`, marks: [] },
			],
		},
	];
}

/** Display string for a parsed reference ("João 3:16-18", "Salmos 23"). */
export function referenceLabel(ref: ParsedReference, fallbackName: string): string {
	const verses =
		ref.verse === undefined
			? ""
			: `:${ref.verse}${ref.verseEnd && ref.verseEnd !== ref.verse ? `-${ref.verseEnd}` : ""}`;
	return `${ref.matchedName || fallbackName} ${ref.chapter}${verses}`;
}

/** The value to patch into the field: existing blocks + the quote at the end. */
export function appendBlocks(current: unknown, blocks: unknown[]): unknown[] {
	return [...(Array.isArray(current) ? current : []), ...blocks];
}

export function jsonBytes(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
