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

const DOW = { "Lunes": 1, "Martes": 2, "Miércoles": 3, "Jueves": 4, "Viernes": 5, "Sábado": 6, "Domingo": 7 };

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
function getMultiSelect(page, prop) {
  const arr = page.properties?.[prop]?.multi_select;
  return arr && arr.length ? arr.map(o => o.name) : [];
}
function getDate(page, prop) {
  return page.properties?.[prop]?.date?.start || "";
}
function getDateEnd(page, prop) {
  return page.properties?.[prop]?.date?.end || "";
}
function getNumber(page, prop) {
  const n = page.properties?.[prop]?.number;
  return typeof n === "number" ? n : null;
}

// mapea el valor de "Curso" de Notion (SO/API/Algoritmos/Redes/Personal) a nuestro id corto
function courseId(cursoValue) {
  const map = { SO: "so", API: "api", Algoritmos: "algo", Redes: "redes", Personal: "personal" };
  return map[cursoValue] || (cursoValue ? cursoValue.toLowerCase() : "personal");
}

// separa "18:30-22:30" / "18:30 – 22:30" / "8-9am" en {start:"HH:MM", end:"HH:MM"}
function parseHora(hora) {
  if (!hora) return null;
  const m = hora.match(/(\d{1,2})(?::(\d{2}))?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let [, h1, m1, h2, m2, ampm] = m;
  h1 = parseInt(h1, 10); h2 = parseInt(h2, 10);
  m1 = m1 || "00"; m2 = m2 || "00";
  if (ampm && ampm.toLowerCase() === "pm") {
    if (h1 < 12) h1 += 12;
    if (h2 < 12) h2 += 12;
  }
  const pad = n => String(n).padStart(2, "0");
  return { start: `${pad(h1)}:${m1}`, end: `${pad(h2)}:${m2}` };
}

async function main() {
  console.log("Consultando Notion...");
  const [calendarPages, studyPages] = await Promise.all([
    queryDatabase(DB_CALENDAR),
    queryDatabase(DB_STUDY)
  ]);

  const courses = [];
  const habits = [];
  const evaluations = [];
  const personalEvents = [];

  for (const page of calendarPages) {
    const tipo = getSelect(page, "Tipo");
    const evento = getTitle(page, "Evento");
    const curso = courseId(getSelect(page, "Curso") || "Personal");
    const fechaInicio = getDate(page, "Fecha Inicio");
    const fechaFin = getDateEnd(page, "Fecha Inicio") || getDate(page, "Fecha Fin") || fechaInicio;
    const horaTxt = getRichText(page, "Hora");
    const horaParsed = parseHora(horaTxt);

    if (tipo === "Curso") {
      const diaSel = getSelect(page, "Día");
      courses.push({
        id: page.id,
        name: evento,
        dow: diaSel && DOW[diaSel] ? [DOW[diaSel]] : [],
        startTime: horaParsed ? horaParsed.start : "",
        endTime: horaParsed ? horaParsed.end : "",
        time: horaTxt,
        mode: getRichText(page, "Sala/Link"),
        professor: getRichText(page, "Profesor"),
        color: curso
      });
    } else if ((tipo === "Evaluación" || tipo === "Entrega TPO") && fechaInicio) {
      evaluations.push({
        id: page.id,
        date: fechaInicio,
        label: evento,
        course: curso
      });
    } else if (tipo === "Vacaciones" || tipo === "Evento Personal") {
      const diasMulti = getMultiSelect(page, "Días");
      if (diasMulti.length) {
        // rutina recurrente semanal (ej. natación, gym) en vez de fecha puntual
        habits.push({
          id: page.id,
          name: evento,
          dow: diasMulti.map(d => DOW[d]).filter(Boolean),
          startTime: horaParsed ? horaParsed.start : "",
          endTime: horaParsed ? horaParsed.end : "",
          color: "personal"
        });
      } else if (fechaInicio) {
        personalEvents.push({
          id: page.id,
          type: tipo === "Vacaciones" ? "vacaciones" : "evento",
          dateStart: fechaInicio,
          dateEnd: fechaFin || fechaInicio,
          label: evento,
          note: getRichText(page, "Detalles"),
          priority: getSelect(page, "Prioridad") || "Media"
        });
      }
    }
  }
  evaluations.sort((a, b) => a.date.localeCompare(b.date));
  personalEvents.sort((a, b) => a.dateStart.localeCompare(b.dateStart));

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
    habits,
    evaluations,
    personalEvents,
    studyTasks
  };

  const fs = await import("node:fs/promises");
  await fs.writeFile(new URL("../data.json", import.meta.url), JSON.stringify(data, null, 2) + "\n");
  console.log(`Listo: ${courses.length} materias, ${habits.length} rutinas, ${evaluations.length} fechas, ${personalEvents.length} eventos personales, ${studyTasks.length} tareas pendientes.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
