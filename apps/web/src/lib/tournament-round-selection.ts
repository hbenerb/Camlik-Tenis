import { finalsRoundAcceptsMatch, finalsRoundForMatch, TOURNAMENT_ROUND_LABELS } from "@/lib/tournament-finals";
import { getTournamentFinalsSeeding } from "@/lib/tournament-finals-seeding";
import type { TournamentMatch, TournamentMatchPhase, TournamentWithDetails } from "@/lib/types";

// Old non-group bookings were all called "final". Suggest a link only when the
// exact two entry IDs identify one resolved slot; persist it only on admin save.
export function inferTournamentRoundSelection(tournament: TournamentWithDetails, record: TournamentMatch) {
  if (record.phase !== "final" || record.bracket_match_id || record.group_id || record.round_label) {
    return { phase: record.phase, bracketId: record.bracket_match_id ?? "" };
  }
  const category = tournament.categories.find((item) => item.id === record.category_id);
  const slots = category ? getTournamentFinalsSeeding(tournament, category)?.matches.filter((match) =>
    match.entrants.every((entry) => entry.entryId && [record.player1_entry_id, record.player2_entry_id].includes(entry.entryId))) ?? [] : [];
  return slots.length === 1 ? {phase:finalsRoundForMatch(slots[0].id),bracketId:slots[0].id}
    : {phase:record.phase,bracketId:""};
}

export function tournamentRoundMatches(tournament: TournamentWithDetails, categoryId: string, phase: TournamentMatchPhase) {
  const category = tournament.categories.find((item) => item.id === categoryId);
  return category ? getTournamentFinalsSeeding(tournament, category)?.matches.filter((match) =>
    finalsRoundAcceptsMatch(phase, match.id)) ?? [] : [];
}

export function validateTournamentRoundSelection(
  tournament: TournamentWithDetails, categoryId: string, phase: TournamentMatchPhase,
  bracketId: string, playerIds: string[], editingId?: string,
) {
  if (phase === "group") return bracketId ? "Grup maçı eleme tablosuna bağlanamaz." : null;
  const category = tournament.categories.find((item) => item.id === categoryId);
  const table = category && getTournamentFinalsSeeding(tournament, category);
  if (!table) return bracketId ? "Bu kategori için eleme tablosu tanımlı değil." : null;
  const slot = table.matches.find((match) => match.id === bracketId && finalsRoundAcceptsMatch(phase, match.id));
  if (!slot) return `${TOURNAMENT_ROUND_LABELS[phase]} için tablodaki eşleşmeyi seçin.`;
  if (tournament.matches.some((match) => match.id !== editingId && match.category_id === categoryId &&
    match.bracket_match_id === bracketId && match.status !== "canceled")) return "Bu tablo eşleşmesi için zaten bir maç kayıtlı.";
  if (slot.entrants.some((entry) => !entry.entryId)) return "Bu eşleşmenin oyuncuları önceki sonuçlardan henüz kesinleşmedi.";
  const expected = slot.entrants.map((entry) => entry.entryId);
  if (playerIds.length !== 2 || new Set(playerIds).size !== 2 || playerIds.some((id) => !expected.includes(id))) {
    return "Oyuncular seçilen tablo eşleşmesiyle aynı olmalı.";
  }
  return null;
}
