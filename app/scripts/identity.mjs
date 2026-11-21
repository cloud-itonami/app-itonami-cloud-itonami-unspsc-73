// The app's identity comes from the repository's own name, so the same
// app/ directory can be stamped into every repository of the
// classification series without a hand-written name anywhere. The
// blueprint is checked against that name, never trusted for naming: some
// repositories carry a blueprint id with the scheme part missing, so the
// blueprint id must be either the repository source or the source with its
// "<scheme>-" part removed, and anything else fails closed.
import { readAll } from "./edn.mjs";

export const SCHEMES = {
  isic: { label: "ISIC Rev.4", colour: "#1F4E79" },
  isco: { label: "ISCO-08", colour: "#2E6B4F" },
  jsic: { label: "JSIC", colour: "#7A3B1E" },
  cofog: { label: "COFOG", colour: "#5B3A7A" },
  unspsc: { label: "UNSPSC", colour: "#3D4A57" },
};

const APP_PREFIX = "app-itonami-";
const SERIES_PREFIX = "cloud-itonami-";
const SCHEME = Object.keys(SCHEMES).join("|");
const SOURCE = new RegExp(`^${SERIES_PREFIX}(${SCHEME})-(.+)$`);
const CODE = /^[0-9A-Za-z][0-9A-Za-z.]*$/;
const SUFFIX_PART = /^[0-9a-z]+$/;

/** The single blueprint map of a blueprint.edn text. */
export function readBlueprint(text) {
  const forms = readAll(text);
  const top = forms.length === 1 && Array.isArray(forms[0]) ? forms[0] : forms;
  const maps = top.filter((x) => x && typeof x === "object" && !Array.isArray(x) && "itonami.blueprint/id" in x);
  if (maps.length !== 1) throw new Error(`blueprint.edn must hold exactly one blueprint map, found ${maps.length}`);
  return maps[0];
}

/**
 * Parse a series repository name into its parts. Accepts the name with or
 * without the `app-itonami-` prefix. Returns the canonical source (without
 * the prefix) plus scheme, bare code, suffix variant (or null) and slug.
 */
export function parseSource(source) {
  const raw = source;
  const name = typeof source === "string" && source.startsWith(APP_PREFIX) ? source.slice(APP_PREFIX.length) : source;
  const m = typeof name === "string" ? SOURCE.exec(name) : null;
  if (!m) throw new Error(`not a classification-series repository name: ${JSON.stringify(raw)}`);
  const [, scheme, tail] = m;
  const [code, ...suffix] = tail.split("-");
  if (!CODE.test(code)) throw new Error(`not a classification-series repository name: ${JSON.stringify(raw)}`);
  for (const part of suffix) {
    if (!SUFFIX_PART.test(part)) throw new Error(`not a classification-series repository name: ${JSON.stringify(raw)}`);
  }
  const variant = suffix.length > 0 ? suffix.join("-") : null;
  const slug = (scheme + code + suffix.join("")).toLowerCase().replace(/[^0-9a-z]/g, "");
  return { source: name, scheme, code, variant, slug };
}

/**
 * Identity of the app for one series repository. The repository name is the
 * source of identity; the blueprint id must be exactly that source, or the
 * source with its "<scheme>-" part removed (some repositories omit the
 * scheme in the blueprint id). Anything else fails closed.
 * The Android package id cannot hold "-" or ".", and a segment cannot start
 * with a digit, so "isco-2423" becomes "isco2423" and "cofog-03.2" "cofog032".
 * The classification stays "<label> <code>" (the suffix is not part of it),
 * the icon keeps drawing the bare code, and the suffix is exposed as
 * `variant` (or null when the name has none). The window title and the
 * page show `title`, the blueprint name verbatim (trimmed); `productName`
 * is the Tauri-safe form with each of `\ / : * ? " < > |` replaced by a
 * space and whitespace runs collapsed to one space, trimmed. Control
 * characters in the name, or an empty productName, fail closed.
 */
export function deriveIdentity(source, blueprint) {
  const { source: canonical, scheme, code, variant, slug } = parseSource(source);
  const blueprintId = blueprint?.["itonami.blueprint/id"];
  const short = shortId(canonical, scheme);
  if (blueprintId !== canonical && blueprintId !== short) {
    throw new Error(
      `blueprint id ${JSON.stringify(blueprintId)} does not match repository source ${JSON.stringify(canonical)} ` +
      `(expected ${JSON.stringify(canonical)} or ${JSON.stringify(short)})`,
    );
  }
  const name = blueprint["itonami.blueprint/name"];
  if (typeof name !== "string" || !name.trim()) throw new Error("blueprint has no :itonami.blueprint/name");
  const title = name.trim();
  if (/[\u0000-\u001f]/.test(title)) throw new Error(`blueprint name is not usable as a product name: ${JSON.stringify(name)}`);
  const productName = title.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  if (!productName) throw new Error(`blueprint name is not usable as a product name: ${JSON.stringify(name)}`);
  return {
    source: canonical,
    scheme,
    code,
    variant,
    slug,
    id: `network.itonami.${slug}`,
    title,
    productName,
    classification: `${SCHEMES[scheme].label} ${code}`,
    stateSchema: `itonami.series.${slug}.v1`,
  };
}

/** The source with its "<scheme>-" part removed (the scheme-less blueprint form). */
function shortId(canonical, scheme) {
  return `${SERIES_PREFIX}${canonical.slice(SERIES_PREFIX.length).replace(`${scheme}-`, "")}`;
}
