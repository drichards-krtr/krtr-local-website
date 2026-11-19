-- Initial hosted verification only, before owner/customer setup.
-- All fixtures and workflow writes below are ROLLED BACK. This does not create
-- usable Auth accounts, send email, collect money, or preserve a test campaign.
begin;
do $$ begin
 if exists(select 1 from public.sales_owner) or exists(select 1 from public.sales_organizations) then
 raise exception 'Initial verification requires an uninitialized Sales database';end if;
end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('90100000-0000-4000-8000-000000000001','owner@verification.invalid',now(),'{}'),
 ('90100000-0000-4000-8000-000000000002','seller@verification.invalid',now(),'{}'),
 ('90100000-0000-4000-8000-000000000003','manager@verification.invalid',now(),'{}'),
 ('90100000-0000-4000-8000-000000000004','customer@verification.invalid',now(),'{}'),
 ('90100000-0000-4000-8000-000000000005','outsider@verification.invalid',now(),'{}');
update public.sales_profiles set active=true where id::text like '90100000-%';
insert into public.sales_owner(user_id) values('90100000-0000-4000-8000-000000000001');
insert into public.sales_staff_scopes(user_id,role,district_key) values
 ('90100000-0000-4000-8000-000000000002','salesperson','dlpc'),
 ('90100000-0000-4000-8000-000000000003','district_manager','dlpc');
set local role authenticated;
select set_config('request.jwt.claim.sub','90100000-0000-4000-8000-000000000003',true);
select public.sales_configure_tax('dlpc','Verification only, rolled back',0,false,false);
select set_config('request.jwt.claim.sub','90100000-0000-4000-8000-000000000002',true);
select set_config('sales.verification.org',public.sales_create_customer('Verification only, rolled back','dlpc')::text,true);
reset role;
insert into public.sales_organization_members(organization_id,user_id,can_sign_agreements)
values(current_setting('sales.verification.org')::uuid,'90100000-0000-4000-8000-000000000004',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','90100000-0000-4000-8000-000000000002',true);
select set_config('sales.verification.quote',public.sales_save_quote(current_setting('sales.verification.org')::uuid,
 '[{"product_code":"P05","district_key":"dlpc","special_dates":["2030-03-05","2030-03-12","2030-03-19","2030-03-26"],"assets":[]}]')::text,true);
select public.sales_publish_quote(current_setting('sales.verification.quote')::uuid,1);
select set_config('request.jwt.claim.sub','90100000-0000-4000-8000-000000000004',true);
select public.sales_sign_quote(current_setting('sales.verification.quote')::uuid,1,'90100000-0000-4000-8000-000000000100','Verification Customer',true);
do $$ declare i public.sales_invoices; begin
 select * into i from public.sales_invoices where agreement_id='90100000-0000-4000-8000-000000000100';
 if i.total_cents<>10000 or i.collected_cents<>0 or i.inventory_status<>'held' then raise exception 'Invoice/signature assertion failed';end if;
 if exists(select 1 from public.sales_allocations) then raise exception 'Customer can read internal allocations';end if;
 if exists(select 1 from public.sales_payment_events) then raise exception 'Customer can read private payment events';end if;
 perform set_config('sales.verification.invoice',i.id::text,true);
end $$;
select set_config('request.jwt.claim.sub','90100000-0000-4000-8000-000000000002',true);
select public.sales_receive_check(current_setting('sales.verification.invoice')::uuid,'90100000-0000-4000-8000-000000000200','Verification only',(now() at time zone 'America/Chicago')::date);
select public.sales_update_check('90100000-0000-4000-8000-000000000200','deposit',(now() at time zone 'America/Chicago')::date);
do $$ begin
 begin perform public.sales_update_check('90100000-0000-4000-8000-000000000200','clear',(now() at time zone 'America/Chicago')::date);
 raise exception 'Seller clearance was incorrectly permitted';
 exception when raise_exception then if sqlerrm not like '%manager%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','90100000-0000-4000-8000-000000000003',true);
select public.sales_update_check('90100000-0000-4000-8000-000000000200','clear',(now() at time zone 'America/Chicago')::date);
select public.sales_update_check('90100000-0000-4000-8000-000000000200','clear',(now() at time zone 'America/Chicago')::date);
do $$ declare total integer; begin
 if (select amount_cents from public.sales_allocations where agreement_id='90100000-0000-4000-8000-000000000100')<>3000 then raise exception 'Allocation is not $30';end if;
 if (select count(*) from public.sales_receipts where invoice_id=current_setting('sales.verification.invoice')::uuid)<>1 then raise exception 'Duplicate receipt';end if;
 if (select count(*) from public.sales_inventory_units where agreement_id='90100000-0000-4000-8000-000000000100' and state='booked')<>4 then raise exception 'Four booked publication dates required';end if;
end $$;
select set_config('request.jwt.claim.sub','90100000-0000-4000-8000-000000000005',true);
do $$ begin
 if exists(select 1 from public.sales_organizations) or exists(select 1 from public.sales_quotes) or exists(select 1 from public.sales_agreements) or exists(select 1 from public.sales_invoices) or exists(select 1 from public.sales_receipts) or exists(select 1 from public.sales_allocations) then raise exception 'Unrelated identity can read private Sales data';end if;
end $$;
reset role;
rollback;
select jsonb_build_object('hosted_assertions_passed',true,
 'remaining_fixture_users',(select count(*) from auth.users where id::text like '90100000-%'),
 'remaining_fixture_customers',(select count(*) from public.sales_organizations where company_name='Verification only, rolled back'),
 'owner_count',(select count(*) from public.sales_owner),'invoice_count',(select count(*) from public.sales_invoices)) as verification;
