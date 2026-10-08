// Approved 29 Ekim bracket templates only. These are not scheduled matches and
// must not derive entrants from the live standings until seeding is approved.
export const OCTOBER_29_TOURNAMENT_ID = "13350264-a44c-4c44-8213-4aef62e3fbb6";

export type FinalsMatch = {
  id: string;
  title: string;
  row: number;
  lane: "left" | "center" | "right";
  seeds: readonly [string, string];
  next?: { matchId: string; slot: 0 | 1 };
};

export type FinalsTemplate = {
  matches: readonly FinalsMatch[];
  notes: readonly string[];
};

const finalMatch: FinalsMatch = {
  id: "final", title: "Final", row: 0, lane: "center", seeds: ["", ""],
};

const byeTemplate: FinalsTemplate = {
  matches: [
    finalMatch,
    { id: "sf1", title: "Yarı final 1", row: 1, lane: "left", seeds: ["A1", ""], next: { matchId: "final", slot: 0 } },
    { id: "sf2", title: "Yarı final 2", row: 1, lane: "right", seeds: ["B1", ""], next: { matchId: "final", slot: 1 } },
    { id: "qf1", title: "Playoff 1", row: 2, lane: "left", seeds: ["B2", "A3"], next: { matchId: "sf1", slot: 1 } },
    { id: "qf2", title: "Playoff 2", row: 2, lane: "right", seeds: ["A2", "B3"], next: { matchId: "sf2", slot: 1 } },
  ],
  notes: ["A1 ve B1, BYE ile doğrudan yarı finale geçer."],
};

const crossTemplate: FinalsTemplate = {
  matches: [
    finalMatch,
    { id: "sf1", title: "Yarı final 1", row: 1, lane: "left", seeds: ["A1", "B2"], next: { matchId: "final", slot: 0 } },
    { id: "sf2", title: "Yarı final 2", row: 1, lane: "right", seeds: ["B1", "A2"], next: { matchId: "final", slot: 1 } },
  ],
  notes: [],
};

const singleSemiTemplate: FinalsTemplate = {
  matches: [
    finalMatch,
    { id: "sf1", title: "Yarı final 1", row: 1, lane: "left", seeds: ["1", "4"], next: { matchId: "final", slot: 0 } },
    { id: "sf2", title: "Yarı final 2", row: 1, lane: "right", seeds: ["2", "3"], next: { matchId: "final", slot: 1 } },
  ],
  notes: ["Yarı finaller: 1–4 ve 2–3."],
};

const finalOnlyTemplate: FinalsTemplate = {
  matches: [{ ...finalMatch, seeds: ["1", "2"] }],
  notes: ["Grubun ilk iki sırası final oynar."],
};

const playoffTemplate: FinalsTemplate = {
  matches: [
    finalMatch,
    { id: "sf1", title: "Yarı final 1", row: 1, lane: "left", seeds: ["L2", "L3"], next: { matchId: "final", slot: 0 } },
    { id: "sf2", title: "Yarı final 2", row: 1, lane: "right", seeds: ["L1", ""], next: { matchId: "final", slot: 1 } },
    { id: "e2", title: "Playoff 2", row: 2, lane: "right", seeds: ["İ1", ""], next: { matchId: "sf2", slot: 1 } },
    { id: "e1", title: "Playoff 1", row: 3, lane: "right", seeds: ["İ2", "İ3"], next: { matchId: "e2", slot: 1 } },
  ],
  notes: [
    "L1–L3: grup birincileri. İ1–İ3: grup ikincileri.",
    "Her küme puana göre sıralanır; 1 en yüksek puanlıdır.",
    "En iyi ikinci ilk turu pas geçer.",
  ],
};

function normalizeCategory(name: string) {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

const categoryTemplates: readonly (readonly [string, { groups: number; template: FinalsTemplate }])[] = [
  ["Erkek Master", { groups: 2, template: byeTemplate }],
  ["Erkek İleri", { groups: 2, template: byeTemplate }],
  ["Kadın İleri", { groups: 2, template: crossTemplate }],
  ["Kadın Orta", { groups: 1, template: finalOnlyTemplate }],
  ["Erkek Orta", { groups: 3, template: playoffTemplate }],
  ["Yeni Başlayan Kadın", { groups: 2, template: crossTemplate }],
  ["YB Kadın", { groups: 2, template: crossTemplate }],
  ["Double Master Erkek", { groups: 2, template: crossTemplate }],
  ["Double İleri Erkek", { groups: 1, template: finalOnlyTemplate }],
  ["Orta Mix", { groups: 1, template: finalOnlyTemplate }],
  ["OS - Mix", { groups: 1, template: finalOnlyTemplate }],
  ["İleri Mix", { groups: 1, template: singleSemiTemplate }],
  ["Double Kadın", { groups: 1, template: finalOnlyTemplate }],
];
const approvedCategories = new Map(categoryTemplates.map(([name, config]) => [normalizeCategory(name), config]));

export function getTournamentFinalsTemplate(
  tournamentId: string,
  category: { name: string; group_count: number },
): FinalsTemplate | null {
  if (tournamentId !== OCTOBER_29_TOURNAMENT_ID) return null;
  const approved = approvedCategories.get(normalizeCategory(category.name));
  return approved?.groups === category.group_count ? approved.template : null;
}

// Horizontal coordinates are percentages, vertical coordinates are pixels.
// Keeping two lanes even on phones preserves the actual advancement paths.
export const FINALS_CARD_WIDTH = 46;
export const FINALS_CARD_HEIGHT = 94;
export const FINALS_ROW_STEP = 150;

export function finalsMatchPosition(match: FinalsMatch) {
  return {
    left: match.lane === "left" ? 0 : match.lane === "right" ? 54 : 27,
    top: match.row * FINALS_ROW_STEP,
  };
}

export function finalsConnection(source: FinalsMatch, target: FinalsMatch, slot: 0 | 1) {
  const from = finalsMatchPosition(source);
  const to = finalsMatchPosition(target);
  const sx = from.left + FINALS_CARD_WIDTH / 2;
  const ex = to.left + FINALS_CARD_WIDTH * (slot === 0 ? 0.25 : 0.75);
  const endY = to.top + FINALS_CARD_HEIGHT;
  const bend = (from.top + endY) / 2;
  return {
    path: `M ${sx} ${from.top} V ${bend} H ${ex} V ${endY + 6}`,
    arrowLeft: ex,
    arrowTop: endY,
  };
}
