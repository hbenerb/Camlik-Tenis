import { compareOverallStandings, tournamentStandings, type Standing } from "@/lib/tournament-standings";
import type { TournamentWithDetails } from "@/lib/types";

export const LEAGUE_DRAFT_ID = "2026-2027";
export const LEAGUE_DRAFT_NAME = "Lig Taslağı · Kasım 2026–Ekim 2027";
export const LEAGUE_SEASON_START = "2026-11-01";
export const LEAGUE_MONTH_COUNT = 12;
export const LEAGUE_COLOR = "#2563eb";
export const LEAGUE_GROUP_SIZES = [4, 6, 8, 10] as const;
export const LEAGUE_CATEGORIES = [
  { key: "men", name: "Erkek", kind: "singles" },
  { key: "women", name: "Kadın", kind: "singles" },
  { key: "women-doubles", name: "Double Kadın", kind: "doubles" },
  { key: "men-doubles", name: "Double Erkek", kind: "doubles" },
  { key: "mixed-doubles", name: "Double Mix", kind: "doubles" },
] as const;

export type LeagueEntrant = {
  id: string;
  player_ids: string[];
  player_names: string[];
  display_name: string;
  source_category_name: string;
  source_group_name: string;
  source_rank: number;
  source_tied: boolean;
  source_points: number;
  source_sets_difference: number;
  source_games_difference: number;
};

export type LeagueMatch = {
  id: string;
  month_index: number;
  group_number: number;
  player1_entry_id: string;
  player2_entry_id: string;
};

export type LeagueCategoryDraft = {
  key: (typeof LEAGUE_CATEGORIES)[number]["key"];
  name: string;
  kind: "singles" | "doubles";
  entrants: LeagueEntrant[];
  group_sizes: number[];
  matches: LeagueMatch[];
};

export type LeagueDraft = {
  id: string;
  name: string;
  source_tournament_id: string;
  source_tournament_name: string;
  source_captured_at: string;
  season_start: string;
  month_count: number;
  revision: number;
  created_at: string;
  updated_at: string;
  categories: LeagueCategoryDraft[];
};

function normalizedName(name: string) {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

// The source tournament's categories are deliberately explicit: a new or
// renamed category must be reviewed rather than silently losing its entrants.
const sourceCategories = [
  { name: "Erkek Master", key: "men", tier: 0 },
  { name: "Erkek İleri", key: "men", tier: 1 },
  { name: "Erkek Orta", key: "men", tier: 2 },
  { name: "Kadın İleri", key: "women", tier: 1 },
  { name: "Kadın Orta", key: "women", tier: 2 },
  { name: "Yeni Başlayan Kadın", key: "women", tier: 3 },
  { name: "Double Master Erkek", key: "men-doubles", tier: 0 },
  { name: "Double İleri Erkek", key: "men-doubles", tier: 1 },
  { name: "Double Kadın", key: "women-doubles", tier: 1 },
  { name: "İleri Mix", key: "mixed-doubles", tier: 1 },
  { name: "Orta Mix", key: "mixed-doubles", tier: 2 },
] as const;

const sourceCategoryByName = new Map(sourceCategories.map((category) => [normalizedName(category.name), category]));
sourceCategoryByName.set(normalizedName("YB Kadın"), sourceCategories[5]);

export function defaultLeagueGroupSizes(count: number): number[] {
  if (!Number.isSafeInteger(count) || count < 0 || count % 2 || count === 2) {
    throw new Error("Katılımcı sayısı sıfır veya en az 4 olan çift bir sayı olmalı.");
  }
  if (!count) return [];
  const groups = Math.ceil(count / 10);
  const units = count / 2;
  return Array.from({ length: groups }, (_, index) =>
    2 * (Math.floor(units / groups) + (index < units % groups ? 1 : 0)));
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateLeagueCategory(category: LeagueCategoryDraft): string | null {
  const definition = LEAGUE_CATEGORIES.find((item) => item.key === category.key);
  if (!definition || definition.name !== category.name || definition.kind !== category.kind) {
    return "Lig kategorisi geçersiz.";
  }
  if (!Array.isArray(category.entrants) || !Array.isArray(category.group_sizes)) {
    return `${category.name}: Katılımcı veya grup listesi geçersiz.`;
  }
  const ids = new Set<string>();
  const teams = new Set<string>();
  for (const entrant of category.entrants) {
    if (!entrant || !nonempty(entrant.id) || !nonempty(entrant.display_name) ||
      !nonempty(entrant.source_category_name) || !nonempty(entrant.source_group_name) ||
      !Array.isArray(entrant.player_ids) || !Array.isArray(entrant.player_names) ||
      entrant.player_ids.length !== (category.kind === "singles" ? 1 : 2) ||
      entrant.player_names.length !== entrant.player_ids.length ||
      !entrant.player_ids.every(nonempty) || !entrant.player_names.every(nonempty) ||
      new Set(entrant.player_ids).size !== entrant.player_ids.length ||
      !Number.isSafeInteger(entrant.source_rank) || entrant.source_rank < 1 ||
      typeof entrant.source_tied !== "boolean" ||
      !Number.isSafeInteger(entrant.source_points) || entrant.source_points < 0 ||
      !Number.isSafeInteger(entrant.source_sets_difference) || !Number.isSafeInteger(entrant.source_games_difference)) {
      return `${category.name}: Katılımcı bilgileri eksik veya geçersiz.`;
    }
    const team = JSON.stringify([...entrant.player_ids].sort());
    if (ids.has(entrant.id) || teams.has(team)) return `${category.name}: Aynı katılımcı birden fazla kez bulunuyor.`;
    ids.add(entrant.id);
    teams.add(team);
  }
  if (category.group_sizes.some((size) => !LEAGUE_GROUP_SIZES.some((allowed) => allowed === size))) {
    return `${category.name}: Grup büyüklükleri 4, 6, 8 veya 10 olmalı.`;
  }
  const capacity = category.group_sizes.reduce((sum, size) => sum + size, 0);
  if (capacity !== category.entrants.length) {
    return `${category.name}: Grup kapasitesi (${capacity}) katılımcı sayısına (${category.entrants.length}) eşit olmalı.`;
  }
  return null;
}

export function generateLeagueMatches(category: LeagueCategoryDraft): LeagueMatch[] {
  const issue = validateLeagueCategory(category);
  if (issue) throw new Error(issue);
  const matches: LeagueMatch[] = [];
  let start = 0;
  category.group_sizes.forEach((size, groupIndex) => {
    const entrants = category.entrants.slice(start, start + size);
    start += size;
    const cycle: [string, string][][] = [];
    const rotating = entrants.map((entrant) => entrant.id);
    for (let round = 0; round < size - 1; round++) {
      const pairs: [string, string][] = [];
      for (let pair = 0; pair < size / 2; pair++) {
        pairs.push([rotating[pair], rotating[size - 1 - pair]]);
      }
      cycle.push(pairs);
      // Keep one entrant fixed and rotate the others around it.
      rotating.splice(1, 0, rotating.pop()!);
    }
    for (let month = 0; month < LEAGUE_MONTH_COUNT; month++) {
      cycle[month % cycle.length].forEach(([first, second], pairIndex) => {
        matches.push({
          id: `${category.key}-g${groupIndex + 1}-m${month + 1}-${pairIndex + 1}`,
          month_index: month,
          group_number: groupIndex + 1,
          player1_entry_id: first,
          player2_entry_id: second,
        });
      });
    }
  });
  return matches.sort((a, b) => a.month_index - b.month_index || a.group_number - b.group_number);
}

export function prepareLeagueCategories(categories: LeagueCategoryDraft[]): LeagueCategoryDraft[] {
  if (categories.length !== LEAGUE_CATEGORIES.length || new Set(categories.map((category) => category.key)).size !== LEAGUE_CATEGORIES.length) {
    throw new Error("Beş lig kategorisi de bulunmalı ve yalnızca birer kez yer almalı.");
  }
  return LEAGUE_CATEGORIES.map((definition) => {
    const category = categories.find((item) => item.key === definition.key);
    if (!category) throw new Error(`${definition.name} kategorisi eksik.`);
    const issue = validateLeagueCategory(category);
    if (issue) throw new Error(issue);
    const prepared = {
      ...category,
      entrants: category.entrants.map((entrant) => ({
        ...entrant, player_ids: [...entrant.player_ids], player_names: [...entrant.player_names],
      })),
      group_sizes: [...category.group_sizes],
    };
    return { ...prepared, matches: generateLeagueMatches(prepared) };
  });
}

export function moveLeagueEntrant(category: LeagueCategoryDraft, fromIndex: number, toIndex: number): LeagueCategoryDraft {
  if (![fromIndex, toIndex].every((index) => Number.isSafeInteger(index) && index >= 0 && index < category.entrants.length)) {
    throw new Error("Sıra numarası katılımcı listesi içinde olmalı.");
  }
  const entrants = [...category.entrants];
  entrants.splice(toIndex, 0, entrants.splice(fromIndex, 1)[0]);
  const moved = { ...category, entrants };
  return { ...moved, matches: validateLeagueCategory(moved) ? [] : generateLeagueMatches(moved) };
}

export function leagueEntryGroup(category: LeagueCategoryDraft, entryId: string): { group_number: number; initial_points: number } | null {
  const index = category.entrants.findIndex((entrant) => entrant.id === entryId);
  if (index < 0) return null;
  let end = 0;
  for (let group = 0; group < category.group_sizes.length; group++) {
    end += category.group_sizes[group];
    if (index < end) return { group_number: group + 1, initial_points: category.group_sizes.length - group };
  }
  return null;
}

export function leagueMonthLabel(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0 || index >= LEAGUE_MONTH_COUNT) throw new Error("Lig ayı geçersiz.");
  return new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(2026, 10 + index, 1)));
}

export function createLeagueDraft(tournament: TournamentWithDetails, capturedAt = new Date().toISOString()): LeagueDraft {
  if (!tournament || !nonempty(tournament.id) || !nonempty(tournament.name) ||
    ![tournament.categories, tournament.groups, tournament.players, tournament.participants, tournament.matches].every(Array.isArray) ||
    !Number.isFinite(new Date(capturedAt).getTime())) {
    throw new Error("Kaynak turnuva veya kopyalama tarihi geçersiz.");
  }
  const definitions = new Map(tournament.categories.map((category) => [category.id, sourceCategoryByName.get(normalizedName(category.name))]));
  if (definitions.size !== sourceCategories.length || [...definitions.values()].some((definition) => !definition) ||
    new Set([...definitions.values()].map((definition) => definition!.name)).size !== sourceCategories.length) {
    throw new Error("Kaynak turnuvanın 11 kategorisi eksiksiz ve tanımlı olmalı.");
  }
  const groups = new Map(tournament.groups.map((group) => [group.id, group]));
  const players = new Map(tournament.players.map((player) => [player.id, player.display_name]));
  const participantIds = new Set<string>();
  for (const entry of tournament.participants) {
    const definition = definitions.get(entry.category_id);
    const group = entry.group_id ? groups.get(entry.group_id) : undefined;
    const kind = LEAGUE_CATEGORIES.find((category) => category.key === definition?.key)?.kind;
    if (!definition || !nonempty(entry.id) || participantIds.has(entry.id) || !group || group.category_id !== entry.category_id ||
      !nonempty(group.name) || !Number.isSafeInteger(entry.display_order) ||
      !Array.isArray(entry.player_ids) || entry.player_ids.length !== (kind === "singles" ? 1 : 2) ||
      new Set(entry.player_ids).size !== entry.player_ids.length || !entry.player_ids.every((id) => nonempty(id) && nonempty(players.get(id)))) {
      throw new Error("Kaynak turnuvada eksik, yinelenen veya grubu/oyuncusu geçersiz bir katılımcı var.");
    }
    participantIds.add(entry.id);
  }
  for (const category of tournament.categories) {
    if (!tournament.participants.some((entry) => entry.category_id === category.id)) {
      throw new Error(`${category.name}: Kaynak katılımcı listesi boş.`);
    }
  }
  const standings = tournamentStandings(tournament);
  type Candidate = { row: Standing; tier: number; categoryName: string; groupName: string };
  const compare = (a: Candidate, b: Candidate) => a.tier - b.tier || a.row.rank - b.row.rank || compareOverallStandings(a.row, b.row);
  const candidates: Candidate[] = tournament.participants.map((entry) => {
    const group = groups.get(entry.group_id!)!;
    const row = standings.get(group.id)?.rows.find((row) => row.entry.id === entry.id);
    if (!row) throw new Error("Bir turnuva katılımcısının grup sıralaması bulunamadı.");
    const definition = definitions.get(entry.category_id)!;
    return { row, tier: definition.tier, categoryName: tournament.categories.find((category) => category.id === entry.category_id)!.name, groupName: group.name };
  });
  const categories: LeagueCategoryDraft[] = LEAGUE_CATEGORIES.map((definition) => {
    const ordered = candidates.filter((candidate) => definitions.get(candidate.row.entry.category_id)!.key === definition.key)
      .sort((a, b) => compare(a, b) || a.row.entry.display_order - b.row.entry.display_order || a.row.entry.id.localeCompare(b.row.entry.id));
    const identities = new Set<string>();
    const unique = ordered.filter((candidate) => {
      const identity = JSON.stringify([...candidate.row.entry.player_ids].sort());
      if (identities.has(identity)) return false;
      identities.add(identity);
      return true;
    });
    const entrants = unique.map((candidate, index): LeagueEntrant => {
      const { row } = candidate;
      const playerNames = row.entry.player_ids.map((id) => players.get(id)!);
      return {
        id: row.entry.id, player_ids: [...row.entry.player_ids], player_names: playerNames,
        display_name: playerNames.join(" / "), source_category_name: candidate.categoryName,
        source_group_name: candidate.groupName, source_rank: row.rank,
        source_tied: (index > 0 && compare(candidate, unique[index - 1]) === 0) ||
          (index + 1 < unique.length && compare(candidate, unique[index + 1]) === 0),
        source_points: row.points, source_sets_difference: row.setsWon - row.setsLost,
        source_games_difference: row.gamesWon - row.gamesLost,
      };
    });
    return { ...definition, entrants, group_sizes: defaultLeagueGroupSizes(entrants.length), matches: [] };
  });
  return {
    id: LEAGUE_DRAFT_ID, name: LEAGUE_DRAFT_NAME, source_tournament_id: tournament.id,
    source_tournament_name: tournament.name, source_captured_at: capturedAt,
    season_start: LEAGUE_SEASON_START, month_count: LEAGUE_MONTH_COUNT, revision: 1,
    created_at: capturedAt, updated_at: capturedAt, categories: prepareLeagueCategories(categories),
  };
}
