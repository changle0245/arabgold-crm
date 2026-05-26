-- Migration: Lower default concentration risk threshold from 30% to 10%
-- Fix P0-4: 30% 阈值过高，seed 数据最大客户占 6%，模块永远是空的；改 10% 让中等规模客户也能触发警示
-- 注意 default 不影响已存在的 row，必须显式 UPDATE

update public.system_settings
set value = '0.10'::jsonb,
    updated_at = now()
where key = 'concentration_risk_threshold';

-- 同步更新描述
update public.system_settings
set description = '大客户集中度风险阈值（单客户占总营收比例超过此值时预警），范围 0.05-0.30'
where key = 'concentration_risk_threshold';
