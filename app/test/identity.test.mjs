// Identity comes from the repository name; the blueprint id is checked
// against it, never trusted for naming. Every name below is an inline
// fixture except the refusal shapes, which hold for all series repositories.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveIdentity, parseSource, readBlueprint } from "../scripts/identity.mjs";

const edn = (id, name) => `[{:itonami.blueprint/id "${id}"\n  :itonami.blueprint/name "${name}"}]`;

const ROWS = [
  {
    // 585 repositories: blueprint id equals the repository name.
    source: "cloud-itonami-isco-2423",
    blueprint: "cloud-itonami-isco-2423",
    scheme: "isco",
    code: "2423",
    variant: null,
    slug: "isco2423",
    classification: "ISCO-08 2423",
  },
  {
    // 88 repositories: blueprint id omits the scheme part.
    source: "cloud-itonami-isic-7810",
    blueprint: "cloud-itonami-7810",
    scheme: "isic",
    code: "7810",
    variant: null,
    slug: "isic7810",
    classification: "ISIC Rev.4 7810",
  },
  {
    // 2 repositories: equal blueprint id, with a suffix.
    source: "cloud-itonami-isic-8411-electoral",
    blueprint: "cloud-itonami-isic-8411-electoral",
    scheme: "isic",
    code: "8411",
    variant: "electoral",
    slug: "isic8411electoral",
    classification: "ISIC Rev.4 8411",
  },
  {
    // 1 repository: scheme missing from the blueprint id, with a suffix.
    source: "cloud-itonami-isic-8129-facade",
    blueprint: "cloud-itonami-8129-facade",
    scheme: "isic",
    code: "8129",
    variant: "facade",
    slug: "isic8129facade",
    classification: "ISIC Rev.4 8129",
  },
];

for (const row of ROWS) {
  test(`${row.source} gives its own identity`, () => {
    const identity = deriveIdentity(row.source, readBlueprint(edn(row.blueprint, "Some Series Title")));
    assert.equal(identity.source, row.source);
    assert.equal(identity.scheme, row.scheme);
    assert.equal(identity.code, row.code);
    assert.equal(identity.variant, row.variant);
    assert.equal(identity.slug, row.slug);
    assert.equal(identity.id, `network.itonami.${row.slug}`);
    assert.equal(identity.title, "Some Series Title");
    assert.equal(identity.productName, "Some Series Title");
    assert.equal(identity.classification, row.classification);
    assert.equal(identity.stateSchema, `itonami.series.${row.slug}.v1`);
  });
}

test("the app-itonami- prefix is accepted and strips to the canonical source", () => {
  const identity = deriveIdentity(
    "app-itonami-cloud-itonami-isco-2423",
    readBlueprint(edn("cloud-itonami-isco-2423", "Community Careers Practice")),
  );
  assert.equal(identity.source, "cloud-itonami-isco-2423");
  assert.equal(identity.scheme, "isco");
  assert.equal(identity.code, "2423");
  assert.equal(identity.variant, null);
  assert.equal(identity.slug, "isco2423");
  assert.equal(identity.id, "network.itonami.isco2423");
  assert.equal(identity.classification, "ISCO-08 2423");
});

test("cofog code with a dot loses the dot in slug and id", () => {
  const identity = deriveIdentity(
    "cloud-itonami-cofog-03.2",
    readBlueprint(edn("cloud-itonami-cofog-03.2", "Household Consumption")),
  );
  assert.equal(identity.scheme, "cofog");
  assert.equal(identity.code, "03.2");
  assert.equal(identity.variant, null);
  assert.equal(identity.slug, "cofog032");
  assert.equal(identity.id, "network.itonami.cofog032");
  assert.equal(identity.classification, "COFOG 03.2");
  assert.equal(identity.stateSchema, "itonami.series.cofog032.v1");
});

test("names with / or : keep the verbatim title and sanitize productName", () => {
  const cases = [
    {
      name: "Mine/Quarry-Site Scheduling & Logistics Coordination Service",
      productName: "Mine Quarry-Site Scheduling & Logistics Coordination Service",
    },
    { name: "Research Support: Biology", productName: "Research Support Biology" },
    { name: "Storage (terminal/depot)", productName: "Storage (terminal depot)" },
  ];
  for (const { name, productName } of cases) {
    const identity = deriveIdentity(
      "cloud-itonami-isco-2423",
      readBlueprint(edn("cloud-itonami-isco-2423", name)),
    );
    assert.equal(identity.title, name);
    assert.equal(identity.productName, productName);
  }
});

test("every reserved character becomes a space and runs collapse", () => {
  const identity = deriveIdentity(
    "cloud-itonami-isco-2423",
    { "itonami.blueprint/id": "cloud-itonami-isco-2423", "itonami.blueprint/name": '  A\\B/C:D*E?F"G<H>I|J  K  ' },
  );
  assert.equal(identity.title, 'A\\B/C:D*E?F"G<H>I|J  K');
  assert.equal(identity.productName, "A B C D E F G H I J K");
});

test("control characters or an empty productName still fail closed", () => {
  const bad = (name) => () => deriveIdentity(
    "cloud-itonami-isco-2423",
    { "itonami.blueprint/id": "cloud-itonami-isco-2423", "itonami.blueprint/name": name },
  );
  assert.throws(bad("a\nd"), /not usable as a product name/);
  assert.throws(bad("a\td"), /not usable as a product name/);
  assert.throws(bad("///"), /not usable as a product name/);
  assert.throws(bad("  : *?  "), /not usable as a product name/);
});

test("refusals fail closed instead of guessing a name", () => {
  // Blueprint id of another repository: the error names both values.
  assert.throws(
    () => deriveIdentity("cloud-itonami-isco-2423", readBlueprint(edn("cloud-itonami-isco-2424", "Other"))),
    (err) => err.message.includes("cloud-itonami-isco-2424") && err.message.includes("cloud-itonami-isco-2423"),
  );
  // Blueprint id with the suffix dropped is not the scheme-less form.
  assert.throws(
    () => deriveIdentity(
      "cloud-itonami-isic-8411-electoral",
      readBlueprint(edn("cloud-itonami-8411", "Other")),
    ),
    /does not match repository source/,
  );
  // Unknown scheme.
  assert.throws(() => deriveIdentity("cloud-itonami-foo-1", readBlueprint(edn("cloud-itonami-foo-1", "Whatever"))), /not a classification-series/);
  assert.throws(() => parseSource("cloud-itonami-foo-1"), /not a classification-series/);
  // Empty suffix part.
  assert.throws(() => parseSource("cloud-itonami-isco-2423-"), /not a classification-series/);
  assert.throws(() => parseSource("cloud-itonami-isco-2423--x"), /not a classification-series/);
  // Not a series name at all.
  assert.throws(() => parseSource("jun-1406-series-identity"), /not a classification-series/);
  assert.throws(() => parseSource(undefined), /not a classification-series/);
  // Missing or unusable title still fails.
  assert.throws(
    () => deriveIdentity("cloud-itonami-isco-2423", readBlueprint(edn("cloud-itonami-isco-2423", ""))),
    /no :itonami.blueprint\/name/,
  );
  assert.throws(
    () => deriveIdentity("cloud-itonami-isco-2423", readBlueprint(`[{:itonami.blueprint/id "cloud-itonami-isco-2423"}]`)),
    /blueprint has no/,
  );
  assert.throws(
    () => deriveIdentity("cloud-itonami-isco-2423", { "itonami.blueprint/id": "cloud-itonami-isco-2423", "itonami.blueprint/name": "a\u0001b" }),
    /not usable as a product name/,
  );
  assert.throws(() => readBlueprint(`[{:other/id "x"}]`), /exactly one blueprint map/);
  assert.throws(() => readBlueprint(edn("cloud-itonami-isco-2423", "A") + "\n" + edn("cloud-itonami-isco-2424", "B")), /exactly one blueprint map/);
});
