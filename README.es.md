# @midvash/emdash-plugin-bible

> 🌐 [English](./README.md) · [Português (BR)](./README.pt-BR.md) · **Español**

Detecta automáticamente referencias bíblicas en el contenido de tu sitio EmDash y muestra tooltips con el versículo al pasar el cursor. El texto proviene de la [Midvash API](https://api.midvash.com) — pública, sin autenticación.

Hecho por [Midvash](https://midvash.com). ¿Usas WordPress? Mira el plugin hermano: [midvash/bible-wordpress-plugin](https://github.com/midvash/bible-wordpress-plugin).

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

Listo. El plugin auto-inyecta su script + estilos de tooltip en las páginas públicas mediante el hook `page:fragments` de EmDash — sin `<script>`/`<link>` que agregar — siempre que tu layout renderice los componentes `<EmDashHead />` y `<EmDashBodyEnd />` (la configuración estándar de EmDash).

> **Modelo de instalación — trusted, no sandboxed.** Instálalo vía npm + `astro.config` (in-process), como [@jdevalk/emdash-plugin-seo](https://github.com/jdevalk/emdash-plugin-seo). Los tooltips al pasar el cursor necesitan JS/CSS del cliente, y EmDash solo permite que los plugins **trusted** inyecten scripts/estilos en las páginas. Una instalación *sandboxed* del Marketplace no puede inyectar scripts (por seguridad, a propósito) — solo expondría la API JSON `/lookup`, sin los tooltips. Para la función completa, usa instalación trusted.

### Inyección manual (layouts sin los componentes de EmDash)

Si tu layout no renderiza `<EmDashHead>` / `<EmDashBodyEnd>`, inyecta los snippets tú mismo:

```astro
---
import { getBibleByMidvashSnippets } from "@midvash/emdash-plugin-bible/runtime";
import { getPluginSetting } from "emdash";
const { js, css, enabled } = await getBibleByMidvashSnippets(getPluginSetting);
---
{enabled && (
  <>
    <style is:inline set:html={css}></style>
    <script is:inline set:html={js}></script>
  </>
)}
```

### Enlaces `<a>` reales para SEO (recomendado)

El objetivo de este plugin es **SEO** — las referencias en el contenido de
tu blog deben convertirse en anclas `<a href>` reales que pasen link equity
a **midvash.com**.

> **Dos capas, ambas producen anclas reales:**
> 1. **Middleware SSR (recomendado)** — envuelve las referencias en el HTML
>    SSR antes del envío, Googlebot ve los enlaces en el primer render.
>    Menor riesgo de que un crawler los pierda.
> 2. **Fallback en el cliente (automático, desde 0.3.0)** — si olvidas
>    registrar el middleware, el script del cliente *aún* renderiza las
>    referencias como `<a href>` reales (no `<span>`) en el primer paint.
>    Googlebot moderno ejecuta JS, así que los enlaces se captan — pero la
>    ruta SSR es más segura (sin dependencia de JS).

Agrega el middleware:

```ts
// src/middleware.ts
import { sequence } from "astro:middleware";
import { bibleLinkifier } from "@midvash/emdash-plugin-bible/middleware";

export const onRequest = sequence(bibleLinkifier());
```

Eso es todo. Ambas rutas emiten anclas idénticas:

```html
<a class="midvash-ref"
   href="https://midvash.com/es/rvr/juan/3/16"
   title="Juan 3:16"
   data-ref="Juan 3:16"
   rel="noopener">Juan 3:16</a>
```

**Contrato SEO:**
- ✅ Sin `rel="nofollow"` — el link equity pasa.
- ✅ Sin `target="_blank"` — navegación en la misma pestaña (los crawlers
  prefieren; usuarios en desktop ctrl/cmd-click para nueva pestaña, en
  móvil usan el doble-tap, ver "Móvil" abajo).
- ✅ `title="<referencia>"` — etiqueta explícita para crawlers y lectores
  de pantalla.
- ✅ **Alcance: solo contenido de artículo.** Desde 0.3.0 el linkifier SSR
  omite la estructura de página (`<nav>`, `<header>`, `<footer>`,
  `<aside>`) y widgets sin contenido (`<title>`, `<option>`, `<button>`,
  `<svg>`, …). Enlaces repetidos en todo el sitio serían vistos como
  over-optimization, así que el plugin los evita por defecto.

**Compensación:** el middleware reescribe el HTML body de cada página
(`response.text()` → transforma → nuevo `Response`). La 0.3.0 añadió un
fast-path que devuelve la cadena original cuando no hay candidato de
referencia, así que el overhead en páginas de chrome/vacías es casi cero —
pero las páginas con texto aún pagan el coste del parse. Se compone con
otros middlewares vía `sequence(...)`.

### Comportamiento móvil / touch

Desde 0.3.0, en dispositivos touch (`pointer: coarse`):

- **Primer toque** en una referencia abre el tooltip (navegación bloqueada).
- **Segundo toque** en la misma referencia permite el click, llevando al
  usuario a midvash.com.
- **Toque fuera** cierra el tooltip.

Esto preserva el enlace SEO (Googlebot sigue siguiéndolo) mientras corrige
el bug de "tap lleva al usuario fuera de la página".

## Configuración

Abre `/_emdash/admin/plugins/bible-by-midvash/settings` en el admin de EmDash. En
EmDash **0.30+** el plugin también declara un `settingsSchema`, así que el admin
muestra un formulario **Configure** auto-generado — ambas UIs leen y escriben la
misma configuración, usa la que prefieras. Ajustes principales:

- **Idioma** — pt-BR / en / es (controla qué nombres de libros se reconocen **y el idioma de la interfaz del tooltip**)
- **Versión por defecto** — 38 traducciones en pt-BR / en / es (NAA, ARA, NVI, ACF, ESV, KJV, RVR1960, …), desde la [Midvash API](https://api.midvash.com/v1/versions) en vivo
- **Selectores CSS** — dónde se detectan las referencias (por defecto: `article`, `.prose`, `.post-content`, `main`)
- **Tema del tooltip** — auto / pergamino (claro) / noche cálida (oscuro) / sepia
- **Colores y estilo** — desactivado por defecto (las referencias heredan el estilo de enlace de tu sitio); activa **Usar colores personalizados** para sobrescribir
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
| `GET /lookup?ref=...` | Resuelve una referencia (público, JSON, caché de 5 min en EmDash 0.30+) |
| `GET /passages?refs=` | Resuelve varias refs (separadas por `;`) en una llamada (público, JSON) |
| `GET /versions?lang=` | Lista las versiones disponibles (público, JSON, caché de 1 h en EmDash 0.30+) |
| `GET /settings` | Lee la configuración (admin) |
| `POST /settings/save` | Guarda la configuración (admin) |
| `POST /scan` | Detecta referencias en un texto (admin, `plugins:manage`) |

El script + estilos del tooltip se entregan por el hook `page:fragments` (no por una ruta) — las rutas de plugin de EmDash siempre devuelven JSON, así que no pueden servir assets JS/CSS.

En EmDash **0.30+** la ruta `scan` también se expone como **tool MCP**: un agente
de IA conectado al admin puede detectar referencias bíblicas en cualquier texto a
través del endpoint MCP del CMS. Pasa `includeText: true` para recibir también el
texto de cada versículo (resuelto en una sola llamada por lotes).

**Rendimiento:** el cliente precalienta todas las referencias de la página en una
sola llamada `/passages` cuando el navegador está inactivo, así el primer hover es
instantáneo. Las referencias de capítulo completo (p. ej. `Salmo 23`) ahora también
muestran su texto — el cliente une los versículos cuando la respuesta de capítulo
de la API viene sin `text`.

## Identidad visual

El tooltip usa la paleta de [Midvash](https://midvash.com): Honey Deep (`#B17027`) para los enlaces, Pergamino (`#FBF5E8`) para el fondo claro, Noche Cálida (`#302A21`) para el fondo oscuro. Tipografía: Literata para el versículo, Figtree para la interfaz (con fallbacks `Georgia, serif` / `system-ui`).

## Desarrollo

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run check       # typecheck + tests
npm run build       # compila src/ → dist/ (ESM + .d.ts) para npm
```

El código fuente está en `src/` (TypeScript); los tests y el typecheck se ejecutan directamente sobre él. `npm run build` (tsdown) genera el `dist/` publicado.

## Bundle para el Marketplace

El plugin también se empaqueta para el [Marketplace de EmDash](https://midvash.com) como un tarball sandbox:

```bash
npm run bundle:validate   # build + valida el manifest, sin tarball
npm run bundle            # build + genera dist/<id>-<version>.tar.gz
```

`emdash plugin bundle` extrae un `manifest.json` (id, versión, capabilities, rutas, hooks, páginas de admin) del descriptor + backend, empaqueta `src/sandbox-entry.ts` en un único `backend.js` y verifica los límites de tamaño del marketplace. Publica con `emdash plugin publish`.

> **Nota:** una instalación *sandboxed* del Marketplace solo ejecuta las rutas JSON (`/lookup`, `/versions`) y la página de admin — EmDash **no** ejecuta `page:fragments` para plugins sandboxed, así que los tooltips no se muestran. Para la función completa, instala como plugin **trusted** (npm + `astro.config`, ver [Instalación](#instalación)).

## Enlaces

- 🌐 [midvash.com](https://midvash.com) — el proyecto detrás de los datos
- 📖 [Midvash API](https://api.midvash.com) — API bíblica pública (sin auth)
- 🧩 [Versión WordPress](https://github.com/midvash/bible-wordpress-plugin) — la misma función en WordPress

## Licencia

[MIT](./LICENSE) © [Midvash](https://midvash.com)

