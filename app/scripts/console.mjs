// Reads the operator-console sample that the repository's own actor renders
// (docs/samples/operator-console.html) into plain data. The app shows that
// data with DOM text nodes; no markup from the sample reaches the page.
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", mdash: "—", ndash: "–", hellip: "…", rarr: "→", larr: "←", times: "×", le: "≤", ge: "≥" };

export function plainText(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, name) => {
      if (name[0] === "#") {
        const cp = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isInteger(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
      }
      return Object.hasOwn(ENTITIES, name) ? ENTITIES[name] : whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

const first = (re, text) => { const m = re.exec(text); return m ? plainText(m[1]) : ""; };
const all = (re, text) => [...text.matchAll(re)].map((m) => m[1]);
const TONES = new Set(["ok", "warn", "critical"]);

/** null when the text holds no console section this reader understands. */
export function extractConsole(html) {
  const start = html.search(/<body[\s>]/i);
  const body = start < 0 ? html : html.slice(start);
  const sections = [];
  for (const block of all(/<section\b[^>]*>([\s\S]*?)<\/section>/gi, body)) {
    const heading = first(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i, block);
    if (!heading) continue;
    const tables = [];
    for (const table of all(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, block)) {
      const head = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(table);
      const columns = head ? all(/<th\b[^>]*>([\s\S]*?)<\/th>/gi, head[1]).map(plainText) : [];
      const rowsHtml = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(table);
      const rows = [];
      for (const row of all(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, rowsHtml ? rowsHtml[1] : "")) {
        const cells = all(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi, row).map((cell) => {
          const tone = /<span\b[^>]*class="([^"]*)"/i.exec(cell)?.[1].split(/\s+/).find((c) => TONES.has(c));
          return tone ? { text: plainText(cell), tone } : { text: plainText(cell) };
        });
        if (cells.length) rows.push(cells);
      }
      if (columns.length || rows.length) tables.push({ columns, rows });
    }
    const notes = all(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, block.replace(/<table\b[\s\S]*?<\/table>/gi, "")).map(plainText).filter(Boolean);
    sections.push({ heading, notes, tables });
  }
  if (!sections.length) return null;
  return {
    title: first(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i, body),
    badge: first(/<span\b[^>]*class="badge"[^>]*>([\s\S]*?)<\/span>/i, body),
    sections,
  };
}
