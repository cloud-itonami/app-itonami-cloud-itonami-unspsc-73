// The scaffold stamps this template into another repository: the
// repository name (from --repo or the git remote) is the source of
// identity, and every template file must arrive byte-identical.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { CSP } from "../scripts/build.mjs";
import { ICON_FILES, TEMPLATE_FILES, repoNameFromRemote, scaffold } from "../scripts/scaffold.mjs";

const APP = fileURLToPath(new URL("../", import.meta.url));

const BLUEPRINT_COFOG = `[{:itonami.blueprint/id "cloud-itonami-cofog-03.2"
  :itonami.blueprint/name "Household Consumption"}]
`;

const BLUEPRINT_SCHEME_MISSING = `[{:itonami.blueprint/id "cloud-itonami-7810"
  :itonami.blueprint/name "Growing of Vegetables"}]
`;

const BLUEPRINT_SUFFIXED = `[{:itonami.blueprint/id "cloud-itonami-8129-facade"
  :itonami.blueprint/name "Facade Work"}]
`;

const BLUEPRINT_ISCO = `[{:itonami.blueprint/id "cloud-itonami-isco-2423"
  :itonami.blueprint/name "Community Careers Practice"}]
`;

async function stamped(blueprint) {
  const repo = await mkdtemp(join(tmpdir(), "itonami-scaffold-"));
  await writeFile(join(repo, "blueprint.edn"), blueprint);
  return repo;
}

test("scaffold writes identity files for a dotted cofog code", async (t) => {
  const repo = await stamped(BLUEPRINT_COFOG);
  t.after(() => rm(repo, { recursive: true, force: true }));
  const { identity } = await scaffold(repo, { icons: false, repo: "cloud-itonami-cofog-03.2" });
  assert.equal(identity.slug, "cofog032");
  assert.equal(identity.id, "network.itonami.cofog032");

  const pkg = JSON.parse(await readFile(join(repo, "app/package.json"), "utf8"));
  assert.equal(pkg.name, "@itonami/cofog032");
  assert.deepEqual(pkg.itonami, {
    id: "network.itonami.cofog032",
    title: "Household Consumption",
    source: "cloud-itonami-cofog-03.2",
  });
  assert.deepEqual(
    Object.keys(pkg.scripts).sort(),
    ["build", "build:android", "build:desktop", "tauri", "test"],
  );
  assert.equal(pkg.devDependencies["@tauri-apps/cli"], "3.0.0-alpha.6");

  const conf = JSON.parse(await readFile(join(repo, "app/src-tauri/tauri.conf.json"), "utf8"));
  assert.equal(conf.$schema, "https://schema.tauri.app/config/3");
  assert.equal(conf.identifier, "network.itonami.cofog032");
  assert.equal(conf.productName, "Household Consumption");
  assert.equal(conf.app.windows[0].title, "Household Consumption");
  assert.equal(conf.build.frontendDist, "../dist");
  assert.equal(conf.app.withGlobalTauri, true);
  assert.equal(conf.app.security.csp, CSP);
  assert.equal(conf.bundle.active, false);
  assert.equal(conf.bundle.icon.length, 5);

  const svg = await readFile(join(repo, "app/icon/app.svg"), "utf8");
  assert.ok(svg.includes("<svg"));

  for (const name of TEMPLATE_FILES) {
    const want = await readFile(join(APP, name));
    const got = await readFile(join(repo, "app", name));
    assert.ok(got.equals(want), `${name} travels byte-identical`);
  }
  for (const name of ICON_FILES) {
    assert.ok(!existsSync(join(repo, "app/src-tauri/icons", name)), "--no-icons writes no icon");
  }
  const workflow = await readFile(join(repo, ".github/workflows/app.yml"), "utf8");
  assert.ok(workflow.includes("node-version: 22"));
  assert.ok(workflow.includes("npm ci") && workflow.includes("npm test"));
});

test("scaffold stamps a scheme-missing blueprint from --repo", async (t) => {
  const repo = await stamped(BLUEPRINT_SCHEME_MISSING);
  t.after(() => rm(repo, { recursive: true, force: true }));
  const { identity } = await scaffold(repo, { icons: false, repo: "cloud-itonami-isic-7810" });
  assert.equal(identity.source, "cloud-itonami-isic-7810");
  assert.equal(identity.scheme, "isic");
  assert.equal(identity.code, "7810");
  assert.equal(identity.variant, null);
  assert.equal(identity.slug, "isic7810");
  assert.equal(identity.id, "network.itonami.isic7810");
  assert.equal(identity.classification, "ISIC Rev.4 7810");

  const pkg = JSON.parse(await readFile(join(repo, "app/package.json"), "utf8"));
  assert.equal(pkg.name, "@itonami/isic7810");
  assert.deepEqual(pkg.itonami, {
    id: "network.itonami.isic7810",
    title: "Growing of Vegetables",
    source: "cloud-itonami-isic-7810",
  });
});

test("scaffold stamps a suffixed blueprint from --repo", async (t) => {
  const repo = await stamped(BLUEPRINT_SUFFIXED);
  t.after(() => rm(repo, { recursive: true, force: true }));
  const { identity } = await scaffold(repo, { icons: false, repo: "app-itonami-cloud-itonami-isic-8129-facade" });
  assert.equal(identity.source, "cloud-itonami-isic-8129-facade");
  assert.equal(identity.scheme, "isic");
  assert.equal(identity.code, "8129");
  assert.equal(identity.variant, "facade");
  assert.equal(identity.slug, "isic8129facade");
  assert.equal(identity.id, "network.itonami.isic8129facade");
  assert.equal(identity.classification, "ISIC Rev.4 8129");

  const pkg = JSON.parse(await readFile(join(repo, "app/package.json"), "utf8"));
  assert.equal(pkg.name, "@itonami/isic8129facade");
  assert.equal(pkg.itonami.source, "cloud-itonami-isic-8129-facade");
});

test("scaffold writes a sanitized productName and the verbatim window title", async (t) => {
  const repo = await stamped(`[{:itonami.blueprint/id "cloud-itonami-isco-2423"
  :itonami.blueprint/name "Research Support: Biology"}]
`);
  t.after(() => rm(repo, { recursive: true, force: true }));
  const { identity } = await scaffold(repo, { icons: false, repo: "cloud-itonami-isco-2423" });
  assert.equal(identity.title, "Research Support: Biology");
  assert.equal(identity.productName, "Research Support Biology");
  const conf = JSON.parse(await readFile(join(repo, "app/src-tauri/tauri.conf.json"), "utf8"));
  assert.equal(conf.productName, "Research Support Biology");
  assert.equal(conf.app.windows[0].title, "Research Support: Biology");
});

test("scaffold CLI takes the name from --repo", async (t) => {
  const repo = await stamped(BLUEPRINT_SCHEME_MISSING);
  t.after(() => rm(repo, { recursive: true, force: true }));
  execFileSync(
    process.execPath,
    [join(APP, "scripts/scaffold.mjs"), repo, "--repo", "cloud-itonami-isic-7810", "--no-icons"],
    { cwd: APP, stdio: "pipe" },
  );
  const pkg = JSON.parse(await readFile(join(repo, "app/package.json"), "utf8"));
  assert.equal(pkg.itonami.id, "network.itonami.isic7810");
  assert.equal(pkg.itonami.source, "cloud-itonami-isic-7810");
});

test("scaffold reads the name from the git remote when --repo is absent", async (t) => {
  const repo = await stamped(BLUEPRINT_ISCO);
  t.after(() => rm(repo, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet"], { cwd: repo, stdio: "pipe" });
  execFileSync("git", ["remote", "add", "origin", "git@github.com:cloud-itonami/app-itonami-cloud-itonami-isco-2423.git"], {
    cwd: repo,
    stdio: "pipe",
  });
  assert.equal(
    repoNameFromRemote(repo),
    "app-itonami-cloud-itonami-isco-2423",
    "last path segment with .git removed",
  );
  const { identity } = await scaffold(repo, { icons: false });
  assert.equal(identity.source, "cloud-itonami-isco-2423");
  assert.equal(identity.id, "network.itonami.isco2423");
  const pkg = JSON.parse(await readFile(join(repo, "app/package.json"), "utf8"));
  assert.equal(pkg.itonami.source, "cloud-itonami-isco-2423");
});

test("a directory name alone is not accepted", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "itonami-dirname-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const repo = join(base, "app-itonami-cloud-itonami-isco-2423");
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, "blueprint.edn"), BLUEPRINT_ISCO);
  await assert.rejects(scaffold(repo, { icons: false }), /--repo/);
});

test("scaffold keeps an existing workflow and a set version", async (t) => {
  const repo = await stamped(BLUEPRINT_COFOG);
  t.after(() => rm(repo, { recursive: true, force: true }));
  await mkdir(join(repo, "app"), { recursive: true });
  await writeFile(join(repo, "app/package.json"), JSON.stringify({ version: "0.2.0" }));
  mkdirSync(join(repo, ".github/workflows"), { recursive: true });
  await writeFile(join(repo, ".github/workflows/app.yml"), "custom\n");
  await scaffold(repo, { icons: false, repo: "cloud-itonami-cofog-03.2" });
  assert.equal(await readFile(join(repo, ".github/workflows/app.yml"), "utf8"), "custom\n");
  const pkg = JSON.parse(await readFile(join(repo, "app/package.json"), "utf8"));
  assert.equal(pkg.version, "0.2.0");
  const conf = JSON.parse(await readFile(join(repo, "app/src-tauri/tauri.conf.json"), "utf8"));
  assert.equal(conf.version, "0.2.0");
});
