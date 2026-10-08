-- Explicit deny policy documents the intended RLS state of the trigger-only
-- barrier. Its owner still writes from the narrowly bound SECURITY DEFINER trigger.
create policy court_schedule_guard_deny_api on private.court_schedule_write_guard
  for all to public using (false) with check (false);
