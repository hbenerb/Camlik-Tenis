import { readFile } from "node:fs/promises";

export const uid = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const admin = uid(1), member = uid(2), courtA = uid(3), courtB = uid(4);
export const activeTournament = uid(5), draftTournament = uid(6);
export const legacy1 = uid(7), legacy2 = uid(8);
export const migrationPath = new URL("../../../../supabase/migrations/20261008102514_prevent_all_court_schedule_conflicts.sql", import.meta.url);
export const migrationSQL = async () => await readFile(migrationPath, "utf8") + await readFile(
  new URL("../../../../supabase/migrations/20261008102832_deny_api_access_to_schedule_guard.sql", import.meta.url), "utf8",
);

export const fixtureSQL = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema private;
  create function auth.uid() returns uuid language sql stable as $$
    select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
  grant usage on schema auth to authenticated, anon, service_role;
  create table public.courts (id uuid primary key, name text);
  create table public.tournaments (id uuid primary key, name text, is_active boolean not null);
  create table public.tournament_matches (
    id uuid primary key default gen_random_uuid(), tournament_id uuid not null references public.tournaments(id),
    court_id uuid references public.courts(id), starts_at timestamptz not null, ends_at timestamptz not null,
    status text not null default 'scheduled', score text, check(ends_at > starts_at)
  );
  create table public.reservations (
    id uuid primary key default gen_random_uuid(), court_id uuid not null references public.courts(id),
    user_id uuid default auth.uid(), starts_at timestamptz not null, ends_at timestamptz not null,
    status text not null default 'confirmed', note text, check(ends_at > starts_at)
  );
  insert into public.courts values ('${courtA}','A'), ('${courtB}','B');
  insert into public.tournaments values ('${activeTournament}','Active',true), ('${draftTournament}','Draft',false);
  grant select on public.courts, public.tournaments to authenticated;
  grant select, insert, update, delete on public.tournament_matches, public.reservations to authenticated;
  alter table public.tournament_matches enable row level security;
  alter table public.reservations enable row level security;
  create policy admin_matches on public.tournament_matches to authenticated
    using (auth.uid()='${admin}') with check (auth.uid()='${admin}');
  create policy own_reservations on public.reservations to authenticated
    using (user_id=auth.uid()) with check (user_id=auth.uid());
`;

export async function durationSQL() {
  return readFile(new URL("../../../../supabase/migrations/20260816105243_tournament_match_duration.sql", import.meta.url), "utf8");
}

export function matchSQL(id, start, court = courtA, tournament = activeTournament, status = "scheduled") {
  return `insert into public.tournament_matches(id,tournament_id,court_id,starts_at,ends_at,status)
    values ('${id}','${tournament}','${court}','${start}','${start}'::timestamptz + interval '90 minutes','${status}');`;
}
export function reservationSQL(id, start, court = courtA, status = "confirmed") {
  return `insert into public.reservations(id,court_id,starts_at,ends_at,status)
    values ('${id}','${court}','${start}','${start}'::timestamptz + interval '1 hour','${status}');`;
}

export const seedSQL = `update public.tournaments set match_duration_minutes=90;
  ${matchSQL(legacy1, "2026-10-10 14:00+03")}
  ${matchSQL(legacy2, "2026-10-10 14:00+03")}`;
