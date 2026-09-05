import assert from "node:assert/strict";
import test from "node:test";
import {
  completedTournamentSetWinner,
  formatTournamentMatchScore,
  tournamentEntryPoints,
  validateTournamentScore,
} from "../src/lib/tournament-scoring.ts";

const rules = {
  best_of_sets: 3,
  set_games_to_win: 6,
  set_tiebreak_points: 7,
  deciding_set_type: "match_tiebreak",
  deciding_match_tiebreak_points: 10,
};
const set = (first, second, number = 1, tiebreak = null) => ({
  player1_score: first,
  player2_score: second,
  player1_tiebreak: tiebreak?.[0] ?? null,
  player2_tiebreak: tiebreak?.[1] ?? null,
  set_number: number,
  type: number === 3 ? "match_tiebreak" : "regular",
});
const retirement = (scores, winner = "second") => ({
  score_entered: true,
  status: "completed",
  is_walkover: false,
  is_retired: true,
  player1_entry_id: "first",
  player2_entry_id: "second",
  player1_name: "Birinci Takım",
  player2_name: "İkinci Takım",
  winner_entry_id: winner,
  score_sets: scores,
});

test("4-6, 1-1 (Ret) keeps scores and awards winner 3, retiree 1", () => {
  const scores = [set(4, 6), set(1, 1, 2)];
  assert.deepEqual(validateTournamentScore(rules, scores, { retiredWinnerSide: 2 }), {
    error: null, winnerSide: 2,
  });
  const match = retirement(scores);
  assert.equal(formatTournamentMatchScore(match), "4-6, 1-1 (Ret)");
  assert.equal(tournamentEntryPoints([match], "second"), 3);
  assert.equal(tournamentEntryPoints([match], "first"), 1);
  assert.equal(tournamentEntryPoints([match], "unrelated"), 0);
});

test("retirement winner is independent of the score leader", () => {
  assert.equal(validateTournamentScore(rules, [set(4, 6), set(1, 3, 2)], {
    retiredWinnerSide: 1,
  }).winnerSide, 1);
});

test("retirement can happen during the first set or between sets", () => {
  for (const scores of [[set(0, 0)], [set(3, 2)], [set(6, 4)]]) {
    assert.equal(validateTournamentScore(rules, scores, { retiredWinnerSide: 2 }).error, null);
  }
});

test("partial set tie-break preserves the actual tie-break points", () => {
  const scores = [set(6, 6, 1, [3, 2])];
  assert.equal(validateTournamentScore(rules, scores, { retiredWinnerSide: 2 }).error, null);
  assert.equal(formatTournamentMatchScore(retirement(scores)), "6-6 (3-2) (Ret)");
  assert.equal(completedTournamentSetWinner(rules, scores[0]), null);
});

test("partial deciding match tie-break is accepted and not a won set", () => {
  const scores = [set(6, 4), set(4, 6, 2), set(8, 6, 3)];
  assert.equal(validateTournamentScore(rules, scores, { retiredWinnerSide: 2 }).error, null);
  assert.deepEqual(scores.map(s => completedTournamentSetWinner(rules, s)), [1, 2, null]);
  assert.equal(formatTournamentMatchScore(retirement(scores)), "6-4, 4-6, 8-6 (Ret)");
});

test("unfinished unequal set does not inflate standings set difference", () => {
  assert.equal(completedTournamentSetWinner(rules, set(4, 1, 2)), null);
  assert.equal(completedTournamentSetWinner(rules, set(7, 5)), 1);
  assert.equal(completedTournamentSetWinner(rules, set(6, 7, 1, [4, 7])), 2);
});

test("completed matches and impossible score progressions cannot be retired", () => {
  const invalidScores = [
    [],
    [set(6, 4), set(6, 2, 2)],
    [set(6, 4), set(6, 2, 2), set(0, 0, 3)],
    [set(1, 1), set(2, 2, 2)],
    [set(8, 2)],
    [set(-1, 1)],
    [set(1.5, 2)],
    [set(NaN, 2)],
    [set(6, 6, 1, [7, 3])],
    [set(6, 6, 1, [-1, 3])],
    [set(6, 6, 1, [3, null])],
    [set(1, 1, 3)],
  ];
  for (const scores of invalidScores) {
    assert.ok(validateTournamentScore(rules, scores, { retiredWinnerSide: 2 }).error);
  }
});

test("normal completed matches still validate, incomplete matches need Ret", () => {
  assert.equal(validateTournamentScore(rules, [set(7, 5), set(7, 6, 2, [7, 4])]).winnerSide, 1);
  assert.equal(validateTournamentScore(rules, [set(6, 4), set(4, 6, 2), set(8, 10, 3)]).winnerSide, 2);
  assert.ok(validateTournamentScore(rules, [set(4, 6), set(1, 1, 2)]).error);
  assert.ok(validateTournamentScore(rules, [set(6, 4)]).error);
});

test("normal, walkover, canceled and unscored results retain their points", () => {
  const match = retirement([set(6, 4), set(6, 3, 2)], "first");
  match.is_retired = false;
  assert.equal(formatTournamentMatchScore(match), "6-4, 6-3");
  assert.equal(tournamentEntryPoints([match], "first"), 3);
  assert.equal(tournamentEntryPoints([match], "second"), 1);
  match.is_walkover = true;
  match.score_sets = [];
  assert.equal(tournamentEntryPoints([match], "first"), 3);
  assert.equal(tournamentEntryPoints([match], "second"), 0);
  assert.equal(formatTournamentMatchScore(match), "Birinci Takım (WO)");
  match.status = "canceled";
  assert.equal(tournamentEntryPoints([match], "first"), 0);
  match.score_entered = false;
  assert.equal(formatTournamentMatchScore(match), null);
});

test("retirement uses the tournament's configured set rules", () => {
  const shortRules = { ...rules, best_of_sets: 1, set_games_to_win: 4, deciding_set_type: "regular" };
  assert.equal(validateTournamentScore(shortRules, [set(3, 2)], { retiredWinnerSide: 2 }).error, null);
  assert.ok(validateTournamentScore(shortRules, [set(4, 2)], { retiredWinnerSide: 2 }).error);
  const fiveSets = { ...rules, best_of_sets: 5, deciding_set_type: "regular" };
  assert.equal(validateTournamentScore(fiveSets, [set(6, 4), set(6, 4, 2)], {
    retiredWinnerSide: 2,
  }).winnerSide, 2);
});
