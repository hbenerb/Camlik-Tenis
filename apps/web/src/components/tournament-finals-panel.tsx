import { LockKeyhole } from "lucide-react";
import { useMemo } from "react";

import {
  FINALS_CARD_HEIGHT,
  FINALS_CARD_WIDTH,
  FINALS_ROW_STEP,
  finalsConnection,
  finalsMatchPosition,
} from "@/lib/tournament-finals";
import { getTournamentFinalsSeeding } from "@/lib/tournament-finals-seeding";
import type { GroupStandings } from "@/lib/tournament-standings";
import type { TournamentWithDetails } from "@/lib/types";

export function TournamentFinalsPanel({
  canViewFinals,
  tournament,
  standings,
  selectedCategoryId,
  onCategoryChange,
  color,
  textColor,
}: {
  canViewFinals: boolean;
  tournament: TournamentWithDetails;
  standings?: Map<string, GroupStandings>;
  selectedCategoryId: string;
  onCategoryChange: (categoryId: string) => void;
  color: string;
  textColor: string;
}) {
  const { orderedCategories, category, template } = useMemo(() => {
    const orderedCategories = [...tournament.categories].sort((a, b) => a.display_order - b.display_order);
    const category = orderedCategories.find((item) => item.id === selectedCategoryId) ?? orderedCategories[0];
    return { orderedCategories, category, template: canViewFinals && category
      ? getTournamentFinalsSeeding(tournament, category, standings) : null };
  }, [canViewFinals, tournament, selectedCategoryId, standings]);
  // Guard content as well as navigation, including a role change on this tab.
  if (!canViewFinals) return null;
  const height = template
    ? Math.max(...template.matches.map((match) => match.row)) * FINALS_ROW_STEP + FINALS_CARD_HEIGHT
    : 0;
  const singleMatch = template?.matches.length === 1;
  const connections = template?.matches.flatMap((match) => {
    if (!match.next) return [];
    const target = template.matches.find((item) => item.id === match.next!.matchId);
    return target ? [{ id: match.id, ...finalsConnection(match, target, match.next.slot) }] : [];
  }) ?? [];

  return (
    <section aria-label="Finaller" className="rounded-lg border border-[#ddd7c8] bg-[#fffdf8] p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Finaller</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-[#68756b]">
            <LockKeyhole aria-hidden="true" size={13} />
            Yalnızca adminler
          </p>
        </div>
        <select
          aria-label="Final kategorisi"
          className="input max-w-sm"
          onChange={(event) => onCategoryChange(event.target.value)}
          value={category?.id ?? ""}
        >
          {orderedCategories.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </div>

      {template && category ? (
        <>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-md bg-[#f1eee5] px-3 py-2.5 sm:px-4">
            <h4 className="text-sm font-semibold">{category.name}</h4>
            <span className="shrink-0 text-xs text-[#68756b]">{template.matches.length} maç</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#68756b]">
            İsimler grup sonuçlarından güncellenir. Playoff ve yarı final sonuçlarına bağlı üst tur yerleri henüz boş.
            {template.hasPending ? " Sonucu eksik maçlara bağlı yerler beklemede." : ""}
            {template.hasTies ? " Set ve oyun averajıyla çözülemeyen eşitlikler ayrıca belirlenmeli." : ""}
          </p>
          {!singleMatch ? <p className="mt-2 text-xs text-[#68756b] sm:hidden">Şemayı yatay kaydırabilirsiniz.</p> : null}

          <div className="mt-5 overflow-x-auto pb-2" tabIndex={0} role="region" aria-label={`${category.name} final tablosu`}>
          <div aria-label={`${category.name} eleme şeması`} className={`relative mx-auto w-full ${singleMatch ? "max-w-lg" : "min-w-[640px] max-w-5xl"}`} style={{ height }}>
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
              fill="none"
              preserveAspectRatio="none"
              viewBox={`0 0 100 ${height}`}
            >
              {connections.map((connection) => (
                <path key={connection.id} d={connection.path} stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            {connections.map((connection) => (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -translate-x-1/2 border-x-[4px] border-b-[6px] border-x-transparent"
                key={connection.id}
                style={{ left: `${connection.arrowLeft}%`, top: connection.arrowTop, borderBottomColor: color }}
              />
            ))}
            <ol className="m-0 list-none p-0">
              {template.matches.map((match) => {
                const position = finalsMatchPosition(match);
                const isFinal = match.id === "final";
                return (
                  <li
                    aria-label={match.title}
                    className="absolute overflow-hidden rounded-lg border bg-[var(--theme-panel)]"
                    key={match.id}
                    style={{
                      left: singleMatch ? 0 : `${position.left}%`,
                      top: position.top,
                      width: singleMatch ? "100%" : `${FINALS_CARD_WIDTH}%`,
                      height: FINALS_CARD_HEIGHT,
                      borderColor: isFinal ? color : "var(--theme-border)",
                    }}
                  >
                    <h5
                      className="flex h-7 items-center justify-center text-[11px] font-semibold sm:text-xs"
                      style={{ backgroundColor: isFinal ? color : "var(--theme-muted-surface)", color: isFinal ? textColor : "var(--theme-text)" }}
                    >
                      {match.title}
                    </h5>
                    <div className="grid h-[128px] grid-cols-2 divide-x divide-[var(--theme-border)]">
                      {match.entrants.map((entry, index) => (
                        <div className="flex min-w-0 flex-col items-center justify-center gap-1.5 px-2 py-2 text-center sm:px-3" key={index}>
                          <span className="text-[11px] font-semibold text-[#68756b]">{entry.seed}</span>
                          {entry.status === "confirmed" ? (
                            <div className="space-y-1 text-sm font-bold leading-snug text-[var(--theme-text)]">
                              {entry.names.map((name, i) => <p className="break-words" key={i}>{name}</p>)}
                            </div>
                          ) : entry.status === "later_round" ? (
                            <>
                              <span className="sr-only">Üst tur sonucu bekleniyor</span>
                              <span aria-hidden="true" className="w-full max-w-24 border-b border-dashed border-[var(--theme-border-strong)]" />
                            </>
                          ) : (
                            <span className="text-xs leading-relaxed text-[#68756b]">{entry.status === "tied" ? "Eşitlik çözülmedi" : "Sonuç bekleniyor"}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          </div>
          {template.qualifiedAwaitingPlacement.length > 0 ? (
            <div className="mt-4 rounded-md bg-[var(--theme-muted-surface)] p-3 text-sm">
              <p className="font-semibold">Üst tur kesin · Eşleşme yeri bekleniyor</p>
              <ul className="mt-2 grid list-none gap-2 sm:grid-cols-2">
                {template.qualifiedAwaitingPlacement.map((entry) => (
                  <li key={entry.entryId} className="leading-relaxed">{entry.names.join(" / ")}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {template.notes.length > 0 ? (
            <div className="mx-auto mt-5 max-w-2xl space-y-1 border-t border-[#ddd7c8] pt-3 text-xs leading-relaxed text-[#68756b]">
              {template.notes.map((note) => <p key={note}>{note}</p>)}
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-5 rounded-md border border-dashed border-[#cfc8b8] p-6 text-center text-sm text-[#68756b]">
          {category ? "Bu kategori için final şeması henüz tanımlanmadı." : "Henüz kategori eklenmedi."}
        </p>
      )}
    </section>
  );
}
