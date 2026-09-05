alter table public.tournament_matches
add column is_retired boolean not null default false;

-- Existing score-state checks already require a completed match, a valid winner
-- and nonempty scores for played matches. Retirement keeps those guarantees.
alter table public.tournament_matches
add constraint tournament_matches_retirement_state_valid
check (not is_retired or (score_entered and not is_walkover));

notify pgrst, 'reload schema';
