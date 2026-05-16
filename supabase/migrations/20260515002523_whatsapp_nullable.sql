-- ============================================================
-- Migration: customers.whatsapp 改为可空
-- 业务原因：业务员可能先记一个客户线索（展会听说的公司等），WhatsApp 后续补
-- ============================================================

alter table public.customers alter column whatsapp drop not null;
