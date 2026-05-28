-- ============================================================
-- Phase 4 stage 4 · 中台主数据关联字段
-- ============================================================
-- CRM 是客户主数据真正录入入口(业务员 admin 录入,字段最完整);
-- INSERT / UPDATE 触发 outbound hook 把客户主数据 push 到中台
-- master_customers,首次同步后中台回 master_id 写回 CRM 这里。
--
-- - customers.master_customer_id     uuid, unique, nullable
--     · null = 本地新建,尚未同步到中台
--     · 非空 = 已同步,值即中台 master_customers.id
-- - quotation_items.master_product_id  uuid, nullable
-- - deal_items.master_product_id       uuid, nullable
--     · 选择中台产品时填写,可空(自由文本商品也允许)
--
-- 字段全部不加 FK,跨库引用通过应用层维护。
-- ============================================================

alter table public.customers
  add column if not exists master_customer_id uuid;

create unique index if not exists customers_master_customer_id_unique
  on public.customers (master_customer_id)
  where master_customer_id is not null;

comment on column public.customers.master_customer_id is
  '中台 master_customers.id (uuid). null = 未同步; 非空 = 已 push 到中台并回填。CRM 是主数据录入入口。';

alter table public.quotation_items
  add column if not exists master_product_id uuid;

comment on column public.quotation_items.master_product_id is
  '中台 master_products.id (uuid). 选中台产品时填写;自由文本商品保持 null。';

alter table public.deal_items
  add column if not exists master_product_id uuid;

comment on column public.deal_items.master_product_id is
  '中台 master_products.id (uuid). 选中台产品时填写;自由文本商品保持 null。';
