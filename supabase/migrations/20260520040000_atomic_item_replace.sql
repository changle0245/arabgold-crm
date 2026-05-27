-- ============================================================
-- H3 fix: atomic line-item replacement
-- ============================================================
-- Editing a quotation/deal replaced its line items with a
-- delete-then-insert issued from the client. The two statements were
-- not in one transaction and the INSERT's error went unchecked: if the
-- insert failed (RLS / constraint / network) after the delete had
-- committed, every line item was lost while the header kept its
-- total_amount, and the UI still reported "保存成功".
--
-- These functions do the delete + insert inside a single function body
-- — one transaction. A failing insert rolls the delete back, so the
-- existing items survive and the caller receives the error.
--
-- SECURITY INVOKER (default): delete/insert run with the caller's
-- privileges, so the existing RLS policies on quotation_items /
-- deal_items still apply unchanged — this is not a privilege change,
-- only an atomicity fix.
-- ============================================================

create or replace function public.replace_quotation_items(p_quotation_id uuid, p_items jsonb)
returns void
language plpgsql
as $$
begin
  delete from public.quotation_items where quotation_id = p_quotation_id;

  insert into public.quotation_items
    (quotation_id, product_name, spec, quantity, unit, unit_price, amount, remark)
  select
    p_quotation_id, x.product_name, x.spec, x.quantity, x.unit, x.unit_price, x.amount, x.remark
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
    product_name text, spec text, quantity numeric,
    unit text, unit_price numeric, amount numeric, remark text
  );
end;
$$;

create or replace function public.replace_deal_items(p_deal_id uuid, p_items jsonb)
returns void
language plpgsql
as $$
begin
  delete from public.deal_items where deal_id = p_deal_id;

  insert into public.deal_items
    (deal_id, product_name, spec, quantity, unit, unit_price, amount, remark)
  select
    p_deal_id, x.product_name, x.spec, x.quantity, x.unit, x.unit_price, x.amount, x.remark
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
    product_name text, spec text, quantity numeric,
    unit text, unit_price numeric, amount numeric, remark text
  );
end;
$$;



-- ----------------------------------------------------------
-- Phase 3a Neon port: Supabase-specific SQL stripped above
-- (RLS policies / grants / storage / pg_cron). See top of
-- 20260514091040_initial_schema.sql for the auth.uid() stub.
-- ----------------------------------------------------------
