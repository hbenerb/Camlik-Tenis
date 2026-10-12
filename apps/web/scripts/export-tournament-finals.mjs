// Generate the PDF's data with the exact same ranking/seeding code as the app.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
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
const { getTournamentFinalsSeeding } = await import("../src/lib/tournament-finals-seeding.ts");
const { tournamentStandings } = await import("../src/lib/tournament-standings.ts");
const [input, output, matchUpdatesFile] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node export-tournament-finals.mjs snapshot.json output.json [match-updates.json]");
const tournament = JSON.parse(readFileSync(input, "utf8"));
// Retain the original pending-results snapshot for regression tests, while
// allowing an audited, narrowly scoped result update in a subsequent bulletin.
if (matchUpdatesFile) {
  const updates = JSON.parse(readFileSync(matchUpdatesFile, "utf8"));
  const byId = new Map(updates.map((match) => [match.id, match]));
  if (byId.size !== updates.length) throw new Error("Duplicate match update");
  for (const update of updates) {
    const original = tournament.matches.find((match) => match.id === update.id);
    if (!original || original.category_id !== update.category_id || original.group_id !== update.group_id) {
      throw new Error(`Match update does not belong to this snapshot: ${update.id}`);
    }
  }
  tournament.matches = tournament.matches.map((match) => byId.has(match.id) ? { ...match, ...byId.get(match.id) } : match);
}
const standings = tournamentStandings(tournament);
const report = {
  tournamentId: tournament.id,
  rules: { equalPoints: "mutual-set-difference-then-game-difference", crossGroup: "points-overall-sets-overall-games", matchTiebreakGames: "excluded" },
  categories: [...tournament.categories].sort((a,b)=>a.display_order-b.display_order).map((category) => {
    const seeded = getTournamentFinalsSeeding(tournament, category, standings);
    if (!seeded) throw new Error(`Unapproved bracket: ${category.name}`);
    return {
      name: category.name, ...seeded,
      seeds: Object.fromEntries(seeded.matches.flatMap((m)=>m.entrants.filter((e)=>e.seed).map((e)=>[e.seed,e]))),
      standings: tournament.groups.filter((g)=>g.category_id===category.id).map((g)=>({
        group:g.name, complete:standings.get(g.id).complete,
        rows:standings.get(g.id).rows.map(({entry,...row})=>({...row,entryId:entry.id,name:entry.display_name})),
      })),
    };
  }),
};
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report.categories.map((c)=>({name:c.name,seeds:c.seeds,awaiting:c.qualifiedAwaitingPlacement})),null,2));
