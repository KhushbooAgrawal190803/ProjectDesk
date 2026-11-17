-- A bank share can be any pair of percentages, and it can apply to the
-- booking instalment only or to every instalment. The older named splits
-- stay valid so bookings already saved keep their meaning.

alter table public.bookings
  add column if not exists finance_purchaser_percent numeric,
  add column if not exists finance_bank_percent numeric,
  add column if not exists finance_split_scope text;

alter table public.bookings drop constraint if exists bookings_finance_scenario_check;
alter table public.bookings
  add constraint bookings_finance_scenario_check
  check (finance_scenario is null or finance_scenario in ('purchaser', 'split_50_50', 'split_10_90', 'split'));

alter table public.bookings drop constraint if exists bookings_finance_split_scope_check;
alter table public.bookings
  add constraint bookings_finance_split_scope_check
  check (finance_split_scope is null or finance_split_scope in ('booking', 'every'));
