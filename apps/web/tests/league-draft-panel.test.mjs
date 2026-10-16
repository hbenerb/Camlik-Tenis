import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = fileURLToPath(new URL(`../src/${specifier.slice(2)}`, import.meta.url));
      const path = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      if (path) return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".tsx")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
    };
    return nextLoad(url, context);
  },
});

const { LeagueDraftPanel } = await import("../src/components/league-draft-panel.tsx");
const { createLeagueDraft } = await import("../src/lib/league-draft.ts");
const tournament = JSON.parse(readFileSync(new URL("./fixtures/finals-2026-10-13.json", import.meta.url), "utf8"));
const draft = createLeagueDraft(tournament, "2026-10-16T09:30:00Z");
const defaults = {
  draft, isLoading: false, error: null,
  onSave() { throw new Error("Rendering must not save the draft"); },
  onReload() { throw new Error("Rendering must not reload the draft"); },
  onBack() {},
};
const render = (props = {}) => renderToStaticMarkup(React.createElement(LeagueDraftPanel, { ...defaults, ...props }));

test("all five categories and their two foldouts start closed", () => {
  const html = render();
  assert.equal((html.match(/<details\b/g) ?? []).length, 15);
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|\s|>)/);
  assert.equal((html.match(/>Sıralama Listesi<\/h4>/g) ?? []).length, 5);
  assert.equal((html.match(/>Maçlar<\/h4>/g) ?? []).length, 5);
  for (const name of ["Erkek", "Kadın", "Double Kadın", "Double Erkek", "Double Mix"]) {
    assert.ok(html.includes(`>${name}</h3>`));
  }
  assert.match(html, /Yalnızca adminler/);
  assert.match(html, /Kasım 2026–Ekim 2027/);
});

test("the real tournament snapshot renders all entrants and forty monthly pairings", () => {
  const html = render();
  assert.equal((html.match(/type="number"/g) ?? []).length, 80);
  assert.equal((html.match(/aria-label="[^"]+ sıra numarası"/g) ?? []).length, 80);
  assert.equal((html.match(/aria-label="karşılaşır"/g) ?? []).length, 40);
  assert.match(html, /40 maç\/ay · 480 maç/);
  assert.match(html, /29 Ekim Etkinliği/);
  assert.match(html, /16 Eki 2026/);
  for (const category of draft.categories) {
    assert.ok(html.includes(`${category.name} maç ayı`));
    assert.ok(html.includes(`${category.name} maç grubu`));
    for (const entrant of category.entrants) {
      const escaped = entrant.display_name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
      assert.ok(html.includes(escaped), `Missing entrant/team ${entrant.display_name}`);
    }
  }
  assert.doesNotMatch(html, /type="(?:date|time|datetime-local)"|Skor kaydet|Kort seç/);
  assert.doesNotMatch(html, /min-w-\[\d+px\]|overflow-x-auto/);
});

test("invalid group capacity exposes the issue and hides misleading matches", () => {
  const invalid = structuredClone(draft);
  invalid.categories[0].group_sizes = [8, 8, 8];
  const html = render({ draft: invalid });
  assert.match(html, /Grup kapasitesi \(24\) katılımcı sayısına \(32\) eşit olmalı/);
  assert.match(html, /Maç önizlemesi için grup kapasitesini katılımcı sayısına eşitleyin/);
  assert.equal((html.match(/aria-label="karşılaşır"/g) ?? []).length, 24);
  assert.doesNotMatch(html, /aria-label="Erkek Kasım 2026 maçları"/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*?Taslağı kaydet/);
});

test("unresolved source ties remain visible for admin review", () => {
  const tied = structuredClone(draft);
  tied.categories[0].entrants[0].source_tied = true;
  const html = render({ draft: tied });
  assert.match(html, /mevcut kayıt sırası korundu/);
  assert.match(html, /Eşitlik/);
});

test("loading, missing snapshots and fetch errors do not create or save data", () => {
  const loading = render({ draft: null, isLoading: true });
  assert.match(loading, /role="status"/);
  assert.match(loading, /Lig taslağı yükleniyor/);
  assert.doesNotMatch(loading, /Taslağı kaydet|<details/);
  const missing = render({ draft: null });
  assert.match(missing, /Henüz kayıtlı bir lig taslağı bulunmuyor/);
  assert.match(missing, /Tekrar yükle/);
  const failed = render({ draft: null, error: "Lig taslağı okunamadı" });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Lig taslağı okunamadı/);
  const retained = render({ isLoading: true, error: "Bağlantı kesildi" });
  assert.equal((retained.match(/type="number"/g) ?? []).length, 80);
  assert.match(retained, /Düzenlemeleriniz bu ekranda korunuyor/);
});
