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
  Pencil,
  Search,
  Trophy,
  X,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { FormEvent } from "react";

import {
  formatTournamentMatchScore,
  tournamentEntryPoints,
} from "@/lib/tournament-scoring";
import type { Court, TournamentMatch, TournamentWithDetails } from "@/lib/types";
import type { TournamentDecidingSetType } from "@/lib/types";

type TournamentScheduleScope = "all" | "day" | "week";
type TournamentDetailTab = "schedule" | "players";
type TournamentAdminMode = "create" | "edit";
const tournamentDurationOptions = [30, 45, 60, 75, 90, 105, 120, 150, 180];
export const DEFAULT_TOURNAMENT_COLOR = "#237000";
const tournamentWeekdayFormatter = new Intl.DateTimeFormat("tr-TR", {
  weekday: "short",
});
const tournamentShortDateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
});

export function getTournamentTextColor(color: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);

  if (!match) {
    return "#ffffff";
  }

  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const perceivedBrightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return perceivedBrightness > 165 ? "#17211c" : "#ffffff";
}

export type TournamentPlayerDraft = {
  id?: string;
  client_id: string;
  display_name: string;
};

export type TournamentEntryDraft = {
  id?: string;
  client_id: string;
  player1_client_id: string;
  player2_client_id: string;
};

export type TournamentGroupDraft = {
  id?: string;
  client_id: string;
  name: string;
  entries: TournamentEntryDraft[];
};

export type TournamentCategoryDraft = {
  id?: string;
  client_id: string;
  name: string;
  group_size: number;
  groups: TournamentGroupDraft[];
};

export type TournamentDraft = {
  name: string;
  color: string;
  match_duration_minutes: number;
  best_of_sets: number;
  set_games_to_win: number;
  set_tiebreak_points: number;
  deciding_set_type: TournamentDecidingSetType;
  deciding_match_tiebreak_points: number;
  group_stage_start_date: string;
  group_stage_end_date: string;
  finals_start_date: string;
  finals_end_date: string;
  is_active: boolean;
  court_ids: string[];
  players: TournamentPlayerDraft[];
  categories: TournamentCategoryDraft[];
};

function clientId(prefix: string, index: number) {
  return `${prefix}-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
}

function newGroupDraft(index: number): TournamentGroupDraft {
  return {
    client_id: clientId("group", index),
    entries: [],
    name: groupLabel(index),
  };
}

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
    client_id: clientId("category", index),
    groups: [newGroupDraft(0)],
    group_size: 4,
    name: "",
  };
}

function newTournamentDraft(courts: Court[]): TournamentDraft {
  const today = new Date();
  const groupEnd = addCalendarDays(today, 28);
  const finalsStart = addCalendarDays(groupEnd, 1);

  return {
    name: "",
    color: DEFAULT_TOURNAMENT_COLOR,
    match_duration_minutes: 60,
    best_of_sets: 3,
    set_games_to_win: 6,
    set_tiebreak_points: 7,
    deciding_set_type: "match_tiebreak",
    deciding_match_tiebreak_points: 10,
    group_stage_start_date: dateInputValue(today),
    group_stage_end_date: dateInputValue(groupEnd),
    finals_start_date: dateInputValue(finalsStart),
    finals_end_date: dateInputValue(addCalendarDays(finalsStart, 7)),
    is_active: false,
    court_ids: courts.filter((court) => court.is_active).map((court) => court.id),
    players: [],
    categories: [newCategoryDraft(0)],
  };
}

function tournamentDraftFromDetails(
  tournament: TournamentWithDetails,
): TournamentDraft {
  return {
    name: tournament.name,
    color: tournament.color || DEFAULT_TOURNAMENT_COLOR,
    match_duration_minutes: tournament.match_duration_minutes,
    best_of_sets: tournament.best_of_sets,
    set_games_to_win: tournament.set_games_to_win,
    set_tiebreak_points: tournament.set_tiebreak_points,
    deciding_set_type: tournament.deciding_set_type,
    deciding_match_tiebreak_points:
      tournament.deciding_match_tiebreak_points,
    group_stage_start_date: tournament.group_stage_start_date,
    group_stage_end_date: tournament.group_stage_end_date,
    finals_start_date: tournament.finals_start_date,
    finals_end_date: tournament.finals_end_date,
    is_active: tournament.is_active,
    court_ids: tournament.courts.map((court) => court.court_id),
    players: tournament.players
      .slice()
      .sort((first, second) => first.display_order - second.display_order)
      .map((player) => ({
        client_id: player.id,
        display_name: player.display_name,
        id: player.id,
      })),
    categories: [...tournament.categories]
      .sort((first, second) => first.display_order - second.display_order)
      .map((category) => ({
        id: category.id,
        client_id: category.id,
        groups: tournament.groups
          .filter((group) => group.category_id === category.id)
          .sort((first, second) => first.display_order - second.display_order)
          .map((group) => ({
            client_id: group.id,
            entries: tournament.participants
              .filter((participant) => participant.group_id === group.id)
              .sort(
                (first, second) =>
                  first.display_order - second.display_order,
              )
              .map((participant) => ({
                client_id: participant.id,
                id: participant.id,
                player1_client_id: participant.player_ids[0] ?? "",
                player2_client_id: participant.player_ids[1] ?? "",
              })),
            id: group.id,
            name: group.name,
          })),
        name: category.name,
        group_size: category.group_size,
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
  onClose,
  onEditMatch,
  selectedTournamentId,
  tournaments,
}: {
  currentTime: Date;
  onClose: () => void;
  onEditMatch?: (match: TournamentMatch) => void;
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
  const [playerFilterId, setPlayerFilterId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [playersCategoryId, setPlayersCategoryId] = useState(firstCategoryId);
  const playerListId = useId();
  const defaultAnchorTimestamp = selectedTournament
    ? defaultTournamentDate(selectedTournament, currentTime).getTime()
    : startOfDay(currentTime).getTime();
  const categoriesById = useMemo(
    () =>
      new Map(
        selectedTournament?.categories.map((category) => [category.id, category]) ??
          [],
      ),
    [selectedTournament],
  );
  const groupsById = useMemo(
    () =>
      new Map(
        selectedTournament?.groups.map((group) => [group.id, group]) ?? [],
      ),
    [selectedTournament],
  );
  const participantsById = useMemo(
    () =>
      new Map(
        selectedTournament?.participants.map((participant) => [
          participant.id,
          participant,
        ]) ?? [],
      ),
    [selectedTournament],
  );
  const participantStandingsById = useMemo(() => {
    if (!selectedTournament) {
      return new Map<
        string,
        { points: number; scoredMatches: number; setsWon: number; setsLost: number }
      >();
    }

    const standings = new Map(
      selectedTournament.participants.map((participant) => [
        participant.id,
        { points: 0, scoredMatches: 0, setsWon: 0, setsLost: 0 },
      ]),
    );

    for (const match of selectedTournament.matches) {
      if (
        match.phase !== "group" ||
        match.status !== "completed" ||
        !match.score_entered
      ) {
        continue;
      }

      for (const entryId of [match.player1_entry_id, match.player2_entry_id]) {
        const standing = standings.get(entryId);

        if (!standing) {
          continue;
        }

        standing.scoredMatches += 1;
        standing.points += tournamentEntryPoints([match], entryId);
      }

      const firstStanding = standings.get(match.player1_entry_id);
      const secondStanding = standings.get(match.player2_entry_id);

      if (!firstStanding || !secondStanding) {
        continue;
      }

      for (const scoreSet of match.score_sets) {
        if (scoreSet.player1_score > scoreSet.player2_score) {
          firstStanding.setsWon += 1;
          secondStanding.setsLost += 1;
        } else if (scoreSet.player2_score > scoreSet.player1_score) {
          secondStanding.setsWon += 1;
          firstStanding.setsLost += 1;
        }
      }
    }

    return standings;
  }, [selectedTournament]);

  const participantOptions = useMemo(() => {
    if (!selectedTournament) {
      return [];
    }

    return Array.from(
      new Set(
        selectedTournament.players.map((player) => player.display_name),
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

        if (playerFilterId) {
          const firstEntry = selectedTournament.participants.find(
            (participant) => participant.id === match.player1_entry_id,
          );
          const secondEntry = selectedTournament.participants.find(
            (participant) => participant.id === match.player2_entry_id,
          );

          return Boolean(
            firstEntry?.player_ids.includes(playerFilterId) ||
              secondEntry?.player_ids.includes(playerFilterId),
          );
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
    playerFilterId,
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

  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(anchorDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [anchorDate]);
  const weekTimeSlots = useMemo(
    () =>
      Array.from(
        new Set(
          visibleMatches.map((match) =>
            format(new Date(match.starts_at), "HH:mm"),
          ),
        ),
      ).sort((first, second) => first.localeCompare(second)),
    [visibleMatches],
  );
  const weekMatchesBySlot = useMemo(() => {
    const grouped = new Map<string, TournamentMatch[]>();

    for (const match of visibleMatches) {
      const startsAt = new Date(match.starts_at);
      const key = `${dateInputValue(startsAt)}-${format(startsAt, "HH:mm")}`;
      const slotMatches = grouped.get(key) ?? [];
      slotMatches.push(match);
      grouped.set(key, slotMatches);
    }

    return grouped;
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

  function showPlayerMatches(playerId: string, playerName: string) {
    setPlayerFilterId(playerId);
    setPlayerSearch(playerName);
    setCategoryFilter("all");
    setGroupFilter("all");
    setScope("all");
    setFiltersOpen(true);
    setDetailTab("schedule");
  }

  const tournamentColor =
    selectedTournament.color || DEFAULT_TOURNAMENT_COLOR;
  const tournamentTextColor = getTournamentTextColor(tournamentColor);
  const tournamentCardScoreColor =
    tournamentTextColor === "#ffffff" ? "#b8efc9" : "#237000";
  const tournamentAccentStyle = {
    backgroundColor: tournamentColor,
    color: tournamentTextColor,
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="overflow-hidden rounded-lg border border-[#ddd7c8] bg-[#fffdf8]">
        <div
          className="relative px-4 py-5 pr-16 sm:px-6 sm:pr-20"
          style={tournamentAccentStyle}
        >
          <button
            aria-label="Turnuva ekranından çık"
            className="absolute right-3 top-3 grid size-10 place-items-center rounded-md border border-current bg-white/10 text-current transition hover:bg-white/20 sm:right-4 sm:top-4"
            onClick={onClose}
            title="Turnuva ekranından çık"
            type="button"
          >
            <X size={21} />
          </button>
          <h2 className="text-2xl font-semibold">{selectedTournament.name}</h2>
          <div className="mt-2 grid gap-1 text-sm text-current opacity-80">
            <p>
              Grup maçları: {formatTournamentDate(selectedTournament.group_stage_start_date)}–
              {formatTournamentDate(selectedTournament.group_stage_end_date)}
            </p>
            <p>
              Finaller: {formatTournamentDate(selectedTournament.finals_start_date)}–
              {formatTournamentDate(selectedTournament.finals_end_date)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 p-2 sm:px-6">
          <button
            className={`h-11 rounded-md text-sm font-semibold transition ${
              detailTab === "schedule"
                ? "hover:opacity-90"
                : "text-[#546257] hover:bg-[#eee9dd]"
            }`}
            onClick={openSchedule}
            style={detailTab === "schedule" ? tournamentAccentStyle : undefined}
            type="button"
          >
            Takvim
          </button>
          <button
            className={`h-11 rounded-md text-sm font-semibold transition ${
              detailTab === "players"
                ? "hover:opacity-90"
                : "text-[#546257] hover:bg-[#eee9dd]"
            }`}
            onClick={() => setDetailTab("players")}
            style={detailTab === "players" ? tournamentAccentStyle : undefined}
            type="button"
          >
            Puan Durumu
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
                  className={`h-10 rounded px-2 text-xs font-semibold transition sm:text-sm ${
                    scope === value
                      ? "hover:opacity-90"
                      : "text-[#546257] hover:bg-[#eee9dd]"
                  }`}
                  key={value}
                  onClick={() => {
                    setScope(value);
                    if (value !== "all") {
                      setAnchorDate(new Date(defaultAnchorTimestamp));
                    }
                  }}
                  style={scope === value ? tournamentAccentStyle : undefined}
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
                  ? "transition hover:opacity-90"
                  : "border-[#cfc8b8] bg-white text-[#34443a]"
              }`}
              onClick={() => setFiltersOpen((current) => !current)}
              style={
                filtersOpen || activeFilterCount
                  ? {
                      ...tournamentAccentStyle,
                      borderColor: tournamentColor,
                    }
                  : undefined
              }
              title="Filtreleme"
              type="button"
            >
              <ListFilter size={19} />
              {activeFilterCount ? (
                <span
                  className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-current text-[10px] font-bold"
                  style={tournamentAccentStyle}
                >
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>

          {filtersOpen ? (
            <div className="mt-3 grid gap-3 rounded-md border border-[#eee7db] bg-white p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
                <label className="relative min-w-0">
                  <span className="sr-only">Kişi veya takım</span>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[#68756b]"
                    size={17}
                  />
                  <input
                    className="input !pl-10"
                    list={playerListId}
                    onChange={(event) => {
                      setPlayerFilterId(null);
                      setPlayerSearch(event.target.value);
                    }}
                    placeholder="Oyuncu veya takım yazın"
                    value={playerSearch}
                  />
                  <datalist id={playerListId}>
                    {participantOptions.map((participant) => (
                      <option key={participant} value={participant} />
                    ))}
                  </datalist>
                </label>
                <button
                  aria-label="Filtreleri temizle"
                  className="grid size-11 place-items-center rounded-md border border-[#cfc8b8] bg-white text-[#34443a] transition hover:bg-[#eee9dd] disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!activeFilterCount}
                  onClick={() => {
                    setPlayerFilterId(null);
                    setPlayerSearch("");
                    setCategoryFilter("all");
                    setGroupFilter("all");
                  }}
                  title="Filtreleri temizle"
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
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
                <select
                  aria-label="Grup filtresi"
                  className="input"
                  disabled={categoryFilter === "all"}
                  onChange={(event) => setGroupFilter(event.target.value)}
                  value={groupFilter}
                >
                  {categoryFilter === "all" ? (
                    <option value="all">Önce kategori</option>
                  ) : null}
                  {availableGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      Grup {group.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

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

          <p className="mt-3 text-xs text-[#68756b]">
            {visibleMatches.length} maç gösteriliyor
          </p>

          {matchesByDay.length ? (
            <>
              {scope === "week" && weekTimeSlots.length ? (
                <div className="mt-4 hidden overflow-hidden rounded-md border border-[#ddd7c8] bg-white xl:block">
                  <div
                    className="grid min-w-0"
                    style={{
                      gridTemplateColumns:
                        "72px repeat(7, minmax(0, 1fr))",
                    }}
                  >
                    <div
                      className="grid min-h-14 place-items-center border-b border-r border-current px-2 text-xs font-bold uppercase"
                      style={tournamentAccentStyle}
                    >
                      Saat
                    </div>
                    {weekDays.map((day) => (
                      <div
                        className="grid min-h-14 place-items-center border-b border-r border-current px-1.5 py-2 text-center last:border-r-0"
                        key={day.toISOString()}
                        style={tournamentAccentStyle}
                      >
                        <p className="text-xs font-bold capitalize leading-tight">
                          {tournamentWeekdayFormatter.format(day)}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium leading-tight opacity-85">
                          {tournamentShortDateFormatter.format(day)}
                        </p>
                      </div>
                    ))}

                    {weekTimeSlots.map((time) => (
                      <div className="contents" key={time}>
                        <div
                          className="grid min-h-24 place-items-start border-b border-r border-[#eee7db] px-2 py-3 text-center text-lg font-bold tabular-nums"
                          style={{
                            backgroundColor: `${tournamentColor}14`,
                            color: tournamentColor,
                          }}
                        >
                          {time}
                        </div>
                        {weekDays.map((day) => {
                          const key = `${dateInputValue(day)}-${time}`;
                          const slotMatches = weekMatchesBySlot.get(key) ?? [];

                          return (
                            <div
                              className="grid min-h-24 min-w-0 content-start gap-1.5 border-b border-r border-[#eee7db] p-1.5 last:border-r-0"
                              key={key}
                            >
                              {slotMatches.map((match) => {
                                const category = categoriesById.get(
                                  match.category_id,
                                );
                                const group = match.group_id
                                  ? groupsById.get(match.group_id)
                                  : null;
                                const isPast =
                                  new Date(match.ends_at) < currentTime;
                                const scoreText = formatTournamentMatchScore(match);
                                const player1Won =
                                  match.score_entered &&
                                  match.winner_entry_id === match.player1_entry_id;
                                const player2Won =
                                  match.score_entered &&
                                  match.winner_entry_id === match.player2_entry_id;
                                const matchContent = (
                                  <>
                                    {onEditMatch ? (
                                      <Pencil
                                        aria-hidden="true"
                                        className="absolute right-1.5 top-1.5 opacity-75"
                                        size={12}
                                      />
                                    ) : null}
                                    <div className="grid gap-0.5 pr-3 text-[11px] font-semibold leading-tight">
                                      <p
                                        className={`break-words ${
                                          isPast && !player1Won ? "opacity-45" : ""
                                        }`}
                                        style={
                                          player1Won
                                            ? { color: tournamentCardScoreColor }
                                            : undefined
                                        }
                                      >
                                        {match.player1_name}
                                      </p>
                                      <p
                                        className={`break-words border-t border-current/25 pt-0.5 ${
                                          isPast && !player2Won ? "opacity-45" : ""
                                        }`}
                                        style={
                                          player2Won
                                            ? { color: tournamentCardScoreColor }
                                            : undefined
                                        }
                                      >
                                        {match.player2_name}
                                      </p>
                                    </div>
                                    <p
                                      className={`truncate text-[9px] font-medium leading-tight ${
                                        isPast ? "opacity-45" : "opacity-85"
                                      }`}
                                    >
                                      {category?.name ?? "Kategori"}
                                      {group ? ` · Grup ${group.name}` : " · Final"}
                                    </p>
                                    <p
                                      className={`truncate text-[9px] font-medium leading-tight ${
                                        isPast ? "opacity-45" : "opacity-85"
                                      }`}
                                    >
                                      {match.courts?.name ?? "Kort belirlenecek"}
                                    </p>
                                    {scoreText ? (
                                      <p
                                        className="truncate border-t border-current/25 pt-1 text-xs font-extrabold leading-tight"
                                        style={{ color: tournamentCardScoreColor }}
                                      >
                                        {scoreText}
                                      </p>
                                    ) : null}
                                  </>
                                );
                                const matchClassName =
                                  "relative grid w-full min-w-0 gap-1 rounded border p-2 text-left shadow-sm transition";
                                const matchTitle = `${match.player1_name} - ${match.player2_name} · ${category?.name ?? "Kategori"}${
                                  group ? ` · Grup ${group.name}` : " · Final"
                                }`;

                                return onEditMatch ? (
                                  <button
                                    aria-label={`${matchTitle} maçını düzenle`}
                                    className={`${matchClassName} cursor-pointer hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2`}
                                    key={match.id}
                                    onClick={() => onEditMatch(match)}
                                    style={tournamentAccentStyle}
                                    title="Maçı düzenle"
                                    type="button"
                                  >
                                    {matchContent}
                                  </button>
                                ) : (
                                  <article
                                    aria-label={matchTitle}
                                    className={matchClassName}
                                    key={match.id}
                                    style={tournamentAccentStyle}
                                  >
                                    {matchContent}
                                  </article>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div
                className={`mt-4 space-y-4 ${
                  scope === "week" ? "xl:hidden" : ""
                }`}
              >
                {matchesByDay.map(([date, matches]) => (
                  <div
                    className="overflow-hidden rounded-md border border-[#ddd7c8]"
                    key={date}
                  >
                    <div
                      className="sticky top-0 z-10 px-4 py-2.5"
                      style={tournamentAccentStyle}
                    >
                      <h4 className="font-semibold capitalize">
                        {formatMatchDay(localDate(date))}
                      </h4>
                    </div>
                    <div className="divide-y divide-[#eee7db] bg-white">
                      {matches.map((match) => {
                        const category = categoriesById.get(match.category_id);
                        const group = match.group_id
                          ? groupsById.get(match.group_id)
                          : null;
                        const firstEntry = participantsById.get(
                          match.player1_entry_id,
                        );
                        const secondEntry = participantsById.get(
                          match.player2_entry_id,
                        );
                        const isDoublesMatch =
                          (firstEntry?.player_ids.length ?? 0) > 1 ||
                          (secondEntry?.player_ids.length ?? 0) > 1;
                        const isPast = new Date(match.ends_at) < currentTime;
                        const scoreText = formatTournamentMatchScore(match);
                        const player1Won =
                          match.score_entered &&
                          match.winner_entry_id === match.player1_entry_id;
                        const player2Won =
                          match.score_entered &&
                          match.winner_entry_id === match.player2_entry_id;
                        const rowClassName = `grid w-full grid-cols-[64px_minmax(0,1fr)] items-center gap-3 px-3 py-3 text-left transition sm:grid-cols-[78px_minmax(0,1fr)] sm:gap-4 sm:px-4 ${
                          onEditMatch
                            ? "cursor-pointer hover:bg-[#f7f1e5] focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                            : ""
                        }`;
                        const rowContent = (
                          <>
                            <time
                              className={`text-xl font-bold tabular-nums sm:text-2xl ${
                                isPast ? "text-[#68756b]" : ""
                              }`}
                              style={
                                isPast ? undefined : { color: tournamentColor }
                              }
                            >
                              {format(new Date(match.starts_at), "HH:mm")}
                            </time>
                            <div className="min-w-0">
                              {isDoublesMatch ? (
                                <div
                                  aria-label={`${match.player1_name} ve ${match.player2_name}`}
                                  className="grid gap-0.5 text-[12px] font-semibold leading-tight min-[380px]:text-[13px] sm:text-base"
                                  title={`${match.player1_name} vs ${match.player2_name}`}
                                >
                                  <p
                                    className={`truncate ${
                                      isPast && !player1Won ? "opacity-45" : ""
                                    }`}
                                    style={
                                      player1Won
                                        ? { color: "var(--theme-success-text)" }
                                        : undefined
                                    }
                                  >
                                    {match.player1_name}
                                  </p>
                                  <p
                                    className={`truncate ${
                                      isPast && !player2Won ? "opacity-45" : ""
                                    }`}
                                    style={
                                      player2Won
                                        ? { color: "var(--theme-success-text)" }
                                        : undefined
                                    }
                                  >
                                    {match.player2_name}
                                  </p>
                                </div>
                              ) : (
                                <p className="truncate text-sm font-semibold sm:text-base">
                                  <span
                                    className={
                                      isPast && !player1Won ? "opacity-45" : ""
                                    }
                                    style={
                                      player1Won
                                        ? { color: "var(--theme-success-text)" }
                                        : undefined
                                    }
                                  >
                                    {match.player1_name}
                                  </span>
                                  <span className="px-2 text-xs font-normal text-[#8b8f86]">
                                    vs
                                  </span>
                                  <span
                                    className={
                                      isPast && !player2Won ? "opacity-45" : ""
                                    }
                                    style={
                                      player2Won
                                        ? { color: "var(--theme-success-text)" }
                                        : undefined
                                    }
                                  >
                                    {match.player2_name}
                                  </span>
                                </p>
                              )}
                              <div
                                className={`mt-1 flex min-w-0 items-center justify-between gap-3 text-xs text-[#68756b] ${
                                  isPast ? "opacity-45" : ""
                                }`}
                              >
                                <p className="truncate">
                                  {category?.name ?? "Kategori"}
                                  {group ? ` · Grup ${group.name}` : ""}
                                  {match.phase === "final" ? " · Final" : ""}
                                </p>
                                <span className="flex shrink-0 items-center gap-1.5 font-medium">
                                  {match.courts?.name ?? "Kort belirlenecek"}
                                  {onEditMatch ? (
                                    <Pencil aria-hidden="true" size={13} />
                                  ) : null}
                                </span>
                              </div>
                              {scoreText ? (
                                <p
                                  className="mt-1 truncate text-sm font-extrabold"
                                  style={{ color: "var(--theme-success-text)" }}
                                >
                                  {scoreText}
                                </p>
                              ) : null}
                            </div>
                          </>
                        );

                        return onEditMatch ? (
                          <button
                            aria-label={`${match.player1_name} - ${match.player2_name} maçını düzenle`}
                            className={rowClassName}
                            key={match.id}
                            onClick={() => onEditMatch(match)}
                            title="Maçı düzenle"
                            type="button"
                          >
                            {rowContent}
                          </button>
                        ) : (
                          <article className={rowClassName} key={match.id}>
                            {rowContent}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
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
                    <p
                      className="text-xs font-bold uppercase tracking-wide"
                      style={{ color: tournamentColor }}
                    >
                      Grup {group.name}
                    </p>
                    <ul className="mt-3 space-y-2 text-sm">
                      {selectedTournament.participants
                        .filter((participant) => participant.group_id === group.id)
                        .sort((first, second) => {
                          const firstStanding = participantStandingsById.get(
                            first.id,
                          );
                          const secondStanding = participantStandingsById.get(
                            second.id,
                          );
                          const pointsDifference =
                            (secondStanding?.points ?? 0) -
                            (firstStanding?.points ?? 0);

                          if (pointsDifference !== 0) {
                            return pointsDifference;
                          }

                          const firstSetDifference =
                            (firstStanding?.setsWon ?? 0) -
                            (firstStanding?.setsLost ?? 0);
                          const secondSetDifference =
                            (secondStanding?.setsWon ?? 0) -
                            (secondStanding?.setsLost ?? 0);

                          if (secondSetDifference !== firstSetDifference) {
                            return secondSetDifference - firstSetDifference;
                          }

                          const setsWonDifference =
                            (secondStanding?.setsWon ?? 0) -
                            (firstStanding?.setsWon ?? 0);

                          return (
                            setsWonDifference ||
                            first.display_order - second.display_order
                          );
                        })
                        .map((participant) => (
                          <li
                            className="flex flex-wrap items-center gap-1.5 rounded bg-[#f6f1e7] px-3 py-2"
                            key={participant.id}
                          >
                            {participant.player_ids.map((playerId) => {
                              const player = selectedTournament.players.find(
                                (item) => item.id === playerId,
                              );

                              return player ? (
                                <button
                                  className="rounded-md border bg-white px-2 py-1 text-left text-xs font-semibold transition hover:opacity-80"
                                  key={player.id}
                                  onClick={() =>
                                    showPlayerMatches(player.id, player.display_name)
                                  }
                                  style={{
                                    borderColor: tournamentColor,
                                    color: tournamentColor,
                                  }}
                                  title={`${player.display_name} maçlarını göster`}
                                  type="button"
                                >
                                  {player.display_name}
                                </button>
                              ) : null;
                            })}
                            {(participantStandingsById.get(participant.id)
                              ?.scoredMatches ?? 0) > 0 ? (
                              <span
                                className="ml-auto shrink-0 rounded-full px-2.5 py-1 text-sm font-extrabold"
                                style={{
                                  backgroundColor: "var(--theme-success-bg)",
                                  color: "var(--theme-success-text)",
                                }}
                              >
                                {participantStandingsById.get(participant.id)
                                  ?.points ?? 0} puan
                              </span>
                            ) : null}
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
  ) => Promise<TournamentDraft | null>;
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

    if (mode === "edit" && selectedTournament) {
      const savedDraft = await onUpdateTournament(selectedTournament.id, draft);

      if (savedDraft) {
        setDraft(savedDraft);
      }

      return;
    }

    const didSave = await onCreateTournament(draft);

    if (!didSave) {
      return;
    }

    setMode("edit");
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

  function updatePlayer(playerId: string, displayName: string) {
    setDraft((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.client_id === playerId
          ? { ...player, display_name: displayName }
          : player,
      ),
    }));
  }

  function updateGroup(
    categoryId: string,
    groupId: string,
    fields: Partial<TournamentGroupDraft>,
  ) {
    setDraft((current) => ({
      ...current,
      categories: current.categories.map((category) =>
        category.client_id === categoryId
          ? {
              ...category,
              groups: category.groups.map((group) =>
                group.client_id === groupId ? { ...group, ...fields } : group,
              ),
            }
          : category,
      ),
    }));
  }

  function updateEntry(
    categoryId: string,
    groupId: string,
    entryId: string,
    fields: Partial<TournamentEntryDraft>,
  ) {
    setDraft((current) => ({
      ...current,
      categories: current.categories.map((category) =>
        category.client_id === categoryId
          ? {
              ...category,
              groups: category.groups.map((group) =>
                group.client_id === groupId
                  ? {
                      ...group,
                      entries: group.entries.map((entry) =>
                        entry.client_id === entryId
                          ? { ...entry, ...fields }
                          : entry,
                      ),
                    }
                  : group,
              ),
            }
          : category,
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
        {mode === "edit" ? (
          <button
            className="primary-button w-full sm:w-auto"
            disabled={isSaving}
            type="submit"
          >
            <Trophy size={17} />
            {isSaving ? "Kaydediliyor" : "Değişiklikleri kaydet"}
          </button>
        ) : null}

        <details className="group rounded-md border border-[#ddd7c8] bg-white" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold [&::-webkit-details-marker]:hidden">
            Genel
            <ChevronRight className="transition group-open:rotate-90" size={18} />
          </summary>
          <div className="grid gap-4 border-t border-[#eee7db] p-4 md:grid-cols-2">
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
              Turnuva rengi
              <input
                className="h-11 w-full cursor-pointer rounded-md border border-[#cfc8b8] bg-white p-1"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    color: event.target.value,
                  }))
                }
                type="color"
                value={draft.color}
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
                          : `${duration} dakika`}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 rounded-md border border-[#e6dfd2] bg-[#f6f1e7] p-4 md:col-span-2 md:grid-cols-2">
              <div className="md:col-span-2">
                <p className="font-semibold text-[#34443a]">Maç ve tie-break sistemi</p>
                <p className="mt-1 text-xs text-[#68756b]">
                  Skor girişi bu kurallara göre doğrulanır ve grup puanları otomatik hesaplanır.
                </p>
              </div>
              <label className="grid gap-2 text-sm font-medium text-[#34443a]">
                Kaç set üzerinden
                <select
                  className="input"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      best_of_sets: Number(event.target.value),
                    }))
                  }
                  value={draft.best_of_sets}
                >
                  <option value={1}>1 set · 1 alan kazanır</option>
                  <option value={3}>3 set · 2 alan kazanır</option>
                  <option value={5}>5 set · 3 alan kazanır</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-[#34443a]">
                Normal sette oyun sayısı
                <input
                  className="input"
                  max={12}
                  min={1}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      set_games_to_win: Number(event.target.value),
                    }))
                  }
                  required
                  type="number"
                  value={draft.set_games_to_win}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-[#34443a]">
                Set tie-breaki kaç puan
                <input
                  className="input"
                  max={30}
                  min={1}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      set_tiebreak_points: Number(event.target.value),
                    }))
                  }
                  required
                  type="number"
                  value={draft.set_tiebreak_points}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-[#34443a]">
                Son set türü
                <select
                  className="input"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      deciding_set_type: event.target
                        .value as TournamentDecidingSetType,
                    }))
                  }
                  value={draft.deciding_set_type}
                >
                  <option value="regular">Normal set</option>
                  <option value="match_tiebreak">Maç tie-breaki</option>
                </select>
              </label>
              {draft.deciding_set_type === "match_tiebreak" ? (
                <label className="grid gap-2 text-sm font-medium text-[#34443a]">
                  Maç tie-breaki kaç puan
                  <input
                    className="input"
                    max={30}
                    min={1}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        deciding_match_tiebreak_points: Number(
                          event.target.value,
                        ),
                      }))
                    }
                    required
                    type="number"
                    value={draft.deciding_match_tiebreak_points}
                  />
                </label>
              ) : null}
            </div>
            <TournamentDateField
              label="Grup maçları başlangıç"
              onChange={(value) =>
                setDraft((current) => ({ ...current, group_stage_start_date: value }))
              }
              value={draft.group_stage_start_date}
            />
            <TournamentDateField
              label="Grup maçları bitiş"
              min={draft.group_stage_start_date}
              onChange={(value) =>
                setDraft((current) => ({ ...current, group_stage_end_date: value }))
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
            <fieldset className="md:col-span-2">
              <legend className="text-sm font-semibold text-[#34443a]">
                Kullanılabilecek kortlar
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {courts.map((court) => {
                  const isSelected = draft.court_ids.includes(court.id);

                  return (
                    <label
                      className={`tournament-court-toggle inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm ${
                        isSelected
                          ? "is-selected"
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
            <label
              className={`tournament-active-toggle flex items-start gap-3 rounded-md border p-4 text-sm md:col-span-2 ${
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
          </div>
        </details>

        <section className="rounded-md border border-[#ddd7c8] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Oyuncular</h3>
              <p className="mt-1 text-xs text-[#68756b]">
                Oyuncuları bir kez ekleyin; tekler ve çiftlerde aynı kaydı kullanın.
              </p>
            </div>
            <button
              className="secondary-button shrink-0"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  players: [
                    ...current.players,
                    {
                      client_id: clientId("player", current.players.length),
                      display_name: "",
                    },
                  ],
                }))
              }
              type="button"
            >
              <CirclePlus size={16} />
              Oyuncu
            </button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {draft.players.map((player, index) => {
              const isUsed = draft.categories.some((category) =>
                category.groups.some((group) =>
                  group.entries.some(
                    (entry) =>
                      entry.player1_client_id === player.client_id ||
                      entry.player2_client_id === player.client_id,
                  ),
                ),
              );

              return (
                <div
                  className="grid grid-cols-[32px_minmax(0,1fr)_36px] items-center gap-2"
                  key={player.client_id}
                >
                  <span className="text-center text-xs font-semibold text-[#68756b]">
                    {index + 1}
                  </span>
                  <input
                    aria-label={`${index + 1}. oyuncu adı`}
                    className="input input-compact"
                    onChange={(event) =>
                      updatePlayer(player.client_id, event.target.value)
                    }
                    placeholder="Oyuncu adı"
                    required
                    value={player.display_name}
                  />
                  <button
                    aria-label={`${player.display_name || "Oyuncu"} kaldır`}
                    className="grid size-9 place-items-center rounded-md text-[#a0543b] hover:bg-[#f6f1e7] disabled:opacity-35"
                    disabled={isUsed}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        players: current.players.filter(
                          (item) => item.client_id !== player.client_id,
                        ),
                      }))
                    }
                    title={isUsed ? "Önce kategori/grup atamalarından çıkarın" : "Oyuncuyu kaldır"}
                    type="button"
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-3 rounded-md border border-[#ddd7c8] bg-[#f6f1e7] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Kategoriler ve gruplar</h3>
              <p className="mt-1 text-xs text-[#68756b]">
                Gruplara tek oyuncu veya iki oyunculu takım atayın.
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

          {draft.categories.map((category, categoryIndex) => {
            const categoryHasMatches = Boolean(
              category.id &&
                selectedTournament?.matches.some(
                  (match) => match.category_id === category.id,
                ),
            );

            return (
              <details
                className="group rounded-md border border-[#ddd7c8] bg-white"
                key={category.client_id}
                open
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 [&::-webkit-details-marker]:hidden">
                  <span className="font-semibold">
                    {category.name || `Kategori ${categoryIndex + 1}`}
                  </span>
                  <ChevronRight className="transition group-open:rotate-90" size={17} />
                </summary>
                <div className="space-y-3 border-t border-[#eee7db] p-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_40px]">
                    <label className="grid gap-1.5 text-xs font-semibold text-[#34443a]">
                      Kategori adı
                      <input
                        className="input input-compact"
                        onChange={(event) =>
                          updateCategory(category.client_id, { name: event.target.value })
                        }
                        required
                        value={category.name}
                      />
                    </label>
                    <label className="grid gap-1.5 text-xs font-semibold text-[#34443a]">
                      Grup kapasitesi
                      <input
                        className="input input-compact"
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
                    <button
                      aria-label="Kategoriyi kaldır"
                      className="mt-auto grid size-10 place-items-center rounded-md text-[#a0543b] hover:bg-[#f6f1e7] disabled:opacity-35"
                      disabled={categoryHasMatches || draft.categories.length === 1}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          categories: current.categories.filter(
                            (item) => item.client_id !== category.client_id,
                          ),
                        }))
                      }
                      title={categoryHasMatches ? "Maçı bulunan kategori kaldırılamaz" : "Kategoriyi kaldır"}
                      type="button"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="flex justify-end">
                    <button
                      className="secondary-button"
                      onClick={() =>
                        updateCategory(category.client_id, {
                          groups: [
                            ...category.groups,
                            newGroupDraft(category.groups.length),
                          ],
                        })
                      }
                      type="button"
                    >
                      <CirclePlus size={15} />
                      Grup ekle
                    </button>
                  </div>

                  <div className="grid gap-3">
                    {category.groups.map((group) => {
                      const groupHasMatches = Boolean(
                        group.id &&
                          selectedTournament?.matches.some(
                            (match) => match.group_id === group.id,
                          ),
                      );

                      return (
                        <div
                          className="rounded-md border border-[#e6dfd2] bg-[#fffdf8] p-3"
                          key={group.client_id}
                        >
                          <div className="grid grid-cols-[minmax(0,1fr)_auto_36px] items-end gap-2">
                            <label className="grid gap-1.5 text-xs font-semibold text-[#34443a]">
                              Grup adı
                              <input
                                className="input input-compact"
                                onChange={(event) =>
                                  updateGroup(category.client_id, group.client_id, {
                                    name: event.target.value,
                                  })
                                }
                                required
                                value={group.name}
                              />
                            </label>
                            <span className="mb-2 text-xs font-semibold text-[#68756b]">
                              {group.entries.length}/{category.group_size}
                            </span>
                            <button
                              aria-label={`Grup ${group.name} kaldır`}
                              className="grid size-9 place-items-center rounded-md text-[#a0543b] hover:bg-[#f6f1e7] disabled:opacity-35"
                              disabled={groupHasMatches || category.groups.length === 1}
                              onClick={() =>
                                updateCategory(category.client_id, {
                                  groups: category.groups.filter(
                                    (item) => item.client_id !== group.client_id,
                                  ),
                                })
                              }
                              title={groupHasMatches ? "Maçı bulunan grup kaldırılamaz" : "Grubu kaldır"}
                              type="button"
                            >
                              <X size={15} />
                            </button>
                          </div>

                          <div className="mt-3 grid gap-2">
                            {group.entries.map((entry, entryIndex) => {
                              const entryHasMatches = Boolean(
                                entry.id &&
                                  selectedTournament?.matches.some(
                                    (match) =>
                                      match.player1_entry_id === entry.id ||
                                      match.player2_entry_id === entry.id,
                                  ),
                              );

                              return (
                                <div
                                  className="grid grid-cols-[26px_minmax(0,1fr)_minmax(0,1fr)_36px] items-center gap-2"
                                  key={entry.client_id}
                                >
                                  <span className="text-center text-xs font-semibold text-[#68756b]">
                                    {entryIndex + 1}
                                  </span>
                                  <select
                                    aria-label={`Grup ${group.name} ${entryIndex + 1}. katılımcı`}
                                    className="input input-compact"
                                    onChange={(event) =>
                                      updateEntry(
                                        category.client_id,
                                        group.client_id,
                                        entry.client_id,
                                        { player1_client_id: event.target.value },
                                      )
                                    }
                                    required
                                    value={entry.player1_client_id}
                                  >
                                    <option value="">Oyuncu seçin</option>
                                    {draft.players.map((player) => (
                                      <option key={player.client_id} value={player.client_id}>
                                        {player.display_name || "İsimsiz oyuncu"}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    aria-label={`Grup ${group.name} ${entryIndex + 1}. eş oyuncu`}
                                    className="input input-compact"
                                    onChange={(event) =>
                                      updateEntry(
                                        category.client_id,
                                        group.client_id,
                                        entry.client_id,
                                        { player2_client_id: event.target.value },
                                      )
                                    }
                                    value={entry.player2_client_id}
                                  >
                                    <option value="">Tek oyuncu</option>
                                    {draft.players.map((player) => (
                                      <option
                                        disabled={player.client_id === entry.player1_client_id}
                                        key={player.client_id}
                                        value={player.client_id}
                                      >
                                        {player.display_name || "İsimsiz oyuncu"}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    aria-label="Katılımcıyı gruptan çıkar"
                                    className="grid size-9 place-items-center rounded-md text-[#a0543b] hover:bg-[#f6f1e7] disabled:opacity-35"
                                    disabled={entryHasMatches}
                                    onClick={() =>
                                      updateGroup(category.client_id, group.client_id, {
                                        entries: group.entries.filter(
                                          (item) => item.client_id !== entry.client_id,
                                        ),
                                      })
                                    }
                                    title={entryHasMatches ? "Maçı bulunan katılımcı kaldırılamaz; oyuncusunu değiştirebilirsiniz" : "Katılımcıyı çıkar"}
                                    type="button"
                                  >
                                    <X size={15} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>

                          <button
                            className="secondary-button mt-3"
                            disabled={
                              !draft.players.length ||
                              group.entries.length >= category.group_size
                            }
                            onClick={() =>
                              updateGroup(category.client_id, group.client_id, {
                                entries: [
                                  ...group.entries,
                                  {
                                    client_id: clientId("entry", group.entries.length),
                                    player1_client_id: draft.players[0]?.client_id ?? "",
                                    player2_client_id: "",
                                  },
                                ],
                              })
                            }
                            type="button"
                          >
                            <CirclePlus size={15} />
                            Katılımcı ekle
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </details>
            );
          })}
        </section>

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
