-- Explicit links distinguish a bracket slot from its calendar booking.
-- This migration never creates/moves matches or changes any recorded score.
alter table public.tournament_matches add column if not exists bracket_match_id text;
alter table public.tournament_matches drop constraint if exists tournament_matches_phase_valid;
alter table public.tournament_matches add constraint tournament_matches_phase_valid
  check (phase in ('group', 'playoff', 'quarterfinal', 'semifinal', 'final'));
alter table public.tournament_matches add constraint tournament_matches_bracket_round_valid check (
  bracket_match_id is null or (group_id is null and (
    (phase = 'playoff' and bracket_match_id in ('qf1','qf2','qf3','qf4','e1','e2')) or
    (phase = 'quarterfinal' and bracket_match_id in ('qf1','qf2','qf3','qf4')) or
    (phase = 'semifinal' and bracket_match_id in ('sf1','sf2')) or
    (phase = 'final' and bracket_match_id = 'final')
  ))
);
create unique index tournament_matches_active_bracket_unique
  on public.tournament_matches(tournament_id, category_id, bracket_match_id)
  where bracket_match_id is not null and status <> 'canceled';

create or replace function private.validate_tournament_bracket_entries()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.bracket_match_id is not null and (
    new.player1_entry_id = new.player2_entry_id or
    not exists (select 1 from public.tournament_categories c where c.id = new.category_id and c.tournament_id = new.tournament_id) or
    not exists (select 1 from public.tournament_entries e where e.id = new.player1_entry_id and e.category_id = new.category_id) or
    not exists (select 1 from public.tournament_entries e where e.id = new.player2_entry_id and e.category_id = new.category_id)
  ) then
    raise exception 'Eleme maçında aynı kategoriden iki farklı oyuncu/takım seçilmeli.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_tournament_bracket_entries() from public, anon, authenticated;
create trigger tournament_matches_validate_bracket_entries
  before insert or update on public.tournament_matches
  for each row execute function private.validate_tournament_bracket_entries();

-- Group membership changes must never turn a knockout fixture into a group match.
create or replace function public.sync_tournament_entry_group_matches()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.group_id is distinct from old.group_id then
    update public.tournament_matches set group_id = new.group_id
    where phase = 'group' and (player1_entry_id = new.id or player2_entry_id = new.id);
  end if;
  return new;
end;
$$;
