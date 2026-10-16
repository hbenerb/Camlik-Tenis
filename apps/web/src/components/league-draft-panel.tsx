"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  CirclePlus,
  LoaderCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  leagueEntryGroup,
  leagueMonthLabel,
  moveLeagueEntrant,
  prepareLeagueCategories,
  validateLeagueCategory,
  type LeagueCategoryDraft,
  type LeagueDraft,
} from "@/lib/league-draft";

type LeagueDraftPanelProps = {
  draft: LeagueDraft | null;
  isLoading: boolean;
  error: string | null;
  onSave: (
    categories: LeagueCategoryDraft[],
    expectedRevision: number,
  ) => Promise<LeagueDraft>;
  onReload: () => void;
  onBack: () => void;
};

const groupSizeOptions = [4, 6, 8, 10];
const blueButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#2563eb] px-4 text-sm font-bold text-white hover:bg-[#1d4ed8] disabled:opacity-50";
const iconButton =
  "inline-flex h-10 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--theme-border-strong)] bg-[var(--theme-panel)] hover:bg-[var(--theme-muted-surface)] disabled:opacity-30";
const summaryClasses =
  "flex min-w-0 cursor-pointer list-none items-center gap-2 rounded-md px-3 py-3 [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]";

function sourceDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Kayıt tarihi bilinmiyor"
    : new Intl.DateTimeFormat("tr-TR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Istanbul",
      }).format(date);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Taslak kaydedilemedi. Lütfen yeniden deneyin.";
}

export function LeagueDraftPanel(props: LeagueDraftPanelProps) {
  const { draft, isLoading, error, onBack, onReload } = props;

  if (draft) {
    return <LeagueDraftEditor key={draft.id} {...props} draft={draft} />;
  }

  return (
    <section aria-label="Lig taslağı" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="secondary-button gap-2" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" size={16} /> Geri
        </button>
        <h2 className="text-xl font-bold sm:text-2xl">Lig Taslağı</h2>
        <AdminBadge />
      </div>
      <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-[var(--theme-muted)]" role="status">
            <LoaderCircle aria-hidden="true" className="animate-spin" size={18} /> Lig taslağı yükleniyor…
          </p>
        ) : (
          <>
            <p className="text-sm leading-relaxed" role={error ? "alert" : undefined}>
              {error ?? "Henüz kayıtlı bir lig taslağı bulunmuyor. İlk turnuva kopyası hazırlandığında burada görünecek."}
            </p>
            <button className="secondary-button mt-4 gap-2" onClick={onReload} type="button">
              <RefreshCw aria-hidden="true" size={16} /> Tekrar yükle
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function AdminBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#2563eb]/40 px-2.5 py-1 text-xs font-semibold">
      <ShieldCheck aria-hidden="true" className="text-[#2563eb]" size={14} /> Yalnızca adminler
    </span>
  );
}

function LeagueDraftEditor({
  draft,
  isLoading,
  error,
  onSave,
  onReload,
  onBack,
}: LeagueDraftPanelProps & { draft: LeagueDraft }) {
  const [receivedDraft, setReceivedDraft] = useState(draft);
  const [source, setSource] = useState(draft);
  const [categories, setCategories] = useState(draft.categories);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [wasSaved, setWasSaved] = useState(false);
  const [discardAction, setDiscardAction] = useState<"reload" | "back" | null>(null);

  // A successful explicit reload or save supplies a new snapshot. Loading and
  // failed requests keep the same snapshot so local edits remain available.
  if (draft !== receivedDraft) {
    setReceivedDraft(draft);
    setSource(draft);
    setCategories(draft.categories);
    setSaveError(null);
    setWasSaved(draft === source && wasSaved);
    setDiscardAction(null);
  }

  const dirty = useMemo(
    () => JSON.stringify(categories) !== JSON.stringify(source.categories),
    [categories, source.categories],
  );
  const issues = categories.flatMap((category) => {
    const issue = validateLeagueCategory(category);
    return issue ? [issue.startsWith(`${category.name}:`) ? issue : `${category.name}: ${issue}`] : [];
  });
  const totalEntrants = categories.reduce((total, category) => total + category.entrants.length, 0);
  const totalMatches = categories.reduce((total, category) => total + category.matches.length, 0);

  function updateCategory(nextCategory: LeagueCategoryDraft) {
    setCategories((current) => {
      const next = current.map((category) => category.key === nextCategory.key ? nextCategory : category);
      if (next.every((category) => validateLeagueCategory(category) === null)) {
        return prepareLeagueCategories(next);
      }
      return next.map((category) => validateLeagueCategory(category) ? { ...category, matches: [] } : category);
    });
    setSaveError(null);
    setWasSaved(false);
    setDiscardAction(null);
  }

  async function save() {
    if (isSaving || issues.length || !dirty) return;
    setIsSaving(true);
    setSaveError(null);
    setWasSaved(false);
    try {
      const saved = await onSave(prepareLeagueCategories(categories), source.revision);
      setSource(saved);
      setCategories(saved.categories);
      setWasSaved(true);
      setDiscardAction(null);
    } catch (failure) {
      setSaveError(errorMessage(failure));
    } finally {
      setIsSaving(false);
    }
  }

  function navigate(action: "reload" | "back") {
    if (dirty) {
      setDiscardAction(action);
      return;
    }
    if (action === "reload") onReload();
    else onBack();
  }

  return (
    <section aria-label="Lig taslağı" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="secondary-button gap-2" disabled={isSaving} onClick={() => navigate("back")} type="button">
          <ArrowLeft aria-hidden="true" size={16} /> Geri
        </button>
        <AdminBadge />
      </div>

      <header className="min-w-0 rounded-lg border border-[#2563eb]/35 bg-[var(--theme-surface)] p-4 sm:p-5">
        <h2 className="text-xl font-bold leading-snug sm:text-2xl">Lig Taslağı <span className="font-normal">· Kasım 2026–Ekim 2027</span></h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--theme-muted)]">
          {categories.length} kategori · {totalEntrants} katılımcı/çift · {issues.length ? "Fikstür için grup kapasitelerini tamamlayın" : `${totalEntrants / 2} maç/ay · ${totalMatches} maç`}
        </p>
        <p className="mt-3 break-words text-xs leading-relaxed text-[var(--theme-muted)]">
          Kaynak: {source.source_tournament_name} · İlk kopya: {sourceDate(source.source_captured_at)}.
          {" "}Turnuva sonuçları bu taslağı kendiliğinden değiştirmez.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className={blueButton} disabled={isSaving || isLoading || issues.length > 0 || !dirty} onClick={save} type="button">
            {isSaving ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <Save aria-hidden="true" size={16} />}
            {isSaving ? "Kaydediliyor…" : "Taslağı kaydet"}
          </button>
          <button className="secondary-button gap-2" disabled={isSaving || isLoading} onClick={() => navigate("reload")} type="button">
            <RefreshCw aria-hidden="true" className={isLoading ? "animate-spin" : undefined} size={16} /> Kaydı yeniden yükle
          </button>
          <span aria-live="polite" className="text-xs text-[var(--theme-muted)]">
            {dirty ? "Kaydedilmemiş değişiklikler" : wasSaved ? "Taslak kaydedildi" : "Kayıtlı taslak"}
          </span>
        </div>
      </header>

      {discardAction ? (
        <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-warning-bg)] p-4 text-sm text-[var(--theme-warning-text)]" role="alert">
          <p>Kaydedilmemiş düzenlemeleriniz var. Devam ederseniz bu düzenlemeler bırakılacak.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="secondary-button" onClick={() => {
              setDiscardAction(null);
              if (discardAction === "reload") onReload();
              else onBack();
            }} type="button">{discardAction === "reload" ? "Düzenlemeleri bırak ve yeniden yükle" : "Kaydetmeden dön"}</button>
            <button className="secondary-button" onClick={() => setDiscardAction(null)} type="button">Düzenlemeye devam et</button>
          </div>
        </div>
      ) : null}

      {saveError || error ? (
        <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-warning-bg)] p-4 text-sm leading-relaxed text-[var(--theme-warning-text)]" role="alert">
          <p>{saveError ?? error}</p>
          <p className="mt-1">Düzenlemeleriniz bu ekranda korunuyor. Başka bir admin taslağı değiştirdiyse güncel kaydı yeniden yükleyip düzenlemeleri uygulayın.</p>
        </div>
      ) : null}

      {issues.length ? (
        <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-warning-bg)] p-4 text-sm text-[var(--theme-warning-text)]" role="alert">
          <p className="font-semibold">Kaydetmeden önce grup dağılımını tamamlayın.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </div>
      ) : null}

      <fieldset className="min-w-0 space-y-3" disabled={isSaving || isLoading}>
        <legend className="sr-only">Lig kategorileri ve düzenlemeleri</legend>
        {categories.map((category) => <LeagueCategoryEditor category={category} key={category.key} monthCount={source.month_count} onChange={updateCategory} />)}
      </fieldset>
      <p className="text-xs leading-relaxed text-[var(--theme-muted)]">Her katılımcı/çift ayda kendi grubundan bir rakiple oynar. Tüm rakiplerle eşleşme tamamlanınca rövanş döngüsü başlar.</p>
    </section>
  );
}

function LeagueCategoryEditor({
  category,
  monthCount,
  onChange,
}: {
  category: LeagueCategoryDraft;
  monthCount: number;
  onChange: (category: LeagueCategoryDraft) => void;
}) {
  const [month, setMonth] = useState(0);
  const [group, setGroup] = useState("all");
  const issue = validateLeagueCategory(category);
  const capacity = category.group_sizes.reduce((total, size) => total + size, 0);
  const selectedGroup = group === "all" || Number(group) <= category.group_sizes.length ? group : "all";
  const entrantsById = new Map(category.entrants.map((entrant) => [entrant.id, entrant]));
  const matches = category.matches.filter((match) => match.month_index === month && (selectedGroup === "all" || match.group_number === Number(selectedGroup)));
  const tiedCount = category.entrants.filter((entrant) => entrant.source_tied).length;

  function changeGroupSize(index: number, size: number) {
    onChange({ ...category, group_sizes: category.group_sizes.map((current, currentIndex) => currentIndex === index ? size : current) });
  }

  return (
    <details className="group/league-category min-w-0 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <summary className={`${summaryClasses} py-4 sm:px-4`}>
        <ChevronRight aria-hidden="true" className="shrink-0 text-[#2563eb] transition-transform group-open/league-category:rotate-90" size={20} />
        <h3 className="min-w-0 flex-1 text-base font-bold">{category.name}</h3>
        <span className="shrink-0 text-right text-xs leading-5 text-[var(--theme-muted)]">{category.entrants.length} {category.kind === "doubles" ? "çift" : "kişi"}<br />{category.group_sizes.length} grup</span>
      </summary>
      <div className="min-w-0 space-y-3 border-t border-[var(--theme-border)] p-3 sm:p-4">
        <details className="group/league-standings min-w-0 rounded-md border border-[var(--theme-border)] bg-[var(--theme-panel)]">
          <summary className={summaryClasses}>
            <ChevronRight aria-hidden="true" className="shrink-0 transition-transform group-open/league-standings:rotate-90" size={18} />
            <h4 className="text-sm font-semibold">Sıralama Listesi</h4>
          </summary>
          <div className="min-w-0 space-y-4 border-t border-[var(--theme-border)] p-3">
            <div className="min-w-0 rounded-md bg-[var(--theme-muted-surface)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="text-sm font-semibold">Gruplar</h5>
                <span className="text-xs text-[var(--theme-muted)]">{capacity}/{category.entrants.length} yer</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {category.group_sizes.map((size, index) => (
                  <div className="flex min-w-0 items-center gap-2 rounded-md border border-[var(--theme-border)] bg-[var(--theme-panel)] p-2" key={index}>
                    <span className="shrink-0 text-xs font-semibold">Grup {index + 1}</span>
                    <select aria-label={`${category.name} Grup ${index + 1} kişi sayısı`} className="input input-compact flex-1" onChange={(event) => changeGroupSize(index, Number(event.target.value))} value={size}>
                      {groupSizeOptions.map((option) => <option key={option} value={option}>{option} {category.kind === "doubles" ? "çift" : "kişi"}</option>)}
                    </select>
                    <button aria-label={`${category.name} Grup ${index + 1} kaldır`} className={iconButton} disabled={category.group_sizes.length <= 1} onClick={() => onChange({ ...category, group_sizes: category.group_sizes.filter((_, currentIndex) => currentIndex !== index) })} type="button"><X aria-hidden="true" size={15} /></button>
                  </div>
                ))}
              </div>
              <button className="secondary-button mt-3 gap-2" onClick={() => onChange({ ...category, group_sizes: [...category.group_sizes, 4] })} type="button"><CirclePlus aria-hidden="true" size={16} /> Grup ekle</button>
              <p className="mt-2 text-xs leading-relaxed text-[var(--theme-muted)]">Sıralama yukarıdan aşağıya gruplara yerleşir. Grup 1 {category.group_sizes.length} puanla başlar; her alt grubun başlangıç puanı 1 azalır.</p>
              {issue ? <p className="mt-2 text-xs font-semibold text-[var(--theme-warning-text)]">{issue}</p> : null}
            </div>
            <p className="text-xs leading-relaxed text-[var(--theme-muted)]">Sıra numarasını yazıp Enter’a basın veya okları kullanın. Grup ve başlangıç puanı önizlemesi anında güncellenir.</p>
            {tiedCount ? <p className="rounded-md bg-[var(--theme-warning-bg)] p-3 text-xs leading-relaxed text-[var(--theme-warning-text)]">Turnuva sırası, puan, set ve oyun averajıyla çözülemeyen eşitliklerde mevcut kayıt sırası korundu. “Eşitlik” işaretli {tiedCount} katılımcı/çiftin sırasını gözden geçirin.</p> : null}
            <ol aria-label={`${category.name} sıralama listesi`} className="min-w-0 divide-y divide-[var(--theme-border)]">
              {category.entrants.map((entrant, index) => {
                const placement = leagueEntryGroup(category, entrant.id);
                return (
                  <li className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_4.5rem] gap-x-2 gap-y-1 py-3" key={entrant.id}>
                    <input aria-label={`${entrant.display_name} sıra numarası`} className="input input-compact row-span-2 self-start text-center" defaultValue={index + 1} inputMode="numeric" key={`${entrant.id}-${index}`} max={category.entrants.length} min={1} onBlur={(event) => {
                      const requestedRank = Number(event.target.value);
                      if (Number.isInteger(requestedRank) && requestedRank >= 1 && requestedRank <= category.entrants.length) {
                        if (requestedRank !== index + 1) onChange(moveLeagueEntrant(category, index, requestedRank - 1));
                      } else event.target.value = String(index + 1);
                    }} onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      } else if (event.key === "Escape") {
                        event.currentTarget.value = String(index + 1);
                        event.currentTarget.blur();
                      }
                    }} type="number" />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold leading-snug">{entrant.display_name}</p>
                      <p className="mt-1 break-words text-[11px] leading-relaxed text-[var(--theme-muted)]">{entrant.source_category_name} · {entrant.source_group_name} · Turnuva {entrant.source_rank}.</p>
                    </div>
                    <div className="row-span-2 flex items-start justify-end gap-1">
                      <button aria-label={`${entrant.display_name} yukarı taşı`} className={iconButton} disabled={index === 0} onClick={() => onChange(moveLeagueEntrant(category, index, index - 1))} type="button"><ArrowUp aria-hidden="true" size={15} /></button>
                      <button aria-label={`${entrant.display_name} aşağı taşı`} className={iconButton} disabled={index === category.entrants.length - 1} onClick={() => onChange(moveLeagueEntrant(category, index, index + 1))} type="button"><ArrowDown aria-hidden="true" size={15} /></button>
                    </div>
                    <p className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-[var(--theme-muted)]">
                      <span>{placement ? `Grup ${placement.group_number}` : "Grup bekleniyor"}</span>
                      <span>{placement ? `${placement.initial_points} başlangıç puanı` : "Puan bekleniyor"}</span>
                      {entrant.source_tied ? <span className="rounded bg-[var(--theme-warning-bg)] px-1.5 text-[var(--theme-warning-text)]">Eşitlik</span> : null}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </details>

        <details className="group/league-matches min-w-0 rounded-md border border-[var(--theme-border)] bg-[var(--theme-panel)]">
          <summary className={summaryClasses}>
            <ChevronRight aria-hidden="true" className="shrink-0 transition-transform group-open/league-matches:rotate-90" size={18} />
            <h4 className="text-sm font-semibold">Maçlar</h4>
          </summary>
          <div className="min-w-0 space-y-3 border-t border-[var(--theme-border)] p-3">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="min-w-0 text-xs font-semibold">Ay
                <select aria-label={`${category.name} maç ayı`} className="input mt-1" onChange={(event) => setMonth(Number(event.target.value))} value={month}>
                  {Array.from({ length: monthCount }, (_, index) => <option key={index} value={index}>{leagueMonthLabel(index)}</option>)}
                </select>
              </label>
              <label className="min-w-0 text-xs font-semibold">Grup
                <select aria-label={`${category.name} maç grubu`} className="input mt-1" onChange={(event) => setGroup(event.target.value)} value={selectedGroup}>
                  <option value="all">Tüm gruplar</option>
                  {category.group_sizes.map((_, index) => <option key={index} value={index + 1}>Grup {index + 1}</option>)}
                </select>
              </label>
            </div>
            {issue ? <p className="rounded-md bg-[var(--theme-warning-bg)] p-3 text-sm leading-relaxed text-[var(--theme-warning-text)]">Maç önizlemesi için grup kapasitesini katılımcı sayısına eşitleyin.</p> : (
              <>
                <p aria-live="polite" className="text-xs text-[var(--theme-muted)]">{leagueMonthLabel(month)} · {matches.length} maç</p>
                <ul aria-label={`${category.name} ${leagueMonthLabel(month)} maçları`} className="grid min-w-0 gap-2 lg:grid-cols-2">
                  {matches.map((match) => (
                    <li className="min-w-0 rounded-md border border-[var(--theme-border)] p-3" key={match.id}>
                      <p className="mb-2 text-[11px] font-semibold text-[var(--theme-muted)]">Grup {match.group_number}</p>
                      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm font-semibold leading-snug">
                        <p className="break-words">{entrantsById.get(match.player1_entry_id)?.display_name ?? "Katılımcı bulunamadı"}</p>
                        <span aria-label="karşılaşır" className="text-xs font-normal text-[var(--theme-muted)]">—</span>
                        <p className="break-words text-right">{entrantsById.get(match.player2_entry_id)?.display_name ?? "Katılımcı bulunamadı"}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                {matches.length === 0 ? <p className="py-3 text-center text-sm text-[var(--theme-muted)]">Bu filtrede maç bulunmuyor.</p> : null}
              </>
            )}
          </div>
        </details>
      </div>
    </details>
  );
}
