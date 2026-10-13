import { finalsRoundAcceptsMatch, getTournamentFinalsTemplate } from "@/lib/tournament-finals";
import { formatTournamentMatchScore, validateTournamentScore } from "@/lib/tournament-scoring";
import { compareOverallStandings, tournamentStandings, type GroupStandings, type Standing } from "@/lib/tournament-standings";
import type { TournamentCategory, TournamentParticipant, TournamentWithDetails } from "@/lib/types";

export type FinalsEntrant = {
  seed: string;
  status: "confirmed" | "pending" | "tied" | "later_round";
  entryId: string | null;
  names: string[];
};

export function getTournamentFinalsSeeding(
  tournament: TournamentWithDetails,
  category: TournamentCategory,
  standings = tournamentStandings(tournament),
) {
  const template = getTournamentFinalsTemplate(tournament.id, category);
  if (!template) return null;
  const groups = tournament.groups.filter((group) => group.category_id === category.id);
  const groupNames = new Set(groups.map((group) => group.name.trim().toUpperCase()));
  const validGroups = groups.length === category.group_count && groupNames.size === groups.length &&
    (groups.length === 1 || ["A", "B", "C"].slice(0, groups.length).every((name) => groupNames.has(name)));
  const playerNames = new Map(tournament.players.map((player) => [player.id, player.display_name]));
  const entrant = (seed: string, entry?: TournamentParticipant, status?: FinalsEntrant["status"]): FinalsEntrant => ({
    seed, status: entry ? "confirmed" : status ?? (seed ? "pending" : "later_round"), entryId: entry?.id ?? null,
    names: entry ? (entry.player_ids.length
      ? entry.player_ids.map((id) => playerNames.get(id) ?? "Oyuncu adı bekleniyor")
      : [entry.display_name]) : [],
  });
  const fromGroup = (seed: string, group: GroupStandings | undefined, rank: number) => {
    const row = group?.rows.find((row) => {
      const ranks = group.possibleRanks.get(row.entry.id)!;
      return ranks.size === 1 && ranks.has(rank);
    });
    return entrant(seed, row?.entry, group?.complete && group.rows.length >= rank ? "tied" : "pending");
  };
  const interGroup = new Map<string, FinalsEntrant>();
  if (validGroups && category.group_count === 3) {
    for (const [prefix, rank] of [["L", 1], ["İ", 2]] as const) {
      const candidates = groups.map((group) => {
        const table = standings.get(group.id);
        return table?.complete ? table.rows.find((row) => row.rank === rank && !row.tied) : undefined;
      });
      if (candidates.length === 3 && candidates.every((row): row is Standing => !!row)) {
        candidates.sort(compareOverallStandings);
        candidates.forEach((row, i) => {
          const tied = candidates.some((other) => other !== row && compareOverallStandings(row, other) === 0);
          interGroup.set(`${prefix}${i + 1}`, entrant(`${prefix}${i + 1}`, tied ? undefined : row.entry, "tied"));
        });
      } else if (groups.length === 3) {
        // A completed group's seed can already be fixed even if another group
        // is unfinished: e.g. a 5-point second is below all 6/7-point seconds.
        groups.forEach((group, index) => {
          const row = candidates[index];
          if (!row) return;
          let certainAhead = 0, possibleAhead = 0;
          for (const otherGroup of groups.filter((g) => g.id !== group.id)) {
            const table = standings.get(otherGroup.id);
            const possible = table?.rows.filter((r) => table.possibleRanks.get(r.entry.id)!.has(rank)) ?? [];
            if (!possible.length) { possibleAhead++; continue; }
            const ahead = possible.map((other) => table!.complete
              ? { certain: compareOverallStandings(other, row) < 0, possible: compareOverallStandings(other, row) <= 0 }
              : { certain: [...table!.possiblePoints.get(other.entry.id)!].every((points) => points > row.points),
                  possible: [...table!.possiblePoints.get(other.entry.id)!].some((points) => points >= row.points) });
            if (ahead.every((value) => value.certain)) certainAhead++;
            if (ahead.some((value) => value.possible)) possibleAhead++;
          }
          if (certainAhead === possibleAhead) {
            const seed = `${prefix}${certainAhead + 1}`;
            interGroup.set(seed, entrant(seed, row.entry));
          }
        });
      }
    }
  }
  const resolve = (seed: string): FinalsEntrant => {
    if (!seed) return entrant(seed);
    if (!validGroups) return entrant(seed);
    if (/^[Lİ]/.test(seed)) return interGroup.get(seed) ?? entrant(seed, undefined,
      groups.length === 3 && groups.every((g) => standings.get(g.id)?.complete) ? "tied" : "pending");
    const rank = Number(seed.replace(/^[AB]/, ""));
    const group = groups.length === 1 ? groups[0] : groups.find((group) => group.name.trim().toUpperCase() === seed[0]);
    return fromGroup(seed, group ? standings.get(group.id) : undefined, rank);
  };
  const matches = template.matches.map((match) => ({
    ...match, entrants: match.seeds.map(resolve), winnerEntryId: null as string | null,
    resultMatchId: null as string | null, scoreText: "", resultIssue: "",
  }));
  // Resolve upstream rounds first. Recompute from source results every time so
  // corrections, cancellations and deleted scores cannot leave a stale winner.
  for (const match of [...matches].sort((a, b) => b.row - a.row)) {
    const linked = tournament.matches.filter((record) => record.category_id === category.id &&
      record.tournament_id === tournament.id && record.bracket_match_id === match.id && record.status !== "canceled");
    if (linked.length > 1) { match.resultIssue = "Bu eşleşmeye birden fazla maç bağlanmış."; continue; }
    const record = linked[0];
    if (!record) continue;
    match.resultMatchId = record.id;
    const expected = match.entrants.map((entry) => entry.entryId);
    if (!finalsRoundAcceptsMatch(record.phase, match.id) || record.group_id ||
      expected.some((id) => !id) || expected[0] === expected[1] ||
      !expected.includes(record.player1_entry_id) || !expected.includes(record.player2_entry_id) ||
      record.player1_entry_id === record.player2_entry_id) {
      match.resultIssue = "Kayıtlı maçın oyuncuları veya turu güncel tabloyla uyuşmuyor; maçı düzenleyin.";
      continue;
    }
    if (record.phase === "quarterfinal") match.title = match.title.replace("Playoff", "Çeyrek final");
    if (!record.score_entered || record.status !== "completed") continue;
    const winner = match.entrants.find((entry) => entry.entryId === record.winner_entry_id);
    const side = record.winner_entry_id === record.player1_entry_id ? 1 : 2;
    const validated = record.is_walkover ? null : validateTournamentScore(tournament, record.score_sets, {
      retiredWinnerSide: record.is_retired ? side : undefined,
    });
    if (!winner || (validated && (validated.error || validated.winnerSide !== side))) {
      match.resultIssue = "Maç sonucu doğrulanamadı; skoru kontrol edin.";
      continue;
    }
    match.winnerEntryId = winner.entryId;
    const displayRecord = record.player1_entry_id === expected[0] ? record : {
      ...record, score_sets: record.score_sets.map((set) => ({ ...set,
        player1_score: set.player2_score, player2_score: set.player1_score,
        player1_tiebreak: set.player2_tiebreak, player2_tiebreak: set.player1_tiebreak,
      })),
    };
    match.scoreText = formatTournamentMatchScore(displayRecord) ?? "";
    if (match.next) {
      const target = matches.find((item) => item.id === match.next!.matchId);
      if (target) target.entrants[match.next.slot] = { ...winner, seed: "" };
    }
  }
  const placedIds = new Set(matches.flatMap((match) => match.entrants.flatMap((entry) => entry.entryId ? [entry.entryId] : [])));
  // Show guaranteed qualifiers even when a remaining result can change their
  // exact bracket positions (notably the three-group Erkek Orta draw).
  const cutoff = category.group_count === 3 ? 2 : Math.max(...template.matches.flatMap((match) =>
    match.seeds.map((seed) => Number(seed.replace(/^[AB]/, "")) || 0)));
  const qualifiedAwaitingPlacement = (validGroups ? groups : []).flatMap((group) => {
    const table = standings.get(group.id);
    return table?.rows.filter((row) => !placedIds.has(row.entry.id) &&
      [...table.possibleRanks.get(row.entry.id)!].every((rank) => rank <= cutoff))
      .map((row) => entrant(group.name, row.entry)) ?? [];
  });
  const hasPending = matches.some((match) => match.entrants.some((entry) => entry.status === "pending"));
  const hasTies = matches.some((match) => match.entrants.some((entry) => entry.status === "tied"));
  return { matches, notes: template.notes, hasPending, hasTies, qualifiedAwaitingPlacement };
}
