-- ============================================================================
-- SAPIENS — Phase 1, Chunk 2: mock KYC verification
-- ============================================================================
-- verified / over_18 / verification_token are LOCKED from clients by Phase 0
-- RLS (a user must not be able to declare themselves verified). Real KYC will
-- set them from a provider webhook via a service-role Edge Function.
--
-- For Phase 1 we ship a STUB: this SECURITY DEFINER function lets the signed-in
-- user mark THEMSELVES verified after completing the mock flow. It exists only
-- so the gate is testable end-to-end without a live vendor.
--
--   ⚠️  DEV/STUB ONLY — remove or lock down before public launch. The real
--       flow never trusts the client to assert verification.
-- ============================================================================

create or replace function public.apply_mock_kyc(
  p_name    text,
  p_token   text,
  p_over_18 boolean default true
)
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
  set verified           = true,
      over_18            = p_over_18,
      verification_token = p_token,
      -- Pre-fill the (editable) display name from the ID name if the user
      -- hasn't set one yet; never overwrite a name they chose.
      display_name       = coalesce(nullif(trim(display_name), ''), nullif(trim(p_name), '')),
      updated_at         = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.apply_mock_kyc(text, text, boolean) from public, anon;
grant execute on function public.apply_mock_kyc(text, text, boolean) to authenticated;
