// Stamp this template into one classification-series repository: take the
// repository's name from --repo (else its git remote origin), check its
// blueprint.edn against that name, and write every identity-bearing file
// under its app/ directory. Template files below travel byte-identical;
// only the identity files name the repository's own classification.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { CSP } from "./build.mjs";
import { iconSvg } from "./icon.mjs";
import { deriveIdentity, readBlueprint } from "./identity.mjs";

const HERE = fileURLToPath(new URL("../", import.meta.url));

/** Template files: copied verbatim into every series repository's app/. */
export const TEMPLATE_FILES = [
  ".gitignore",
  "README.md",
  "scripts/android-apk.sh",
  "scripts/build.mjs",
  "scripts/console.mjs",
  "scripts/edn.mjs",
  "scripts/icon.mjs",
  "scripts/identity.mjs",
  "scripts/scaffold.mjs",
  "src/app.js",
  "src/index.html",
  "src/style.css",
  "src/view.js",
  "src-tauri/Cargo.lock",
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/capabilities/main.json",
  "src-tauri/src/lib.rs",
  "src-tauri/src/main.rs",
  "test/build.test.mjs",
  "test/console.test.mjs",
  "test/identity.test.mjs",
  "test/scaffold.test.mjs",
  "test/view.test.mjs",
  "vendor/PINS.json",
  "vendor/kotoba-client-consent.css",
  "vendor/kotoba-client-runtime.js",
];

/** Desktop icon files taken from the `tauri icon` output directory. */
export const ICON_FILES = ["32x32.png", "128x128.png", "128x128@2x.png", "icon.icns", "icon.ico", "icon.png"];

const CONF_ICONS = ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"];

const WORKFLOW = `name: app
on:
  pull_request:
    paths: ["app/**", "blueprint.edn", "physics.edn", "docs/samples/**"]
  push:
    branches: [main]
    paths: ["app/**", "blueprint.edn", "physics.edn", "docs/samples/**"]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
        working-directory: app
      - run: npm test
        working-directory: app
`;

/**
 * The series repository name for a stamp: the --repo value when given,
 * else the last path segment of the git remote origin URL (with a `.git`
 * suffix removed). The directory name is never used: worktrees are named
 * after tasks, not repositories. Fails when neither gives a name.
 */
export function repoNameFromRemote(repoRoot) {
  let url;
  try {
    url = execFileSync("git", ["-C", repoRoot, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      `cannot determine the repository name for ${repoRoot}: pass --repo <name> or set a git remote origin`,
    );
  }
  const segment = url.trim().replace(/\/+$/, "").split(/[/:]/).pop() ?? "";
  const name = segment.endsWith(".git") ? segment.slice(0, -".git".length) : segment;
  if (!name) throw new Error(`git remote origin for ${repoRoot} gives no repository name: pass --repo <name>`);
  return name;
}

export async function scaffold(repoRoot, { icons = true, repo: repoName = null } = {}) {
  const repo = resolve(repoRoot);
  const name = repoName ?? repoNameFromRemote(repo);
  const blueprintText = await readFile(join(repo, "blueprint.edn"), "utf8");
  const identity = deriveIdentity(name, readBlueprint(blueprintText));
  const app = join(repo, "app");
  const selfRun = resolve(app) === resolve(HERE);

  if (!selfRun) {
    for (const name of TEMPLATE_FILES) {
      await mkdir(join(app, name.slice(0, name.lastIndexOf("/"))), { recursive: true });
      await copyFile(join(HERE, name), join(app, name));
    }
    await execFileSync("chmod", ["755", join(app, "scripts/android-apk.sh")]);
  }
  await mkdir(join(app, "icon"), { recursive: true });
  await mkdir(join(app, "src-tauri"), { recursive: true });

  let version = "0.1.0";
  try {
    const prev = JSON.parse(await readFile(join(app, "package.json"), "utf8"));
    if (typeof prev.version === "string" && prev.version) version = prev.version;
  } catch {
    // A fresh stamp starts at 0.1.0.
  }
  const pkg = {
    name: `@itonami/${identity.slug}`,
    version,
    private: true,
    type: "module",
    itonami: { id: identity.id, title: identity.title, source: identity.source },
    scripts: {
      build: "node scripts/build.mjs",
      test: "npm run build && node --test test/*.test.mjs",
      tauri: "tauri",
      "build:desktop": "npm run build && tauri build --no-bundle",
      "build:android": "sh scripts/android-apk.sh",
    },
    devDependencies: { "@tauri-apps/cli": "3.0.0-alpha.6" },
  };
  await writeFile(join(app, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  const conf = {
    $schema: "https://schema.tauri.app/config/3",
    productName: identity.productName,
    version,
    identifier: identity.id,
    build: { frontendDist: "../dist" },
    app: {
      withGlobalTauri: true,
      windows: [{ label: "main", title: identity.title, width: 1100, height: 780, minWidth: 360, minHeight: 480 }],
      security: { csp: CSP },
    },
    bundle: { active: false, icon: CONF_ICONS },
  };
  await writeFile(join(app, "src-tauri/tauri.conf.json"), JSON.stringify(conf, null, 2) + "\n");

  const svg = iconSvg(identity);
  await writeFile(join(app, "icon/app.svg"), svg);

  if (icons) {
    if (!existsSync(join(app, "node_modules/.bin/tauri"))) {
      execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: app, stdio: "inherit" });
    }
    const out = await mkdtemp(join(tmpdir(), "itonami-icons-"));
    try {
      const tauri = join(app, "node_modules/.bin/tauri");
      execFileSync(tauri, ["icon", join(app, "icon/app.svg"), "--output", out], { cwd: app, stdio: "inherit" });
      await mkdir(join(app, "src-tauri/icons"), { recursive: true });
      for (const name of ICON_FILES) {
        await copyFile(join(out, name), join(app, "src-tauri/icons", name));
      }
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }

  const workflow = join(repo, ".github/workflows/app.yml");
  if (!existsSync(workflow)) {
    await mkdir(join(repo, ".github/workflows"), { recursive: true });
    await writeFile(workflow, WORKFLOW);
  }
  return { identity, app, version };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let repo = null;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--repo") {
      i += 1;
      repo = args[i] ?? null;
    } else if (args[i].startsWith("--repo=")) {
      repo = args[i].slice("--repo=".length);
    } else {
      rest.push(args[i]);
    }
  }
  const root = rest.find((a) => !a.startsWith("--"));
  if (!root) {
    console.error("usage: node scripts/scaffold.mjs <repo-root> [--repo <name>] [--no-icons]");
    process.exit(1);
  }
  const { identity, app } = await scaffold(root, { icons: !rest.includes("--no-icons"), repo });
  console.log(`${identity.title} (${identity.id}) scaffolded into ${app}`);
}
