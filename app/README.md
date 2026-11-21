# Series app

A read-only Tauri v3 viewer for one classification-series repository. The
same `app/` directory is stamped unchanged into every repository of the
series; the repository name supplies the identity (app id, product name,
icon code, variant). The repository's own `blueprint.edn` is checked
against that name — its id must equal the name, or the name with the
`<scheme>-` part removed — and supplies the title verbatim. The product
name is the title with each of `\ / : * ? " < > |` replaced by a space
(whitespace runs collapsed, trimmed): the window title and the page show
the verbatim title while Tauri gets the sanitized product name. Control
characters in the name, or an empty product name, fail closed.

## What the app shows

Four tabs, all in Japanese UI labels, all content shown as it is in the
sources:

- 概要: every field of the repository's `blueprint.edn`.
- 操作卓の見本: the `docs/samples/operator-console.html` sample, shown only
  when the repository has one. The tab says it is a sample, not live data.
- 物理仕様: the `physics.edn` cases, shown only when the repository has
  `physics.edn`.
- この app について: id, version, source digests, and the statement that
  the app performs no external communication.

The selected tab is remembered in localStorage; the app still renders when
storage throws.

## Where its data comes from

`node scripts/build.mjs` reads the repository name from `itonami.source`
in `package.json`, plus `blueprint.edn`, `physics.edn` (when present)
and `docs/samples/operator-console.html` (when present) next to `app/`,
pins each source by SHA-256 digest in `dist/release.json`, and writes the
page's `dist/data.js`. The app carries no second, hand-written copy of the
data. The build refuses to run when `package.json` or
`src-tauri/tauri.conf.json` disagree with the derived identity, or when the
blueprint id does not match the repository name; re-run
`node scripts/scaffold.mjs` in that case.

## Consent and network

No external operation of any kind. The shipped descriptor declares no
operations, and the page only loads its own files (`script-src 'self'`,
`style-src 'self'`). An operation added later must go through the vendored
canonical broker with per-operation consent. There is no product-local
consent logic and no remote fallback.

## Build and test

- `npm ci`
- `npm run build`: static build into `app/dist/`.
- `npm test`: builds, then runs `node --test test/*.test.mjs`.
- `npm run build:desktop`: static build, then a Tauri desktop build.
- `npm run build:android`: via `sh scripts/android-apk.sh` (needs the
  Android SDK + NDK 27, JDK 21, and the `aarch64-linux-android` Rust target).
- `node scripts/scaffold.mjs <repo-root> [--repo <name>] [--no-icons]`:
  stamp this template into a series repository and rewrite its identity
  files from the repository name and its `blueprint.edn`. The name comes
  from `--repo`, else from the last path segment of the git remote
  origin URL (`.git` removed); the directory name is never used. The
  scaffold writes the name into `itonami.source` in `package.json`.

## Limits

- Read-only: the host exposes one command, `awai_host_info`, and no
  filesystem, network, shell or installer permission.
- The Android build is not yet verified in this repository.
