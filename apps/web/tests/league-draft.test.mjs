import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = fileURLToPath(new URL(`../src/${specifier.slice(2)}`, import.meta.url));
      const path = [base, `${base}.ts`].find(existsSync);
      if (path) return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const {
  createLeagueDraft, defaultLeagueGroupSizes, generateLeagueMatches, validateLeagueCategory,
  prepareLeagueCategories, leagueMonthLabel, moveLeagueEntrant, leagueEntryGroup,
} = await import("../src/lib/league-draft.ts");
const fixture = JSON.parse(readFileSync(new URL("./fixtures/finals-2026-10-13.json", import.meta.url), "utf8"));
const captured = "2026-10-16T09:30:00.000Z";
const draft = () => createLeagueDraft(fixture, captured);

test("balanced groups use the fewest groups, fit 4–10 entrants and keep even sizes", () => {
  const cases = [
    [0, []], [4, [4]], [6, [6]], [8, [8]], [10, [10]], [12, [6, 6]],
    [14, [8, 6]], [18, [10, 8]], [22, [8, 8, 6]], [32, [8, 8, 8, 8]],
    [34, [10, 8, 8, 8]], [40, [10, 10, 10, 10]],
  ];
  for (const [count, expected] of cases) assert.deepEqual(defaultLeagueGroupSizes(count), expected);
  for (let count = 4; count <= 200; count += 2) {
    const sizes = defaultLeagueGroupSizes(count);
    assert.equal(sizes.length, Math.ceil(count / 10));
    assert.equal(sizes.reduce((sum, size) => sum + size, 0), count);
    assert.ok(sizes.every((size) => [4, 6, 8, 10].includes(size)));
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 2);
  }
  for (const count of [-1, 1, 2, 3, 7, 3.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => defaultLeagueGroupSizes(count));
  }
});

test("the October tournament seeds all five approved categories with 480 monthly matches", () => {
  const before = structuredClone(fixture);
  const league = draft();
  assert.deepEqual(fixture, before, "source tournament is unchanged");
  assert.equal(league.id, "2026-2027");
  assert.equal(league.source_tournament_id, fixture.id);
  assert.equal(league.source_tournament_name, "29 Ekim Etkinliği");
  assert.equal(league.source_captured_at, captured);
  assert.equal(league.created_at, captured);
  assert.equal(league.updated_at, captured);
  assert.equal(league.season_start, "2026-11-01");
  assert.equal(league.month_count, 12);
  assert.equal(league.revision, 1);
  assert.deepEqual(league.categories.map((category) => [category.key, category.entrants.length, category.group_sizes]), [
    ["men", 32, [8, 8, 8, 8]], ["women", 22, [8, 8, 6]], ["women-doubles", 4, [4]],
    ["men-doubles", 12, [6, 6]], ["mixed-doubles", 10, [10]],
  ]);
  assert.equal(league.categories.reduce((sum, category) => sum + category.matches.length, 0), 480);
  assert.equal(league.categories.reduce((sum, category) => sum + category.matches.filter((match) => match.month_index === 0).length, 0), 40);
  for (const category of league.categories) {
    assert.equal(validateLeagueCategory(category), null);
    for (const entrant of category.entrants) {
      const source = fixture.participants.find((entry) => entry.id === entrant.id);
      assert.deepEqual(entrant.player_ids, source.player_ids, "doubles partner order is retained");
      assert.deepEqual(entrant.player_names, source.player_ids.map((id) => fixture.players.find((player) => player.id === id).display_name));
      assert.equal(entrant.display_name, entrant.player_names.join(" / "));
    }
  }
});

test("source tiers and actual group standings determine the initial order", () => {
  const [men, women, womenDoubles, menDoubles, mixed] = draft().categories;
  assert.deepEqual(men.entrants.slice(0, 6).map((entry) => entry.display_name), [
    "Turgay Urgancı", "Stefan De Jong", "Gençay Üstünel", "Tuncer Urgancı", "Ahmet Ok", "Ali Koray Güzel",
  ]);
  assert.deepEqual(men.entrants.map((entry) => entry.source_category_name), [
    ...Array(10).fill("Erkek Master"), ...Array(10).fill("Erkek İleri"), ...Array(12).fill("Erkek Orta"),
  ]);
  assert.deepEqual(women.entrants.slice(0, 6).map((entry) => entry.display_name), [
    "Günnur Algın", "Evrim Özcan", "Zeliha Aysan", "Zeynep Kürşat", "Elif Bora", "Ekin Akgün",
  ]);
  assert.deepEqual(womenDoubles.entrants.map((entry) => entry.display_name), [
    "Evrim Özcan / Fatma Müsait", "Mehtap / Nuray Baskak", "Zeliha Aysan / Zeynep Kürşat", "Günnur Algın / Ekin Akgün",
  ]);
  assert.equal(menDoubles.entrants[0].display_name, "Serkan İrden / Ahmet Ok");
  assert.equal(mixed.entrants[0].display_name, "Evrim Özcan / Gençay Üstünel");
  assert.deepEqual(mixed.entrants.slice(0, 6).map((entry) => entry.source_points), [15, 13, 9, 9, 9, 5]);
});

test("knockout results cannot affect the initial league rank or source statistics", () => {
  const source = structuredClone(fixture);
  const first = source.participants[0], second = source.participants[1];
  source.matches.push({ ...source.matches[0], id: "synthetic-final", phase: "final", group_id: first.group_id,
    category_id: first.category_id, status: "completed", score_entered: true,
    player1_entry_id: first.id, player2_entry_id: second.id, winner_entry_id: second.id,
    is_walkover: true, score_sets: [] });
  assert.deepEqual(createLeagueDraft(source, captured), draft());
});

test("unresolved equal ranks remain visible and retain registration order", () => {
  const source = structuredClone(fixture);
  source.matches = [];
  const league = createLeagueDraft(source, captured);
  const masterId = source.categories.find((category) => category.name === "Erkek Master").id;
  const expected = source.participants.filter((entry) => entry.category_id === masterId)
    .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id));
  const actual = league.categories[0].entrants.slice(0, expected.length);
  assert.deepEqual(actual.map((entry) => entry.id), expected.map((entry) => entry.id));
  assert.ok(actual.every((entry) => entry.source_tied && entry.source_rank === 1 && entry.source_points === 0));
});

test("duplicate players/teams across source tiers keep their best occurrence and preserve partners", () => {
  const source = structuredClone(fixture);
  for (const [higher, lower] of [["Erkek Master", "Erkek Orta"], ["Double Master Erkek", "Double İleri Erkek"]]) {
    const highId = source.categories.find((category) => category.name === higher).id;
    const lowId = source.categories.find((category) => category.name === lower).id;
    const group = source.groups.find((group) => group.category_id === lowId);
    source.participants.filter((entry) => entry.category_id === highId).slice(0, 2).forEach((entry, index) => {
      source.participants.push({ ...entry, id: `${higher}-duplicate-${index}`, category_id: lowId,
        group_id: group.id, player_ids: [...entry.player_ids].reverse() });
    });
  }
  const league = createLeagueDraft(source, captured);
  assert.deepEqual(league.categories.map((category) => category.entrants.length), [32, 22, 4, 12, 10]);
  assert.ok(league.categories.every((category) => category.entrants.every((entry) => !entry.id.includes("duplicate"))));
});

test("source initialization rejects missing and malformed data rather than dropping entrants", () => {
  const mutations = [
    (source) => source.categories.pop(),
    (source) => { source.categories[0].name = "Başka kategori"; },
    (source) => { source.participants[0].group_id = "missing"; },
    (source) => { source.participants[0].player_ids = []; },
    (source) => { source.participants[0].player_ids = ["missing-player"]; },
    (source) => { source.participants[0].id = source.participants[1].id; },
    (source) => { source.participants = source.participants.filter((entry) => entry.category_id !== source.categories[0].id); },
  ];
  for (const mutate of mutations) {
    const source = structuredClone(fixture);
    mutate(source);
    assert.throws(() => createLeagueDraft(source, captured));
  }
  assert.throws(() => createLeagueDraft(fixture, "not-a-date"));
  const oldName = structuredClone(fixture);
  oldName.categories.find((category) => category.name === "Yeni Başlayan Kadın").name = "YB Kadın";
  assert.equal(createLeagueDraft(oldName, captured).categories[1].entrants.length, 22);
});

function checkFixture(category) {
  const ids = new Set(category.entrants.map((entry) => entry.id));
  assert.equal(new Set(category.matches.map((match) => match.id)).size, category.matches.length);
  for (let month = 0; month < 12; month++) {
    const counts = new Map([...ids].map((id) => [id, 0]));
    for (const match of category.matches.filter((match) => match.month_index === month)) {
      assert.notEqual(match.player1_entry_id, match.player2_entry_id);
      for (const id of [match.player1_entry_id, match.player2_entry_id]) {
        assert.ok(ids.has(id));
        assert.equal(leagueEntryGroup(category, id).group_number, match.group_number);
        counts.set(id, counts.get(id) + 1);
      }
    }
    assert.ok([...counts.values()].every((count) => count === 1), "each entrant plays exactly once per month");
  }
  for (let group = 0; group < category.group_sizes.length; group++) {
    const cycleLength = category.group_sizes[group] - 1;
    const pairs = new Set();
    for (let month = 0; month < Math.min(12, cycleLength); month++) {
      for (const match of category.matches.filter((match) => match.month_index === month && match.group_number === group + 1)) {
        const pair = [match.player1_entry_id, match.player2_entry_id].sort().join(":");
        assert.ok(!pairs.has(pair), "opponents cannot repeat before everyone has played");
        pairs.add(pair);
      }
    }
    assert.equal(pairs.size, category.group_sizes[group] * cycleLength / 2);
    for (let month = cycleLength; month < 12; month++) {
      const pairsAt = (index) => category.matches.filter((match) => match.month_index === index && match.group_number === group + 1)
        .map((match) => [match.player1_entry_id, match.player2_entry_id]);
      assert.deepEqual(pairsAt(month), pairsAt(month % cycleLength), "the full cycle repeats deterministically");
    }
  }
}

test("every monthly fixture respects group membership and complete round-robin cycles", () => {
  for (const category of draft().categories) checkFixture(category);
  const men = draft().categories[0];
  const entrants = Array.from({ length: 40 }, (_, index) => ({ ...men.entrants[index % men.entrants.length],
    id: `entry-${index}`, player_ids: [`player-${index}`] }));
  const forty = { ...men, entrants, group_sizes: [10, 10, 10, 10] };
  forty.matches = generateLeagueMatches(forty);
  checkFixture(forty);
  assert.equal(forty.matches.length, 240);
});

test("ranking edits immediately reassign adjacent groups, initial points and fixtures without mutation", () => {
  const category = draft().categories[0];
  const before = structuredClone(category);
  const moved = moveLeagueEntrant(category, 0, 31);
  assert.deepEqual(category, before);
  assert.equal(moved.entrants[31].id, category.entrants[0].id);
  assert.deepEqual(leagueEntryGroup(moved, category.entrants[0].id), { group_number: 4, initial_points: 1 });
  assert.deepEqual(leagueEntryGroup(moved, moved.entrants[0].id), { group_number: 1, initial_points: 4 });
  assert.equal(leagueEntryGroup(moved, "missing"), null);
  checkFixture(moved);
  assert.throws(() => moveLeagueEntrant(category, -1, 0));
  assert.throws(() => moveLeagueEntrant(category, 0, category.entrants.length));
  const invalid = { ...category, group_sizes: [10, 10] };
  assert.deepEqual(moveLeagueEntrant(invalid, 0, 1).matches, []);
  assert.equal(leagueEntryGroup(invalid, category.entrants[31].id), null);
});

test("save preparation validates every category and rebuilds fixtures atomically", () => {
  const categories = draft().categories;
  const edits = structuredClone(categories);
  edits[0].matches = [{ id: "stale-fixture" }];
  edits[0].group_sizes = [10, 10, 6, 6];
  const prepared = prepareLeagueCategories([...edits].reverse());
  assert.deepEqual(prepared.map((category) => category.key), categories.map((category) => category.key));
  assert.equal(prepared[0].matches.length, 192);
  assert.ok(prepared[0].matches.every((match) => match.id !== "stale-fixture"));
  assert.notEqual(prepared[0].entrants[0].player_ids, edits[0].entrants[0].player_ids);
  checkFixture(prepared[0]);
  const invalidCases = [
    { ...categories[0], group_sizes: [8, 8, 8] },
    { ...categories[0], group_sizes: [12, 10, 10] },
    { ...categories[0], entrants: [categories[0].entrants[0], ...categories[0].entrants.slice(0, -1)] },
    { ...categories[0], kind: "doubles" },
  ];
  for (const invalid of invalidCases) {
    assert.ok(validateLeagueCategory(invalid));
    assert.throws(() => generateLeagueMatches(invalid));
    assert.throws(() => prepareLeagueCategories([invalid, ...categories.slice(1)]));
  }
  assert.throws(() => prepareLeagueCategories(categories.slice(0, 4)));
  assert.throws(() => prepareLeagueCategories([categories[0], categories[0], ...categories.slice(2)]));
});

test("season labels are fixed to November 2026 through October 2027", () => {
  assert.equal(leagueMonthLabel(0), "Kasım 2026");
  assert.equal(leagueMonthLabel(1), "Aralık 2026");
  assert.equal(leagueMonthLabel(2), "Ocak 2027");
  assert.equal(leagueMonthLabel(11), "Ekim 2027");
  for (const index of [-1, 12, 0.5, NaN]) assert.throws(() => leagueMonthLabel(index));
});
