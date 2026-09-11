// sync-notion.mjs
// Lee las dos bases de Notion (Calendario+Evaluaciones y Plan de Estudio Semanal)
// y genera data.json en la raíz del repo. Corre en GitHub Actions (Node 20+, fetch nativo).
//
// Variables de entorno requeridas (se configuran como Secrets del repo):
//   NOTION_TOKEN        -> token de tu integración interna de Notion
//   NOTION_DB_CALENDAR  -> ID de la base "Calendario + Evaluaciones"
//   NOTION_DB_STUDY     -> ID de la base "Plan de Estudio Semanal"

const NOTION_VERSION = "2022-06-28";
const TOKEN = process.env.NOTION_TOKEN;
const DB_CALENDAR = process.env.NOTION_DB_CALENDAR;
const DB_STUDY = process.env.NOTION_DB_STUDY;

if (!TOKEN || !DB_CALENDAR || !DB_STUDY) {
  console.error("Faltan variables de entorno: NOTION_TOKEN, NOTION_DB_CALENDAR, NOTION_DB_STUDY");
  process.exit(1);
}

async function queryDatabase(databaseId) {
  let results = [];
  let cursor = undefined;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ start_cursor: cursor, page_size: 100 })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Notion API error (${res.status}) en database ${databaseId}: ${body}`);
    }
    const json = await res.json();
    results = results.concat(json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return results;
}

function getTitle(page, prop) {
  const arr = page.properties?.[prop]?.title;
  return arr && arr.length ? arr.map(t => t.plain_text).join("") : "";
}
function getRichText(page, prop) {
  const arr = page.properties?.[prop]?.rich_text;
  return arr && arr.length ? arr.map(t => t.plain_text).join("") : "";
}
function getSelect(page, prop) {
  return page.properties?.[prop]?.select?.name || "";
}
function getDate(page, prop) {
  return page.properties?.[prop]?.date?.start || "";
}
function getNumber(page, prop) {
  const n = page.properties?.[prop]?.number;
  return typeof n === "number" ? n : null;
}

// mapea el valor de "Curso" de Notion (SO/API/Algoritmos/Redes/Personal) a nuestro id corto
function courseId(cursoValue) {
  const map = { SO: "so", API: "api", Algoritmos: "algo", Redes: "redes", Personal: "personal" };
  return map[cursoValue] || cursoValue.toLowerCase();
}

async function main() {
  console.log("Consultando Notion...");
  const [calendarPages, studyPages] = await Promise.all([
    queryDatabase(DB_CALENDAR),
    queryDatabase(DB_STUDY)
  ]);

  // --- Calendario + Evaluaciones -> courses (Tipo=Curso) y evaluations (Tipo=Evaluación / Entrega TPO) ---
  const courses = [];
  const evaluations = [];

  for (const page of calendarPages) {
    const tipo = getSelect(page, "Tipo");
    const evento = getTitle(page, "Evento");
    const curso = courseId(getSelect(page, "Curso") || "personal");
    const fechaInicio = getDate(page, "Fecha Inicio");

    if (tipo === "Curso") {
      courses.push({
        id: page.id,
        name: evento,
        color: curso,
        time: getRichText(page, "Hora"),
        mode: getRichText(page, "Sala/Link"),
        professor: getRichText(page, "Profesor"),
        details: getRichText(page, "Detalles")
      });
    } else if ((tipo === "Evaluación" || tipo === "Entrega TPO") && fechaInicio) {
      evaluations.push({
        id: page.id,
        date: fechaInicio,
        label: evento,
        course: curso
      });
    }
  }
  evaluations.sort((a, b) => a.date.localeCompare(b.date));

  // --- Plan de Estudio Semanal -> studyTasks (solo Pendiente / En Progreso) ---
  const studyTasks = [];
  for (const page of studyPages) {
    const estado = getSelect(page, "Estado");
    if (estado === "Completado") continue; // no mostramos lo ya hecho en la web (queda en Notion)
    studyTasks.push({
      id: page.id,
      course: courseId(getSelect(page, "Curso")),
      text: getTitle(page, "Tarea de Estudio").replace(/^\[[^\]]+\]\s*/, ""), // saca el prefijo [S1] etc.
      week: getNumber(page, "Semana"),
      dueDate: getDate(page, "Fecha Límite"),
      priority: getSelect(page, "Prioridad")
    });
  }
  studyTasks.sort((a, b) => (a.week || 0) - (b.week || 0));

  const data = {
    meta: { lastSynced: new Date().toISOString(), source: "notion" },
    courses,
    evaluations,
    studyTasks
  };

  const fs = await import("node:fs/promises");
  await fs.writeFile(new URL("../data.json", import.meta.url), JSON.stringify(data, null, 2) + "\n");
  console.log(`Listo: ${courses.length} materias, ${evaluations.length} fechas, ${studyTasks.length} tareas pendientes.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
