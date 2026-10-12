import { completedTournamentSetWinner, tournamentEntryPoints } from "@/lib/tournament-scoring";
import type { TournamentMatch, TournamentParticipant, TournamentWithDetails } from "@/lib/types";

export type Standing = {
  entry: TournamentParticipant;
  points: number;
  scoredMatches: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  rank: number;
  tied: boolean;
};
export type GroupStandings = {
  rows: Standing[];
  complete: boolean;
  possibleRanks: Map<string, Set<number>>;
  possiblePoints: Map<string, Set<number>>;
};

function scored(match: TournamentMatch) {
  return match.status === "completed" && match.score_entered &&
    [match.player1_entry_id, match.player2_entry_id].includes(match.winner_entry_id ?? "");
}

function totals(tournament: TournamentWithDetails, entries: TournamentParticipant[], matches: TournamentMatch[]) {
  const rows = new Map(entries.map((entry) => [entry.id, {
    entry, points: 0, scoredMatches: 0, setsWon: 0, setsLost: 0,
    gamesWon: 0, gamesLost: 0, rank: 0, tied: false,
  } satisfies Standing]));
  for (const match of matches) {
    if (!scored(match)) continue;
    const first = rows.get(match.player1_entry_id);
    const second = rows.get(match.player2_entry_id);
    if (!first || !second) continue;
    for (const row of [first, second]) {
      row.points += tournamentEntryPoints([match], row.entry.id);
      row.scoredMatches++;
    }
    // A walkover gives points, but does not invent unplayed sets or games.
    if (match.is_walkover) continue;
    for (const set of match.score_sets) {
      const winner = completedTournamentSetWinner(tournament, set);
      if (winner === 1) { first.setsWon++; second.setsLost++; }
      if (winner === 2) { second.setsWon++; first.setsLost++; }
      // Match tie-breaks count as a completed set, never as games.
      // Played games in an unfinished retirement set still count.
      if (set.type !== "match_tiebreak") {
        first.gamesWon += set.player1_score;
        first.gamesLost += set.player2_score;
        second.gamesWon += set.player2_score;
        second.gamesLost += set.player1_score;
      }
    }
  }
  return rows;
}

export function compareOverallStandings(a: Standing, b: Standing) {
  return b.points - a.points ||
    (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost) ||
    (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost);
}

function rankRows(tournament: TournamentWithDetails, rows: Standing[], matches: TournamentMatch[], points?: Map<string, number>) {
  const ordered = rows.map((row) => ({ ...row, points: points?.get(row.entry.id) ?? row.points }));
  ordered.sort((a, b) => b.points - a.points || a.entry.display_order - b.entry.display_order);
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].points === ordered[start].points) end++;
    const bucket = ordered.slice(start, end);
    const ids = new Set(bucket.map((row) => row.entry.id));
    const mutual = matches.filter((match) => ids.has(match.player1_entry_id) && ids.has(match.player2_entry_id));
    const mini = totals(tournament, bucket.map((row) => row.entry), mutual);
    // A hypothetical points tie involving an unplayed mutual match cannot be
    // resolved with today's partial set/game figures.
    const unknownMutualResult = mutual.some((match) => !scored(match));
    const compare = (a: Standing, b: Standing) => {
      if (unknownMutualResult) return 0;
      const x = mini.get(a.entry.id)!;
      const y = mini.get(b.entry.id)!;
      return (y.setsWon - y.setsLost) - (x.setsWon - x.setsLost) ||
        (y.gamesWon - y.gamesLost) - (x.gamesWon - x.gamesLost);
    };
    bucket.sort((a, b) => compare(a, b) || a.entry.display_order - b.entry.display_order);
    for (let i = 0; i < bucket.length; i++) {
      const previousTied = i > 0 && compare(bucket[i - 1], bucket[i]) === 0;
      bucket[i].rank = previousTied ? bucket[i - 1].rank : start + i + 1;
      bucket[i].tied = previousTied || (i + 1 < bucket.length && compare(bucket[i], bucket[i + 1]) === 0);
    }
    ordered.splice(start, bucket.length, ...bucket);
    start = end;
  }
  return ordered;
}

export function tournamentGroupStandings(tournament: TournamentWithDetails, groupId: string): GroupStandings {
  const entries = tournament.participants.filter((entry) => entry.group_id === groupId);
  const ids = new Set(entries.map((entry) => entry.id));
  const matches = tournament.matches.filter((match) => match.phase === "group" &&
    match.group_id === groupId && match.status !== "canceled" &&
    ids.has(match.player1_entry_id) && ids.has(match.player2_entry_id));
  const pairCounts = new Map<string, number>();
  for (const match of matches) {
    const key = [match.player1_entry_id, match.player2_entry_id].sort().join(":");
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  // A missing/deleted fixture must not silently certify an unfinished group.
  const fullSchedule = entries.length >= 2 && pairCounts.size === entries.length * (entries.length - 1) / 2 &&
    [...pairCounts.values()].every((count) => count === 1) && matches.every((m) => m.player1_entry_id !== m.player2_entry_id);
  const pending = matches.filter((match) => !scored(match));
  const rows = rankRows(tournament, [...totals(tournament, entries, matches).values()], matches);
  const possibleRanks = new Map(entries.map((entry) => [entry.id, new Set<number>()]));
  const possiblePoints = new Map(entries.map((entry) => [entry.id, new Set<number>()]));
  const recordRanks = (ranking: Standing[]) => {
    for (const row of ranking) {
      possiblePoints.get(row.entry.id)!.add(row.points);
      const tiedCount = ranking.filter((other) => other.rank === row.rank).length;
      for (let rank = row.rank; rank < row.rank + tiedCount; rank++) possibleRanks.get(row.entry.id)!.add(rank);
    }
  };
  if (!fullSchedule || pending.length > 4) {
    // Bounded, conservative fallback for early-stage or malformed schedules.
    for (const ranks of possibleRanks.values()) for (let rank = 1; rank <= entries.length; rank++) ranks.add(rank);
    for (const row of rows) for (let extra = 0; extra <= 3 * Math.max(0, entries.length - 1 - row.scoredMatches); extra++) {
      possiblePoints.get(row.entry.id)!.add(row.points + extra);
    }
  } else {
    const points = new Map(rows.map((row) => [row.entry.id, row.points]));
    const explore = (index: number) => {
      if (index === pending.length) { recordRanks(rankRows(tournament, rows, matches, points)); return; }
      const match = pending[index];
      const a = points.get(match.player1_entry_id)!;
      const b = points.get(match.player2_entry_id)!;
      // Both played/retired and walkover results are possible until entered.
      for (const [x, y] of [[3, 1], [1, 3], [3, 0], [0, 3]]) {
        points.set(match.player1_entry_id, a + x);
        points.set(match.player2_entry_id, b + y);
        explore(index + 1);
      }
      points.set(match.player1_entry_id, a);
      points.set(match.player2_entry_id, b);
    };
    explore(0);
  }
  return { rows, complete: fullSchedule && pending.length === 0, possibleRanks, possiblePoints };
}

export function tournamentStandings(tournament: TournamentWithDetails) {
  return new Map(tournament.groups.map((group) => [group.id, tournamentGroupStandings(tournament, group.id)]));
}
