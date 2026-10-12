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
  FINALS_MOBILE_CARD_HEIGHT, FINALS_MOBILE_ROW_STEP,
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
const { tournamentGroupStandings, tournamentStandings, compareOverallStandings } = await import("../src/lib/tournament-standings.ts");
const { getTournamentFinalsSeeding } = await import("../src/lib/tournament-finals-seeding.ts");
const live = JSON.parse(readFileSync(new URL("./fixtures/finals-2026-10-12.json", import.meta.url), "utf8"));

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

test("mobile cards and upward connectors share the same compact two-lane geometry", () => {
  for (const category of categories) {
    const template = templateFor(category.name);
    for (const match of template.matches) {
      const position = finalsMatchPosition(match, true);
      assert.ok(position.left >= 0 && position.left + FINALS_CARD_WIDTH <= 100);
      assert.equal(position.top, match.row * FINALS_MOBILE_ROW_STEP);
      if (!match.next) continue;
      const target = template.matches.find((item) => item.id === match.next.matchId);
      const connection = finalsConnection(match, target, match.next.slot, true);
      assert.equal(connection.arrowTop, finalsMatchPosition(target, true).top + FINALS_MOBILE_CARD_HEIGHT);
      assert.ok(connection.arrowTop + 6 < position.top);
      assert.equal(connection.arrowLeft, finalsConnection(match, target, match.next.slot).arrowLeft);
    }
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
  canViewFinals: true,
  tournament: { id: OCTOBER_29_TOURNAMENT_ID, categories, groups:[], players:[], participants:[], matches:[] },
  selectedCategoryId: "0", onCategoryChange() {}, color: "#c71532", textColor: "#ffffff",
};
test("finals content remains admin-only and missing results are never invented", () => {
  assert.equal(renderToStaticMarkup(React.createElement(TournamentFinalsPanel, {...props, canViewFinals:false})), "");
  for (const category of categories) {
    const html = renderToStaticMarkup(React.createElement(TournamentFinalsPanel, {...props, selectedCategoryId:category.id}));
    assert.equal((html.match(/<li /g) ?? []).length, category.matches);
    assert.equal((html.match(/Üst tur sonucu bekleniyor|>Sonuç bekleniyor</g) ?? []).length, category.matches * 2);
    assert.ok(!html.includes("<input"));
    assert.ok(!html.includes("Şampiyon"));
  }
});

test("finals fit the mobile width with stacked entrants, without a scrolling canvas", () => {
  for (const category of categories) {
    const html = renderToStaticMarkup(React.createElement(TournamentFinalsPanel, {...props, selectedCategoryId:category.id}));
    assert.doesNotMatch(html, /min-w-\[640px\]|overflow-x-auto|yatay kaydır/);
    assert.match(html, /grid-rows-2/);
    assert.match(html, /sm:grid-cols-2/);
    assert.match(html, /--finals-mobile-card-height:220px/);
    assert.match(html, /--finals-card-height:158px/);
  }
});

const categoryByName = (name, data = live) => data.categories.find((c) => c.name === name);
const groupTable = (name, group, data = live) => tournamentGroupStandings(data,
  data.groups.find((g) => g.category_id === categoryByName(name, data).id && g.name === group).id);
const seedCategory = (name, data = live) => getTournamentFinalsSeeding(data, categoryByName(name, data));

test("live three-way ties use only mutual sets: İlker and Cenk/Haluk qualify", () => {
  assert.deepEqual(groupTable("Erkek Orta", "B").rows.map((r) => r.entry.display_name),
    ["Mehmet Yiğit", "İlker Doğaç", "Emre Karaaslan", "Bener Bozkurt"]);
  const doubles = seedCategory("Double İleri Erkek").matches[0].entrants;
  assert.deepEqual(doubles.map((e) => e.names), [["Mete Albeyoğlu", "Ersin Başaran"], ["Cenk Cömert", "Haluk Sağun"]]);
  assert.ok(doubles.every((e) => e.status === "confirmed"));
});

test("all complete live groups certify names, missing results remain pending", () => {
  const tables = tournamentStandings(live);
  assert.equal([...tables.values()].filter((g) => !g.complete).length, 3);
  for (const category of live.categories) {
    const seeded = getTournamentFinalsSeeding(live, category, tables);
    assert.equal(seeded.hasPending, ["Erkek Orta", "Orta Mix", "İleri Mix"].includes(category.name));
    assert.equal(seeded.hasTies, false);
    for (const m of seeded.matches) for (const e of m.entrants) {
      if (!e.seed) assert.equal(e.status, "later_round");
      if (e.status === "confirmed") assert.ok(e.names.every(Boolean));
    }
  }
  assert.deepEqual(seedCategory("Erkek Orta").qualifiedAwaitingPlacement.map((e) => e.names[0]).sort(),
    ["Hüseyin Kahraman", "Özcan Günay", "Mehmet Yiğit", "Cengiz Gültekin", "Utku Ataman"].sort());
  assert.deepEqual(seedCategory("Erkek Orta").matches.find((m)=>m.id==="e1").entrants[1].names, ["İlker Doğaç"]);
});

test("names come from player references and readable doubles names render without truncation", () => {
  const data = structuredClone(live);
  const player = data.players.find((p) => p.display_name === "Cenk Cömert");
  player.display_name = "Cenk Güncel Ad";
  const html = renderToStaticMarkup(React.createElement(TournamentFinalsPanel, {
    ...props, tournament: data, selectedCategoryId: categoryByName("Double İleri Erkek").id,
  }));
  assert.match(html, /Cenk Güncel Ad/);
  assert.match(html, /Haluk Sağun/);
  assert.doesNotMatch(html, /Cenk Cömert|truncate|line-clamp/);
  assert.equal(renderToStaticMarkup(React.createElement(TournamentFinalsPanel, {...props, tournament:data, canViewFinals:false})), "");
});

function miniTournament(scores, pending = []) {
  const entries = ["A", "B", "C"].map((id, display_order) => ({ id, group_id:"g", category_id:"c", display_order, display_name:id, player_ids:[] }));
  return { ...live, participants:entries, groups:[{id:"g", name:"A", category_id:"c"}], matches:scores.map(([a,b,sets], i) => {
    const playedSets = sets.map(([x,y,type = "regular"], n) => ({set_number:n+1, type, player1_score:x, player2_score:y, player1_tiebreak:x===7&&y===6?7:null, player2_tiebreak:x===7&&y===6?4:null}));
    return {id:String(i), phase:"group", group_id:"g", category_id:"c", player1_entry_id:a, player2_entry_id:b,
      status:pending.includes(i)?"scheduled":"completed", score_entered:!pending.includes(i), score_sets:playedSets,
      winner_entry_id:a, is_walkover:false, is_retired:false};
  }) };
}

test("equal mutual sets use mutual games, excluding every match tie-break point", () => {
  const data = miniTournament([
    ["A","B",[[6,0],[6,0]]], ["B","C",[[6,4],[6,4]]], ["C","A",[[6,4],[6,4]]],
  ]);
  let rows = tournamentGroupStandings(data,"g").rows;
  assert.deepEqual(rows.map((r) => [r.entry.id,r.points,r.rank]), [["A",4,1],["C",4,2],["B",4,3]]);
  const originalGames = rows.map((r) => [r.entry.id,r.gamesWon,r.gamesLost]);
  data.matches[0].score_sets.push({type:"match_tiebreak",set_number:3,player1_score:20,player2_score:18});
  rows = tournamentGroupStandings(data,"g").rows;
  assert.deepEqual(rows.map((r) => [r.entry.id,r.gamesWon,r.gamesLost]), originalGames);
  assert.equal(rows[0].setsWon,3);
});

test("a two-way points tie uses their mutual sets, not better overall set difference", () => {
  const data = miniTournament([["A","B",[[6,4],[3,6],[10,8,"match_tiebreak"]]],
    ["C","A",[[6,0],[6,0]]], ["B","D",[[6,0],[6,0]]]]);
  data.participants.push({...data.participants[0],id:"D",display_name:"D",display_order:3});
  const rows = tournamentGroupStandings(data,"g").rows;
  assert.deepEqual(rows.slice(0,2).map((r)=>[r.entry.id,r.points]), [["A",4],["B",4]]);
  assert.ok(rows[0].setsWon-rows[0].setsLost < rows[1].setsWon-rows[1].setsLost);
});

test("an exact mini-league tie is explicit, never broken by alphabetical or entry order", () => {
  const data = miniTournament([["A","B",[[6,0],[6,0]]],["B","C",[[6,0],[6,0]]],["C","A",[[6,0],[6,0]]]]);
  const group = tournamentGroupStandings(data,"g");
  assert.ok(group.complete);
  assert.ok(group.rows.every((r) => r.tied && r.rank === 1));
  assert.ok([...group.possibleRanks.values()].every((ranks) => ranks.size === 3));
});

test("walkovers, retirement partial games, canceled fixtures and finals are handled separately", () => {
  const data = miniTournament([["A","B",[[4,2]]],["B","C",[]],["C","A",[[6,0],[6,0]]]]);
  data.matches[0].is_retired = true;
  data.matches[1].is_walkover = true;
  const group = tournamentGroupStandings(data,"g");
  const a = group.rows.find((r)=>r.entry.id==="A"), b = group.rows.find((r)=>r.entry.id==="B"), c = group.rows.find((r)=>r.entry.id==="C");
  assert.equal(a.setsWon,0); assert.equal(a.gamesWon,4); assert.equal(b.points,4); assert.equal(c.points,3);
  data.matches.push({...data.matches[0],id:"final",phase:"final"}, {...data.matches[0],id:"canceled",status:"canceled"});
  assert.deepEqual(tournamentGroupStandings(data,"g").rows,group.rows);
  data.matches = data.matches.filter((m)=>m.id!=="0");
  assert.equal(tournamentGroupStandings(data,"g").complete,false);
});

test("remaining results never fix a slot early, including possible walkovers", () => {
  const seeded = seedCategory("İleri Mix");
  assert.ok(seeded.hasPending);
  assert.ok(seeded.qualifiedAwaitingPlacement.some((e)=>e.names.includes("Evrim Özcan")));
  const group = groupTable("İleri Mix","A");
  const inan = group.rows.find((r)=>r.entry.display_name.includes("İnan"));
  assert.ok(group.possibleRanks.get(inan.entry.id).has(5),"A walkover loss can still exclude İnan/Zeynep");
});

test("İleri Mix completed result resolves the three-way games tie and populates both semifinals", () => {
  const data = structuredClone(live);
  const updates = JSON.parse(readFileSync(new URL("./fixtures/finals-ileri-mix-result-2026-10-12.json", import.meta.url), "utf8"));
  assert.equal(updates.length, 1);
  data.matches = data.matches.map((match) => updates.find((update) => update.id === match.id) ?? match);
  const table = groupTable("İleri Mix", "A", data);
  assert.ok(table.complete);
  assert.deepEqual(table.rows.map((row) => [row.entry.display_name, row.points]), [
    ["Evrim Özcan / Gençay Üstünel", 15], ["Elif Bora / Serkan İrden", 13],
    ["İnan Özbakır / Zeynep Kürşat", 9], ["Ahmet Ok / Naz Lale", 9],
    ["Esen Atay / Kemal Yardımcı", 9], ["Zeliha Aysan / Aydoğan Aysan", 5],
  ]);
  const seeded = seedCategory("İleri Mix", data);
  assert.equal(seeded.hasPending, false);
  assert.equal(seeded.hasTies, false);
  assert.deepEqual(seeded.qualifiedAwaitingPlacement, []);
  assert.deepEqual(seeded.matches.slice(1).map((match) => match.entrants.map((entry) => entry.names)), [
    [["Evrim Özcan", "Gençay Üstünel"], ["Ahmet Ok", "Naz Lale"]],
    [["Elif Bora", "Serkan İrden"], ["İnan Özbakır", "Zeynep Kürşat"]],
  ]);
  assert.ok(seeded.matches[0].entrants.every((entry) => entry.status === "later_round"));
  const html = renderToStaticMarkup(React.createElement(TournamentFinalsPanel, {
    ...props, tournament:data, selectedCategoryId:categoryByName("İleri Mix").id,
  }));
  for (const name of ["Evrim Özcan", "Gençay Üstünel", "Ahmet Ok", "Naz Lale", "Elif Bora", "Serkan İrden", "İnan Özbakır", "Zeynep Kürşat"]) {
    assert.ok(html.includes(name), name);
  }
  assert.doesNotMatch(html, /Sonuç bekleniyor|Üst tur kesin/);
  for (const category of live.categories.filter((c) => c.name !== "İleri Mix")) {
    assert.deepEqual(getTournamentFinalsSeeding(data, category), getTournamentFinalsSeeding(live, category));
  }
});

test("inter-group rankings use overall points then sets then games, and do not invent a last tiebreak", () => {
  const rows = groupTable("Erkek Orta","A").rows;
  const a={...rows[0],points:9,setsWon:6,setsLost:0,gamesWon:30,gamesLost:10};
  const b={...a,gamesWon:29};
  assert.ok(compareOverallStandings(a,b)<0);
  assert.ok(compareOverallStandings(a,{...b,setsWon:7})>0);
  assert.equal(compareOverallStandings(a,{...a,entry:rows[1].entry}),0);
});

test("missing or renamed groups cannot assign a different group's entrants to approved slots", () => {
  const data = structuredClone(live);
  const category = categoryByName("Erkek Master");
  data.groups = data.groups.filter((g)=>g.category_id!==category.id || g.name==="A");
  const seeding = seedCategory(category.name,data);
  assert.ok(seeding.matches.flatMap((m)=>m.entrants).every((e)=>e.status!=="confirmed"));
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
