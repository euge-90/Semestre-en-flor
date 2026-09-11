# 🌸 Semestre en Flor

Tu semestre (Q2 2026) en una página web propia: materias, evaluaciones, plan de estudio y calendario — todo se actualiza solo cuando editás tus bases de Notion o tu Google Calendar. Gratis, en GitHub Pages, sin backend.

## Cómo funciona

- `index.html` — la página. Lee `data.json` y dibuja todo (cronograma, cuenta regresiva al próximo parcial, timeline, checklist con progreso).
- `data.json` — los datos. Arranca con datos de ejemplo (los tuyos, tal cual están hoy en Notion) para que la página funcione apenas la subas.
- `scripts/sync-notion.mjs` — un script que se conecta a tus dos bases de Notion y regenera `data.json` con lo que encuentre ahí.
- `.github/workflows/sync-notion.yml` — hace correr ese script solo, cada 6 horas, y cada vez que lo pidas manualmente. Si `data.json` cambió, lo commitea al repo automáticamente.

Es decir: vos editás fechas o tareas en Notion (donde ya estás acostumbrada) → cada 6 horas (o cuando quieras, a mano) GitHub actualiza `data.json` → tu página web las muestra. No hay que tocar código nunca más.

El token de Notion **nunca** queda expuesto en la página pública — vive solo como un "Secret" de GitHub, y lo usa el workflow del lado del servidor. Lo único público es el `data.json` resultante (fechas y texto de tus materias, nada sensible).

---

## Puesta en marcha (una sola vez, ~15 minutos)

### 1. Crear el repositorio en GitHub

1. Entrá a [github.com/new](https://github.com/new).
2. Nombre sugerido: `semestre-en-flor`. Público (para que Pages funcione gratis) o privado si tenés GitHub Pro por el Student Pack.
3. Creá el repo vacío (sin README, sin .gitignore).
4. Subí esta carpeta completa (`semestre-en-flor/`, con todo adentro) a ese repo — arrastrando los archivos desde GitHub Desktop, o por consola:
   ```bash
   cd semestre-en-flor
   git init
   git add .
   git commit -m "Primera versión de Semestre en Flor"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/semestre-en-flor.git
   git push -u origin main
   ```

### 2. Activar GitHub Pages

1. En el repo: **Settings → Pages**.
2. En "Build and deployment" → Source: **Deploy from a branch**.
3. Branch: **main**, carpeta **/ (root)** → **Save**.
4. En un par de minutos tu sitio va a estar en `https://TU-USUARIO.github.io/semestre-en-flor/`.

Con esto **ya tenés la página funcionando**, mostrando los datos de ejemplo. Los pasos que siguen son para que se sincronice sola con tus Notion reales.

### 3. Crear una integración interna de Notion (el "token")

1. Andá a [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration**.
2. Nombre: `Semestre en Flor Sync`. Workspace: el tuyo. Tipo: **Internal**.
3. Guardá → copiá el **Internal Integration Token** (empieza con `ntn_` o `secret_`). Lo vas a pegar en el paso 5.

### 4. Compartir tus dos bases con la integración

Notion no deja leer una base por API a menos que se la compartas explícitamente a la integración:

1. Abrí la base **"📚 Semestre Q2 2026 — Calendario + Evaluaciones"** en Notion.
2. Arriba a la derecha, **"..."** (o el ícono de conectar) → **Connections** (o "Add connections") → buscá y seleccioná `Semestre en Flor Sync`.
3. Repetí exactamente lo mismo con **"📖 Plan de Estudio Semanal Q2 2026"**.

### 5. Sacar el ID de cada base

El ID es el bloque de 32 caracteres en la URL de la base, justo antes de `?v=`:

- Calendario + Evaluaciones → `https://app.notion.com/p/df4bbc3224244a27a34e1e39bbfa8bee` → ID: `df4bbc3224244a27a34e1e39bbfa8bee`
- Plan de Estudio Semanal → `https://app.notion.com/p/bffff2c5f45f46e08bc2b97b57a4e500` → ID: `bffff2c5f45f46e08bc2b97b57a4e500`

(Si tu URL tiene guiones tipo `df4bbc32-c093-...`, funciona igual con o sin guiones.)

### 6. Cargar los Secrets en GitHub

En el repo: **Settings → Secrets and variables → Actions → New repository secret**. Creá estos tres, uno por uno:

| Nombre | Valor |
|---|---|
| `NOTION_TOKEN` | el token que copiaste en el paso 3 |
| `NOTION_DB_CALENDAR` | el ID del paso 5 (base de Calendario + Evaluaciones) |
| `NOTION_DB_STUDY` | el ID del paso 5 (base de Plan de Estudio Semanal) |

### 7. Correr la sincronización por primera vez

1. En el repo: pestaña **Actions**.
2. Si GitHub pregunta si querés habilitar workflows, aceptá.
3. Click en **"Sync Notion data"** (a la izquierda) → **Run workflow** → **Run workflow** (botón verde).
4. Esperá ~20 segundos y refrescá. Si el círculo queda verde ✅, funcionó: `data.json` se actualizó con tus datos reales de Notion y tu página ya los muestra.
5. Si queda rojo ❌, entrá al run y mirá el log — casi siempre es un secret mal pegado o una base no compartida con la integración (pasos 4 y 6).

De acá en adelante, **cada 6 horas se sincroniza sola**, y siempre podés forzarlo a mano repitiendo el paso 7 cuando quieras ver un cambio reflejado ya mismo.

### 8. (Opcional) Mostrar tu Google Calendar en la página

La página ya tiene un lugar para embeber tu calendario en modo agenda. Para que cualquiera que abra el link vea tus eventos ahí:

1. En Google Calendar (web) → configuración del calendario `ojedaeugenia08@gmail.com` → **Permisos de acceso** → activá **"Hacer disponible para el público"**.
2. Si preferís no hacerlo público, dejalo como está: el bloque del calendario simplemente no va a cargar para otros visitantes, pero el resto de la página (materias, fechas, checklist) funciona igual — eso viene de Notion, no de Google Calendar.

---

## Uso del día a día

- **Cambiaste una fecha o agregaste una tarea en Notion** → esperá hasta 6 horas, o andá a Actions → Sync Notion data → Run workflow para verlo ya.
- **Tildaste el checklist en la página** → eso se guarda solo en tu navegador (no vuelve a Notion). Si marcás algo como "Completado" en Notion, esa tarea deja de listarse en la web.
- **Agregaste una materia/evaluación/tarea nueva en Notion** → aparece sola en la próxima sincronización, sin tocar código.
- **Querés cambiar colores, tipografías o textos fijos** → se edita `index.html` directamente (o pedime que te ayude).

## Estructura de archivos

```
semestre-en-flor/
├── index.html                        ← la página (HTML + CSS + JS, todo en un archivo)
├── data.json                         ← datos actuales (se regenera solo)
├── scripts/
│   └── sync-notion.mjs               ← trae los datos de Notion
└── .github/workflows/
    └── sync-notion.yml               ← corre el script cada 6hs y commitea el resultado
```

---

Hecho con 🌸 a partir de tus cronogramas reales de SO, API, Algoritmos y Redes — Q2 2026, UADE.
