-- ============================================================
-- Phase 5C · replace_quotation_items / replace_deal_items 接受 master_product_id
-- ============================================================
-- 阶段 4 给 quotation_items + deal_items 加了 master_product_id (uuid, nullable)。
-- 此 migration 把对应的 jsonb→record 解析 + INSERT 字段列表都加上 master_product_id,
-- 使前端在产品选择器选中台产品时,把 master_products.id 一起写下来。
--
-- 字段保持 nullable;前端可传 null(自由文本商品)或 uuid(选了中台产品)。
-- 既有调用方不传 master_product_id 也兼容 — jsonb_to_recordset 找不到字段时返回 null,
-- INSERT 默认走 column default(无 default 也是 null)。
--
-- 与 20260520040000_atomic_item_replace.sql 一样,函数体走 SECURITY INVOKER,
-- RLS 由调用者(authenticated)凭证决定。
-- ============================================================

create or replace function public.replace_quotation_items(p_quotation_id uuid, p_items jsonb)
returns void
language plpgsql
as $$
begin
  delete from public.quotation_items where quotation_id = p_quotation_id;

  insert into public.quotation_items
    (quotation_id, product_name, spec, quantity, unit, unit_price, amount, remark, master_product_id)
  select
    p_quotation_id, x.product_name, x.spec, x.quantity, x.unit, x.unit_price, x.amount, x.remark, x.master_product_id
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
    product_name text, spec text, quantity numeric,
    unit text, unit_price numeric, amount numeric, remark text,
    master_product_id uuid
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
    (deal_id, product_name, spec, quantity, unit, unit_price, amount, remark, master_product_id)
  select
    p_deal_id, x.product_name, x.spec, x.quantity, x.unit, x.unit_price, x.amount, x.remark, x.master_product_id
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
    product_name text, spec text, quantity numeric,
    unit text, unit_price numeric, amount numeric, remark text,
    master_product_id uuid
  );
end;
$$;
