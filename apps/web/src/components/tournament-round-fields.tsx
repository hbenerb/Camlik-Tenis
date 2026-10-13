import { TOURNAMENT_ROUND_LABELS } from "@/lib/tournament-finals";
import { useMemo } from "react";
import { tournamentRoundMatches } from "@/lib/tournament-round-selection";
import type { TournamentMatchPhase, TournamentWithDetails } from "@/lib/types";

export type TournamentRoundSelection = {
  phase: TournamentMatchPhase; groupId: string; bracketId: string;
  playerNames?: [string, string];
};

export function TournamentRoundFields({ tournament, categoryId, groupId, phase, bracketId, editingId, onChange }: {
  tournament: TournamentWithDetails; categoryId: string; groupId: string;
  phase: TournamentMatchPhase; bracketId: string; editingId?: string;
  onChange: (selection: TournamentRoundSelection) => void;
}) {
  const groups = tournament.groups.filter((group) => group.category_id === categoryId)
    .sort((a, b) => a.display_order - b.display_order);
  const matches = useMemo(() => tournamentRoundMatches(tournament, categoryId, phase), [tournament, categoryId, phase]);
  function selectRound(nextPhase: TournamentMatchPhase, nextGroup: string, nextBracket: string) {
    const match = tournamentRoundMatches(tournament, categoryId, nextPhase).find((item) => item.id === nextBracket);
    const names = match?.entrants.map((entry) => tournament.participants.find((p) => p.id === entry.entryId)?.display_name);
    onChange({ phase: nextPhase, groupId: nextGroup, bracketId: nextBracket,
      playerNames: names?.length === 2 && names.every(Boolean) ? names as [string, string] : undefined });
  }
  return <div className="grid min-w-0 gap-3">
    <label className="grid min-w-0 gap-1 text-sm font-medium">
      Grup / Tur
      <select aria-label="Grup / Tur" className="input min-w-0" value={phase === "group" ? groupId : `@${phase}`}
        onChange={(event) => {
          const value = event.target.value;
          if (!value.startsWith("@")) { selectRound("group", value, ""); return; }
          const nextPhase = value.slice(1) as TournamentMatchPhase;
          const options = tournamentRoundMatches(tournament, categoryId, nextPhase);
          selectRound(nextPhase, "", options.length === 1 ? options[0].id : "");
        }}>
        {groups.map((group) => <option key={group.id} value={group.id}>Grup {group.name}</option>)}
        {(["playoff", "quarterfinal", "semifinal", "final"] as const).map((round) =>
          <option key={round} value={`@${round}`}>{TOURNAMENT_ROUND_LABELS[round]}</option>)}
      </select>
    </label>
    {phase !== "group" ? matches.length ? <label className="grid min-w-0 gap-1 text-sm font-medium">
      Tablodaki eşleşme
      <select aria-label="Tablodaki eşleşme" className="input min-w-0" required value={bracketId}
        onChange={(event) => selectRound(phase, "", event.target.value)}>
        <option value="">Eşleşme seçin</option>
        {matches.map((match) => {
          const occupied = tournament.matches.some((record) => record.id !== editingId && record.status !== "canceled" &&
            record.category_id === categoryId && record.bracket_match_id === match.id);
          return <option key={match.id} value={match.id} disabled={occupied}>
            {phase === "quarterfinal" ? match.title.replace("Playoff", "Çeyrek Final") : match.title}
            {" · "}{match.entrants.map((entry) => entry.names.join(" / ") || "Sonuç bekleniyor").join(" — ")}
            {occupied ? " (kayıtlı)" : ""}
          </option>;
        })}
      </select>
      <span className="text-xs font-normal text-[#68756b]">Oyuncular tablodan alınır; girilen sonuç kazananı üst tura taşır.</span>
    </label> : <p className="text-xs text-[#68756b]">Bu kategori için bu turda tanımlı bir tablo eşleşmesi yok.</p> : null}
  </div>;
}
