import type {
  Tournament,
  TournamentMatch,
  TournamentScoreSet,
  TournamentScoreSetType,
} from "@/lib/types";

type TournamentScoringRules = Pick<
  Tournament,
  | "best_of_sets"
  | "deciding_match_tiebreak_points"
  | "deciding_set_type"
  | "set_games_to_win"
  | "set_tiebreak_points"
>;

export type TournamentScoreValidation =
  | { error: string; winnerSide: null }
  | { error: null; winnerSide: 1 | 2 };

export function setsNeededToWin(bestOfSets: number) {
  return Math.floor(bestOfSets / 2) + 1;
}

export function tournamentSetType(
  rules: TournamentScoringRules,
  setIndex: number,
): TournamentScoreSetType {
  return setIndex === rules.best_of_sets - 1 &&
    rules.deciding_set_type === "match_tiebreak"
    ? "match_tiebreak"
    : "regular";
}

export function isRegularSetTiebreakScore(
  gamesToWin: number,
  player1Score: number | null,
  player2Score: number | null,
) {
  if (player1Score === null || player2Score === null) {
    return false;
  }

  return (
    Math.max(player1Score, player2Score) === gamesToWin + 1 &&
    Math.min(player1Score, player2Score) === gamesToWin
  );
}

function scoreWinner(
  player1Score: number,
  player2Score: number,
  pointsToWin: number,
  requiresTwoPointLead: boolean,
): 1 | 2 | null {
  const highestScore = Math.max(player1Score, player2Score);
  const scoreDifference = Math.abs(player1Score - player2Score);

  if (
    player1Score === player2Score ||
    highestScore < pointsToWin ||
    (requiresTwoPointLead && scoreDifference < 2)
  ) {
    return null;
  }

  return player1Score > player2Score ? 1 : 2;
}

function isUnfinishedSet(
  rules: TournamentScoringRules,
  scoreSet: TournamentScoreSet,
) {
  const { player1_score: first, player2_score: second } = scoreSet;
  const noTiebreak =
    scoreSet.player1_tiebreak === null && scoreSet.player2_tiebreak === null;

  if (scoreSet.type === "match_tiebreak") {
    return noTiebreak && !scoreWinner(
      first, second, rules.deciding_match_tiebreak_points, true,
    );
  }

  const target = rules.set_games_to_win;
  if (first === target && second === target) {
    return noTiebreak || (
      scoreSet.player1_tiebreak !== null &&
      scoreSet.player2_tiebreak !== null &&
      !scoreWinner(
        scoreSet.player1_tiebreak,
        scoreSet.player2_tiebreak,
        rules.set_tiebreak_points,
        true,
      )
    );
  }

  return noTiebreak && (
    Math.max(first, second) < target ||
    (Math.max(first, second) === target && Math.min(first, second) === target - 1)
  );
}

function validateRegularSet(
  rules: TournamentScoringRules,
  scoreSet: TournamentScoreSet,
  setNumber: number,
) {
  const { player1_score: player1Score, player2_score: player2Score } = scoreSet;
  const gamesToWin = rules.set_games_to_win;
  const highestGames = Math.max(player1Score, player2Score);
  const lowestGames = Math.min(player1Score, player2Score);
  const isStandardWin =
    highestGames === gamesToWin && highestGames - lowestGames >= 2;
  const isExtendedWin =
    highestGames === gamesToWin + 1 && lowestGames === gamesToWin - 1;
  const isTiebreakWin = isRegularSetTiebreakScore(
    gamesToWin,
    player1Score,
    player2Score,
  );

  if (!isStandardWin && !isExtendedWin && !isTiebreakWin) {
    return `${setNumber}. set skoru ${gamesToWin} oyunluk set sistemine uygun değil.`;
  }

  if (!isTiebreakWin) {
    if (
      scoreSet.player1_tiebreak !== null ||
      scoreSet.player2_tiebreak !== null
    ) {
      return `${setNumber}. sette tie-break puanı yalnızca ${gamesToWin + 1}-${gamesToWin} biten sette girilebilir.`;
    }

    return null;
  }

  if (
    scoreSet.player1_tiebreak === null ||
    scoreSet.player2_tiebreak === null
  ) {
    return `${setNumber}. set için tie-break puanları girilmeli.`;
  }

  const tiebreakWinner = scoreWinner(
    scoreSet.player1_tiebreak,
    scoreSet.player2_tiebreak,
    rules.set_tiebreak_points,
    true,
  );
  const setWinner = player1Score > player2Score ? 1 : 2;

  if (!tiebreakWinner || tiebreakWinner !== setWinner) {
    return `${setNumber}. set tie-breaki en az ${rules.set_tiebreak_points} puan ve 2 farkla kazanılmalı.`;
  }

  return null;
}

export function validateTournamentScore(
  rules: TournamentScoringRules,
  scoreSets: TournamentScoreSet[],
  options: { retiredWinnerSide?: 1 | 2 } = {},
): TournamentScoreValidation {
  const neededSets = setsNeededToWin(rules.best_of_sets);
  const minimumSets = options.retiredWinnerSide ? 1 : neededSets;

  if (scoreSets.length < minimumSets || scoreSets.length > rules.best_of_sets) {
    return {
      error: `Maç sonucu ${minimumSets} ile ${rules.best_of_sets} set arasında olmalı.`,
      winnerSide: null,
    };
  }

  let player1Sets = 0;
  let player2Sets = 0;

  for (const [setIndex, scoreSet] of scoreSets.entries()) {
    const expectedType = tournamentSetType(rules, setIndex);
    const setNumber = setIndex + 1;

    const scores = [scoreSet.player1_score, scoreSet.player2_score];
    const tiebreakScores = [scoreSet.player1_tiebreak, scoreSet.player2_tiebreak];
    if (
      scores.some((score) => !Number.isInteger(score) || score < 0) ||
      tiebreakScores.some((score) => score !== null && (!Number.isInteger(score) || score < 0)) ||
      (scoreSet.player1_tiebreak === null) !== (scoreSet.player2_tiebreak === null)
    ) {
      return { error: `${setNumber}. set skorları eksik veya geçersiz.`, winnerSide: null };
    }

    if (scoreSet.type !== expectedType) {
      return {
        error: `${setNumber}. set türü turnuva sistemine uygun değil.`,
        winnerSide: null,
      };
    }

    let setWinner: 1 | 2 | null = null;

    // Only the last recorded set may be unfinished when a player retires.
    if (
      options.retiredWinnerSide &&
      setIndex === scoreSets.length - 1 &&
      isUnfinishedSet(rules, scoreSet)
    ) {
      continue;
    }

    if (expectedType === "match_tiebreak") {
      setWinner = scoreWinner(
        scoreSet.player1_score,
        scoreSet.player2_score,
        rules.deciding_match_tiebreak_points,
        true,
      );

      if (!setWinner) {
        return {
          error: `${setNumber}. set maç tie-breaki en az ${rules.deciding_match_tiebreak_points} puan ve 2 farkla kazanılmalı.`,
          winnerSide: null,
        };
      }
    } else {
      const regularSetError = validateRegularSet(rules, scoreSet, setNumber);

      if (regularSetError) {
        return { error: regularSetError, winnerSide: null };
      }

      setWinner =
        scoreSet.player1_score > scoreSet.player2_score ? 1 : 2;
    }

    if (setWinner === 1) {
      player1Sets += 1;
    } else {
      player2Sets += 1;
    }

    const matchAlreadyWon =
      player1Sets === neededSets || player2Sets === neededSets;

    if (matchAlreadyWon && setIndex !== scoreSets.length - 1) {
      return {
        error: "Maç kazanıldıktan sonra fazladan set skoru girilemez.",
        winnerSide: null,
      };
    }
  }

  if (options.retiredWinnerSide) {
    if (player1Sets === neededSets || player2Sets === neededSets) {
      return { error: "Tamamlanmış maçta terk seçilemez; normal sonuç olarak kaydedin.", winnerSide: null };
    }
    return { error: null, winnerSide: options.retiredWinnerSide };
  }

  if (player1Sets !== neededSets && player2Sets !== neededSets) {
    return {
      error: `Kazanan oyuncu/takım ${neededSets} set kazanmış olmalı.`,
      winnerSide: null,
    };
  }

  return {
    error: null,
    winnerSide: player1Sets > player2Sets ? 1 : 2,
  };
}

export function completedTournamentSetWinner(
  rules: TournamentScoringRules,
  scoreSet: TournamentScoreSet,
): 1 | 2 | null {
  if (scoreSet.type === "match_tiebreak") {
    return scoreWinner(
      scoreSet.player1_score,
      scoreSet.player2_score,
      rules.deciding_match_tiebreak_points,
      true,
    );
  }

  return validateRegularSet(rules, scoreSet, scoreSet.set_number) === null
    ? scoreSet.player1_score > scoreSet.player2_score ? 1 : 2
    : null;
}

export function tournamentEntryPoints(
  matches: TournamentMatch[],
  entryId: string,
) {
  return matches.reduce((points, match) => {
    if (
      !match.score_entered ||
      match.status !== "completed" ||
      (match.player1_entry_id !== entryId && match.player2_entry_id !== entryId)
    ) {
      return points;
    }

    if (match.winner_entry_id === entryId) {
      return points + 3;
    }

    return points + (match.is_walkover ? 0 : 1);
  }, 0);
}

export function formatTournamentMatchScore(match: TournamentMatch) {
  if (!match.score_entered) {
    return null;
  }

  if (match.is_walkover) {
    const winnerName =
      match.winner_entry_id === match.player1_entry_id
        ? match.player1_name
        : match.player2_name;
    return `${winnerName} hükmen kazandı`;
  }

  const scoreText = match.score_sets
    .map((scoreSet) => {
      const baseScore = `${scoreSet.player1_score}-${scoreSet.player2_score}`;

      if (
        scoreSet.player1_tiebreak === null ||
        scoreSet.player2_tiebreak === null
      ) {
        return baseScore;
      }

      return `${baseScore} (${scoreSet.player1_tiebreak}-${scoreSet.player2_tiebreak})`;
    })
    .join(", ");

  return match.is_retired ? `${scoreText} (Ret)` : scoreText;
}
