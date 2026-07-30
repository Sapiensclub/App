-- ============================================================================
-- SAPIENS — Phase 1, Chunk 3: display photo (two-photo model, PRD 9.2)
-- ============================================================================
-- The editable, public display photo lives in a Storage bucket. The private
-- KYC selfie (never served) will live in a separate private bucket when real
-- KYC lands. display_photo_url is locked from direct client writes by RLS, so
-- it is set via a SECURITY DEFINER RPC — the seam where the real face-match
-- (against the KYC selfie) runs before accepting a new photo.
-- ============================================================================

-- Public bucket for display photos. Files are namespaced by user id folder.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- A user may write only inside their own "<uid>/…" folder.
create policy "avatars: owner uploads own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: owner updates own folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: owner deletes own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Display photos are shown to others → public read.
create policy "avatars: public read"
  on storage.objects for select to public
  using (bucket_id = 'avatars');

-- Accept a new display photo. STUB: the real flow face-matches p_url against
-- the private KYC selfie and only sets it on a match (PRD 9.2); repeated
-- failures soft-flag to reports/admin. The mock auto-accepts.
create or replace function public.set_display_photo(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles
  set display_photo_url = p_url,
      updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.set_display_photo(text) from public, anon;
grant execute on function public.set_display_photo(text) to authenticated;
