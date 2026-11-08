-- Dedicated Sales database only. No payment-provider credentials or fake payments.
begin;

create table public.sales_agreements (
 id uuid primary key references public.sales_inventory_agreements(agreement_id),
 organization_id uuid not null references public.sales_organizations(id),
 seller_id uuid not null references public.sales_profiles(id),seller_kind text not null check(seller_kind in ('owner','employee')),
 district_keys text[] not null, signed_name text not null check(char_length(btrim(signed_name)) between 1 and 200),
 signed_email text not null, signature_on date not null,consent_text text not null,
 snapshot jsonb not null, created_at timestamptz not null default now()
);
-- Paper evidence preserves a known calendar date without claiming a known time.
alter table public.sales_inventory_agreements add column signature_precision text not null default 'timestamp' check(signature_precision in ('timestamp','date'));
create table public.sales_invoices (
 id uuid primary key default gen_random_uuid(),agreement_id uuid not null unique references public.sales_agreements(id),
 invoice_number bigint generated always as identity unique, currency text not null default 'USD' check(currency='USD'),
 advertising_cents bigint not null check(advertising_cents>=0),asset_cents bigint not null check(asset_cents>=0),tax_cents bigint not null check(tax_cents>=0),
 total_cents bigint not null check(total_cents>0 and total_cents<=9007199254740991),due_at timestamptz not null,
 collected_cents bigint not null default 0 check(collected_cents between 0 and 9007199254740991),
 refunded_cents bigint not null default 0 check(refunded_cents>=0 and refunded_cents<=collected_cents),
 payment_review_required boolean not null default false,
 inventory_status text not null default 'held' check(inventory_status in ('held','booked','released','payment_conflict')),
 created_at timestamptz not null default now(),check(total_cents=advertising_cents+asset_cents+tax_cents)
);
create table public.sales_checks (
 id uuid primary key,invoice_id uuid not null references public.sales_invoices(id),amount_cents bigint not null check(amount_cents>0),
 reference text not null check(char_length(btrim(reference)) between 1 and 200),
 state text not null check(state in ('received','deposited','cleared','returned')),
 received_on date not null,deposited_on date,cleared_on date,received_by uuid not null references public.sales_profiles(id),
 deposited_by uuid references public.sales_profiles(id),cleared_by uuid references public.sales_profiles(id),
 created_at timestamptz not null default now(),check(deposited_on is null or deposited_on>=received_on),
 check(cleared_on is null or (deposited_on is not null and cleared_on>=deposited_on))
);
create unique index sales_one_active_check on public.sales_checks(invoice_id) where state<>'returned';
-- Normalized, verified financial facts. Raw provider payloads stay in adapters.
create table public.sales_payment_events (
 id uuid primary key default gen_random_uuid(),invoice_id uuid not null references public.sales_invoices(id),
 provider text not null check(provider ~ '^[a-z][a-z0-9_-]{0,39}$'),event_key text not null check(char_length(event_key) between 1 and 250),
 transaction_ref text not null check(char_length(btrim(transaction_ref)) between 1 and 250),
 kind text not null check(kind in ('captured','check_cleared','refunded','processor_fee','bank_payout')),
 amount_cents bigint not null check(amount_cents>0 and amount_cents<=9007199254740991),currency text not null check(currency='USD'),
 occurred_at timestamptz not null,recorded_at timestamptz not null default now(),unique(provider,event_key)
);
create unique index sales_capture_transaction_once on public.sales_payment_events(provider,transaction_ref,kind) where kind in ('captured','check_cleared');
create table public.sales_receipts (
 id uuid primary key default gen_random_uuid(),invoice_id uuid not null references public.sales_invoices(id),
 payment_event_id uuid not null unique references public.sales_payment_events(id),
 kind text not null check(kind in ('payment','refund')),amount_cents bigint not null check(amount_cents>0),
 method text not null check(method in ('card','check')),occurred_at timestamptz not null,created_at timestamptz not null default now()
);
create table public.sales_allocations (
 id uuid primary key default gen_random_uuid(),agreement_id uuid not null references public.sales_agreements(id),
 beneficiary_id uuid not null references public.sales_profiles(id),beneficiary_kind text not null check(beneficiary_kind in ('owner','employee')),
 kind text not null check(kind in ('sale','takeover')),basis_cents bigint not null check(basis_cents>=0),
 rate_bps integer not null check(rate_bps in (3000,500)),amount_cents bigint not null check(amount_cents>=0),
 approved_by uuid references public.sales_profiles(id),reason text,earned_at timestamptz,created_at timestamptz not null default now(),
 unique(agreement_id,beneficiary_id,kind),check((kind='sale' and rate_bps=3000) or (kind='takeover' and rate_bps=500 and approved_by is not null and char_length(btrim(reason))>0))
);
create unique index sales_original_allocation_once on public.sales_allocations(agreement_id) where kind='sale';
create table public.sales_owner_movements (
 id uuid primary key,allocation_id uuid not null references public.sales_allocations(id),
 kind text not null check(kind in ('withdrawn','reinvested')),amount_cents bigint not null check(amount_cents>0),
 on_date date not null,reference text not null check(char_length(btrim(reference)) between 1 and 250),
 actor_id uuid not null references public.sales_profiles(id),created_at timestamptz not null default now()
);
create table public.sales_finance_settings (
 singleton boolean primary key default true check(singleton),check_payee text not null default 'KRTR Local, LLC',
 mailing_instructions text not null default '',dropoff_instructions text not null default '',
 updated_by uuid references public.sales_profiles(id),updated_at timestamptz not null default now()
);
insert into public.sales_finance_settings(singleton) values(true);
create table public.sales_payroll_settings (
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 payday_anchor date,cutoff_days integer check(cutoff_days between 1 and 13),
 hiring_complete boolean not null default false,employer_ready boolean not null default false,agreements_ready boolean not null default false,
 updated_by uuid references public.sales_profiles(id),updated_at timestamptz not null default now(),
 check(not enabled or (payday_anchor is not null and cutoff_days is not null and hiring_complete and employer_ready and agreements_ready))
);
insert into public.sales_payroll_settings(singleton) values(true);
create table public.sales_payroll_runs (
 id uuid primary key,payday date not null unique,cutoff_at timestamptz not null,
 created_by uuid not null references public.sales_profiles(id),created_at timestamptz not null default now(),
 paid_on date,payment_reference text,check(paid_on is null or char_length(btrim(payment_reference))>0)
);
create table public.sales_payroll_items (
 run_id uuid not null references public.sales_payroll_runs(id),allocation_id uuid not null unique references public.sales_allocations(id),primary key(run_id,allocation_id)
);

create function sales_private.can_read_agreement(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.active_user() and exists(select 1 from public.sales_agreements a join public.sales_inventory_agreements e on e.agreement_id=a.id where a.id=target and
 (sales_private.can_work_quote(e.quote_id) or exists(select 1 from public.sales_organization_members m where m.organization_id=a.organization_id and m.user_id=auth.uid() and m.can_view)));
$$;
create function sales_private.can_work_agreement(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sales_inventory_agreements e where e.agreement_id=target and sales_private.can_work_quote(e.quote_id));
$$;
create function sales_private.can_manage_agreement(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sales_agreements a where a.id=target and sales_private.can_manage_scope(a.district_keys));
$$;
create function sales_private.finance_notice(target uuid,event text,message text) returns void language plpgsql security definer set search_path='' as $$
 declare a public.sales_agreements; district text;
 begin
 select * into a from public.sales_agreements where id=target;
 insert into public.sales_notifications(recipient_id,event_key,organization_id,message,action_path)
 select u.id,event,a.organization_id,message,'/agreements/'||a.id from public.sales_profiles u where u.active and
 (u.id=a.seller_id or exists(select 1 from public.sales_organizations o where o.id=a.organization_id and o.salesperson_id=u.id) or exists(select 1 from public.sales_organization_members m where m.organization_id=a.organization_id and m.user_id=u.id and m.can_view)) on conflict(recipient_id,event_key) do nothing;
 foreach district in array a.district_keys loop perform sales_private.notify_managers(district,event,a.organization_id,message,'/agreements/'||a.id);end loop;
 end;
$$;

create function public.sales_sign_quote(p_quote uuid,p_version integer,p_key uuid,p_name text,p_consent boolean,p_method text default 'digital',p_signed_on date default null,p_paper_ref text default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare q public.sales_quotes; content jsonb; org public.sales_organizations; existing uuid; deadline timestamptz; signer_email text; policy uuid;
 begin
 perform pg_advisory_xact_lock(730031);
 select * into q from public.sales_quotes where id=p_quote for update;
 if not found or not sales_private.active_user() then raise exception 'Signing unavailable';end if;
 if p_method='digital' then
 if p_signed_on is not null or p_paper_ref is not null then raise exception 'Digital signature uses the verified current timestamp';end if;
 if p_consent is distinct from true or not exists(select 1 from public.sales_organization_members m where m.organization_id=q.organization_id and m.user_id=auth.uid() and m.can_view and m.can_sign_agreements) then raise exception 'Customer signing permission and explicit acceptance required';end if;
 elsif p_method='paper' then
 if not sales_private.can_work_quote(p_quote) or p_consent is distinct from true then raise exception 'Authorized staff must attest to the uploaded signature';end if;
 if p_signed_on is null or p_signed_on>(now() at time zone 'America/Chicago')::date or p_signed_on<(q.created_at at time zone 'America/Chicago')::date then raise exception 'Actual signature date required';end if;
 if p_paper_ref is null or p_paper_ref not like q.organization_id::text||'/'||auth.uid()::text||'/%.pdf' then raise exception 'Private uploaded paper signature required';end if;
 if to_regclass('storage.objects') is null then raise exception 'Private agreement storage not configured';end if;
 if not exists(select 1 from storage.objects where bucket_id='sales-agreements' and name=p_paper_ref) then raise exception 'Upload the signed PDF first';end if;
 else raise exception 'Unknown signing method';end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 200 or p_key is null then raise exception 'Signer name and request identity required';end if;
 select agreement_id into existing from public.sales_inventory_agreements where quote_id=p_quote and version=p_version;
 if existing is not null then
 if not exists(select 1 from public.sales_agreements where id=existing) then raise exception 'Legacy evidence needs owner reconciliation';end if;
 return existing;end if;
 if exists(select 1 from public.sales_inventory_agreements where agreement_id=p_key) then raise exception 'Request identity belongs to another agreement';end if;
 if q.current_version<>p_version or q.status<>'sent' then raise exception 'Quote changed or withdrawn; review the current shared version';end if;
 select v.content,v.policy_id into content,policy from public.sales_quote_versions v where v.quote_id=p_quote and v.version=p_version;
 if (content->>'total_cents')::bigint<=0 then raise exception 'A positive invoice total is required';end if;
 if exists(select 1 from jsonb_array_elements(content->'lines') l cross join lateral jsonb_array_elements(l->'deadlines') d where (d->>'approval_due_at')::timestamptz<=now() or (d->>'payment_due_at')::timestamptz<=now() or (d->>'production_inputs_due_on')::date<(now() at time zone 'America/Chicago')::date)
 then raise exception 'A requirement deadline has passed; obtain new approved terms';end if;
 -- Last-minute bookings remain blocked until Chunk 5 can verify actual approved materials/capacity.
 if exists(select 1 from jsonb_array_elements(content->'overrides') o where coalesce((o->'terms'->>'allow_short_lead')::boolean,false)) then raise exception 'Last-minute signing requires verified asset and production readiness (Chunk 5)';end if;
 select * into org from public.sales_organizations where id=q.organization_id for update;
 if not sales_private.eligible_seller(org.salesperson_id) then raise exception 'Assign an active selling staff member first';end if;
 select coalesce(email,'') into signer_email from auth.users where id=auth.uid();
 insert into public.sales_inventory_agreements(agreement_id,quote_id,version,signed_by,signed_at,signing_method,paper_signer_name,paper_signature_ref,signature_precision)
 values(p_key,p_quote,p_version,auth.uid(),case when p_method='paper' then p_signed_on::timestamp at time zone 'America/Chicago' else now() end,p_method,case when p_method='paper' then btrim(p_name) end,p_paper_ref,case when p_method='paper' then 'date' else 'timestamp' end);
 insert into public.sales_agreements(id,organization_id,seller_id,seller_kind,district_keys,signed_name,signed_email,signature_on,consent_text,snapshot)
 values(p_key,q.organization_id,org.salesperson_id,case when exists(select 1 from public.sales_owner where user_id=org.salesperson_id) then 'owner' else 'employee' end,
 array(select distinct l->>'district_key' from jsonb_array_elements(content->'lines') l),btrim(p_name),case when p_method='digital' then signer_email else '' end,coalesce(p_signed_on,(now() at time zone 'America/Chicago')::date),
 'I am authorized to accept this exact agreement version, its placements, dates, prices, deadlines and policies on behalf of this organization.',content||jsonb_build_object('organization_name',org.company_name,'quote_id',q.id,'version',p_version,'policy_id',policy,'paper_signature_ref',p_paper_ref));
 perform sales_private.reserve_signed_quote(p_key);
 select min((d->>'payment_due_at')::timestamptz) into deadline from jsonb_array_elements(content->'lines') l cross join lateral jsonb_array_elements(l->'deadlines') d;
 insert into public.sales_invoices(agreement_id,advertising_cents,asset_cents,tax_cents,total_cents,due_at) values(p_key,(content->>'advertising_cents')::bigint,(content->>'asset_cents')::bigint,(content->>'tax_cents')::bigint,(content->>'total_cents')::bigint,deadline);
 insert into public.sales_allocations(agreement_id,beneficiary_id,beneficiary_kind,kind,basis_cents,rate_bps,amount_cents)
 select p_key,a.seller_id,a.seller_kind,'sale',(content->>'advertising_cents')::bigint,3000,round((content->>'advertising_cents')::numeric*0.30)::bigint from public.sales_agreements a where a.id=p_key;
 update public.sales_opportunities set stage='signed_awaiting_payment',version=version+1,updated_at=now(),next_action='Collect full upfront payment',next_action_on=(deadline at time zone 'America/Chicago')::date where id=q.opportunity_id;
 perform sales_private.finance_notice(p_key,'signed:'||p_key,'Agreement signed. Invoice issued; full upfront payment is required before its deadline.');
 return p_key;
 end;
$$;

create function sales_private.expire_finance_hold(target uuid) returns boolean language plpgsql security definer set search_path='' as $$
 declare invoice public.sales_invoices;
 begin
 perform pg_advisory_xact_lock(730031);
 select * into invoice from public.sales_invoices where agreement_id=target for update;
 if not found or invoice.inventory_status<>'held' then return false;end if;
 if exists(select 1 from public.sales_inventory_units where agreement_id=target and (state='released' or (state='held' and (hold_until<=now() or payment_due_at<=now())))) then
 update public.sales_inventory_units set state='released' where agreement_id=target and state='held';
 update public.sales_invoices set inventory_status='released' where id=invoice.id;
 perform sales_private.finance_notice(target,'expired:'||target,'Unpaid hold expired. Inventory released; contact your salesperson for available new dates.');return true;end if;
 return false;end;
$$;
create function public.sales_expire_holds() returns integer language plpgsql security definer set search_path='' as $$
 declare target uuid; total integer=0;
 begin
 if not sales_private.is_sales_staff() then raise exception 'Staff required';end if;
 for target in select i.agreement_id from public.sales_invoices i where i.inventory_status='held' and sales_private.can_work_agreement(i.agreement_id) loop
 if sales_private.expire_finance_hold(target) then total=total+1;end if;end loop;return total;end;
$$;
create function public.sales_expire_all_holds() returns integer language plpgsql security definer set search_path='' as $$
 declare target uuid; total integer=0;
 begin
 for target in select agreement_id from public.sales_invoices where inventory_status='held' loop
 if sales_private.expire_finance_hold(target) then total=total+1;end if;end loop;return total;end;
$$;

create function sales_private.post_finance_event(p_invoice uuid,p_provider text,p_key text,p_transaction text,p_kind text,p_cents bigint,p_currency text,p_occurred timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
 declare inv public.sales_invoices; previous public.sales_payment_events; event_id uuid; can_book boolean; qid uuid;
 begin
 perform pg_advisory_xact_lock(730031);
 select * into previous from public.sales_payment_events where provider=p_provider and event_key=p_key;
 if found then
 if previous.invoice_id<>p_invoice or previous.kind<>p_kind or previous.amount_cents<>p_cents or previous.currency<>p_currency or previous.transaction_ref<>p_transaction or previous.occurred_at<>p_occurred then raise exception 'Conflicting duplicate financial event';end if;return previous.id;end if;
 select * into inv from public.sales_invoices where id=p_invoice for update;if not found then raise exception 'Invoice unavailable';end if;
 if p_cents is null or p_cents<=0 or p_currency is distinct from inv.currency or p_occurred is null or p_occurred>now()+interval '5 minutes' or p_occurred<inv.created_at-interval '5 minutes' then raise exception 'Invalid verified payment amount, currency or occurrence time';end if;
 select * into previous from public.sales_payment_events where provider=p_provider and transaction_ref=p_transaction and kind=p_kind and kind in ('captured','check_cleared');
 if found then
 if previous.invoice_id<>p_invoice or previous.amount_cents<>p_cents or previous.currency<>p_currency then raise exception 'Conflicting duplicate captured transaction';end if;return previous.id;end if;
 if p_kind='check_cleared' and (inv.collected_cents<>0 or p_cents<>inv.total_cents) then raise exception 'Check clearance requires reconciliation of existing collections';end if;
 if p_kind='refunded' then
 if p_cents>inv.collected_cents-inv.refunded_cents then raise exception 'Refund exceeds actual collected balance';end if;
 elsif p_kind not in ('processor_fee','bank_payout','captured','check_cleared') then raise exception 'Unsupported normalized financial event';end if;
 insert into public.sales_payment_events(invoice_id,provider,event_key,transaction_ref,kind,amount_cents,currency,occurred_at) values(p_invoice,p_provider,p_key,p_transaction,p_kind,p_cents,p_currency,p_occurred) returning id into event_id;
 if p_kind='captured' and (inv.collected_cents<>0 or p_cents<>inv.total_cents) then
 -- Unexpected real money is still a fact, but cannot activate inventory or
 -- create another allocation. Preserve it for explicit manager reconciliation.
 perform sales_private.expire_finance_hold(inv.agreement_id);
 update public.sales_invoices set collected_cents=collected_cents+p_cents,payment_review_required=true where id=inv.id;
 insert into public.sales_receipts(invoice_id,payment_event_id,kind,amount_cents,method,occurred_at) values(inv.id,event_id,'payment',p_cents,'card',p_occurred);
 perform sales_private.finance_notice(inv.agreement_id,'payment-review:'||event_id,'Unexpected or additional payment recorded. Manager reconciliation required; no additional allocation or inventory activation occurred.');return event_id;end if;
 if p_kind in ('captured','check_cleared') then
 perform sales_private.expire_finance_hold(inv.agreement_id);
 can_book=exists(select 1 from public.sales_inventory_units where agreement_id=inv.agreement_id) and not exists(select 1 from public.sales_inventory_units where agreement_id=inv.agreement_id and (state<>'held' or hold_until<=now() or payment_due_at<=now())) and p_occurred<=inv.due_at;
 update public.sales_inventory_units set state='booked' where agreement_id=inv.agreement_id and can_book and state='held';
 update public.sales_invoices set collected_cents=p_cents,inventory_status=case when can_book then 'booked' else 'payment_conflict' end where id=inv.id;
 insert into public.sales_receipts(invoice_id,payment_event_id,kind,amount_cents,method,occurred_at) values(inv.id,event_id,'payment',p_cents,case when p_kind='check_cleared' then 'check' else 'card' end,p_occurred);
 update public.sales_allocations set earned_at=now() where agreement_id=inv.agreement_id and kind='sale' and earned_at is null;
 select quote_id into qid from public.sales_inventory_agreements where agreement_id=inv.agreement_id;
 update public.sales_opportunities set stage='won',version=version+1,updated_at=now(),next_action=case when can_book then 'Complete production requirements' else 'Resolve paid booking conflict' end where id=(select opportunity_id from public.sales_quotes where id=qid);
 perform sales_private.finance_notice(inv.agreement_id,'paid:'||inv.agreement_id,case when can_book then 'Payment confirmed. Receipt available; production requirements still apply.' else 'Payment received after inventory eligibility changed. Booking conflict requires resolution; dates were not reactivated.' end);
 elsif p_kind='refunded' then
 update public.sales_invoices set refunded_cents=refunded_cents+p_cents where id=inv.id;
 insert into public.sales_receipts(invoice_id,payment_event_id,kind,amount_cents,method,occurred_at) values(inv.id,event_id,'refund',p_cents,coalesce((select method from public.sales_receipts where invoice_id=inv.id and kind='payment' limit 1),'card'),p_occurred);
 -- Refund facts do not authorize inventory changes or automatic commission clawbacks.
 perform sales_private.finance_notice(inv.agreement_id,'refund:'||event_id,'Refund recorded. Receipt history updated.');
 end if;return event_id;end;
$$;
create function public.sales_record_provider_event(p_invoice uuid,p_provider text,p_key text,p_transaction text,p_kind text,p_cents bigint,p_currency text,p_occurred timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
 begin
 if p_provider='manual_check' or p_kind='check_cleared' then raise exception 'Use the checked manual-clearance workflow';end if;
 return sales_private.post_finance_event(p_invoice,p_provider,p_key,p_transaction,p_kind,p_cents,p_currency,p_occurred);end;
$$;

create function public.sales_receive_check(p_invoice uuid,p_key uuid,p_reference text,p_on date) returns uuid language plpgsql security definer set search_path='' as $$
 declare inv public.sales_invoices; existing public.sales_checks;
 begin
 perform pg_advisory_xact_lock(730031);select * into inv from public.sales_invoices where id=p_invoice for update;
 if not found or not sales_private.can_work_agreement(inv.agreement_id) then raise exception 'Check receipt denied';end if;
 select * into existing from public.sales_checks where id=p_key;
 if found then if existing.invoice_id<>p_invoice or existing.reference<>btrim(p_reference) or existing.received_on<>p_on then raise exception 'Check request changed';end if;return existing.id;end if;
 if inv.collected_cents>0 or p_on is null or p_on>(now() at time zone 'America/Chicago')::date or p_on<(inv.created_at at time zone 'America/Chicago')::date then raise exception 'Valid receipt date on an unpaid invoice required';end if;
 perform sales_private.expire_finance_hold(inv.agreement_id);
 insert into public.sales_checks(id,invoice_id,amount_cents,reference,state,received_on,received_by) values(p_key,p_invoice,inv.total_cents,btrim(p_reference),'received',p_on,auth.uid());
 -- Receipt must be recorded while the hold is actually live. Backdating does not restore it.
 update public.sales_inventory_units set hold_until=least(inv.due_at,payment_due_at) where agreement_id=inv.agreement_id and state='held' and hold_until>now() and inv.due_at>now();
 perform sales_private.finance_notice(inv.agreement_id,'check-received:'||p_key,'Check received, not cleared. Deposit and verification are still required.');return p_key;end;
$$;
create function public.sales_update_check(p_check uuid,p_action text,p_on date) returns void language plpgsql security definer set search_path='' as $$
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
 perform sales_private.post_finance_event(inv.id,'manual_check','cleared:'||c.id,c.id::text,'check_cleared',c.amount_cents,'USD',least(now(),sales_private.central_deadline(p_on)));
 update public.sales_checks set state='cleared',cleared_on=p_on,cleared_by=auth.uid() where id=c.id;
 elsif p_action='return' then
 if not sales_private.can_manage_agreement(inv.agreement_id) or c.state='cleared' then raise exception 'Uncleared returned checks require scoped manager verification; cleared funds need reconciliation';end if;
 update public.sales_checks set state='returned' where id=c.id;
 perform sales_private.finance_notice(inv.agreement_id,'check-returned:'||c.id,'Check returned unpaid. Full payment remains due; inventory is subject to its recorded deadline.');
 else raise exception 'Unknown check action';end if;end;
$$;

create function public.sales_payment_eligibility(p_invoice uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare inv public.sales_invoices;
 begin select * into inv from public.sales_invoices where id=p_invoice;
 if not found or not sales_private.can_read_agreement(inv.agreement_id) then raise exception 'Invoice unavailable';end if;
 return jsonb_build_object('invoice_id',inv.id,'currency',inv.currency,'amount_cents',inv.total_cents,'eligible',inv.collected_cents=0 and inv.inventory_status='held' and inv.due_at>now() and exists(select 1 from public.sales_inventory_units where agreement_id=inv.agreement_id) and not exists(select 1 from public.sales_inventory_units where agreement_id=inv.agreement_id and (state<>'held' or hold_until<=now() or payment_due_at<=now())) and not exists(select 1 from public.sales_checks where invoice_id=inv.id and state in ('received','deposited')));
 end;
$$;

create function public.sales_refund_eligibility(p_invoice uuid,p_cents bigint) returns void language plpgsql stable security definer set search_path='' as $$
 declare inv public.sales_invoices;
 begin
 select * into inv from public.sales_invoices where id=p_invoice;
 if not found or not sales_private.can_manage_agreement(inv.agreement_id) then raise exception 'Refund requests require scoped manager authority';end if;
 if p_cents is null or p_cents<=0 or p_cents>inv.collected_cents-inv.refunded_cents then raise exception 'Refund exceeds actual collected balance';end if;end;
$$;
create function public.sales_record_owner_movement(p_allocation uuid,p_key uuid,p_kind text,p_cents bigint,p_on date,p_reference text) returns uuid language plpgsql security definer set search_path='' as $$
 declare a public.sales_allocations; used bigint; existing public.sales_owner_movements;
 begin
 if not sales_private.is_owner() then raise exception 'Owner draw is owner only';end if;
 perform pg_advisory_xact_lock(730032);select * into a from public.sales_allocations where id=p_allocation for update;
 if not found or a.beneficiary_kind<>'owner' or a.beneficiary_id<>auth.uid() or a.earned_at is null then raise exception 'Collected owner allocation required';end if;
 select * into existing from public.sales_owner_movements where id=p_key;
 if found then if existing.allocation_id<>p_allocation or existing.kind<>p_kind or existing.amount_cents<>p_cents or existing.on_date<>p_on or existing.reference<>btrim(p_reference) then raise exception 'Owner movement request changed';end if;return existing.id;end if;
 if p_kind is null or p_kind not in ('withdrawn','reinvested') or p_cents is null or p_cents<=0 or p_on is null or p_on<(a.earned_at at time zone 'America/Chicago')::date or p_on>(now() at time zone 'America/Chicago')::date then raise exception 'Valid owner movement kind, amount and date required';end if;
 select coalesce(sum(amount_cents),0) into used from public.sales_owner_movements where allocation_id=a.id;
 if p_cents>a.amount_cents-used then raise exception 'Owner allocation already used or amount exceeds available balance';end if;
 insert into public.sales_owner_movements(id,allocation_id,kind,amount_cents,on_date,reference,actor_id) values(p_key,a.id,p_kind,p_cents,p_on,btrim(p_reference),auth.uid());return p_key;end;
$$;
create function public.sales_approve_takeover(p_agreement uuid,p_seller uuid,p_basis bigint,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
 declare a public.sales_agreements; inv public.sales_invoices; result uuid;
 begin
 perform pg_advisory_xact_lock(730032);select * into a from public.sales_agreements where id=p_agreement;
 select * into inv from public.sales_invoices where agreement_id=p_agreement;
 if not found or not sales_private.can_manage_agreement(p_agreement) then raise exception 'Takeover allocation requires a manager over the entire agreement';end if;
 if inv.collected_cents<>inv.total_cents or inv.refunded_cents>0 or inv.inventory_status<>'booked' then raise exception 'Paid, active campaign required';end if;
 if not sales_private.eligible_seller(p_seller) or p_seller=a.seller_id or not exists(select 1 from public.sales_organizations where id=a.organization_id and salesperson_id=p_seller) then raise exception 'Takeover beneficiary must be the current new seller';end if;
 if p_basis is null or p_basis<=0 or p_basis>inv.advertising_cents or p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'Documented undelivered advertising value and reason required';end if;
 if not exists(select 1 from public.sales_inventory_units where agreement_id=p_agreement and run_on>=(now() at time zone 'America/Chicago')::date and state='booked') then raise exception 'No remaining campaign dates';end if;
 insert into public.sales_allocations(agreement_id,beneficiary_id,beneficiary_kind,kind,basis_cents,rate_bps,amount_cents,approved_by,reason,earned_at)
 values(p_agreement,p_seller,case when exists(select 1 from public.sales_owner where user_id=p_seller) then 'owner' else 'employee' end,'takeover',p_basis,500,round(p_basis::numeric*0.05)::bigint,auth.uid(),btrim(p_reason),now()) returning id into result;return result;end;
$$;
create function public.sales_configure_finance(p_payee text,p_mailing text,p_dropoff text) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not sales_private.is_owner() then raise exception 'Owner only';end if;
 if p_payee is null or char_length(btrim(p_payee)) not between 1 and 200 or p_mailing is null or char_length(p_mailing)>2000 or p_dropoff is null or char_length(p_dropoff)>2000 then raise exception 'Valid verified check instructions required';end if;
 update public.sales_finance_settings set check_payee=btrim(p_payee),mailing_instructions=btrim(p_mailing),dropoff_instructions=btrim(p_dropoff),updated_by=auth.uid(),updated_at=now() where singleton;end;
$$;
create function public.sales_configure_payroll(p_enabled boolean,p_anchor date,p_cutoff integer,p_hiring boolean,p_employer boolean,p_agreements boolean) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not sales_private.is_owner() then raise exception 'Owner only';end if;
 update public.sales_payroll_settings set enabled=p_enabled,payday_anchor=p_anchor,cutoff_days=p_cutoff,hiring_complete=p_hiring,employer_ready=p_employer,agreements_ready=p_agreements,updated_by=auth.uid(),updated_at=now() where singleton;end;
$$;
create function public.sales_schedule_payroll(p_key uuid,p_payday date,p_allocations uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
 declare settings public.sales_payroll_settings; cutoff timestamptz; previous public.sales_payroll_runs; allocation uuid; a public.sales_allocations;
 begin
 if not sales_private.is_owner() then raise exception 'Owner only';end if;
 perform pg_advisory_xact_lock(730032);select * into settings from public.sales_payroll_settings where singleton for update;
 if not settings.enabled then raise exception 'Employee payouts are inactive until hiring, employer, agreement and payday setup are complete';end if;
 if p_payday is null or p_payday<settings.payday_anchor or (p_payday-settings.payday_anchor)%14<>0 then raise exception 'Payday must match the configured biweekly schedule';end if;
 if cardinality(p_allocations) is null or cardinality(p_allocations)=0 or cardinality(p_allocations)<>(select count(distinct x) from unnest(p_allocations) x) then raise exception 'Distinct payable allocations required';end if;
 cutoff=sales_private.central_deadline(p_payday-settings.cutoff_days);
 select * into previous from public.sales_payroll_runs where id=p_key;
 if found then
 if previous.payday<>p_payday or (select array_agg(allocation_id order by allocation_id) from public.sales_payroll_items where run_id=p_key)<>(select array_agg(x order by x) from unnest(p_allocations) x) then raise exception 'Payroll request changed';end if;return p_key;end if;
 insert into public.sales_payroll_runs(id,payday,cutoff_at,created_by) values(p_key,p_payday,cutoff,auth.uid());
 foreach allocation in array p_allocations loop
 select * into a from public.sales_allocations where id=allocation for update;
 if not found or a.beneficiary_kind<>'employee' or a.earned_at is null or a.earned_at>cutoff then raise exception 'Only collected employee allocations within cutoff may be scheduled';end if;
 insert into public.sales_payroll_items(run_id,allocation_id) values(p_key,a.id);
 end loop;return p_key;end;
$$;
create function public.sales_mark_payroll_paid(p_run uuid,p_on date,p_reference text) returns void language plpgsql security definer set search_path='' as $$
 declare r public.sales_payroll_runs;
 begin
 if not sales_private.is_owner() then raise exception 'Owner only';end if;
 perform pg_advisory_xact_lock(730032);select * into r from public.sales_payroll_runs where id=p_run for update;
 if not found or not exists(select 1 from public.sales_payroll_settings where enabled) then raise exception 'Configured employee payroll run required';end if;
 if p_on is null or p_on<r.payday or p_on>(now() at time zone 'America/Chicago')::date or p_reference is null or char_length(btrim(p_reference)) not between 1 and 250 then raise exception 'Actual payout date/reference required';end if;
 if r.paid_on is not null then if r.paid_on<>p_on or r.payment_reference<>btrim(p_reference) then raise exception 'Paid payroll history cannot be changed';end if;return;end if;
 update public.sales_payroll_runs set paid_on=p_on,payment_reference=btrim(p_reference) where id=p_run;end;
$$;

-- Private evidence files are served through authenticated Storage, never public URLs.
create function sales_private.can_read_agreement_file(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.active_user() and (
 exists(select 1 from public.sales_inventory_agreements e where e.paper_signature_ref=object_name and sales_private.can_read_agreement(e.agreement_id))
 or (split_part(object_name,'/',2)=auth.uid()::text and exists(select 1 from public.sales_organizations o where o.id::text=split_part(object_name,'/',1) and sales_private.can_read_staff_customer(o.id))));
$$;
do $$ begin
 if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('sales-agreements','sales-agreements',false,10485760,array['application/pdf']) on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/pdf'];
 execute $policy$create policy sales_paper_upload on storage.objects for insert to authenticated with check(bucket_id='sales-agreements' and split_part(name,'/',2)=auth.uid()::text and name like '%.pdf' and exists(select 1 from public.sales_organizations o where o.id::text=split_part(name,'/',1) and sales_private.can_read_staff_customer(o.id)))$policy$;
 execute $policy$create policy sales_paper_read on storage.objects for select to authenticated using(bucket_id='sales-agreements' and sales_private.can_read_agreement_file(name))$policy$;
 end if;end $$;

-- RLS protects facts as well as pages. There are no authenticated table writes.
create function sales_private.protect_allocation_fact() returns trigger language plpgsql set search_path='' as $$
 begin
 if tg_op='DELETE' then raise exception 'Allocation history cannot be deleted';end if;
 if (to_jsonb(new)-'earned_at') is distinct from (to_jsonb(old)-'earned_at') or (old.earned_at is not null and new.earned_at is distinct from old.earned_at) then raise exception 'Allocation attribution and amounts are immutable';end if;
 return new;end;
$$;
create trigger sales_allocation_fact_guard before update or delete on public.sales_allocations for each row execute function sales_private.protect_allocation_fact();
do $$ declare tab text;begin
 foreach tab in array array['sales_agreements','sales_invoices','sales_checks','sales_payment_events','sales_receipts','sales_allocations','sales_owner_movements','sales_finance_settings','sales_payroll_settings','sales_payroll_runs','sales_payroll_items'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('revoke all on public.%I from anon,authenticated',tab);
 execute format('grant select on public.%I to authenticated',tab);
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function sales_private.capture_audit()',tab||'_audit',tab);
 end loop;
 foreach tab in array array['sales_agreements','sales_payment_events','sales_receipts','sales_owner_movements','sales_payroll_items','sales_inventory_agreements'] loop
 execute format('create trigger %I before update or delete on public.%I for each row execute function sales_private.immutable_record()',tab||'_immutable',tab);
 end loop;end $$;
create policy sales_agreements_read on public.sales_agreements for select to authenticated using(sales_private.can_read_agreement(id));
create policy sales_invoices_read on public.sales_invoices for select to authenticated using(sales_private.can_read_agreement(agreement_id));
create policy sales_checks_read on public.sales_checks for select to authenticated using(exists(select 1 from public.sales_invoices i where i.id=invoice_id and sales_private.can_read_agreement(i.agreement_id)));
create policy sales_events_read on public.sales_payment_events for select to authenticated using(exists(select 1 from public.sales_invoices i where i.id=invoice_id and sales_private.can_work_agreement(i.agreement_id)));
create policy sales_receipts_read on public.sales_receipts for select to authenticated using(exists(select 1 from public.sales_invoices i where i.id=invoice_id and sales_private.can_read_agreement(i.agreement_id)));
create policy sales_allocations_read on public.sales_allocations for select to authenticated using(sales_private.active_user() and ((beneficiary_id=auth.uid() and sales_private.is_sales_staff()) or sales_private.can_manage_agreement(agreement_id)));
create policy sales_owner_movements_read on public.sales_owner_movements for select to authenticated using(sales_private.is_owner());
create policy sales_finance_settings_read on public.sales_finance_settings for select to authenticated using(sales_private.active_user() and (sales_private.is_sales_staff() or exists(select 1 from public.sales_organization_members m where m.user_id=auth.uid() and m.can_view)));
create policy sales_payroll_settings_read on public.sales_payroll_settings for select to authenticated using(sales_private.is_owner());
create policy sales_payroll_runs_read on public.sales_payroll_runs for select to authenticated using(sales_private.is_owner() or (sales_private.active_user() and exists(select 1 from public.sales_payroll_items p join public.sales_allocations a on a.id=p.allocation_id where p.run_id=sales_payroll_runs.id and a.beneficiary_id=auth.uid())));
create policy sales_payroll_items_read on public.sales_payroll_items for select to authenticated using(sales_private.is_owner() or exists(select 1 from public.sales_allocations a where a.id=allocation_id and a.beneficiary_id=auth.uid() and sales_private.active_user()));

do $$ declare fn record;begin
 for fn in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('sales_sign_quote','sales_expire_holds','sales_expire_all_holds','sales_record_provider_event','sales_receive_check','sales_update_check','sales_payment_eligibility','sales_refund_eligibility','sales_record_owner_movement','sales_approve_takeover','sales_configure_finance','sales_configure_payroll','sales_schedule_payroll','sales_mark_payroll_paid') loop
 execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
 if fn.proname in ('sales_record_provider_event','sales_expire_all_holds') then execute format('grant execute on function %s to service_role',fn.signature);
 else execute format('grant execute on function %s to authenticated',fn.signature);end if;
 end loop;
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sales_private' and p.proname in
 ('can_read_agreement','can_work_agreement','can_manage_agreement','finance_notice','expire_finance_hold','post_finance_event','can_read_agreement_file','protect_allocation_fact') loop execute format('revoke all on function %s from public,anon,authenticated',fn.signature);end loop;
end $$;
grant execute on function sales_private.can_read_agreement(uuid),sales_private.can_work_agreement(uuid),sales_private.can_manage_agreement(uuid),sales_private.can_read_agreement_file(text) to authenticated;
commit;
