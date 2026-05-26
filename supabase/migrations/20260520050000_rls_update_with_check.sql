-- ============================================================
-- M1 fix: add WITH CHECK to UPDATE policies
-- ============================================================
-- quotations / deals / samples / reminders and the *_items tables had
-- UPDATE RLS policies with a USING clause but no WITH CHECK. USING only
-- vets the OLD row, so a member could UPDATE a row they own and set its
-- customer_id (or a reminder's assigned_to) to a value they do NOT own
-- — silently moving the row out of their scope. customers_update was
-- given a WITH CHECK in an earlier migration; these siblings were not.
--
-- Fix: set each UPDATE policy's WITH CHECK equal to its USING clause, so
-- the post-update row must satisfy the same ownership test.
-- ============================================================

alter policy quotations_update on public.quotations
  with check (
    customer_id in (select id from public.customers where owner_id = auth.uid())
    or public.get_my_role() = 'admin'
  );

alter policy deals_update on public.deals
  with check (
    customer_id in (select id from public.customers where owner_id = auth.uid())
    or public.get_my_role() = 'admin'
  );

alter policy samples_update on public.samples
  with check (
    customer_id in (select id from public.customers where owner_id = auth.uid())
    or public.get_my_role() = 'admin'
  );

alter policy reminders_update on public.reminders
  with check (
    assigned_to = auth.uid() or public.get_my_role() = 'admin'
  );

alter policy quotation_items_update on public.quotation_items
  with check (
    exists (
      select 1 from public.quotations q
      where q.id = quotation_items.quotation_id and public.owns_customer(q.customer_id)
    )
  );

alter policy deal_items_update on public.deal_items
  with check (
    exists (
      select 1 from public.deals d
      where d.id = deal_items.deal_id and public.owns_customer(d.customer_id)
    )
  );
