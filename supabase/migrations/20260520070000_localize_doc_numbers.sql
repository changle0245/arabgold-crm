-- ============================================================
-- M3 fix: localize quote_no / deal_no generation to Asia/Shanghai
-- ============================================================
-- generate_quote_no / generate_deal_no built the "Q-YYYYMMDD-XXXX" /
-- "D-YYYYMMDD-XXXX" number from current_date and counted same-day rows
-- via created_at::date = current_date — all in the DB session timezone
-- (UTC). During CN 00:00-08:00 the number carried yesterday's date and
-- the per-day sequence reset on the wrong boundary. The rest of the app
-- was localized to Asia/Shanghai in 20260517020000; these two were
-- missed.
--
-- Fix: compute "today" and the day-bucket comparison in Asia/Shanghai.
-- (The read-then-insert sequence race is unchanged — low volume — and
-- is best addressed separately with a unique index once existing data
-- is known to be collision-free.)
-- ============================================================

create or replace function public.generate_quote_no()
returns trigger as $$
declare
  seq integer;
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
begin
  if new.quote_no is null or new.quote_no = '' then
    select count(*) + 1 into seq
    from public.quotations
    where (created_at at time zone 'Asia/Shanghai')::date = v_today;
    new.quote_no := 'Q-' || to_char(v_today, 'YYYYMMDD') || '-' || lpad(seq::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.generate_deal_no()
returns trigger as $$
declare
  seq integer;
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
begin
  if new.deal_no is null or new.deal_no = '' then
    select count(*) + 1 into seq
    from public.deals
    where (created_at at time zone 'Asia/Shanghai')::date = v_today;
    new.deal_no := 'D-' || to_char(v_today, 'YYYYMMDD') || '-' || lpad(seq::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;
