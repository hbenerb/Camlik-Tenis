revoke execute on function public.validate_reservation()
from public, anon, authenticated;

revoke execute on function public.enforce_tournament_match_duration()
from public, anon, authenticated;

revoke execute on function public.sync_tournament_match_duration()
from public, anon, authenticated;

revoke execute on function public.validate_tournament_match_reservation_conflict()
from public, anon, authenticated;

revoke execute on function public.validate_tournament_activation_conflicts()
from public, anon, authenticated;
