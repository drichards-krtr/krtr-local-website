-- Hosted verification exposed an after-5pm same-day manual-clearance bug.
-- Preserve the entered actual cleared_on date on sales_checks. The normalized
-- event timestamp is when clearance was verified, not an invented 5pm time.
begin;
create or replace function public.sales_update_check(p_check uuid,p_action text,p_on date) returns void language plpgsql security definer set search_path='' as $$
 declare c public.sales_checks; inv public.sales_invoices;
 begin
 perform pg_advisory_xact_lock(730031);select * into c from public.sales_checks where id=p_check for update;
 select * into inv from public.sales_invoices where id=c.invoice_id for update;
 if not found or not sales_private.can_work_agreement(inv.agreement_id) then raise exception 'Check action denied';end if;
 if p_on is null or p_on<c.received_on or p_on>(now() at time zone 'America/Chicago')::date then raise exception 'Valid actual check date required';end if;
 if p_action='deposit' then
 if c.state='deposited' and c.deposited_on=p_on then return;end if;
 if c.state<>'received' then raise exception 'Only received checks may be deposited';end if;
 update public.sales_checks set state='deposited',deposited_on=p_on,deposited_by=auth.uid() where id=c.id;
 elsif p_action='clear' then
 if not sales_private.can_manage_agreement(inv.agreement_id) then raise exception 'Only an owner or manager over the whole agreement may verify clearance';end if;
 if c.state='cleared' and c.cleared_on=p_on then return;end if;
 if c.state<>'deposited' or p_on<c.deposited_on then raise exception 'Deposit must precede clearance';end if;
 perform sales_private.post_finance_event(inv.id,'manual_check','cleared:'||c.id,c.id::text,'check_cleared',c.amount_cents,'USD',now());
 update public.sales_checks set state='cleared',cleared_on=p_on,cleared_by=auth.uid() where id=c.id;
 elsif p_action='return' then
 if not sales_private.can_manage_agreement(inv.agreement_id) or c.state='cleared' then raise exception 'Uncleared returned checks require scoped manager verification; cleared funds need reconciliation';end if;
 update public.sales_checks set state='returned' where id=c.id;
 perform sales_private.finance_notice(inv.agreement_id,'check-returned:'||c.id,'Check returned unpaid. Full payment remains due; inventory is subject to its recorded deadline.');
 else raise exception 'Unknown check action';end if;end;
$$;
-- Defense in depth; these tables remain unexposed with no public read policies.
alter table sales_private.override_industry_checks enable row level security;
alter table sales_private.override_inventory_checks enable row level security;
commit;
