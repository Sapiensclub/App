-- ============================================================================
-- SAPIENS — Phase 7, Chunk 3: category-suggestion review (PRD 9.6)
-- ============================================================================
-- Admins turn a "missing category" suggestion into a live category, or reject
-- it. Approving generates a unique slug and inserts into categories (all other
-- columns have sensible defaults). Service-role only; the dashboard re-checks
-- the admin allowlist first.
-- ============================================================================

create or replace function public.admin_approve_suggestion(
  p_id uuid, p_label text, p_parent uuid, p_icon text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_slug text; v_cat uuid;
begin
  if not exists (select 1 from public.category_suggestions where id = p_id and status = 'pending') then
    raise exception 'suggestion not pending';
  end if;
  if coalesce(trim(p_label), '') = '' then raise exception 'label required'; end if;

  v_slug := trim(both '-' from regexp_replace(lower(trim(p_label)), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'category'; end if;
  if exists (select 1 from public.categories where slug = v_slug) then
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  end if;

  insert into public.categories (parent_id, label, slug, icon, enabled)
    values (p_parent, trim(p_label), v_slug, nullif(trim(p_icon), ''), true)
    returning id into v_cat;

  update public.category_suggestions set status = 'approved' where id = p_id;
  return v_cat;
end; $$;

create or replace function public.admin_reject_suggestion(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.category_suggestions set status = 'rejected' where id = p_id and status = 'pending';
end; $$;

revoke all on function public.admin_approve_suggestion(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_reject_suggestion(uuid) from public, anon, authenticated;
grant execute on function public.admin_approve_suggestion(uuid, text, uuid, text) to service_role;
grant execute on function public.admin_reject_suggestion(uuid) to service_role;
