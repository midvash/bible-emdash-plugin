# @midvash/emdash-plugin-bible

> 🌐 [English](./README.md) · [Português (BR)](./README.pt-BR.md) · **Español**

Detecta automáticamente referencias bíblicas en el contenido de tu sitio EmDash y muestra tooltips con el versículo al pasar el cursor. El texto proviene de la [Midvash API](https://api.midvash.com) — pública, sin autenticación.

Hecho por [Midvash](https://midvash.com). ¿Usas WordPress? Mira el plugin hermano: [midvash/bible-by-midvash](https://github.com/midvash/bible-by-midvash).

## Instalación

```bash
npm install @midvash/emdash-plugin-bible
```

```js
// astro.config.mjs
import { biblePlugin } from "@midvash/emdash-plugin-bible";
import emdash from "emdash/astro";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [biblePlugin()],
      // ...resto de tu config
    }),
  ],
});
```

Listo. Registrado en `plugins: []`, el plugin inyecta su CSS/JS de tooltip en cada
página automáticamente mediante el hook `page:fragments` de EmDash — **sin editar el
layout**.

### Inyección manual (opcional)

Si prefieres colocar los assets tú mismo, hazles inline desde el helper de runtime en
tu layout base:

```astro
---
// src/layouts/Base.astro
import { getBibleByMidvashSnippets } from "@midvash/emdash-plugin-bible/runtime";
import { getPluginSetting, getPluginSettings } from "emdash";

// Pasar getPluginSettings lee todas las claves en una sola llamada en lugar de una
// por ajuste. El JS/CSS compilado se memoiza, así que es barato por request.
const { js, css, enabled } = await getBibleByMidvashSnippets(getPluginSetting, getPluginSettings);
---
{enabled && (
  <>
    <style is:inline set:html={css}></style>
    <script is:inline set:html={js}></script>
  </>
)}
```

> ⚠️ **No** cargues los assets vía `…/client.js` ni `…/client.css`. EmDash 0.16+
> envuelve toda respuesta de ruta en JSON, así que una ruta no puede servir un cuerpo
> de JS/CSS en crudo — esas rutas devolvían 500 y fueron eliminadas. Usa la
> auto-inyección o el helper de runtime de arriba.

### Linkificación en SSR para SEO (opcional, avanzado)

Las referencias se linkifican en el cliente por defecto. Para SEO puedes *además*
envolverlas en el servidor, de modo que el HTML que reciben los crawlers contenga
anclas reales `<a class="midvash-ref" href="https://midvash.com/…">`. Añade el
middleware:

```ts
// src/middleware.ts
import { sequence } from "astro:middleware";
import { bibleLinkifier } from "@midvash/emdash-plugin-bible/middleware";

export const onRequest = sequence(bibleLinkifier());
```

**Compensación:** el middleware lee y reescribe todo el HTML de cada página
(`response.text()` → transforma → nuevo `Response`) — coste real de CPU/latencia en un
Worker. El script del cliente detecta esas anclas de SSR y solo adjunta los listeners
de hover (nunca duplica). Úsalo cuando el link equity de SEO importe más que el coste
por request.

## Registro: `plugins:` vs `sandboxed:`

El descriptor es de formato estándar (`format: "standard"`, `entrypoint`,
`capabilities`, `allowedHosts`) y puede registrarse de dos maneras:

- **`plugins: [biblePlugin()]` — in-process (recomendado).** EmDash adapta la entrada
  estándar in-process y la ejecuta por el HookPipeline. El control de capabilities es
  vía `ctx.*` (consultivo — un plugin in-process puede saltárselo). **Necesario para la
  auto-inyección vía `page:fragments`**, ya que los plugins sandboxed no aportan
  fragments.
- **`sandboxed: [biblePlugin()]` + un `sandboxRunner` — aislado.** Se ejecuta en el
  runtime aislado donde `network:fetch` y `allowedHosts: ["api.midvash.com"]` sí se
  aplican — apropiado si quieres aislamiento fuerte de capabilities en la llamada a la
  API externa. Requiere un sandbox runner (p. ej. `worker_loaders` de Cloudflare +
  `sandboxRunner: sandbox()`). En este modo la auto-inyección no se ejecuta; usa la
  inyección manual con el helper de runtime de arriba.

## Configuración

Abre `/_emdash/admin/plugins/bible-by-midvash/settings` en el admin de EmDash. Ajustes principales:

- **Idioma** — pt-BR / en / es (controla qué nombres de libros se reconocen)
- **Versión por defecto** — NAA, ARA, NVI, ACF, ESV, KJV, RVR1960, y más
- **Selectores CSS** — dónde se detectan las referencias (por defecto: `article`, `.prose`, `.post-content`, `main`)
- **Tema del tooltip** — auto / pergamino (claro) / noche cálida (oscuro) / sepia
- **Colores y estilo** — color del enlace, subrayado
- **Caché** — duración en segundos (por defecto: 30 días)

## Formatos soportados

| Formato | Ejemplo |
| ---------------------- | ----------------- |
| Versículo único | `Juan 3:16` |
| Separador alt. | `Juan 3.16` |
| Rango | `Juan 3:16-18` |
| Capítulo completo | `Salmos 23` |
| Abreviatura | `Gn 1:1` |
| Numerado (con espacio) | `1 Corintios 13:4` |
| Numerado (sin espacio) | `1Co 13:4` |

Los nombres de los libros se reconocen en portugués, inglés y español (las abreviaturas latinas son universales).

## Endpoints

Todas las rutas se sirven bajo `/_emdash/api/plugins/bible-by-midvash/`.

| Ruta | Descripción |
| --------------------- | ---------------------------------------- |
| `GET /lookup?ref=...` | Resuelve una referencia (público) — `{ data: { reference, text, … } }` |
| `GET /versions?lang=` | Lista las versiones disponibles (público) — `{ data: [ … ] }` |
| `GET /settings` | Lee la configuración (admin) |
| `POST /settings/save` | Guarda la configuración (admin) |

> Los assets del cliente no se sirven desde una ruta — mira [Instalación](#instalación). EmDash 0.16+ envuelve toda respuesta de ruta en JSON, así que una ruta no devuelve un cuerpo de JS/CSS en crudo.

## Identidad visual

El tooltip usa la paleta de [Midvash](https://midvash.com): Honey Deep (`#B17027`) para los enlaces, Pergamino (`#FBF5E8`) para el fondo claro, Noche Cálida (`#302A21`) para el fondo oscuro. Tipografía: Literata para el versículo, Figtree para la interfaz (con fallbacks `Georgia, serif` / `system-ui`).

## Enlaces

- 🌐 [midvash.com](https://midvash.com) — el proyecto detrás de los datos
- 📖 [Midvash API](https://api.midvash.com) — API bíblica pública (sin auth)
- 🧩 [Versión WordPress](https://github.com/midvash/bible-by-midvash) — la misma función en WordPress

## Licencia

[MIT](./LICENSE) © [Midvash](https://midvash.com)
