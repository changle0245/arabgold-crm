-- ============================================================
-- Migration: 扩展 customers 表，增加 17 个字段
-- 目标：把联系方式从备注里拆出来，加上外贸场景常用的客户画像字段
-- ============================================================

-- ── 客户身份 ──
alter table public.customers add column if not exists contact_title text;       -- 职位（采购/CEO等）
alter table public.customers add column if not exists gender text;              -- 性别（男/女/不便提供）
alter table public.customers add column if not exists company_website text;     -- 公司网站
alter table public.customers add column if not exists company_address text;     -- 公司地址

-- ── 联系方式（独立字段，不再揉进备注）──
alter table public.customers add column if not exists phone text;               -- 手机号（区别于 WhatsApp）
alter table public.customers add column if not exists wechat_id text;           -- 微信号
alter table public.customers add column if not exists telegram text;            -- Telegram
alter table public.customers add column if not exists linkedin text;            -- LinkedIn URL
alter table public.customers add column if not exists skype text;               -- Skype
alter table public.customers add column if not exists instagram text;           -- Instagram
alter table public.customers add column if not exists facebook text;            -- Facebook
alter table public.customers add column if not exists alibaba_id text;          -- 阿里巴巴账号

-- ── 业务进展 ──
alter table public.customers add column if not exists first_contact_date date;  -- 首次接触日期
alter table public.customers add column if not exists purchase_frequency text;  -- 采购频率
alter table public.customers add column if not exists decision_role text;       -- 决策角色

-- ── 公司画像 ──
alter table public.customers add column if not exists industry text;            -- 行业
alter table public.customers add column if not exists company_size text;        -- 公司规模

-- ── 商务偏好 ──
alter table public.customers add column if not exists currency_preference text; -- 货币偏好
alter table public.customers add column if not exists incoterms text;           -- 物流偏好（FOB/CIF等）

-- 索引：常用筛选字段
create index if not exists idx_customers_industry on public.customers(industry);
create index if not exists idx_customers_first_contact on public.customers(first_contact_date);
