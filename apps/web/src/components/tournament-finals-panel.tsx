import { LockKeyhole } from "lucide-react";

import {
  FINALS_CARD_HEIGHT,
  FINALS_CARD_WIDTH,
  FINALS_ROW_STEP,
  finalsConnection,
  finalsMatchPosition,
  getTournamentFinalsTemplate,
} from "@/lib/tournament-finals";
import type { TournamentCategory } from "@/lib/types";

export function TournamentFinalsPanel({
  canViewFinals,
  tournamentId,
  categories,
  selectedCategoryId,
  onCategoryChange,
  color,
  textColor,
}: {
  canViewFinals: boolean;
  tournamentId: string;
  categories: TournamentCategory[];
  selectedCategoryId: string;
  onCategoryChange: (categoryId: string) => void;
  color: string;
  textColor: string;
}) {
  // Guard the content as well as the parent navigation, including role changes
  // while this tab is open. This preview has no data endpoint or write action.
  if (!canViewFinals) return null;

  const orderedCategories = [...categories].sort((a, b) => a.display_order - b.display_order);
  const category = orderedCategories.find((item) => item.id === selectedCategoryId) ?? orderedCategories[0];
  const template = category ? getTournamentFinalsTemplate(tournamentId, category) : null;
  const height = template
    ? Math.max(...template.matches.map((match) => match.row)) * FINALS_ROW_STEP + FINALS_CARD_HEIGHT
    : 0;
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
            Yalnızca adminler · Ön izleme
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
          <p className="mt-3 text-xs text-[#68756b]">Oyuncular ve skorlar henüz atanmadı.</p>

          <div aria-label={`${category.name} eleme şeması`} className="relative mx-auto mt-5 w-full max-w-2xl" style={{ height }}>
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
                      left: `${position.left}%`,
                      top: position.top,
                      width: `${FINALS_CARD_WIDTH}%`,
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
                    <div className="grid h-[64px] grid-cols-2 divide-x divide-[var(--theme-border)]">
                      {match.seeds.map((seed, index) => (
                        <div className="flex min-w-0 flex-col items-center px-2 py-2 sm:px-4" key={index}>
                          <span aria-hidden="true" className="h-4 text-[10px] font-semibold text-[#68756b] sm:text-xs">{seed}</span>
                          <span className="sr-only">{seed ? `${seed}: ` : ""}Oyuncu ve skor henüz atanmadı</span>
                          <span aria-hidden="true" className="mt-3 w-full max-w-24 border-b border-dashed border-[var(--theme-border-strong)]" />
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
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
