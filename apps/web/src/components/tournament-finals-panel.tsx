import { useMemo, type CSSProperties } from "react";

import {
  FINALS_CARD_HEIGHT,
  FINALS_CARD_WIDTH,
  FINALS_MOBILE_CARD_HEIGHT,
  FINALS_MOBILE_ROW_STEP,
  FINALS_ROW_STEP,
  finalsConnection,
  finalsMatchPosition,
} from "@/lib/tournament-finals";
import { getTournamentFinalsSeeding } from "@/lib/tournament-finals-seeding";
import type { GroupStandings } from "@/lib/tournament-standings";
import type { TournamentWithDetails } from "@/lib/types";

export function TournamentFinalsPanel({
  tournament,
  standings,
  selectedCategoryId,
  onCategoryChange,
  color,
  textColor,
}: {
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
    return { orderedCategories, category, template: category
      ? getTournamentFinalsSeeding(tournament, category, standings) : null };
  }, [tournament, selectedCategoryId, standings]);
  const lastRow = template ? Math.max(...template.matches.map((match) => match.row)) : 0;
  const height = lastRow * FINALS_ROW_STEP + FINALS_CARD_HEIGHT;
  const mobileHeight = lastRow * FINALS_MOBILE_ROW_STEP + FINALS_MOBILE_CARD_HEIGHT;
  const singleMatch = template?.matches.length === 1;
  const connections = template?.matches.flatMap((match) => {
    if (!match.next) return [];
    const target = template.matches.find((item) => item.id === match.next!.matchId);
    return target ? [{
      id: match.id,
      desktop: finalsConnection(match, target, match.next.slot),
      mobile: finalsConnection(match, target, match.next.slot, true),
    }] : [];
  }) ?? [];

  return (
    <section aria-label="Finaller" className="min-w-0 rounded-lg border border-[#ddd7c8] bg-[#fffdf8] p-3 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-lg font-semibold">Finaller</h3>
        <select
          aria-label="Final kategorisi"
          className="input min-w-0 max-w-sm"
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
            İsimler grup sonuçlarından güncellenir. Eleme maçlarına sonuç girildiğinde kazanan üst tura geçer.
            {template.hasPending ? " Sonucu eksik maçlara bağlı yerler beklemede." : ""}
            {template.hasTies ? " Set ve oyun averajıyla çözülemeyen eşitlikler ayrıca belirlenmeli." : ""}
          </p>
          {template.matches.some((match) => match.resultIssue) ? <p className="mt-2 text-xs text-amber-700">
            Kayıtlı eleme maçı güncel eşleşmeyle uyuşmuyor. Üst tura geçiş için maçın turunu ve oyuncularını kontrol edin.
          </p> : null}
          <div className="mt-5 min-w-0 pb-2" role="region" aria-label={`${category.name} final tablosu`}>
          <div
            aria-label={`${category.name} eleme şeması`}
            className={`relative mx-auto h-[var(--finals-mobile-height)] w-full sm:h-[var(--finals-height)] ${singleMatch ? "max-w-lg" : "max-w-5xl"}`}
            style={{ "--finals-mobile-height": `${mobileHeight}px`, "--finals-height": `${height}px` } as CSSProperties}
          >
            {(["mobile", "desktop"] as const).map((layout) => <svg
              aria-hidden="true"
              key={layout}
              className={`pointer-events-none absolute inset-0 h-full w-full ${layout === "mobile" ? "sm:hidden" : "hidden sm:block"}`}
              fill="none"
              preserveAspectRatio="none"
              viewBox={`0 0 100 ${layout === "mobile" ? mobileHeight : height}`}
            >
              {connections.map((connection) => (
                <path key={connection.id} d={connection[layout].path} stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>)}
            {connections.map((connection) => (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-[var(--finals-mobile-top)] -translate-x-1/2 border-x-[4px] border-b-[6px] border-x-transparent sm:top-[var(--finals-top)]"
                key={connection.id}
                style={{
                  left: `${connection.desktop.arrowLeft}%`,
                  "--finals-mobile-top": `${connection.mobile.arrowTop}px`,
                  "--finals-top": `${connection.desktop.arrowTop}px`,
                  borderBottomColor: color,
                } as CSSProperties}
              />
            ))}
            <ol className="m-0 list-none p-0">
              {template.matches.map((match) => {
                const position = finalsMatchPosition(match);
                const isFinal = match.id === "final";
                return (
                  <li
                    aria-label={match.title}
                    className="absolute top-[var(--finals-mobile-top)] flex h-[var(--finals-mobile-card-height)] min-w-0 flex-col overflow-hidden rounded-lg border bg-[var(--theme-panel)] sm:top-[var(--finals-top)] sm:h-[var(--finals-card-height)]"
                    key={match.id}
                    style={{
                      left: singleMatch ? 0 : `${position.left}%`,
                      "--finals-mobile-top": `${finalsMatchPosition(match, true).top}px`,
                      "--finals-top": `${position.top}px`,
                      "--finals-mobile-card-height": `${FINALS_MOBILE_CARD_HEIGHT}px`,
                      "--finals-card-height": `${FINALS_CARD_HEIGHT}px`,
                      width: singleMatch ? "100%" : `${FINALS_CARD_WIDTH}%`,
                      borderColor: isFinal ? color : "var(--theme-border)",
                    } as CSSProperties}
                  >
                    <h5
                      className="flex h-7 shrink-0 items-center justify-center text-[11px] font-semibold sm:text-xs"
                      style={{ backgroundColor: isFinal ? color : "var(--theme-muted-surface)", color: isFinal ? textColor : "var(--theme-text)" }}
                    >
                      {match.title}
                    </h5>
                    <div className="grid min-h-0 flex-1 grid-rows-2 divide-y divide-[var(--theme-border)] sm:grid-cols-2 sm:grid-rows-1 sm:divide-x sm:divide-y-0">
                      {match.entrants.map((entry, index) => (
                        <div className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-1 px-1.5 py-1 text-center sm:gap-1.5 sm:px-3 sm:py-2" key={index}>
                          <span className="text-[11px] font-semibold text-[#68756b]">{entry.seed}</span>
                          {entry.status === "confirmed" ? (
                            <div className={`w-full space-y-1 text-xs font-bold leading-4 sm:text-sm sm:leading-snug ${
                              entry.entryId === match.winnerEntryId ? "text-[var(--theme-score-accent)]" : "text-[var(--theme-text)]"}`}>
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
                    {match.scoreText ? <p className="shrink-0 bg-[var(--theme-score-accent-bg)] px-1 text-center text-[10px] font-bold leading-4 text-[var(--theme-score-accent)] sm:text-xs">
                      {match.scoreText}
                    </p> : null}
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
