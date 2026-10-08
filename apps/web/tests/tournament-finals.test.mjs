import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FINALS_CARD_HEIGHT, FINALS_CARD_WIDTH, FINALS_ROW_STEP,
  OCTOBER_29_TOURNAMENT_ID, finalsConnection, finalsMatchPosition,
  getTournamentFinalsTemplate,
} from "../src/lib/tournament-finals.ts";

// Render the real TSX components, including their role guards, without a
// production-only preview route or a new runtime dependency.
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
const { TournamentFinalsPanel } = await import("../src/components/tournament-finals-panel.tsx");
const { TournamentDetailPanel } = await import("../src/components/tournament-panel.tsx");

const categories = [
  ["Erkek Master", 2, 5], ["Erkek İleri", 2, 5], ["Kadın İleri", 2, 3],
  ["Kadın Orta", 1, 3], ["Erkek Orta", 3, 5], ["Yeni Başlayan Kadın", 2, 3],
  ["Double Master Erkek", 2, 3], ["Double İleri Erkek", 1, 1], ["Orta Mix", 1, 1],
  ["İleri Mix", 1, 3], ["Double Kadın", 1, 1],
].map(([name, group_count, matches], display_order) => ({ id: String(display_order), name, group_count, matches, display_order }));
const templateFor = (name) => getTournamentFinalsTemplate(OCTOBER_29_TOURNAMENT_ID, categories.find((c) => c.name === name));

test("all 11 approved categories contain 33 matches and 22 upward connections", () => {
  let total = 0, edges = 0;
  for (const category of categories) {
    const template = templateFor(category.name);
    assert.equal(template.matches.length, category.matches);
    total += template.matches.length;
    assert.equal(template.matches[0].id, "final");
    assert.equal(template.matches[0].row, 0);
    const slots = new Set();
    for (const match of template.matches) {
      const position = finalsMatchPosition(match);
      assert.ok(position.left >= 0 && position.left + FINALS_CARD_WIDTH <= 100);
      assert.equal(position.top, match.row * FINALS_ROW_STEP);
      assert.deepEqual(Object.keys(match).filter((key) => /player|score|date|time/i.test(key)), []);
      if (!match.next) { assert.equal(match.id, "final"); continue; }
      const target = template.matches.find((item) => item.id === match.next.matchId);
      assert.ok(target.row < match.row);
      assert.equal(target.seeds[match.next.slot], "");
      const slotKey = `${target.id}:${match.next.slot}`;
      assert.ok(!slots.has(slotKey));
      slots.add(slotKey);
      const connection = finalsConnection(match, target, match.next.slot);
      assert.ok(connection.arrowTop + 6 < position.top);
      assert.equal(connection.arrowTop, target.row * FINALS_ROW_STEP + FINALS_CARD_HEIGHT);
      edges++;
    }
  }
  assert.equal(total, 33);
  assert.equal(edges, 22);
});

test("master and advanced preserve cross quarterfinals and first-place byes", () => {
  for (const name of ["Erkek Master", "Erkek İleri"]) {
    const matches = templateFor(name).matches;
    assert.deepEqual(matches.map((m) => m.seeds), [["", ""], ["A1", ""], ["B1", ""], ["B2", "A3"], ["A2", "B3"]]);
    assert.equal(matches[3].next.matchId, "sf1");
    assert.equal(matches[4].next.matchId, "sf2");
  }
});

test("Erkek Orta keeps both eliminations and sends their winner to L1", () => {
  const matches = templateFor("Erkek Orta").matches;
  assert.deepEqual(matches.map((m) => m.seeds), [["", ""], ["L2", "L3"], ["L1", ""], ["İ1", ""], ["İ2", "İ3"]]);
  assert.equal(matches[4].next.matchId, "e2");
  assert.equal(matches[3].next.matchId, "sf2");
});

test("cross semifinals, single-group semifinals and final-only categories match the approved PDF", () => {
  for (const name of ["Kadın İleri", "Yeni Başlayan Kadın", "Double Master Erkek"]) {
    assert.deepEqual(templateFor(name).matches.slice(1).map((m) => m.seeds), [["A1", "B2"], ["B1", "A2"]]);
  }
  for (const name of ["Kadın Orta", "İleri Mix"]) {
    assert.deepEqual(templateFor(name).matches.slice(1).map((m) => m.seeds), [["1", "4"], ["2", "3"]]);
  }
  for (const category of categories.filter((c) => c.matches === 1)) {
    assert.deepEqual(templateFor(category.name).matches[0].seeds, ["1", "2"]);
  }
});

test("Kadın Orta uses the same empty semifinal/final template as İleri Mix", () => {
  assert.deepEqual(templateFor("Kadın Orta"), templateFor("İleri Mix"));
  const matches = templateFor("Kadın Orta").matches;
  assert.deepEqual(matches.map((match) => match.title), ["Final", "Yarı final 1", "Yarı final 2"]);
  assert.deepEqual(matches[0].seeds, ["", ""]);
  assert.deepEqual(matches.slice(1).map((match) => match.next), [
    { matchId: "final", slot: 0 }, { matchId: "final", slot: 1 },
  ]);
});

test("unknown tournaments, categories and changed group structures are not guessed", () => {
  assert.equal(getTournamentFinalsTemplate("another-tournament", categories[0]), null);
  assert.equal(getTournamentFinalsTemplate(OCTOBER_29_TOURNAMENT_ID, {name:"Other", group_count:2}), null);
  assert.equal(getTournamentFinalsTemplate(OCTOBER_29_TOURNAMENT_ID, {...categories[0], group_count:3}), null);
  assert.ok(getTournamentFinalsTemplate(OCTOBER_29_TOURNAMENT_ID, {name:"  ERKEK   İLERİ ", group_count:2}));
  assert.ok(getTournamentFinalsTemplate(OCTOBER_29_TOURNAMENT_ID, {name:"YB Kadın", group_count:2}));
});

test("Playoff labels and simplified footnotes stay aligned with the revised PDF", () => {
  for (const name of ["Erkek Master", "Erkek İleri", "Erkek Orta"]) {
    const titles = templateFor(name).matches.map((m) => m.title);
    assert.ok(titles.includes("Playoff 1") && titles.includes("Playoff 2"));
  }
  for (const category of categories) {
    const template = templateFor(category.name);
    assert.doesNotMatch(template.matches.map((m) => m.title).join(" "), /Çeyrek|Eleme/);
    assert.doesNotMatch(template.notes.join(" "), /Harf grubu|grup sırasını gösterir|Eşit puanda/);
  }
  assert.ok(templateFor("Erkek Orta").notes.includes("En iyi ikinci ilk turu pas geçer."));
});

const props = {
  canViewFinals: true, tournamentId: OCTOBER_29_TOURNAMENT_ID,
  categories, selectedCategoryId: "0", onCategoryChange() {}, color: "#c71532", textColor: "#ffffff",
};
test("finals content is empty for non-admins and has only blank slots for admins", () => {
  assert.equal(renderToStaticMarkup(React.createElement(TournamentFinalsPanel, {...props, canViewFinals:false})), "");
  for (const category of categories) {
    const html = renderToStaticMarkup(React.createElement(TournamentFinalsPanel, {...props, selectedCategoryId:category.id}));
    assert.equal((html.match(/<li /g) ?? []).length, category.matches);
    assert.equal((html.match(/Oyuncu ve skor henüz atanmadı/g) ?? []).length, category.matches * 2);
    assert.ok(!html.includes("<input"));
    assert.ok(!html.includes("Şampiyon"));
  }
});

test("tournament navigation exposes the finals button only with admin access", () => {
  const tournament = {
    id: OCTOBER_29_TOURNAMENT_ID, name:"29 Ekim", is_active:true,
    group_stage_start_date:"2026-08-18", group_stage_end_date:"2026-10-15",
    finals_start_date:"2026-10-16", finals_end_date:"2026-10-29",
    categories, groups:[], players:[], participants:[], matches:[], courts:[],
  };
  for (const allowed of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(TournamentDetailPanel, {
      canViewFinals:allowed, currentTime:new Date("2026-10-08T12:00:00"), onClose() {},
      selectedTournamentId:tournament.id, tournaments:[tournament],
    }));
    assert.equal(/>Finaller<\/button>/.test(html), allowed);
    assert.ok(html.includes(">Takvim</button>"));
    assert.ok(html.includes(">Puan Durumu</button>"));
  }
  const parent = readFileSync(new URL("../src/components/club-app.tsx", import.meta.url), "utf8");
  assert.match(parent, /<TournamentDetailPanel\s+canViewFinals=\{isAdmin\(profile\)\}/);
});
