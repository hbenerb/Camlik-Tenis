"use client";

import {
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from "date-fns";
import {
  CalendarDays,
  Check,
  ChevronDown,
  CirclePlus,
  MapPin,
  Search,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import type { Court, TournamentWithDetails } from "@/lib/types";

type TournamentScope = "today" | "week" | "all";

export type TournamentCategoryDraft = {
  client_id: string;
  name: string;
  group_count: number;
  group_size: number;
  players_text: string;
};

export type TournamentDraft = {
  name: string;
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
    group_stage_start_date: dateInputValue(today),
    group_stage_end_date: dateInputValue(groupEnd),
    finals_start_date: dateInputValue(finalsStart),
    finals_end_date: dateInputValue(addCalendarDays(finalsStart, 7)),
    is_active: false,
    court_ids: courts.filter((court) => court.is_active).map((court) => court.id),
    categories: [newCategoryDraft(0)],
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
  }).format(new Date(`${value}T12:00:00`));
}

function formatMatchDay(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function groupLabel(index: number) {
  if (index < 26) {
    return String.fromCharCode(65 + index);
  }

  return String(index + 1);
}

export function TournamentPanel({
  canManage,
  courts,
  currentTime,
  isSaving,
  onCreateTournament,
  onSelectedTournamentChange,
  onToggleTournament,
  selectedTournamentId,
  tournaments,
}: {
  canManage: boolean;
  courts: Court[];
  currentTime: Date;
  isSaving: boolean;
  onCreateTournament: (draft: TournamentDraft) => Promise<boolean>;
  onSelectedTournamentChange: (tournamentId: string) => void;
  onToggleTournament: (tournamentId: string, isActive: boolean) => Promise<void>;
  selectedTournamentId: string | null;
  tournaments: TournamentWithDetails[];
}) {
  const [scope, setScope] = useState<TournamentScope>("today");
  const [playerSearch, setPlayerSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draft, setDraft] = useState(() => newTournamentDraft(courts));

  const selectedTournament =
    tournaments.find((tournament) => tournament.id === selectedTournamentId) ??
    tournaments.find((tournament) => tournament.is_active) ??
    tournaments[0] ??
    null;

  const availableGroups = useMemo(() => {
    if (!selectedTournament) {
      return [];
    }

    const categoryIds =
      categoryFilter === "all"
        ? selectedTournament.categories.map((category) => category.id)
        : [categoryFilter];

    return selectedTournament.groups
      .filter((group) => categoryIds.includes(group.category_id))
      .sort((first, second) => first.display_order - second.display_order);
  }, [categoryFilter, selectedTournament]);

  const visibleMatches = useMemo(() => {
    if (!selectedTournament) {
      return [];
    }

    const search = normalizeSearch(playerSearch);
    const weekStart = startOfWeek(currentTime, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentTime, { weekStartsOn: 1 });

    return selectedTournament.matches
      .filter((match) => match.status !== "canceled")
      .filter((match) => {
        const startsAt = new Date(match.starts_at);

        if (scope === "today" && !isSameDay(startsAt, currentTime)) {
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
    categoryFilter,
    currentTime,
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

  const selectedCourtNames = useMemo(() => {
    if (!selectedTournament) {
      return [];
    }

    const courtIds = new Set(selectedTournament.courts.map((court) => court.court_id));
    return courts.filter((court) => courtIds.has(court.id)).map((court) => court.name);
  }, [courts, selectedTournament]);

  async function submitTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const didSave = await onCreateTournament(draft);

    if (didSave) {
      setDraft(newTournamentDraft(courts));
      setIsCreateOpen(false);
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

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="overflow-hidden rounded-lg border border-[#ddd7c8] bg-[#fffdf8]">
        <div className="bg-[#17211c] px-4 py-5 text-white sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#b9d8ae]">
                <Trophy size={18} />
                Turnuvalar
              </div>
              <h2 className="mt-2 text-2xl font-semibold">
                {selectedTournament?.name ?? "Henüz turnuva yok"}
              </h2>
              {selectedTournament ? (
                <p className="mt-2 text-sm text-[#d5ded7]">
                  Grup maçları {formatTournamentDate(selectedTournament.group_stage_start_date)}–
                  {formatTournamentDate(selectedTournament.group_stage_end_date)} · Finaller {formatTournamentDate(selectedTournament.finals_start_date)}–
                  {formatTournamentDate(selectedTournament.finals_end_date)}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedTournament && canManage ? (
                <button
                  className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold ${
                    selectedTournament.is_active
                      ? "bg-[#eaf5e6] text-[#237000]"
                      : "border border-white/30 text-white"
                  }`}
                  disabled={isSaving}
                  onClick={() =>
                    void onToggleTournament(
                      selectedTournament.id,
                      !selectedTournament.is_active,
                    )
                  }
                  type="button"
                >
                  {selectedTournament.is_active ? <Check size={16} /> : null}
                  {selectedTournament.is_active ? "Aktif" : "Pasif"}
                </button>
              ) : null}
              {canManage ? (
                <button
                  className="inline-flex min-h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-[#17211c]"
                  onClick={() => setIsCreateOpen((current) => !current)}
                  type="button"
                >
                  {isCreateOpen ? <X size={16} /> : <CirclePlus size={17} />}
                  {isCreateOpen ? "Kapat" : "Yeni turnuva"}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {tournaments.length > 1 ? (
          <div className="border-b border-[#ddd7c8] p-4 sm:px-6">
            <label className="grid gap-2 text-sm font-medium text-[#34443a]">
              Turnuva seç
              <select
                className="input max-w-md"
                onChange={(event) => onSelectedTournamentChange(event.target.value)}
                value={selectedTournament?.id ?? ""}
              >
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}{tournament.is_active ? " · Aktif" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {isCreateOpen ? (
          <form className="space-y-5 border-b border-[#ddd7c8] p-4 sm:p-6" onSubmit={submitTournament}>
            <div>
              <h3 className="text-lg font-semibold">Yeni turnuva oluştur</h3>
              <p className="mt-1 text-sm text-[#68756b]">
                Tarihleri, kortları ve kategori gruplarını tek seferde tanımlayın.
              </p>
            </div>

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
                  setDraft((current) => ({
                    ...current,
                    finals_start_date: value,
                  }))
                }
                value={draft.finals_start_date}
              />
              <TournamentDateField
                label="Finaller bitiş"
                min={draft.finals_start_date}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    finals_end_date: value,
                  }))
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
                  <h4 className="font-semibold">Kategoriler ve oyuncular</h4>
                  <p className="mt-1 text-xs text-[#68756b]">
                    Her satıra bir oyuncu veya çift takım yazın; gruplara otomatik dağıtılır.
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
                          className="grid size-8 place-items-center rounded-md text-[#a0543b] hover:bg-[#f6f1e7]"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              categories: current.categories.filter(
                                (currentCategory) =>
                                  currentCategory.client_id !== category.client_id,
                              ),
                            }))
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
                          placeholder="Örn. Erkek Master"
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
                          placeholder={"Oyuncu 1\nOyuncu 2\nOyuncu 3"}
                          required
                          value={category.players_text}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <label className="flex items-start gap-3 rounded-md border border-[#ddd7c8] bg-white p-4 text-sm">
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
                <span className="block font-semibold">Turnuvayı aktif yap</span>
                <span className="mt-1 block text-[#68756b]">
                  Aktif turnuva ana ekranda kısayol olarak görünür.
                </span>
              </span>
            </label>

            <button className="primary-button w-full sm:w-auto" disabled={isSaving} type="submit">
              <Trophy size={17} />
              {isSaving ? "Oluşturuluyor" : "Turnuvayı oluştur"}
            </button>
          </form>
        ) : null}

        {selectedTournament ? (
          <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-6">
            <TournamentSummaryCard
              icon={<CalendarDays size={18} />}
              label="Program"
              value={`${selectedTournament.matches.length} maç`}
            />
            <TournamentSummaryCard
              icon={<Users size={18} />}
              label="Katılım"
              value={`${selectedTournament.participants.length} oyuncu / takım`}
            />
            <TournamentSummaryCard
              icon={<MapPin size={18} />}
              label="Kortlar"
              value={selectedCourtNames.join(", ") || "Kort seçilmedi"}
            />
          </div>
        ) : null}
      </section>

      {selectedTournament ? (
        <>
          <section className="rounded-lg border border-[#ddd7c8] bg-[#fffdf8] p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Maç programı</h3>
                <p className="mt-1 text-sm text-[#68756b]">
                  Gün altında saat ve maç bilgilerini birlikte görün.
                </p>
              </div>
              <div className="grid grid-cols-3 rounded-md border border-[#cfc8b8] bg-white p-1">
                {(
                  [
                    ["today", "Bugün"],
                    ["week", "Bu hafta"],
                    ["all", "Tümü"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    className={`h-9 rounded px-2 text-xs font-semibold sm:px-3 sm:text-sm ${
                      scope === value
                        ? "bg-[#237000] text-white"
                        : "text-[#546257] hover:bg-[#eee9dd]"
                    }`}
                    key={value}
                    onClick={() => setScope(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <label className="relative block">
                <span className="sr-only">Kişi ara</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68756b]"
                  size={17}
                />
                <input
                  className="input pl-10"
                  onChange={(event) => setPlayerSearch(event.target.value)}
                  placeholder="Kişi veya takım ara"
                  value={playerSearch}
                />
              </label>
              <select
                aria-label="Kategori filtresi"
                className="input"
                onChange={(event) => {
                  setCategoryFilter(event.target.value);
                  setGroupFilter("all");
                }}
                value={categoryFilter}
              >
                <option value="all">Tüm kategoriler</option>
                {selectedTournament.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Grup filtresi"
                className="input"
                onChange={(event) => setGroupFilter(event.target.value)}
                value={groupFilter}
              >
                <option value="all">Tüm gruplar</option>
                {availableGroups.map((group) => {
                  const category = selectedTournament.categories.find(
                    (item) => item.id === group.category_id,
                  );
                  return (
                    <option key={group.id} value={group.id}>
                      {categoryFilter === "all" ? `${category?.name} · ` : ""}
                      Grup {group.name}
                    </option>
                  );
                })}
              </select>
            </div>

            <p className="mt-3 text-xs text-[#68756b]">
              {visibleMatches.length} maç gösteriliyor
            </p>

            {matchesByDay.length ? (
              <div className="mt-4 space-y-5">
                {matchesByDay.map(([date, matches]) => (
                  <div key={date}>
                    <div className="sticky top-0 z-10 border-b border-[#ddd7c8] bg-[#fffdf8] py-2">
                      <h4 className="font-semibold capitalize">
                        {formatMatchDay(new Date(`${date}T12:00:00`))}
                      </h4>
                    </div>
                    <div className="divide-y divide-[#eee7db]">
                      {matches.map((match) => {
                        const category = selectedTournament.categories.find(
                          (item) => item.id === match.category_id,
                        );
                        const group = selectedTournament.groups.find(
                          (item) => item.id === match.group_id,
                        );

                        return (
                          <article
                            className="grid gap-2 py-3 sm:grid-cols-[80px_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                            key={match.id}
                          >
                            <time className="text-sm font-bold text-[#237000]">
                              {format(new Date(match.starts_at), "HH:mm")}
                            </time>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">
                                {match.player1_name}
                                <span className="px-2 text-xs font-normal text-[#8b8f86]">vs</span>
                                {match.player2_name}
                              </p>
                              <p className="mt-1 text-xs text-[#68756b]">
                                {category?.name ?? "Kategori"}
                                {group ? ` · Grup ${group.name}` : ""}
                                {match.phase === "final" ? " · Final" : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-[#68756b]">
                              <MapPin size={13} />
                              {match.courts?.name ?? "Kort belirlenecek"}
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
                  Tarih görünümünü veya arama filtrelerini değiştirebilirsiniz.
                </p>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-[#ddd7c8] bg-[#fffdf8] p-4 sm:p-6">
            <div>
              <h3 className="text-lg font-semibold">Kategoriler ve gruplar</h3>
              <p className="mt-1 text-sm text-[#68756b]">
                Oyuncu ve takımların grup dağılımları.
              </p>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {selectedTournament.categories.map((category) => {
                const categoryGroups = selectedTournament.groups
                  .filter((group) => group.category_id === category.id)
                  .sort((first, second) => first.display_order - second.display_order);

                return (
                  <details
                    className="group rounded-md border border-[#ddd7c8] bg-white"
                    key={category.id}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                      <span>
                        <span className="block font-semibold">{category.name}</span>
                        <span className="mt-1 block text-xs text-[#68756b]">
                          {category.group_count} grup · {category.group_size} kişilik/takımlık
                        </span>
                      </span>
                      <ChevronDown className="transition group-open:rotate-180" size={18} />
                    </summary>
                    <div className="space-y-3 border-t border-[#eee7db] p-4">
                      {categoryGroups.map((group) => (
                        <div key={group.id}>
                          <p className="text-xs font-bold uppercase tracking-wide text-[#237000]">
                            Grup {group.name}
                          </p>
                          <ul className="mt-2 space-y-1.5 text-sm">
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
                  </details>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-lg border border-[#ddd7c8] bg-[#fffdf8] p-8 text-center">
          <Trophy className="mx-auto text-[#8b8f86]" size={30} />
          <h3 className="mt-3 text-lg font-semibold">Turnuva bulunamadı</h3>
          <p className="mt-2 text-sm text-[#68756b]">
            Admin yeni bir turnuva oluşturduğunda burada görünecek.
          </p>
        </div>
      )}
    </div>
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

function TournamentSummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-[#ddd7c8] bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#68756b]">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

export function buildTournamentGroupNames(groupCount: number) {
  return Array.from({ length: groupCount }, (_, index) => groupLabel(index));
}
