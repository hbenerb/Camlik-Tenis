"use client";

import {
  addDays,
  addWeeks,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
} from "date-fns";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  ListFilter,
  Search,
  Trophy,
  X,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { FormEvent } from "react";

import type { Court, TournamentWithDetails } from "@/lib/types";

type TournamentScheduleScope = "all" | "day" | "week";
type TournamentDetailTab = "schedule" | "players";
type TournamentAdminMode = "create" | "edit";
const tournamentDurationOptions = [30, 45, 60, 75, 90, 105, 120, 150, 180];

export type TournamentCategoryDraft = {
  id?: string;
  client_id: string;
  name: string;
  group_count: number;
  group_size: number;
  players_text: string;
};

export type TournamentDraft = {
  name: string;
  match_duration_minutes: number;
  group_stage_start_date: string;
  group_stage_end_date: string;
  finals_start_date: string;
  finals_end_date: string;
  is_active: boolean;
  court_ids: string[];
  categories: TournamentCategoryDraft[];
};

function dateInputValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function localDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function addCalendarDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function newCategoryDraft(index: number): TournamentCategoryDraft {
  return {
    client_id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    name: "",
    group_count: 1,
    group_size: 4,
    players_text: "",
  };
}

function newTournamentDraft(courts: Court[]): TournamentDraft {
  const today = new Date();
  const groupEnd = addCalendarDays(today, 28);
  const finalsStart = addCalendarDays(groupEnd, 1);

  return {
    name: "",
    match_duration_minutes: 60,
    group_stage_start_date: dateInputValue(today),
    group_stage_end_date: dateInputValue(groupEnd),
    finals_start_date: dateInputValue(finalsStart),
    finals_end_date: dateInputValue(addCalendarDays(finalsStart, 7)),
    is_active: false,
    court_ids: courts.filter((court) => court.is_active).map((court) => court.id),
    categories: [newCategoryDraft(0)],
  };
}

function tournamentDraftFromDetails(
  tournament: TournamentWithDetails,
): TournamentDraft {
  const groupOrder = new Map(
    tournament.groups.map((group) => [group.id, group.display_order]),
  );

  return {
    name: tournament.name,
    match_duration_minutes: tournament.match_duration_minutes,
    group_stage_start_date: tournament.group_stage_start_date,
    group_stage_end_date: tournament.group_stage_end_date,
    finals_start_date: tournament.finals_start_date,
    finals_end_date: tournament.finals_end_date,
    is_active: tournament.is_active,
    court_ids: tournament.courts.map((court) => court.court_id),
    categories: [...tournament.categories]
      .sort((first, second) => first.display_order - second.display_order)
      .map((category) => ({
        id: category.id,
        client_id: category.id,
        name: category.name,
        group_count: category.group_count,
        group_size: category.group_size,
        players_text: tournament.participants
          .filter((participant) => participant.category_id === category.id)
          .sort((first, second) => {
            const groupDifference =
              (groupOrder.get(first.group_id ?? "") ?? Number.MAX_SAFE_INTEGER) -
              (groupOrder.get(second.group_id ?? "") ?? Number.MAX_SAFE_INTEGER);

            return groupDifference || first.display_order - second.display_order;
          })
          .map((participant) => participant.display_name)
          .join("\n"),
      })),
  };
}

function normalizeSearch(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

function formatTournamentDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(localDate(value));
}

function formatMatchDay(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function formatWeekRange(date: Date) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
  const formatter = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
  });

  return `${formatter.format(weekStart)} – ${formatter.format(weekEnd)}`;
}

function groupLabel(index: number) {
  if (index < 26) {
    return String.fromCharCode(65 + index);
  }

  return String(index + 1);
}

function defaultTournamentDate(
  tournament: TournamentWithDetails,
  currentTime: Date,
) {
  const currentDay = startOfDay(currentTime);
  const tournamentStart = startOfDay(localDate(tournament.group_stage_start_date));
  const tournamentEnd = startOfDay(localDate(tournament.finals_end_date));
  const scheduledMatches = tournament.matches
    .filter((match) => match.status !== "canceled")
    .sort(
      (first, second) =>
        new Date(first.starts_at).getTime() - new Date(second.starts_at).getTime(),
    );

  if (currentDay < tournamentStart) {
    return startOfDay(
      scheduledMatches[0]
        ? new Date(scheduledMatches[0].starts_at)
        : tournamentStart,
    );
  }

  if (currentDay <= tournamentEnd) {
    return currentDay;
  }

  return startOfDay(
    scheduledMatches.at(-1)
      ? new Date(scheduledMatches.at(-1)!.starts_at)
      : tournamentEnd,
  );
}

export function TournamentDetailPanel({
  currentTime,
  selectedTournamentId,
  tournaments,
}: {
  currentTime: Date;
  selectedTournamentId: string | null;
  tournaments: TournamentWithDetails[];
}) {
  const selectedTournament =
    tournaments.find((tournament) => tournament.id === selectedTournamentId) ??
    tournaments.find((tournament) => tournament.is_active) ??
    null;
  const initialAnchorDate = selectedTournament
    ? defaultTournamentDate(selectedTournament, currentTime)
    : startOfDay(currentTime);
  const firstCategoryId =
    selectedTournament?.categories
      .slice()
      .sort((first, second) => first.display_order - second.display_order)[0]
      ?.id ?? "";
  const [detailTab, setDetailTab] = useState<TournamentDetailTab>("schedule");
  const [scope, setScope] = useState<TournamentScheduleScope>("week");
  const [anchorDate, setAnchorDate] = useState(initialAnchorDate);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [playersCategoryId, setPlayersCategoryId] = useState(firstCategoryId);
  const playerListId = useId();
  const defaultAnchorTimestamp = selectedTournament
    ? defaultTournamentDate(selectedTournament, currentTime).getTime()
    : startOfDay(currentTime).getTime();

  const participantOptions = useMemo(() => {
    if (!selectedTournament) {
      return [];
    }

    return Array.from(
      new Set(
        selectedTournament.participants.map((participant) => participant.display_name),
      ),
    ).sort((first, second) => first.localeCompare(second, "tr"));
  }, [selectedTournament]);

  const availableGroups = useMemo(() => {
    if (!selectedTournament || categoryFilter === "all") {
      return [];
    }

    return selectedTournament.groups
      .filter((group) => group.category_id === categoryFilter)
      .sort((first, second) => first.display_order - second.display_order);
  }, [categoryFilter, selectedTournament]);

  const visibleMatches = useMemo(() => {
    if (!selectedTournament) {
      return [];
    }

    const search = normalizeSearch(playerSearch);
    const weekStart = startOfWeek(anchorDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(anchorDate, { weekStartsOn: 1 });

    return selectedTournament.matches
      .filter((match) => match.status !== "canceled")
      .filter((match) => {
        const startsAt = new Date(match.starts_at);

        if (scope === "day" && !isSameDay(startsAt, anchorDate)) {
          return false;
        }

        if (scope === "week" && (startsAt < weekStart || startsAt > weekEnd)) {
          return false;
        }

        if (categoryFilter !== "all" && match.category_id !== categoryFilter) {
          return false;
        }

        if (groupFilter !== "all" && match.group_id !== groupFilter) {
          return false;
        }

        return (
          !search ||
          normalizeSearch(`${match.player1_name} ${match.player2_name}`).includes(
            search,
          )
        );
      })
      .sort(
        (first, second) =>
          new Date(first.starts_at).getTime() - new Date(second.starts_at).getTime(),
      );
  }, [
    anchorDate,
    categoryFilter,
    groupFilter,
    playerSearch,
    scope,
    selectedTournament,
  ]);

  const matchesByDay = useMemo(() => {
    const grouped = new Map<string, typeof visibleMatches>();

    for (const match of visibleMatches) {
      const key = dateInputValue(new Date(match.starts_at));
      const dayMatches = grouped.get(key) ?? [];
      dayMatches.push(match);
      grouped.set(key, dayMatches);
    }

    return [...grouped.entries()];
  }, [visibleMatches]);

  if (!selectedTournament) {
    return (
      <div className="rounded-lg border border-[#ddd7c8] bg-[#fffdf8] p-8 text-center">
        <Trophy className="mx-auto text-[#8b8f86]" size={30} />
        <h2 className="mt-3 text-lg font-semibold">Turnuva bulunamadı</h2>
      </div>
    );
  }

  const tournamentGroups = selectedTournament.groups;
  const tournamentStart = startOfDay(localDate(selectedTournament.group_stage_start_date));
  const tournamentEnd = startOfDay(localDate(selectedTournament.finals_end_date));
  const previousAnchor =
    scope === "day" ? addDays(anchorDate, -1) : addWeeks(anchorDate, -1);
  const nextAnchor = scope === "day" ? addDays(anchorDate, 1) : addWeeks(anchorDate, 1);
  const canMovePrevious =
    scope === "day"
      ? startOfDay(previousAnchor) >= tournamentStart
      : endOfWeek(previousAnchor, { weekStartsOn: 1 }) >= tournamentStart;
  const canMoveNext =
    scope === "day"
      ? startOfDay(nextAnchor) <= tournamentEnd
      : startOfWeek(nextAnchor, { weekStartsOn: 1 }) <= tournamentEnd;
  const activeFilterCount =
    Number(Boolean(normalizeSearch(playerSearch))) +
    Number(categoryFilter !== "all") +
    Number(groupFilter !== "all");
  const playerCategory =
    selectedTournament.categories.find(
      (category) => category.id === playersCategoryId,
    ) ?? selectedTournament.categories[0] ?? null;
  const playerCategoryGroups = playerCategory
    ? selectedTournament.groups
        .filter((group) => group.category_id === playerCategory.id)
        .sort((first, second) => first.display_order - second.display_order)
    : [];

  function openSchedule() {
    setDetailTab("schedule");
    setScope("week");
    setAnchorDate(new Date(defaultAnchorTimestamp));
  }

  function changeCategoryFilter(categoryId: string) {
    setCategoryFilter(categoryId);

    if (categoryId === "all") {
      setGroupFilter("all");
      return;
    }

    const firstGroup = tournamentGroups
      .filter((group) => group.category_id === categoryId)
      .sort((first, second) => first.display_order - second.display_order)[0];
    setGroupFilter(firstGroup?.id ?? "all");
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="overflow-hidden rounded-lg border border-[#ddd7c8] bg-[#fffdf8]">
        <div className="bg-[#17211c] px-4 py-5 text-white sm:px-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#b9d8ae]">
            <Trophy size={18} />
            Turnuva
          </div>
          <h2 className="mt-2 text-2xl font-semibold">{selectedTournament.name}</h2>
          <p className="mt-2 text-sm text-[#d5ded7]">
            Grup maçları {formatTournamentDate(selectedTournament.group_stage_start_date)}–
            {formatTournamentDate(selectedTournament.group_stage_end_date)} · Finaller{" "}
            {formatTournamentDate(selectedTournament.finals_start_date)}–
            {formatTournamentDate(selectedTournament.finals_end_date)}
          </p>
        </div>

        <div className="grid grid-cols-2 p-2 sm:px-6">
          <button
            className={`h-11 rounded-md text-sm font-semibold ${
              detailTab === "schedule"
                ? "bg-[#237000] text-white"
                : "text-[#546257] hover:bg-[#eee9dd]"
            }`}
            onClick={openSchedule}
            type="button"
          >
            Takvim
          </button>
          <button
            className={`h-11 rounded-md text-sm font-semibold ${
              detailTab === "players"
                ? "bg-[#237000] text-white"
                : "text-[#546257] hover:bg-[#eee9dd]"
            }`}
            onClick={() => setDetailTab("players")}
            type="button"
          >
            Oyuncular
          </button>
        </div>
      </section>

      {detailTab === "schedule" ? (
        <section className="rounded-lg border border-[#ddd7c8] bg-[#fffdf8] p-4 sm:p-6">
          <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
            <div className="grid grid-cols-3 rounded-md border border-[#cfc8b8] bg-white p-1">
              {(
                [
                  ["all", "Tümü"],
                  ["day", "Günlük"],
                  ["week", "Haftalık"],
                ] as const
              ).map(([value, label]) => (
                <button
                  className={`h-10 rounded px-2 text-xs font-semibold sm:text-sm ${
                    scope === value
                      ? "bg-[#237000] text-white"
                      : "text-[#546257] hover:bg-[#eee9dd]"
                  }`}
                  key={value}
                  onClick={() => {
                    setScope(value);
                    if (value !== "all") {
                      setAnchorDate(new Date(defaultAnchorTimestamp));
                    }
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              aria-label="Filtreleme"
              aria-expanded={filtersOpen}
              className={`relative grid size-11 place-items-center rounded-md border ${
                filtersOpen || activeFilterCount
                  ? "border-[#237000] bg-[#f0f8ef] text-[#237000]"
                  : "border-[#cfc8b8] bg-white text-[#34443a]"
              }`}
              onClick={() => setFiltersOpen((current) => !current)}
              title="Filtreleme"
              type="button"
            >
              <ListFilter size={19} />
              {activeFilterCount ? (
                <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#237000] text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>

          {scope !== "all" ? (
            <div className="mt-3 grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2">
              <button
                aria-label={scope === "day" ? "Önceki gün" : "Önceki hafta"}
                className="grid size-11 place-items-center rounded-md border border-[#cfc8b8] bg-white disabled:opacity-40"
                disabled={!canMovePrevious}
                onClick={() => setAnchorDate(previousAnchor)}
                type="button"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="grid min-w-0 place-items-center rounded-md border border-[#cfc8b8] bg-white px-2 text-center text-sm font-semibold capitalize">
                {scope === "day"
                  ? formatMatchDay(anchorDate)
                  : formatWeekRange(anchorDate)}
              </div>
              <button
                aria-label={scope === "day" ? "Sonraki gün" : "Sonraki hafta"}
                className="grid size-11 place-items-center rounded-md border border-[#cfc8b8] bg-white disabled:opacity-40"
                disabled={!canMoveNext}
                onClick={() => setAnchorDate(nextAnchor)}
                type="button"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          ) : null}

          {filtersOpen ? (
            <div className="mt-3 grid gap-3 rounded-md border border-[#eee7db] bg-white p-3 md:grid-cols-3">
              <label className="relative block">
                <span className="sr-only">Kişi veya takım</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68756b]"
                  size={17}
                />
                <input
                  className="input pl-10"
                  list={playerListId}
                  onChange={(event) => setPlayerSearch(event.target.value)}
                  placeholder="Oyuncu veya takım yazın"
                  value={playerSearch}
                />
                <datalist id={playerListId}>
                  {participantOptions.map((participant) => (
                    <option key={participant} value={participant} />
                  ))}
                </datalist>
              </label>
              <select
                aria-label="Kategori filtresi"
                className="input"
                onChange={(event) => changeCategoryFilter(event.target.value)}
                value={categoryFilter}
              >
                <option value="all">Kategori seçin</option>
                {selectedTournament.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {categoryFilter !== "all" ? (
                <select
                  aria-label="Grup filtresi"
                  className="input"
                  onChange={(event) => setGroupFilter(event.target.value)}
                  value={groupFilter}
                >
                  {availableGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      Grup {group.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="grid min-h-11 place-items-center rounded-md border border-dashed border-[#cfc8b8] px-3 text-center text-xs text-[#68756b]">
                  Grup seçmek için önce kategori seçin
                </div>
              )}
              {activeFilterCount ? (
                <button
                  className="secondary-button md:col-span-3 md:justify-self-end"
                  onClick={() => {
                    setPlayerSearch("");
                    setCategoryFilter("all");
                    setGroupFilter("all");
                  }}
                  type="button"
                >
                  Filtreleri temizle
                </button>
              ) : null}
            </div>
          ) : null}

          <p className="mt-3 text-xs text-[#68756b]">
            {visibleMatches.length} maç gösteriliyor
          </p>

          {matchesByDay.length ? (
            <div className="mt-4 space-y-4">
              {matchesByDay.map(([date, matches]) => (
                <div
                  className="overflow-hidden rounded-md border border-[#ddd7c8]"
                  key={date}
                >
                  <div className="sticky top-0 z-10 bg-[#237000] px-4 py-2.5 text-white">
                    <h4 className="font-semibold capitalize text-white">
                      {formatMatchDay(localDate(date))}
                    </h4>
                  </div>
                  <div className="divide-y divide-[#eee7db] bg-white">
                    {matches.map((match) => {
                      const category = selectedTournament.categories.find(
                        (item) => item.id === match.category_id,
                      );
                      const group = selectedTournament.groups.find(
                        (item) => item.id === match.group_id,
                      );
                      const isPast = new Date(match.ends_at) < currentTime;

                      return (
                        <article
                          className={`grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 px-3 py-3 transition sm:grid-cols-[78px_minmax(0,1fr)] sm:gap-4 sm:px-4 ${
                            isPast ? "opacity-45" : ""
                          }`}
                          key={match.id}
                        >
                          <time
                            className={`text-xl font-bold tabular-nums sm:text-2xl ${
                              isPast ? "text-[#68756b]" : "text-[#2563eb]"
                            }`}
                          >
                            {format(new Date(match.starts_at), "HH:mm")}
                          </time>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold sm:text-base">
                              {match.player1_name}
                              <span className="px-2 text-xs font-normal text-[#8b8f86]">
                                vs
                              </span>
                              {match.player2_name}
                            </p>
                            <div className="mt-1 flex min-w-0 items-center justify-between gap-3 text-xs text-[#68756b]">
                              <p className="truncate">
                                {category?.name ?? "Kategori"}
                                {group ? ` · Grup ${group.name}` : ""}
                                {match.phase === "final" ? " · Final" : ""}
                              </p>
                              <p className="shrink-0 font-medium">
                                {match.courts?.name ?? "Kort belirlenecek"}
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-[#cfc8b8] p-8 text-center">
              <Trophy className="mx-auto text-[#8b8f86]" size={26} />
              <p className="mt-3 font-semibold">Bu seçimde maç yok</p>
              <p className="mt-1 text-sm text-[#68756b]">
                Tarihi veya filtreleri değiştirebilirsiniz.
              </p>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-lg border border-[#ddd7c8] bg-[#fffdf8] p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Oyuncular</h3>
              <p className="mt-1 text-sm text-[#68756b]">
                Kategori seçerek grup dağılımını görüntüleyin.
              </p>
            </div>
            <select
              aria-label="Oyuncu kategorisi"
              className="input max-w-sm"
              onChange={(event) => setPlayersCategoryId(event.target.value)}
              value={playerCategory?.id ?? ""}
            >
              {selectedTournament.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {playerCategory ? (
            <div className="mt-5">
              <div className="rounded-md bg-[#f1eee5] px-4 py-3">
                <p className="font-semibold">{playerCategory.name}</p>
                <p className="mt-1 text-xs text-[#68756b]">
                  {playerCategory.group_count} grup · {playerCategory.group_size} kişilik/takımlık
                </p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {playerCategoryGroups.map((group) => (
                  <div
                    className="rounded-md border border-[#ddd7c8] bg-white p-4"
                    key={group.id}
                  >
                    <p className="text-xs font-bold uppercase tracking-wide text-[#237000]">
                      Grup {group.name}
                    </p>
                    <ul className="mt-3 space-y-2 text-sm">
                      {selectedTournament.participants
                        .filter((participant) => participant.group_id === group.id)
                        .sort(
                          (first, second) =>
                            first.display_order - second.display_order,
                        )
                        .map((participant) => (
                          <li
                            className="rounded bg-[#f6f1e7] px-3 py-2"
                            key={participant.id}
                          >
                            {participant.display_name}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-[#cfc8b8] p-8 text-center text-sm text-[#68756b]">
              Oyuncu kategorisi bulunamadı.
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function TournamentAdminPanel({
  courts,
  isSaving,
  onCreateTournament,
  onSelectedTournamentChange,
  onUpdateTournament,
  selectedTournamentId,
  tournaments,
}: {
  courts: Court[];
  isSaving: boolean;
  onCreateTournament: (draft: TournamentDraft) => Promise<boolean>;
  onSelectedTournamentChange: (tournamentId: string) => void;
  onUpdateTournament: (
    tournamentId: string,
    draft: TournamentDraft,
  ) => Promise<boolean>;
  selectedTournamentId: string | null;
  tournaments: TournamentWithDetails[];
}) {
  const selectedTournament =
    tournaments.find((tournament) => tournament.id === selectedTournamentId) ??
    tournaments[0] ??
    null;
  const [mode, setMode] = useState<TournamentAdminMode>(
    selectedTournament ? "edit" : "create",
  );
  const [draft, setDraft] = useState<TournamentDraft>(() =>
    selectedTournament
      ? tournamentDraftFromDetails(selectedTournament)
      : newTournamentDraft(courts),
  );

  async function submitTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const didSave =
      mode === "edit" && selectedTournament
        ? await onUpdateTournament(selectedTournament.id, draft)
        : await onCreateTournament(draft);

    if (!didSave) {
      return;
    }

    if (mode === "create") {
      setMode("edit");
    }
  }

  function updateCategory(
    categoryId: string,
    fields: Partial<TournamentCategoryDraft>,
  ) {
    setDraft((current) => ({
      ...current,
      categories: current.categories.map((category) =>
        category.client_id === categoryId ? { ...category, ...fields } : category,
      ),
    }));
  }

  function startCreate() {
    setMode("create");
    setDraft(newTournamentDraft(courts));
  }

  function startEdit() {
    setMode("edit");
    if (selectedTournament) {
      setDraft(tournamentDraftFromDetails(selectedTournament));
    }
  }

  return (
    <section className="rounded-lg border border-[#ddd7c8] bg-[#fffdf8] p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Turnuva yönetimi</h2>
        <p className="mt-1 text-sm text-[#68756b]">
          Yeni turnuva oluşturun veya mevcut turnuvanın ayarlarını düzenleyin.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 rounded-md border border-[#cfc8b8] bg-white p-1">
        <button
          className={`h-10 rounded px-2 text-xs font-semibold sm:text-sm ${
            mode === "create"
              ? "bg-[#237000] text-white"
              : "text-[#546257] hover:bg-[#eee9dd]"
          }`}
          onClick={startCreate}
          type="button"
        >
          Turnuva oluştur
        </button>
        <button
          className={`h-10 rounded px-2 text-xs font-semibold sm:text-sm ${
            mode === "edit"
              ? "bg-[#237000] text-white"
              : "text-[#546257] hover:bg-[#eee9dd]"
          }`}
          disabled={!tournaments.length}
          onClick={startEdit}
          type="button"
        >
          Varolanı düzenle
        </button>
      </div>

      {mode === "edit" ? (
        <label className="mt-4 grid gap-2 text-sm font-medium text-[#34443a]">
          Düzenlenecek turnuva
          <select
            className="input"
            onChange={(event) => {
              const tournament = tournaments.find(
                (item) => item.id === event.target.value,
              );

              onSelectedTournamentChange(event.target.value);
              if (tournament) {
                setDraft(tournamentDraftFromDetails(tournament));
              }
            }}
            value={selectedTournament?.id ?? ""}
          >
            {tournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name} · {tournament.is_active ? "Aktif" : "Pasif"}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <form className="mt-5 space-y-5" onSubmit={submitTournament}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-[#34443a] md:col-span-2">
            Turnuva adı
            <input
              className="input"
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Örn. 29 Ekim"
              required
              value={draft.name}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-[#34443a] md:col-span-2">
            Maç süresi
            <select
              className="input"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  match_duration_minutes: Number(event.target.value),
                }))
              }
              value={draft.match_duration_minutes}
            >
              {tournamentDurationOptions.map((duration) => (
                <option key={duration} value={duration}>
                  {duration === 60
                    ? "1 saat"
                    : duration === 90
                      ? "1 saat 30 dakika"
                      : duration === 120
                        ? "2 saat"
                        : duration === 150
                          ? "2 saat 30 dakika"
                          : duration === 180
                            ? "3 saat"
                            : `${duration} dakika`}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-[#68756b]">
              Maç başlangıç saati korunur; bitiş bu süreye göre otomatik hesaplanır.
            </span>
          </label>
          <TournamentDateField
            label="Grup maçları başlangıç"
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                group_stage_start_date: value,
              }))
            }
            value={draft.group_stage_start_date}
          />
          <TournamentDateField
            label="Grup maçları bitiş"
            min={draft.group_stage_start_date}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                group_stage_end_date: value,
              }))
            }
            value={draft.group_stage_end_date}
          />
          <TournamentDateField
            label="Finaller başlangıç"
            min={draft.group_stage_end_date}
            onChange={(value) =>
              setDraft((current) => ({ ...current, finals_start_date: value }))
            }
            value={draft.finals_start_date}
          />
          <TournamentDateField
            label="Finaller bitiş"
            min={draft.finals_start_date}
            onChange={(value) =>
              setDraft((current) => ({ ...current, finals_end_date: value }))
            }
            value={draft.finals_end_date}
          />
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-[#34443a]">
            Kullanılabilecek kortlar
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {courts.map((court) => {
              const isSelected = draft.court_ids.includes(court.id);

              return (
                <label
                  className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm ${
                    isSelected
                      ? "border-[#237000] bg-[#eaf5e6] text-[#237000]"
                      : "border-[#cfc8b8] bg-white"
                  }`}
                  key={court.id}
                >
                  <input
                    checked={isSelected}
                    className="size-4 accent-[#237000]"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        court_ids: event.target.checked
                          ? [...current.court_ids, court.id]
                          : current.court_ids.filter((id) => id !== court.id),
                      }))
                    }
                    type="checkbox"
                  />
                  {court.name}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Kategoriler ve oyuncular</h3>
              <p className="mt-1 text-xs text-[#68756b]">
                Her satıra bir oyuncu veya çift takım yazın.
              </p>
            </div>
            <button
              className="secondary-button shrink-0"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  categories: [
                    ...current.categories,
                    newCategoryDraft(current.categories.length),
                  ],
                }))
              }
              type="button"
            >
              <CirclePlus size={16} />
              Kategori
            </button>
          </div>

          {draft.categories.map((category, index) => {
            const playerCount = category.players_text
              .split("\n")
              .map((player) => player.trim())
              .filter(Boolean).length;
            const hasScheduledMatches = Boolean(
              category.id &&
                selectedTournament?.matches.some(
                  (match) => match.category_id === category.id,
                ),
            );

            return (
              <div
                className="rounded-md border border-[#ddd7c8] bg-white p-4"
                key={category.client_id}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Kategori {index + 1}</p>
                  {draft.categories.length > 1 ? (
                    <button
                      aria-label="Kategoriyi kaldır"
                      className="grid size-8 place-items-center rounded-md text-[#a0543b] hover:bg-[#f6f1e7] disabled:opacity-40"
                      disabled={hasScheduledMatches}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          categories: current.categories.filter(
                            (currentCategory) =>
                              currentCategory.client_id !== category.client_id,
                          ),
                        }))
                      }
                      title={
                        hasScheduledMatches
                          ? "Maçı bulunan kategori kaldırılamaz"
                          : "Kategoriyi kaldır"
                      }
                      type="button"
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-2 text-sm font-medium text-[#34443a] sm:col-span-3">
                    Kategori adı
                    <input
                      className="input"
                      onChange={(event) =>
                        updateCategory(category.client_id, {
                          name: event.target.value,
                        })
                      }
                      required
                      value={category.name}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#34443a]">
                    Grup sayısı
                    <input
                      className="input"
                      max={12}
                      min={1}
                      onChange={(event) =>
                        updateCategory(category.client_id, {
                          group_count: Number(event.target.value),
                        })
                      }
                      required
                      type="number"
                      value={category.group_count}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#34443a]">
                    Gruptaki kişi/takım
                    <input
                      className="input"
                      max={32}
                      min={2}
                      onChange={(event) =>
                        updateCategory(category.client_id, {
                          group_size: Number(event.target.value),
                        })
                      }
                      required
                      type="number"
                      value={category.group_size}
                    />
                  </label>
                  <div className="rounded-md bg-[#f1eee5] px-3 py-2 text-sm text-[#546257]">
                    <span className="block text-xs">Kapasite</span>
                    <span className="mt-1 block font-semibold text-[#17211c]">
                      {category.group_count * category.group_size} · {playerCount} eklendi
                    </span>
                  </div>
                  <label className="grid gap-2 text-sm font-medium text-[#34443a] sm:col-span-3">
                    Oyuncular / takımlar
                    <textarea
                      className="min-h-36 w-full rounded-md border border-[#cfc8b8] bg-white p-3 text-sm outline-none focus:border-[#237000]"
                      onChange={(event) =>
                        updateCategory(category.client_id, {
                          players_text: event.target.value,
                        })
                      }
                      required
                      value={category.players_text}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <label
          className={`tournament-active-toggle flex items-start gap-3 rounded-md border p-4 text-sm ${
            draft.is_active ? "is-active" : "border-[#ddd7c8] bg-white"
          }`}
        >
          <input
            checked={draft.is_active}
            className="mt-0.5 size-4 accent-[#237000]"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                is_active: event.target.checked,
              }))
            }
            type="checkbox"
          />
          <span>
            <span className="flex items-center gap-2 font-semibold">
              {draft.is_active ? <Check size={16} /> : null}
              {draft.is_active ? "Aktif" : "Pasif"}
            </span>
            <span className="mt-1 block text-xs opacity-80">
              Aktif turnuva kullanıcıların ana ekranında isimli kısayol olarak görünür.
            </span>
          </span>
        </label>

        <button
          className="primary-button w-full sm:w-auto"
          disabled={isSaving}
          type="submit"
        >
          <Trophy size={17} />
          {isSaving
            ? "Kaydediliyor"
            : mode === "edit"
              ? "Değişiklikleri kaydet"
              : "Turnuvayı oluştur"}
        </button>
      </form>
    </section>
  );
}

function TournamentDateField({
  label,
  min,
  onChange,
  value,
}: {
  label: string;
  min?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-[#34443a]">
      {label}
      <input
        className="input reservation-date-input"
        min={min}
        onChange={(event) => onChange(event.target.value)}
        required
        type="date"
        value={value}
      />
    </label>
  );
}

export function buildTournamentGroupNames(groupCount: number) {
  return Array.from({ length: groupCount }, (_, index) => groupLabel(index));
}
