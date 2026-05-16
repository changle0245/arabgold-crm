-- ============================================================
-- Phase 2: Allow customer owner (in addition to admin) to delete
-- quotations / quotation_items / deals / samples.
-- Edit symmetry: if owner can edit, owner can delete.
-- Uses the existing public.owns_customer() helper.
-- ============================================================

-- quotations
drop policy if exists "quotations_delete" on public.quotations;
create policy quotations_delete on public.quotations
  for delete to authenticated
  using (public.owns_customer(customer_id));

-- quotation_items: keyed via parent quotation's customer
drop policy if exists "quotation_items_delete" on public.quotation_items;
create policy quotation_items_delete on public.quotation_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.quotations q
      where q.id = quotation_id and public.owns_customer(q.customer_id)
    )
  );

-- quotation_items UPDATE was previously open to any authenticated user;
-- tighten it the same way so only the owning customer's owner (or admin) can modify items
drop policy if exists "quotation_items_update" on public.quotation_items;
create policy quotation_items_update on public.quotation_items
  for update to authenticated
  using (
    exists (
      select 1 from public.quotations q
      where q.id = quotation_id and public.owns_customer(q.customer_id)
    )
  );

-- deals
drop policy if exists "deals_delete" on public.deals;
create policy deals_delete on public.deals
  for delete to authenticated
  using (public.owns_customer(customer_id));

-- samples
drop policy if exists "samples_delete" on public.samples;
create policy samples_delete on public.samples
  for delete to authenticated
  using (public.owns_customer(customer_id));
