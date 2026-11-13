-- The game server seeds a brand-new local profile from the lounge name the
-- member already chose, so a member must be able to read their own
-- display_name. Column-scoped on purpose: the moderation flags stay unreadable
-- from the API (they are served through lounge_permissions), and the policy
-- limits rows to the caller so no other member's profile is visible.
begin;
grant select (user_id, display_name) on public.profiles to authenticated;
create policy profiles_read_own on public.profiles for select to authenticated using (user_id = auth.uid());
commit;
