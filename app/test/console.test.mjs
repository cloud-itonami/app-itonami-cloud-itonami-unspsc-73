// The console reader turns the operator-console sample into plain data.
// Inline fixtures pin the mapping; the repository's own sample is checked
// structurally so the test passes unchanged in every series repository.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { extractConsole } from "../scripts/console.mjs";

const APP = fileURLToPath(new URL("../", import.meta.url));

const FIXTURE = `<html><body>
<h1>Sample Console</h1><span class="badge">demo</span>
<section><h2>First</h2><p>Note <b>one</b> &amp; two.</p>
<table><thead><tr><th>name</th><th>state</th></tr></thead>
<tbody><tr><td>alpha</td><td><span class="ok">fine</span></td></tr>
<tr><td>beta</td><td><span class="warn">slow</span></td></tr>
<tr><td>gamma</td><td><span class="critical">down</span></td></tr></tbody></table></section>
<section><h2>Empty</h2></section>
</body></html>`;

test("fixture maps to plain data with tones", () => {
  const console = extractConsole(FIXTURE);
  assert.equal(console.title, "Sample Console");
  assert.equal(console.badge, "demo");
  assert.equal(console.sections.length, 2);
  const [first, empty] = console.sections;
  assert.equal(first.heading, "First");
  assert.deepEqual(first.notes, ["Note one & two."]);
  assert.deepEqual(first.tables[0].columns, ["name", "state"]);
  assert.deepEqual(first.tables[0].rows, [
    [{ text: "alpha" }, { text: "fine", tone: "ok" }],
    [{ text: "beta" }, { text: "slow", tone: "warn" }],
    [{ text: "gamma" }, { text: "down", tone: "critical" }],
  ]);
  assert.deepEqual(empty.notes, []);
  assert.deepEqual(empty.tables, []);
});

test("html without a console section reads as null", () => {
  assert.equal(extractConsole("<html><body><p>no sections</p></body></html>"), null);
});

test("repository sample keeps the console shape", async (t) => {
  const sample = resolve(APP, "../docs/samples/operator-console.html");
  if (!existsSync(sample)) {
    t.skip("no operator-console sample in this repository");
    return;
  }
  const console = extractConsole(await readFile(sample, "utf8"));
  assert.ok(console, "sample must hold at least one console section");
  assert.equal(typeof console.title, "string");
  assert.ok(console.sections.length >= 1);
  for (const section of console.sections) {
    assert.ok(section.heading.length > 0, "every section names its heading");
    assert.ok(Array.isArray(section.notes) && Array.isArray(section.tables));
    for (const table of section.tables) {
      assert.ok(Array.isArray(table.columns) && Array.isArray(table.rows));
      for (const row of table.rows) {
        for (const cell of row) {
          assert.equal(typeof cell.text, "string");
          assert.ok(cell.tone === undefined || ["ok", "warn", "critical"].includes(cell.tone));
        }
      }
    }
  }
});
