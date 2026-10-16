// Capture the public tournament once. Output SQL is reviewed/applied separately
// by the project administrator; this script never writes to the remote database.
import { existsSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const path = fileURLToPath(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url));
      if (existsSync(path)) return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { createLeagueDraft } = await import("../src/lib/league-draft.ts");
const [sqlPath, snapshotPath] = process.argv.slice(2);
if (!sqlPath || !snapshotPath) throw new Error("Usage: node --env-file=.env.local scripts/prepare-league-seed.mjs output.sql snapshot.json");
if ([sqlPath, snapshotPath].some(existsSync)) throw new Error("Output already exists; use fresh paths to preserve the captured snapshot.");
const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (baseUrl !== "https://mwqqkojfboogusqczlxm.supabase.co" || !key) throw new Error("Expected Çamlık Tenis Supabase configuration.");
const tournamentId = "13350264-a44c-4c44-8213-4aef62e3fbb6";
async function read(table, filter) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const url = new URL(`${baseUrl}/rest/v1/${table}`);
    url.searchParams.set("select", "*");
    url.searchParams.set(filter[0], filter[1]);
    url.searchParams.set("order", table === "tournament_entry_players" ? "entry_id,position" : "id");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", "1000");
    const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error(`${table}: ${response.status}`);
    const rows = await response.json();
    result.push(...rows);
    if (rows.length < 1000) return result;
  }
}
const [headers, categories, players, matches, courts] = await Promise.all([
  read("tournaments", ["id", `eq.${tournamentId}`]),
  read("tournament_categories", ["tournament_id", `eq.${tournamentId}`]),
  read("tournament_players", ["tournament_id", `eq.${tournamentId}`]),
  read("tournament_matches", ["tournament_id", `eq.${tournamentId}`]),
  // Court links are irrelevant to the scoreless league snapshot.
  Promise.resolve([]),
]);
if (headers.length !== 1 || !categories.length) throw new Error("Source tournament unavailable.");
const categoryFilter = ["category_id", `in.(${categories.map((category) => category.id).join(",")})`];
const [groups, entries] = await Promise.all([read("tournament_groups", categoryFilter), read("tournament_entries", categoryFilter)]);
if (!entries.length) throw new Error("Source entrants unavailable.");
const entryPlayers = await read("tournament_entry_players", ["entry_id", `in.(${entries.map((entry) => entry.id).join(",")})`]);
const playerNames = new Map(players.map((player) => [player.id, player.display_name]));
const participants = entries.map((entry) => {
  const members = entryPlayers.filter((member) => member.entry_id === entry.id).sort((a, b) => a.position - b.position);
  return { ...entry, player_ids: members.map((member) => member.player_id),
    display_name: members.map((member) => playerNames.get(member.player_id) ?? "").join(" - ") };
});
const tournament = { ...headers[0], categories, groups, players, matches, courts, participants };
const draft = createLeagueDraft(tournament);
const { categories: leagueCategories, ...header } = draft;
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const values = Object.values(header).map(literal).join(",");
const rows = leagueCategories.map((category, index) =>
  `(${literal(draft.id)},${literal(category.key)},${index},${literal(JSON.stringify(category))}::jsonb)`).join(",\n");
const sql = `-- Snapshot captured ${draft.source_captured_at}; fails rather than overwriting an existing draft.\n` +
  `do $league_seed$ begin\n` +
  `if exists (select 1 from public.league_drafts where id=${literal(draft.id)}) then\n` +
  `raise exception 'League draft already exists; preserve manual edits.'; end if;\n` +
  `insert into public.league_drafts (${Object.keys(header).join(",")}) values (${values});\n` +
  `insert into public.league_draft_categories (league_id,category_key,display_order,payload) values\n${rows};\n` +
  `end; $league_seed$;\n`;
writeFileSync(sqlPath, sql);
writeFileSync(snapshotPath, JSON.stringify({ tournament, draft }, null, 2) + "\n");
console.log(JSON.stringify({ source_captured_at: draft.source_captured_at, categories: leagueCategories.map((category) =>
  ({ name: category.name, entrants: category.entrants.length, groups: category.group_sizes, matches: category.matches.length })) }, null, 2));
