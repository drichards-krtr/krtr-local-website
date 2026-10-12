-- Dedicated Sales project ONLY. Apply after the foundation migration.
begin;
alter table public.sales_organizations add column seed_key text unique;
alter table public.sales_staff_scopes add column is_primary boolean not null default false;
alter table public.sales_staff_scopes add constraint sales_primary_requires_salesperson check(not is_primary or role='salesperson');
create unique index sales_one_primary_scope on public.sales_staff_scopes(user_id) where is_primary;
-- Existing single salesperson assignments can be marked primary explicitly in
-- the owner screen; never guess among multiple authorized districts.

create table public.sales_customer_details (
 organization_id uuid primary key references public.sales_organizations(id),
 contact_name text not null default '' check(char_length(contact_name)<=200),
 contact_email text not null default '' check(char_length(contact_email)<=320),
 contact_phone text not null default '' check(char_length(contact_phone)<=100),
 business_location text not null default '' check(char_length(business_location)<=500),
 internal_notes text not null default '' check(char_length(internal_notes)<=10000),
 updated_at timestamptz not null default now()
);
create table public.sales_customer_district_access (
 organization_id uuid not null,district_key text not null,
 user_id uuid not null references public.sales_profiles(id),granted_by uuid not null references public.sales_profiles(id),
 granted_at timestamptz not null default now(),revoked_at timestamptz,
 primary key(organization_id,district_key,user_id),
 foreign key(organization_id,district_key) references public.sales_organization_districts(organization_id,district_key)
);
create table public.sales_ownership_history (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.sales_organizations(id),
 previous_salesperson_id uuid references public.sales_profiles(id),new_salesperson_id uuid not null references public.sales_profiles(id),
 actor_id uuid not null references public.sales_profiles(id),reason text not null check(char_length(btrim(reason)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create type public.sales_pipeline_stage as enum ('prospect','contacted','needs_identified','proposal_sent','signed_awaiting_payment','won','not_now','lost');
create table public.sales_opportunities (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.sales_organizations(id),district_key text not null,
 owner_id uuid not null references public.sales_profiles(id),original_salesperson_id uuid not null references public.sales_profiles(id),
 stage public.sales_pipeline_stage not null default 'prospect',business_goal text not null default '' check(char_length(business_goal)<=3000),
 proposed_product text not null default '' check(char_length(proposed_product)<=200),next_action text not null default '' check(char_length(next_action)<=1000),
 next_action_on date,last_contact_at timestamptz,lost_reason text not null default '' check(char_length(lost_reason)<=2000),version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,district_key) references public.sales_organization_districts(organization_id,district_key),
 check(stage <> 'not_now' or next_action_on is not null),check(stage <> 'lost' or char_length(btrim(lost_reason)) > 0),
 check(stage <> 'needs_identified' or char_length(btrim(business_goal)) > 0)
);
create index sales_opportunities_owner_due on public.sales_opportunities(owner_id,next_action_on);
create table public.sales_contact_history (
 id uuid primary key default gen_random_uuid(),opportunity_id uuid not null references public.sales_opportunities(id),actor_id uuid not null references public.sales_profiles(id),
 method text not null check(method in ('phone','email','in_person','other')),summary text not null check(char_length(btrim(summary)) between 1 and 5000),
 contacted_at timestamptz not null default now(),created_at timestamptz not null default now()
);
create table public.sales_customer_invitations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.sales_organizations(id),
 email text not null check(email=lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' and char_length(email)<=320),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),can_view boolean not null,can_approve_assets boolean not null,can_sign_agreements boolean not null,
 is_account_owner boolean not null default false,invited_by uuid not null references public.sales_profiles(id),reason text not null default '' check(char_length(reason)<=2000),expires_at timestamptz not null default now()+interval '7 days',
 accepted_by uuid references public.sales_profiles(id),accepted_at timestamptz,revoked_at timestamptz,
 email_status text not null default 'pending' check(email_status in ('pending','sent','failed')),email_attempts integer not null default 0,email_provider_id text,email_error text,
 created_at timestamptz not null default now(),check(can_view or (not can_approve_assets and not can_sign_agreements and not is_account_owner))
);
create unique index sales_pending_invitation on public.sales_customer_invitations(organization_id,email) where accepted_at is null and revoked_at is null;
create table public.sales_account_owner_transfers (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.sales_organizations(id),
 previous_owner_id uuid not null references public.sales_profiles(id),new_owner_id uuid not null references public.sales_profiles(id),requested_by uuid not null references public.sales_profiles(id),
 reason text not null check(char_length(btrim(reason)) between 1 and 2000),status text not null default 'pending' check(status in ('pending','accepted','canceled')),
 created_at timestamptz not null default now(),decided_at timestamptz,check(previous_owner_id<>new_owner_id)
);
create unique index sales_pending_account_transfer on public.sales_account_owner_transfers(organization_id) where status='pending';
create table public.sales_district_access_requests (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.sales_profiles(id),district_key text not null references public.sales_districts(district_key),
 reason text not null check(char_length(btrim(reason)) between 1 and 2000),status text not null default 'pending' check(status in ('pending','approved','denied')),
 decision_reason text,decided_by uuid references public.sales_profiles(id),created_at timestamptz not null default now(),decided_at timestamptz
);
create unique index sales_pending_district_request on public.sales_district_access_requests(user_id,district_key) where status='pending';
create table public.sales_notifications (
 id uuid primary key default gen_random_uuid(),recipient_id uuid not null references public.sales_profiles(id),event_key text not null,
 organization_id uuid references public.sales_organizations(id),district_key text references public.sales_districts(district_key),message text not null,
 action_path text not null check(action_path like '/%'),read_at timestamptz,created_at timestamptz not null default now(),unique(recipient_id,event_key)
);

create function sales_private.is_sales_staff() returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.is_owner() or (sales_private.active_user() and exists(select 1 from public.sales_staff_scopes s where s.user_id=auth.uid() and s.role in ('salesperson','district_manager','regional_manager')));
$$;
create function sales_private.eligible_seller(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sales_profiles p where p.id=target and p.active and
 (exists(select 1 from public.sales_owner o where o.user_id=p.id) or exists(select 1 from public.sales_staff_scopes s where s.user_id=p.id and s.role in ('salesperson','district_manager','regional_manager'))));
$$;
-- Whole-company transfer/recovery requires ONE authorized district or region.
create function sales_private.can_manage_company(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.is_owner() or (sales_private.active_user() and exists(
 select 1 from public.sales_staff_scopes s where s.user_id=auth.uid() and
 exists(select 1 from public.sales_organization_districts od where od.organization_id=target) and
 ((s.role='district_manager' and not exists(select 1 from public.sales_organization_districts od where od.organization_id=target and od.district_key<>s.district_key))
 or (s.role='regional_manager' and not exists(select 1 from public.sales_organization_districts od join public.sales_districts d using(district_key) where od.organization_id=target and (d.region_id is null or d.region_id<>s.region_id))))));
$$;
create function sales_private.can_edit_customer(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.can_manage_company(target) or (sales_private.active_user() and exists(select 1 from public.sales_organizations o where o.id=target and o.salesperson_id=auth.uid() and sales_private.is_sales_staff()));
$$;
create function sales_private.can_admin_members(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.can_edit_customer(target) or (sales_private.active_user() and exists(select 1 from public.sales_organization_members m where m.organization_id=target and m.user_id=auth.uid() and m.is_account_owner and m.can_view));
$$;
create function sales_private.can_read_staff_customer(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.is_owner() or (sales_private.active_user() and sales_private.is_sales_staff() and (
 exists(select 1 from public.sales_organizations o where o.id=target and o.salesperson_id=auth.uid())
 or exists(select 1 from public.sales_organization_districts d where d.organization_id=target and sales_private.can_manage_district(d.district_key))));
$$;
create function sales_private.can_work_opportunity(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.active_user() and exists(select 1 from public.sales_opportunities o where o.id=target and (sales_private.can_manage_district(o.district_key) or (o.owner_id=auth.uid() and sales_private.is_sales_staff())));
$$;
create or replace function sales_private.can_view_district(target text) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.can_manage_district(target) or (sales_private.active_user() and (
 exists(select 1 from public.sales_staff_scopes s where s.user_id=auth.uid() and s.district_key=target)
 or exists(select 1 from public.sales_customer_district_access a join public.sales_organizations o on o.id=a.organization_id where a.user_id=auth.uid() and a.district_key=target and a.revoked_at is null and o.salesperson_id=auth.uid() and sales_private.is_sales_staff())));
$$;
create function sales_private.notify_managers(target text,event text,org uuid,message text,path text) returns void language plpgsql security definer set search_path='' as $$
 declare recipients integer;
 begin
 insert into public.sales_notifications(recipient_id,event_key,organization_id,district_key,message,action_path)
 select distinct s.user_id,event,org,target,message,path from public.sales_staff_scopes s join public.sales_profiles p on p.id=s.user_id and p.active join public.sales_districts d on d.district_key=target
 where (s.role='district_manager' and s.district_key=target) or (s.role='regional_manager' and s.region_id=d.region_id)
 on conflict(recipient_id,event_key) do nothing;
 get diagnostics recipients=row_count;
 if recipients=0 then
 insert into public.sales_notifications(recipient_id,event_key,organization_id,district_key,message,action_path)
 select user_id,event,org,target,message,path from public.sales_owner on conflict(recipient_id,event_key) do nothing;
 end if;
 end;
$$;
revoke insert,update,delete on public.sales_organizations,public.sales_organization_districts,public.sales_organization_members from authenticated;
do $$ declare tab text; begin
 foreach tab in array array['sales_customer_details','sales_customer_district_access','sales_ownership_history','sales_opportunities','sales_contact_history','sales_customer_invitations','sales_account_owner_transfers','sales_district_access_requests','sales_notifications'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('revoke all on public.%I from anon,authenticated',tab);
 execute format('grant select on public.%I to authenticated',tab);
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function sales_private.capture_audit()',tab||'_audit',tab);
 end loop;
end $$;
create policy sales_details_read on public.sales_customer_details for select to authenticated using(sales_private.can_read_staff_customer(organization_id));
create policy sales_customer_access_read on public.sales_customer_district_access for select to authenticated using(sales_private.is_owner() or (user_id=auth.uid() and sales_private.active_user()) or sales_private.can_manage_district(district_key));
create policy sales_ownership_read on public.sales_ownership_history for select to authenticated using(sales_private.can_read_staff_customer(organization_id));
create policy sales_pipeline_read on public.sales_opportunities for select to authenticated using(sales_private.can_work_opportunity(id));
create policy sales_contacts_read on public.sales_contact_history for select to authenticated using(sales_private.can_work_opportunity(opportunity_id));
create policy sales_invites_read on public.sales_customer_invitations for select to authenticated using(sales_private.can_admin_members(organization_id));
create policy sales_account_transfers_read on public.sales_account_owner_transfers for select to authenticated using(sales_private.can_admin_members(organization_id) or (sales_private.active_user() and new_owner_id=auth.uid()));
create policy sales_access_requests_read on public.sales_district_access_requests for select to authenticated using((user_id=auth.uid() and sales_private.active_user()) or sales_private.can_manage_district(district_key));
create policy sales_notices_read on public.sales_notifications for select to authenticated using(recipient_id=auth.uid() and sales_private.active_user() and (organization_id is null or sales_private.can_view_organization(organization_id)));
drop policy sales_organization_members_read on public.sales_organization_members;
create policy sales_organization_members_read on public.sales_organization_members for select to authenticated using(sales_private.can_admin_members(organization_id) or (user_id=auth.uid() and sales_private.active_user()));

create function public.sales_workspace_context() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('is_sales_staff',sales_private.is_sales_staff(),'is_owner',sales_private.is_owner(),'is_production_agent',sales_private.active_user() and exists(select 1 from public.sales_staff_scopes where user_id=auth.uid() and role='production_agent'));
$$;
create function public.sales_organization_permissions(p_org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('can_view',sales_private.can_view_organization(p_org),'can_edit',sales_private.can_edit_customer(p_org),'can_admin_members',sales_private.can_admin_members(p_org),'can_transfer_salesperson',sales_private.can_manage_company(p_org));
$$;
create function public.sales_expansion_districts(p_org uuid default null) returns table(district_key text,name text) language sql stable security definer set search_path='' as $$
 select d.district_key,d.name from public.sales_districts d where d.active and sales_private.is_sales_staff() and (p_org is null or sales_private.can_edit_customer(p_org)) order by d.name;
$$;
create function public.sales_available_sellers(p_org uuid) returns table(id uuid,display_name text) language sql stable security definer set search_path='' as $$
 select p.id,p.display_name from public.sales_profiles p where sales_private.can_manage_company(p_org) and sales_private.eligible_seller(p.id) order by p.display_name;
$$;
create function public.sales_member_names(p_org uuid) returns table(id uuid,display_name text) language sql stable security definer set search_path='' as $$
 select p.id,p.display_name from public.sales_profiles p join public.sales_organization_members m on m.user_id=p.id where m.organization_id=p_org and sales_private.can_admin_members(p_org) order by p.display_name;
$$;

create function public.sales_create_customer(p_name text,p_district text,p_contact_name text default '',p_contact_email text default '',p_contact_phone text default '',p_location text default '') returns uuid language plpgsql security definer set search_path='' as $$
 declare org uuid;
 begin
 if not sales_private.is_sales_staff() or not (sales_private.can_manage_district(p_district) or exists(select 1 from public.sales_staff_scopes s where s.user_id=auth.uid() and s.role='salesperson' and s.district_key=p_district)) then raise exception 'Customer creation requires an assigned sales district'; end if;
 if not exists(select 1 from public.sales_districts where district_key=p_district and active) then raise exception 'District unavailable'; end if;
 insert into public.sales_organizations(company_name,salesperson_id) values(btrim(p_name),auth.uid()) returning id into org;
 insert into public.sales_organization_districts(organization_id,district_key) values(org,p_district);
 insert into public.sales_customer_details values(org,btrim(p_contact_name),lower(btrim(p_contact_email)),btrim(p_contact_phone),btrim(p_location),'',now());
 insert into public.sales_customer_district_access(organization_id,district_key,user_id,granted_by) values(org,p_district,auth.uid(),auth.uid());
 insert into public.sales_ownership_history(organization_id,new_salesperson_id,actor_id,reason) values(org,auth.uid(),auth.uid(),'Initial customer ownership');
 insert into public.sales_opportunities(organization_id,district_key,owner_id,original_salesperson_id,next_action,next_action_on) values(org,p_district,auth.uid(),auth.uid(),'Contact business',(now() at time zone 'America/Chicago')::date);
 return org;
 end;
$$;
create function public.sales_update_customer(p_org uuid,p_name text,p_contact_name text,p_contact_email text,p_contact_phone text,p_location text,p_notes text) returns void language plpgsql security definer set search_path='' as $$
 begin
 perform 1 from public.sales_organizations where id=p_org for update;
 if not sales_private.can_edit_customer(p_org) then raise exception 'Customer edit denied'; end if;
 update public.sales_organizations set company_name=btrim(p_name) where id=p_org;
 update public.sales_customer_details set contact_name=btrim(p_contact_name),contact_email=lower(btrim(p_contact_email)),contact_phone=btrim(p_contact_phone),business_location=btrim(p_location),internal_notes=p_notes,updated_at=now() where organization_id=p_org;
 end;
$$;
create function public.sales_add_customer_district(p_org uuid,p_district text) returns void language plpgsql security definer set search_path='' as $$
 declare seller uuid; added integer;
 begin
 select salesperson_id into seller from public.sales_organizations where id=p_org for update;
 if not sales_private.can_edit_customer(p_org) then raise exception 'Customer expansion denied'; end if;
 if not exists(select 1 from public.sales_districts where district_key=p_district and active) then raise exception 'District unavailable'; end if;
 insert into public.sales_organization_districts(organization_id,district_key) values(p_org,p_district) on conflict do nothing;
 get diagnostics added=row_count;
 if seller is not null then
 insert into public.sales_customer_district_access(organization_id,district_key,user_id,granted_by) values(p_org,p_district,seller,auth.uid()) on conflict(organization_id,district_key,user_id) do update set revoked_at=null,granted_at=now(),granted_by=auth.uid();
 end if;
 if added>0 then perform sales_private.notify_managers(p_district,'expansion:'||p_org::text||':'||p_district,p_org,'Customer added to your district. Standard customer-specific sales access is active.','/customers/'||p_org::text); end if;
 end;
$$;
create function public.sales_transfer_salesperson(p_org uuid,p_new_seller uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
 declare previous uuid; event uuid;
 begin
 select salesperson_id into previous from public.sales_organizations where id=p_org for update;
 if not found or not sales_private.can_manage_company(p_org) then raise exception 'Transfer requires owner or whole-company manager scope'; end if;
 if not sales_private.eligible_seller(p_new_seller) then raise exception 'New salesperson must be an active sales identity'; end if;
 if previous=p_new_seller then return; end if;
 if char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'Transfer reason required'; end if;
 update public.sales_organizations set salesperson_id=p_new_seller where id=p_org;
 update public.sales_customer_invitations set revoked_at=now() where organization_id=p_org and invited_by=previous and accepted_at is null and revoked_at is null;
 update public.sales_customer_district_access set revoked_at=now() where organization_id=p_org and revoked_at is null;
 insert into public.sales_customer_district_access(organization_id,district_key,user_id,granted_by)
 select p_org,district_key,p_new_seller,auth.uid() from public.sales_organization_districts where organization_id=p_org
 on conflict(organization_id,district_key,user_id) do update set revoked_at=null,granted_at=now(),granted_by=auth.uid();
 insert into public.sales_ownership_history(organization_id,previous_salesperson_id,new_salesperson_id,actor_id,reason) values(p_org,previous,p_new_seller,auth.uid(),btrim(p_reason)) returning id into event;
 -- Signed-sale attribution and commissions must remain independent of ownership.
 update public.sales_opportunities set owner_id=p_new_seller,version=version+1,updated_at=now() where organization_id=p_org;
 insert into public.sales_notifications(recipient_id,event_key,organization_id,message,action_path) values(p_new_seller,'ownership:'||event::text,p_org,'Customer ownership transferred to you.','/customers/'||p_org::text) on conflict do nothing;
 end;
$$;
create function public.sales_create_opportunity(p_org uuid,p_district text,p_goal text,p_product text,p_action text,p_on date) returns uuid language plpgsql security definer set search_path='' as $$
 declare result uuid; seller uuid;
 begin
 select salesperson_id into seller from public.sales_organizations where id=p_org for update;
 if not (sales_private.can_edit_customer(p_org) or sales_private.can_manage_district(p_district)) then raise exception 'Opportunity creation denied'; end if;
 if not exists(select 1 from public.sales_organization_districts where organization_id=p_org and district_key=p_district) then raise exception 'Add this customer district first'; end if;
 insert into public.sales_opportunities(organization_id,district_key,owner_id,original_salesperson_id,business_goal,proposed_product,next_action,next_action_on)
 values(p_org,p_district,seller,seller,p_goal,p_product,p_action,p_on) returning id into result;
 return result;
 end;
$$;
create function public.sales_update_opportunity(p_id uuid,p_version integer,p_stage public.sales_pipeline_stage,p_goal text,p_product text,p_action text,p_on date,p_lost_reason text) returns void language plpgsql security definer set search_path='' as $$
 declare current_record public.sales_opportunities;
 begin
 select * into current_record from public.sales_opportunities where id=p_id for update;
 if not found or not sales_private.can_work_opportunity(p_id) then raise exception 'Opportunity edit denied'; end if;
 if current_record.version<>p_version then raise exception 'This opportunity changed. Reload before saving'; end if;
 if p_stage in ('signed_awaiting_payment','won') or current_record.stage in ('signed_awaiting_payment','won') then raise exception 'Signed and Won stages require verified agreement/payment workflows'; end if;
 update public.sales_opportunities set stage=p_stage,business_goal=p_goal,proposed_product=p_product,next_action=p_action,next_action_on=p_on,lost_reason=p_lost_reason,version=version+1,updated_at=now() where id=p_id;
 end;
$$;
create function public.sales_log_contact(p_id uuid,p_method text,p_summary text) returns void language plpgsql security definer set search_path='' as $$
 begin
 perform 1 from public.sales_opportunities where id=p_id for update;
 if not sales_private.can_work_opportunity(p_id) then raise exception 'Contact logging denied'; end if;
 insert into public.sales_contact_history(opportunity_id,actor_id,method,summary) values(p_id,auth.uid(),p_method,btrim(p_summary));
 update public.sales_opportunities set last_contact_at=now(),updated_at=now(),version=version+1 where id=p_id;
 end;
$$;
create function public.sales_request_district_access(p_district text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
 declare result uuid;
 begin
 if not sales_private.is_sales_staff() then raise exception 'Staff access request denied'; end if;
 if not exists(select 1 from public.sales_districts where district_key=p_district and active) then raise exception 'District unavailable'; end if;
 insert into public.sales_district_access_requests(user_id,district_key,reason) values(auth.uid(),p_district,btrim(p_reason)) returning id into result;
 perform sales_private.notify_managers(p_district,'access-request:'||result::text,null,'Broader salesperson district access requested.','/access-requests');
 return result;
 end;
$$;
create function public.sales_decide_district_access(p_id uuid,p_approve boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
 declare request public.sales_district_access_requests;
 begin
 select * into request from public.sales_district_access_requests where id=p_id for update;
 if not found or not sales_private.can_manage_district(request.district_key) or request.user_id=auth.uid() then raise exception 'Scoped manager approval required; no self approval'; end if;
 if request.status<>'pending' then return; end if;
 if char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'Decision reason required'; end if;
 if p_approve then
 if not sales_private.eligible_seller(request.user_id) then raise exception 'Applicant is not active sales staff'; end if;
 insert into public.sales_staff_scopes(user_id,role,district_key) values(request.user_id,'salesperson',request.district_key) on conflict do nothing;
 end if;
 update public.sales_district_access_requests set status=case when p_approve then 'approved' else 'denied' end,decision_reason=btrim(p_reason),decided_by=auth.uid(),decided_at=now() where id=p_id;
 insert into public.sales_notifications(recipient_id,event_key,district_key,message,action_path) values(request.user_id,'access-decision:'||p_id::text,request.district_key,case when p_approve then 'District access approved.' else 'District access denied. Review the decision reason.' end,'/access-requests');
 end;
$$;
create function public.sales_read_notification(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
 begin if not sales_private.active_user() then raise exception 'Sign in required'; end if; update public.sales_notifications set read_at=now() where id=p_id and recipient_id=auth.uid(); end;
$$;
create function public.sales_seed_launch_prospects() returns void language plpgsql security definer set search_path='' as $$
 declare name text; key text; org uuid;
 begin
 if not sales_private.is_owner() then raise exception 'Owner only'; end if;
 perform 1 from public.sales_owner for update;
 foreach name in array array['The Old Stone Bistro','The Getaway Bar and Grill','La Porte City Golf Club'] loop
 key='launch:'||name;
 if not exists(select 1 from public.sales_organizations where seed_key=key) then
 org=public.sales_create_customer(name,'dlpc'); update public.sales_organizations set seed_key=key where id=org;
 end if;
 end loop;
 end;
$$;

create function public.sales_invite_customer(p_org uuid,p_email text,p_token_hash text,p_view boolean,p_approve boolean,p_sign boolean,p_owner boolean default false,p_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$
 declare result uuid;
 begin
 perform 1 from public.sales_organizations where id=p_org for update;
 if not sales_private.can_admin_members(p_org) then raise exception 'Invitation denied'; end if;
 if p_owner and exists(select 1 from public.sales_organization_members where organization_id=p_org and is_account_owner) then raise exception 'Use accepted account-owner transfer to replace an owner'; end if;
 -- Reissue invalidates earlier tokens. Recovery reasons are required for all
 -- staff recovery invitations when an organization already has an account owner.
 if not exists(select 1 from public.sales_organization_members where organization_id=p_org and user_id=auth.uid() and is_account_owner)
 and exists(select 1 from public.sales_organization_members where organization_id=p_org and is_account_owner) and btrim(p_reason)='' then raise exception 'Onboarding or recovery reason required'; end if;
 update public.sales_customer_invitations set revoked_at=now() where organization_id=p_org and email=lower(btrim(p_email)) and accepted_at is null and revoked_at is null;
 insert into public.sales_customer_invitations(organization_id,email,token_hash,can_view,can_approve_assets,can_sign_agreements,is_account_owner,invited_by,reason)
 values(p_org,lower(btrim(p_email)),p_token_hash,p_view,p_approve,p_sign,p_owner,auth.uid(),btrim(p_reason)) returning id into result;
 return result;
 end;
$$;
create function sales_private.invitation_authorizer_valid(actor uuid,target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sales_profiles p where p.id=actor and p.active) and (
 exists(select 1 from public.sales_owner where user_id=actor)
 or exists(select 1 from public.sales_organizations where id=target and salesperson_id=actor and sales_private.eligible_seller(actor))
 or exists(select 1 from public.sales_organization_members where organization_id=target and user_id=actor and is_account_owner and can_view)
 or exists(select 1 from public.sales_staff_scopes s where s.user_id=actor and exists(select 1 from public.sales_organization_districts where organization_id=target) and (
 (s.role='district_manager' and not exists(select 1 from public.sales_organization_districts d where d.organization_id=target and d.district_key<>s.district_key))
 or (s.role='regional_manager' and not exists(select 1 from public.sales_organization_districts od join public.sales_districts d using(district_key) where od.organization_id=target and (d.region_id is null or d.region_id<>s.region_id))))));
$$;
create function public.sales_inspect_invitation(p_hash text) returns table(id uuid,organization_id uuid,company_name text,email text,can_view boolean,can_approve_assets boolean,can_sign_agreements boolean,is_account_owner boolean) language sql stable security definer set search_path='' as $$
 select i.id,i.organization_id,o.company_name,i.email,i.can_view,i.can_approve_assets,i.can_sign_agreements,i.is_account_owner from public.sales_customer_invitations i join public.sales_organizations o on o.id=i.organization_id
 where i.token_hash=p_hash and i.revoked_at is null and i.accepted_at is null and i.expires_at>now() and sales_private.invitation_authorizer_valid(i.invited_by,i.organization_id);
$$;
create function public.sales_accept_invitation(p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
 declare invite public.sales_customer_invitations; verified_email text;
 begin
 select * into invite from public.sales_customer_invitations where token_hash=p_hash;
 if not found then raise exception 'Invitation invalid or expired'; end if;
 -- Organization-first locking is consistent with invite/member administration.
 perform 1 from public.sales_organizations where id=invite.organization_id for update;
 select * into invite from public.sales_customer_invitations where token_hash=p_hash for update;
 if invite.revoked_at is not null or invite.expires_at<=now() then raise exception 'Invitation invalid or expired'; end if;
 select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified_email is null or verified_email<>invite.email then raise exception 'Sign in with the verified invited email'; end if;
 if invite.accepted_at is not null then
 if invite.accepted_by=auth.uid() then return invite.organization_id; else raise exception 'Invitation already accepted'; end if;
 end if;
 if not sales_private.invitation_authorizer_valid(invite.invited_by,invite.organization_id) then raise exception 'Invitation authorizer no longer has access; request a new invitation'; end if;
 if invite.is_account_owner and exists(select 1 from public.sales_organization_members where organization_id=invite.organization_id and is_account_owner and user_id<>auth.uid()) then raise exception 'Organization already has an owner; request an accepted transfer'; end if;
 if not sales_private.active_user() and (exists(select 1 from public.sales_staff_scopes where user_id=auth.uid()) or exists(select 1 from public.sales_owner where user_id=auth.uid())) then raise exception 'Staff account deactivated; contact the KRTR owner'; end if;
 update public.sales_profiles set active=true where id=auth.uid();
 insert into public.sales_organization_members(organization_id,user_id,can_view,can_approve_assets,can_sign_agreements,is_account_owner)
 values(invite.organization_id,auth.uid(),invite.can_view,invite.can_approve_assets,invite.can_sign_agreements,invite.is_account_owner)
 on conflict(organization_id,user_id) do update set can_view=excluded.can_view,can_approve_assets=excluded.can_approve_assets,can_sign_agreements=excluded.can_sign_agreements,is_account_owner=sales_organization_members.is_account_owner or excluded.is_account_owner;
 update public.sales_customer_invitations set accepted_at=now(),accepted_by=auth.uid() where id=invite.id;
 return invite.organization_id;
 end;
$$;
create function public.sales_record_invitation_email(p_id uuid,p_status text,p_provider_id text default null,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
 begin
 if p_status not in ('sent','failed') then raise exception 'Invalid email status'; end if;
 update public.sales_customer_invitations set email_status=p_status,email_attempts=email_attempts+1,email_provider_id=p_provider_id,email_error=left(p_error,500) where id=p_id;
 end;
$$;
create function public.sales_revoke_invitation(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare org uuid;
 begin
 select organization_id into org from public.sales_customer_invitations where id=p_id;
 perform 1 from public.sales_organizations where id=org for update;
 if not sales_private.can_admin_members(org) then raise exception 'Invitation revocation denied'; end if;
 update public.sales_customer_invitations set revoked_at=now() where id=p_id and accepted_at is null;
 end;
$$;
create function public.sales_set_member_permissions(p_org uuid,p_user uuid,p_view boolean,p_approve boolean,p_sign boolean,p_remove boolean default false) returns void language plpgsql security definer set search_path='' as $$
 declare member public.sales_organization_members;
 begin
 perform 1 from public.sales_organizations where id=p_org for update;
 if not sales_private.can_admin_members(p_org) then raise exception 'Membership administration denied'; end if;
 select * into member from public.sales_organization_members where organization_id=p_org and user_id=p_user for update;
 if not found then raise exception 'Member not found'; end if;
 if member.is_account_owner and (p_remove or not p_view) then raise exception 'Transfer account ownership before removing owner access'; end if;
 if p_remove then
 delete from public.sales_organization_members where organization_id=p_org and user_id=p_user;
 update public.sales_account_owner_transfers set status='canceled',decided_at=now() where organization_id=p_org and new_owner_id=p_user and status='pending';
 update public.sales_customer_invitations set revoked_at=now() where organization_id=p_org and (accepted_by=p_user or invited_by=p_user) and revoked_at is null;
 else update public.sales_organization_members set can_view=p_view,can_approve_assets=p_approve,can_sign_agreements=p_sign where organization_id=p_org and user_id=p_user;
 end if;
 end;
$$;
create function public.sales_request_account_transfer(p_org uuid,p_new_owner uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
 declare previous uuid; result uuid;
 begin
 perform 1 from public.sales_organizations where id=p_org for update;
 if not sales_private.can_admin_members(p_org) then raise exception 'Account ownership transfer denied'; end if;
 select user_id into previous from public.sales_organization_members where organization_id=p_org and is_account_owner;
 if previous is null then raise exception 'Invite the first organization owner'; end if;
 if not exists(select 1 from public.sales_organization_members m join public.sales_profiles p on p.id=m.user_id where m.organization_id=p_org and m.user_id=p_new_owner and m.can_view and p.active) then raise exception 'New owner must be an active organization member'; end if;
 insert into public.sales_account_owner_transfers(organization_id,previous_owner_id,new_owner_id,requested_by,reason) values(p_org,previous,p_new_owner,auth.uid(),btrim(p_reason)) returning id into result;
 insert into public.sales_notifications(recipient_id,event_key,organization_id,message,action_path) values(p_new_owner,'account-owner:'||result::text,p_org,'Account ownership transfer awaits your acceptance.','/customers/'||p_org::text);
 return result;
 end;
$$;
create function public.sales_decide_account_transfer(p_id uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
 declare transfer public.sales_account_owner_transfers;
 begin
 select * into transfer from public.sales_account_owner_transfers where id=p_id;
 if not found then raise exception 'Transfer not found'; end if;
 perform 1 from public.sales_organizations where id=transfer.organization_id for update;
 select * into transfer from public.sales_account_owner_transfers where id=p_id for update;
 if transfer.status<>'pending' then return; end if;
 if not sales_private.active_user() then raise exception 'Active account required'; end if;
 if p_accept then
 if transfer.new_owner_id<>auth.uid() then raise exception 'Only the new owner can accept'; end if;
 if not exists(select 1 from public.sales_organization_members where organization_id=transfer.organization_id and user_id=auth.uid() and can_view) then raise exception 'New owner membership unavailable'; end if;
 if not exists(select 1 from public.sales_organization_members where organization_id=transfer.organization_id and user_id=transfer.previous_owner_id and is_account_owner) then raise exception 'Previous owner changed; request a new transfer'; end if;
 update public.sales_organization_members set is_account_owner=false where organization_id=transfer.organization_id and user_id=transfer.previous_owner_id;
 update public.sales_organization_members set is_account_owner=true where organization_id=transfer.organization_id and user_id=transfer.new_owner_id;
 update public.sales_customer_invitations set revoked_at=now() where organization_id=transfer.organization_id and invited_by=transfer.previous_owner_id and accepted_at is null and revoked_at is null;
 update public.sales_account_owner_transfers set status='accepted',decided_at=now() where id=p_id;
 else
 if transfer.new_owner_id<>auth.uid() and not sales_private.can_admin_members(transfer.organization_id) then raise exception 'Transfer cancellation denied'; end if;
 update public.sales_account_owner_transfers set status='canceled',decided_at=now() where id=p_id;
 end if;
 end;
$$;
create function public.sales_creation_districts() returns table(district_key text,name text) language sql stable security definer set search_path='' as $$
 select d.district_key,d.name from public.sales_districts d where d.active and sales_private.is_sales_staff() and (sales_private.can_manage_district(d.district_key) or exists(select 1 from public.sales_staff_scopes s where s.user_id=auth.uid() and s.role='salesperson' and s.district_key=d.district_key)) order by d.name;
$$;
create function public.sales_customer_sales_contact(p_org uuid) returns table(display_name text,email text) language sql stable security definer set search_path='' as $$
 select p.display_name,u.email from public.sales_organizations o join public.sales_profiles p on p.id=o.salesperson_id join auth.users u on u.id=p.id where o.id=p_org and sales_private.can_view_organization(p_org);
$$;
create function public.sales_set_primary_scope(p_scope uuid) returns void language plpgsql security definer set search_path='' as $$
 declare selected public.sales_staff_scopes;
 begin
 if not sales_private.is_owner() then raise exception 'Owner only'; end if;
 select * into selected from public.sales_staff_scopes where id=p_scope;
 if not found or selected.role<>'salesperson' then raise exception 'Select an existing salesperson district scope'; end if;
 perform 1 from public.sales_profiles where id=selected.user_id for update;
 update public.sales_staff_scopes set is_primary=false where user_id=selected.user_id and is_primary;
 update public.sales_staff_scopes set is_primary=true where id=p_scope;
 end;
$$;
create function public.sales_update_display_name(p_name text) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not sales_private.active_user() then raise exception 'Active account required'; end if;
 if char_length(btrim(p_name)) not between 1 and 100 then raise exception 'Display name must contain 1 to 100 characters'; end if;
 update public.sales_profiles set display_name=btrim(p_name) where id=auth.uid();
 end;
$$;
-- No raw mutation access; authenticated RPCs repeat scope checks internally.
do $$ declare f record; begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'sales_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 execute format('grant execute on function %s to authenticated',f.sig);
 end loop;
end $$;
grant execute on function public.sales_inspect_invitation(text) to anon;
revoke execute on function public.sales_record_invitation_email(uuid,text,text,text) from authenticated;
grant execute on function public.sales_record_invitation_email(uuid,text,text,text) to service_role;
revoke all on function sales_private.invitation_authorizer_valid(uuid,uuid),sales_private.is_sales_staff(),sales_private.eligible_seller(uuid),sales_private.can_manage_company(uuid),sales_private.can_edit_customer(uuid),sales_private.can_admin_members(uuid),sales_private.can_read_staff_customer(uuid),sales_private.can_work_opportunity(uuid),sales_private.notify_managers(text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function sales_private.is_sales_staff(),sales_private.can_manage_company(uuid),sales_private.can_edit_customer(uuid),sales_private.can_admin_members(uuid),sales_private.can_read_staff_customer(uuid),sales_private.can_work_opportunity(uuid) to authenticated;
commit;
