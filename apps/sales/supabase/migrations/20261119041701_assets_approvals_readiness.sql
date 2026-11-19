-- Dedicated Sales project. Asset identity, exact-version approval and readiness.
begin;
create table public.sales_assets (
 id uuid primary key,organization_id uuid not null references public.sales_organizations(id),
 district_key text not null,label text not null check(char_length(btrim(label)) between 1 and 200),
 kind text not null check(kind in ('banner','display','social','logo')),origin text not null check(origin in ('supplied','krtr')),
 replaces_asset_id uuid references public.sales_assets(id),current_version integer not null default 0,
 intake_version integer not null default 0,production_assignee uuid references public.sales_profiles(id),
 created_by uuid not null references public.sales_profiles(id),created_at timestamptz not null default now(),
 foreign key(organization_id,district_key) references public.sales_organization_districts(organization_id,district_key)
);
create table public.sales_asset_intakes (
 asset_id uuid not null references public.sales_assets(id),version integer not null,content jsonb not null,
 actor_id uuid not null references public.sales_profiles(id),created_at timestamptz not null default now(),primary key(asset_id,version)
);
create table public.sales_media_uploads (
 id uuid primary key,organization_id uuid not null references public.sales_organizations(id),asset_id uuid not null references public.sales_assets(id),
 purpose text not null check(purpose in ('logo','artwork')),actor_id uuid not null references public.sales_profiles(id),
 public_id text not null unique,expires_at timestamptz not null default now()+interval '15 minutes',created_at timestamptz not null default now()
);
create table public.sales_asset_media (
 id uuid primary key references public.sales_media_uploads(id),organization_id uuid not null references public.sales_organizations(id),asset_id uuid not null references public.sales_assets(id),
 public_id text not null unique,cloudinary_asset_id text not null,cloudinary_version text not null,
 format text not null check(format in ('png','jpg','webp')),width integer not null check(width>0),height integer not null check(height>0),
 has_transparency boolean not null,sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),created_at timestamptz not null default now()
);
create table public.sales_asset_work (
 id uuid primary key,asset_id uuid not null references public.sales_assets(id),agreement_id uuid not null references public.sales_agreements(id),
 kind text not null check(kind in ('creation','revision','correction')),revision_round integer,
 amount_cents bigint not null check(amount_cents in (0,500,1500)),reason text not null check(char_length(btrim(reason)) between 1 and 2000),
 state text not null default 'proposed' check(state in ('proposed','authorized','completed','declined')),
 requested_by uuid not null references public.sales_profiles(id),authorized_by uuid references public.sales_profiles(id),
 authorized_at timestamptz,created_at timestamptz not null default now(),unique(asset_id,revision_round)
);
create unique index sales_creation_work_once on public.sales_asset_work(asset_id) where kind='creation' and state<>'declined';
create table public.sales_asset_versions (
 asset_id uuid not null references public.sales_assets(id),version integer not null,intake_version integer not null,
 media_id uuid not null references public.sales_asset_media(id),content jsonb not null,
 work_id uuid unique references public.sales_asset_work(id),change_kind text not null check(change_kind in ('initial','supplied','revision','correction')),
 actor_id uuid not null references public.sales_profiles(id),created_at timestamptz not null default now(),primary key(asset_id,version),
 foreign key(asset_id,intake_version) references public.sales_asset_intakes(asset_id,version)
);
create table public.sales_asset_reviews (
 id uuid primary key,asset_id uuid not null,version integer not null,agreement_id uuid references public.sales_agreements(id),
 decision text not null check(decision in ('approved','revision_requested','revoked')),
 comment text not null default '',standing boolean not null default false,valid_from date,valid_until date,
 actor_id uuid not null references public.sales_profiles(id),created_at timestamptz not null default now(),review_order bigint generated always as identity unique,
 foreign key(asset_id,version) references public.sales_asset_versions(asset_id,version),
 check(decision='approved' or char_length(btrim(comment)) between 1 and 3000),
 check(decision<>'approved' or ((agreement_id is not null and not standing) or (standing and valid_from is not null and valid_until>=valid_from)))
);
create table public.sales_creative_bindings (
 id uuid primary key,agreement_id uuid not null references public.sales_agreements(id),line_id uuid not null,
 slot text not null,run_on date,asset_id uuid not null,asset_version integer not null,actor_id uuid not null references public.sales_profiles(id),updated_at timestamptz not null default now(),
 foreign key(asset_id,asset_version) references public.sales_asset_versions(asset_id,version),unique nulls not distinct(agreement_id,line_id,slot,run_on)
);
create table public.sales_readiness_exceptions (
 id uuid primary key,agreement_id uuid not null references public.sales_agreements(id),line_id uuid not null,run_on date,
 block_code text not null check(block_code in ('payment','inputs','asset_approval','approval_deadline','nrcs_handoff')),
 reason text not null check(char_length(btrim(reason)) between 1 and 2000),expires_at timestamptz not null,
 actor_id uuid not null references public.sales_profiles(id),created_at timestamptz not null default now()
);
create table public.sales_deadline_amendments (
 id uuid primary key,agreement_id uuid not null references public.sales_agreements(id),line_id uuid not null,run_on date not null,
 previous_due_at timestamptz not null,proposed_due_at timestamptz not null,reason text not null check(char_length(btrim(reason)) between 1 and 2000),
 state text not null default 'pending' check(state in ('pending','accepted','declined','canceled')),
 actor_id uuid not null references public.sales_profiles(id),created_at timestamptz not null default now(),
 accepted_by uuid references public.sales_profiles(id),decided_at timestamptz,check(proposed_due_at<previous_due_at)
);
create unique index sales_pending_deadline_amendment on public.sales_deadline_amendments(agreement_id,line_id,run_on) where state='pending';
create table sales_private.asset_notice_outbox (
 id uuid primary key default gen_random_uuid(),event_key text not null,recipient_id uuid not null references public.sales_profiles(id),
 subject text not null,message text not null,action_path text not null,attempts integer not null default 0,
 available_at timestamptz not null default now(),locked_until timestamptz,claim_token uuid,sent_at timestamptz,provider_id text,last_error text,
 unique(event_key,recipient_id)
);
alter table sales_private.asset_notice_outbox enable row level security;
alter table public.sales_invoices drop constraint sales_invoices_agreement_id_key;
alter table public.sales_invoices add column invoice_kind text not null default 'agreement' check(invoice_kind in ('agreement','asset_work'));
alter table public.sales_invoices add column work_terms jsonb;
alter table public.sales_invoices add column asset_work_id uuid unique references public.sales_asset_work(id);
alter table public.sales_invoices add constraint sales_work_invoice_kind check((invoice_kind='agreement' and asset_work_id is null) or (invoice_kind='asset_work' and asset_work_id is not null and advertising_cents=0));
create unique index sales_main_invoice_once on public.sales_invoices(agreement_id) where invoice_kind='agreement';
create index sales_assets_org on public.sales_assets(organization_id,district_key);
create index sales_assets_assignee on public.sales_assets(production_assignee);
create index sales_reviews_scope on public.sales_asset_reviews(asset_id,version,created_at desc);
create index sales_work_agreement on public.sales_asset_work(agreement_id,state);
create index sales_bindings_asset on public.sales_creative_bindings(asset_id,asset_version);
create index sales_notices_pending on sales_private.asset_notice_outbox(available_at) where sent_at is null;

create function sales_private.asset_customer(org uuid,permission text default 'view') returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.active_user() and exists(select 1 from public.sales_organization_members m where m.organization_id=org and m.user_id=auth.uid() and m.can_view and
 (permission='view' or (permission='approve' and m.can_approve_assets) or (permission='sign' and m.can_sign_agreements)));
$$;
create function sales_private.asset_producer(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.active_user() and exists(select 1 from public.sales_assets a join public.sales_staff_scopes s on s.user_id=auth.uid() and s.role='production_agent' and s.district_key=a.district_key where a.id=target and a.production_assignee=auth.uid());
$$;
create function sales_private.asset_staff(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sales_assets a where a.id=target and (sales_private.can_edit_customer(a.organization_id) or sales_private.can_manage_district(a.district_key)));
$$;
create function sales_private.asset_view(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.asset_staff(target) or sales_private.asset_producer(target) or exists(select 1 from public.sales_assets a where a.id=target and sales_private.asset_customer(a.organization_id));
$$;
create function sales_private.asset_edit(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.asset_staff(target) or sales_private.asset_producer(target) or exists(select 1 from public.sales_assets a where a.id=target and sales_private.asset_customer(a.organization_id,'approve'));
$$;
create function sales_private.asset_notice(target uuid,event text,message text,audience text) returns void language plpgsql security definer set search_path='' as $$
 declare a public.sales_assets; recipient uuid;
 begin select * into a from public.sales_assets where id=target;
 for recipient in select p.id from public.sales_profiles p where p.active and (
 (audience='customer' and exists(select 1 from public.sales_organization_members m where m.organization_id=a.organization_id and m.user_id=p.id and m.can_view and m.can_approve_assets)) or
 (audience='staff' and (p.id=a.production_assignee or exists(select 1 from public.sales_organizations o where o.id=a.organization_id and o.salesperson_id=p.id)))) loop
 insert into public.sales_notifications(recipient_id,event_key,organization_id,district_key,message,action_path) values(recipient,event,a.organization_id,a.district_key,message,'/assets/'||a.id) on conflict(recipient_id,event_key) do nothing;
 insert into sales_private.asset_notice_outbox(event_key,recipient_id,subject,message,action_path) values(event,recipient,'KRTR Sales: asset action',message,'/assets/'||a.id) on conflict(event_key,recipient_id) do nothing;
 end loop;end;
$$;
create function sales_private.agreement_line(agreement uuid,line_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select l from public.sales_agreements a cross join lateral jsonb_array_elements(a.snapshot->'lines') l where a.id=agreement and l->>'line_id'=line_id::text;
$$;
create function sales_private.creative_slots(code text) returns text[] language sql immutable set search_path='' as $$
 select case when code in ('P01','P02','P03','P06') then array['web_banner'] when code='P04' then array['show_display','show_bug'] when code='P05' then array['special_display'] when code='P13' then array['studio_display'] else array['social_image','coverage_logo'] end;
$$;
create function sales_private.slot_kind(slot text) returns text language sql immutable set search_path='' as $$
 select case when slot='web_banner' then 'banner' when slot in ('show_bug','coverage_logo') then 'logo' when slot='social_image' then 'social' else 'display' end;
$$;
create function public.sales_create_asset(p_id uuid,p_org uuid,p_district text,p_label text,p_kind text,p_origin text,p_replaces uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare a public.sales_assets;
 begin
 if not (sales_private.can_edit_customer(p_org) or sales_private.can_manage_district(p_district)) or not exists(select 1 from public.sales_organization_districts where organization_id=p_org and district_key=p_district) then raise exception 'Asset creation denied';end if;
 if p_replaces is not null and not exists(select 1 from public.sales_assets where id=p_replaces and organization_id=p_org) then raise exception 'Replacement must belong to the same organization';end if;
 if exists(select 1 from public.sales_quote_asset_intents where id=p_id and organization_id<>p_org) then raise exception 'Quoted asset belongs to another organization';end if;
 select * into a from public.sales_assets where id=p_id;
 if found then if a.organization_id<>p_org or a.label<>btrim(p_label) or a.kind<>p_kind or a.origin<>p_origin then raise exception 'Asset request identity changed';end if;return a.id;end if;
 insert into public.sales_assets(id,organization_id,district_key,label,kind,origin,replaces_asset_id,created_by) values(p_id,p_org,p_district,btrim(p_label),p_kind,p_origin,p_replaces,auth.uid());return p_id;end;
$$;
create function public.sales_save_asset_intake(p_asset uuid,p_expected integer,p_content jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare a public.sales_assets; key text;
 begin select * into a from public.sales_assets where id=p_asset for update;
 if not found or not sales_private.asset_edit(a.id) then raise exception 'Asset intake denied';end if;
 if a.intake_version<>p_expected then raise exception 'Intake changed; reload before saving';end if;
 if jsonb_typeof(p_content) is distinct from 'object' then raise exception 'Production inputs required';end if;
 for key in select jsonb_object_keys(p_content) loop
 if key not in ('goal','offer','hours','restrictions','business_location','approver','brand_notes','logo_media_id','destination_url') then raise exception 'Unsupported intake field';end if;
 if jsonb_typeof(p_content->key) is distinct from 'string' or char_length(p_content->>key)>3000 then raise exception 'Intake fields must be text within 3000 characters';end if;end loop;
 if coalesce(p_content->>'logo_media_id','')<>'' and not exists(select 1 from public.sales_asset_media m where m.id=(p_content->>'logo_media_id')::uuid and m.organization_id=a.organization_id) then raise exception 'Supplied logo must belong to this organization';end if;
 if coalesce(p_content->>'destination_url','')<>'' and (p_content->>'destination_url') !~ '^https?://[^[:space:]]+$' then raise exception 'Valid advertiser destination URL required';end if;
 insert into public.sales_asset_intakes(asset_id,version,content,actor_id) values(a.id,a.intake_version+1,p_content||jsonb_build_object('company_name',(select company_name from public.sales_organizations where id=a.organization_id)),auth.uid());update public.sales_assets set intake_version=intake_version+1 where id=a.id;end;
$$;
create function public.sales_assign_asset_producer(p_asset uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
 declare a public.sales_assets;
 begin select * into a from public.sales_assets where id=p_asset for update;
 if not found or not sales_private.asset_staff(a.id) then raise exception 'Production assignment denied';end if;
 if p_user is not null and not exists(select 1 from public.sales_profiles p join public.sales_staff_scopes s on s.user_id=p.id where p.id=p_user and p.active and s.role='production_agent' and s.district_key=a.district_key) then raise exception 'Active production agent in this district required';end if;
 update public.sales_assets set production_assignee=p_user where id=a.id;end;
$$;
create function public.sales_begin_asset_upload(p_asset uuid,p_purpose text,p_id uuid) returns text language plpgsql security definer set search_path='' as $$
 declare a public.sales_assets; u public.sales_media_uploads;
 begin select * into a from public.sales_assets where id=p_asset;
 if not found or not sales_private.asset_edit(a.id) or p_purpose not in ('logo','artwork') then raise exception 'Asset upload denied';end if;
 select * into u from public.sales_media_uploads where id=p_id;
 if found then if u.asset_id<>a.id or u.actor_id<>auth.uid() or u.purpose<>p_purpose or u.expires_at<=now() then raise exception 'Upload request changed or expired';end if;return u.public_id;end if;
 insert into public.sales_media_uploads(id,organization_id,asset_id,purpose,actor_id,public_id) values(p_id,a.organization_id,a.id,p_purpose,auth.uid(),'krtr-sales/'||a.organization_id||'/'||a.id||'/'||p_id) returning public_id into u.public_id;return u.public_id;end;
$$;
-- The server independently inspects the immutable authenticated Cloudinary image.
create function public.sales_register_asset_media(p_upload uuid,p_actor uuid,p_cloudinary_id text,p_cloudinary_version text,p_format text,p_width integer,p_height integer,p_transparent boolean,p_sha256 text) returns uuid language plpgsql security definer set search_path='' as $$
 declare u public.sales_media_uploads; a public.sales_assets; existing public.sales_asset_media;
 begin select * into u from public.sales_media_uploads where id=p_upload for update;
 if not found or u.actor_id<>p_actor or u.expires_at<=now() then raise exception 'Upload registration unavailable';end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 if not sales_private.asset_edit(u.asset_id) then raise exception 'Upload authority changed';end if;
 select * into a from public.sales_assets where id=u.asset_id;
 if u.purpose='artwork' and ((a.kind='banner' and (p_width<>1800 or p_height<>200)) or (a.kind='display' and (p_width<>1080 or p_height<>1160)) or (a.kind='social' and (p_width<>1080 or p_height<>1080)) or (a.kind='logo' and (p_width<>500 or p_height<>500 or not p_transparent))) then raise exception 'Source dimensions/transparency do not match the asset kind';end if;
 select * into existing from public.sales_asset_media where id=u.id;
 if found then if existing.sha256<>p_sha256 or existing.cloudinary_asset_id<>p_cloudinary_id then raise exception 'Immutable media identity changed';end if;return u.id;end if;
 insert into public.sales_asset_media(id,organization_id,asset_id,public_id,cloudinary_asset_id,cloudinary_version,format,width,height,has_transparency,sha256) values(u.id,u.organization_id,u.asset_id,u.public_id,p_cloudinary_id,p_cloudinary_version,p_format,p_width,p_height,p_transparent,p_sha256);return u.id;end;
$$;

create function public.sales_propose_asset_work(p_asset uuid,p_agreement uuid,p_key uuid,p_kind text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
 declare a public.sales_assets; agreement public.sales_agreements; fee bigint; round_number integer; w public.sales_asset_work;
 begin
 select * into a from public.sales_assets where id=p_asset for update;select * into agreement from public.sales_agreements where id=p_agreement;
 if a.id is null or agreement.id is null or a.organization_id<>agreement.organization_id or not sales_private.asset_staff(a.id) or not sales_private.can_work_agreement(agreement.id) then raise exception 'Asset work proposal denied';end if;
 select * into w from public.sales_asset_work where id=p_key;
 if found then if w.asset_id<>p_asset or w.agreement_id<>p_agreement or w.kind<>p_kind or w.reason<>btrim(p_reason) then raise exception 'Work request identity changed';end if;return p_key;end if;
 if p_kind='creation' then
 if exists(select 1 from public.sales_agreements g cross join lateral jsonb_array_elements(g.snapshot->'lines') l cross join lateral jsonb_array_elements(l->'assets') x where g.organization_id=a.organization_id and x->>'id'=a.id::text and (x->>'billed_here')::boolean) then raise exception 'This asset creation is already itemized in a signed agreement';end if;
 if a.origin<>'krtr' or a.current_version<>0 then raise exception 'New KRTR creation identity required';end if;fee=1500;
 elsif p_kind='revision' then
 if a.origin<>'krtr' or a.current_version=0 then raise exception 'Existing KRTR asset required for revision';end if;
 if exists(select 1 from public.sales_asset_work where asset_id=a.id and kind='revision' and state in ('proposed','authorized')) then raise exception 'Finish or decline the existing revision round first';end if;
 select coalesce(max(revision_round),0)+1 into round_number from public.sales_asset_work where asset_id=a.id and kind='revision';
 fee=case when exists(select 1 from public.sales_asset_work where asset_id=a.id and kind='revision' and state in ('authorized','completed')) then 500 else 0 end;
 elsif p_kind='correction' then
 if a.current_version=0 then raise exception 'Existing asset required for an error correction';end if;fee=0;
 else raise exception 'Unsupported asset work kind';end if;
 insert into public.sales_asset_work(id,asset_id,agreement_id,kind,revision_round,amount_cents,reason,requested_by,state,authorized_by,authorized_at)
 values(p_key,a.id,agreement.id,p_kind,round_number,fee,btrim(p_reason),auth.uid(),case when fee=0 then 'authorized' else 'proposed' end,case when fee=0 then auth.uid() end,case when fee=0 then now() end);
 perform sales_private.asset_notice(a.id,'work-proposed:'||p_key,'Asset work terms are available for review. Paid work needs explicit authorization before it begins.','customer');return p_key;end;
$$;
create function public.sales_decide_asset_work(p_work uuid,p_accept boolean,p_due timestamptz default null,p_tax_version uuid default null) returns void language plpgsql security definer set search_path='' as $$
 declare w public.sales_asset_work; a public.sales_assets; tax public.sales_tax_versions; tax_amount bigint;
 begin
 select * into w from public.sales_asset_work where id=p_work for update;select * into a from public.sales_assets where id=w.asset_id;
 if a.id is null or not sales_private.asset_customer(a.organization_id,'sign') then raise exception 'Customer agreement-signing permission required for paid work';end if;
 if w.state='authorized' and p_accept then return;end if;
 if w.state<>'proposed' then raise exception 'Work proposal is no longer pending';end if;
 if p_accept is distinct from true then update public.sales_asset_work set state='declined',authorized_by=auth.uid(),authorized_at=now() where id=w.id;return;end if;
 if p_due is null or p_due<=now() then raise exception 'Explicit future payment due time required';end if;
 select * into tax from public.sales_tax_versions where district_key=a.district_key order by version desc limit 1;
 if not found then raise exception 'Manager must configure tax treatment first';end if;
 if p_tax_version is distinct from tax.id then raise exception 'Tax treatment changed; review the exact work terms again';end if;
 tax_amount=case when tax.asset_work_taxable then round(w.amount_cents*tax.rate_bps/10000.0)::bigint else 0 end;
 insert into public.sales_invoices(agreement_id,invoice_kind,asset_work_id,advertising_cents,asset_cents,tax_cents,total_cents,due_at,inventory_status,work_terms)
 values(w.agreement_id,'asset_work',w.id,0,w.amount_cents,tax_amount,w.amount_cents+tax_amount,p_due,'held',jsonb_build_object('work_id',w.id,'asset_id',a.id,'label',a.label,'kind',w.kind,'reason',w.reason,'tax',to_jsonb(tax)-'configured_by','total_cents',w.amount_cents+tax_amount));
 update public.sales_asset_work set state='authorized',authorized_by=auth.uid(),authorized_at=now() where id=w.id;
 perform sales_private.asset_notice(a.id,'work-authorized:'||w.id,'The customer authorized the exact asset work charge. Its separate invoice does not change advertising commission.','staff');end;
$$;
create function public.sales_publish_asset_version(p_asset uuid,p_expected integer,p_media uuid,p_content jsonb,p_change text,p_work uuid default null) returns integer language plpgsql security definer set search_path='' as $$
 declare a public.sales_assets; m public.sales_asset_media; w public.sales_asset_work; intake jsonb; k text; authorized_creation boolean;
 begin
 select * into a from public.sales_assets where id=p_asset for update;
 if not found or not (sales_private.asset_staff(a.id) or sales_private.asset_producer(a.id) or sales_private.asset_customer(a.organization_id,'approve')) then raise exception 'Asset editing denied';end if;
 if a.current_version<>p_expected then raise exception 'Asset version changed; reload before saving';end if;
 if a.intake_version=0 then raise exception 'Complete the production intake first';end if;
 select content into intake from public.sales_asset_intakes where asset_id=a.id and version=a.intake_version;
 if coalesce(intake->>'logo_media_id','')='' or coalesce(btrim(intake->>'goal'),'')='' or coalesce(btrim(intake->>'approver'),'')='' then raise exception 'Advertiser logo, goal and approver are required';end if;
 select * into m from public.sales_asset_media where id=p_media and organization_id=a.organization_id;
 if not found or (a.kind='banner' and (m.width<>1800 or m.height<>200)) or (a.kind='display' and (m.width<>1080 or m.height<>1160)) or (a.kind='social' and (m.width<>1080 or m.height<>1080)) or (a.kind='logo' and (m.width<>500 or m.height<>500 or not m.has_transparency)) then raise exception 'Verified source dimensions/transparency required';end if;
 if jsonb_typeof(p_content) is distinct from 'object' then raise exception 'Exact final copy required';end if;
 for k in select jsonb_object_keys(p_content) loop
 if k not in ('spoken_copy','post_copy','recognition','destination_url') or jsonb_typeof(p_content->k) is distinct from 'string' or char_length(p_content->>k)>5000 then raise exception 'Invalid final copy field';end if;end loop;
 if coalesce(p_content->>'destination_url','')<>'' and (p_content->>'destination_url') !~ '^https?://[^[:space:]]+$' then raise exception 'Valid destination link required';end if;
 if p_work is not null then
 select * into w from public.sales_asset_work where id=p_work and asset_id=a.id for update;
 if not found or w.state<>'authorized' or w.kind<>(case when p_change='initial' then 'creation' else p_change end) then raise exception 'Authorized exact work order required before work begins';end if;
 elsif a.origin='krtr' and p_change='initial' and a.current_version=0 then
 select exists(select 1 from public.sales_agreements g cross join lateral jsonb_array_elements(g.snapshot->'lines') l cross join lateral jsonb_array_elements(l->'assets') x where g.organization_id=a.organization_id and x->>'id'=a.id::text and (x->>'billed_here')::boolean and (x->>'cents')::bigint=1500) into authorized_creation;
 if not authorized_creation then raise exception 'Signed $15 creation authorization required';end if;
 elsif p_change='supplied' then
 if a.origin<>'supplied' or sales_private.asset_producer(a.id) then raise exception 'Customer-supplied updates cannot disguise KRTR revision work';end if;
 elsif not (p_change='initial' and a.origin='supplied' and a.current_version=0 and not sales_private.asset_producer(a.id)) then raise exception 'Revision/correction work order required';end if;
 if p_change='initial' and a.current_version<>0 then raise exception 'An existing asset cannot restart its initial allowance';end if;
 insert into public.sales_asset_versions(asset_id,version,intake_version,media_id,content,work_id,change_kind,actor_id) values(a.id,a.current_version+1,a.intake_version,m.id,p_content,p_work,p_change,auth.uid());
 update public.sales_assets set current_version=current_version+1 where id=a.id;
 if w.id is not null then update public.sales_asset_work set state='completed' where id=w.id;end if;
 perform sales_private.asset_notice(a.id,'asset-review:'||a.id||':'||(a.current_version+1),'Advertising artwork and its exact copy are ready for your review. Please approve or request a revision.','customer');return a.current_version+1;end;
$$;
create function public.sales_review_asset(p_asset uuid,p_version integer,p_key uuid,p_decision text,p_comment text default '',p_agreement uuid default null,p_standing boolean default false,p_from date default null,p_until date default null) returns void language plpgsql security definer set search_path='' as $$
 declare a public.sales_assets; r public.sales_asset_reviews;
 begin select * into a from public.sales_assets where id=p_asset for update;
 if not found or not sales_private.asset_customer(a.organization_id,'approve') then raise exception 'Explicit advertiser asset-approval permission required';end if;
 if a.current_version<>p_version or p_version=0 then raise exception 'Review the current exact asset version';end if;
 if p_agreement is not null and not exists(select 1 from public.sales_agreements where id=p_agreement and organization_id=a.organization_id) then raise exception 'Agreement belongs to another organization';end if;
 if p_decision in ('revision_requested','revoked') and coalesce(char_length(btrim(p_comment)),0)=0 then raise exception 'A comment is required for a revision or revoked approval';end if;
 if p_decision='approved' and ((p_standing is distinct from true and p_agreement is null) or (p_standing and (p_from is null or p_until is null or p_until<p_from))) then raise exception 'Choose the agreement or explicit standing authorization dates';end if;
 select * into r from public.sales_asset_reviews where id=p_key;
 if found then if r.asset_id<>p_asset or r.version<>p_version or r.decision<>p_decision or r.comment<>coalesce(p_comment,'') or r.agreement_id is distinct from p_agreement or r.standing is distinct from p_standing or r.valid_from is distinct from p_from or r.valid_until is distinct from p_until then raise exception 'Review request identity changed';end if;return;end if;
 insert into public.sales_asset_reviews(id,asset_id,version,agreement_id,decision,comment,standing,valid_from,valid_until,actor_id) values(p_key,p_asset,p_version,p_agreement,p_decision,coalesce(p_comment,''),p_standing,p_from,p_until,auth.uid());
 perform sales_private.asset_notice(a.id,'asset-decision:'||p_key,case when p_decision='approved' then 'Advertiser approved the exact asset and copy version. Update the production assignment to this version.' else 'Advertiser requested a material review. See the comment and resolve it before use.' end,'staff');end;
$$;
create function public.sales_bind_creative(p_agreement uuid,p_line uuid,p_slot text,p_run_on date,p_asset uuid,p_version integer) returns uuid language plpgsql security definer set search_path='' as $$
 declare g public.sales_agreements; line jsonb; a public.sales_assets; result uuid;
 begin select * into g from public.sales_agreements where id=p_agreement;
 select * into a from public.sales_assets where id=p_asset;
 if g.id is null or a.id is null or not sales_private.can_work_agreement(g.id) or a.organization_id<>g.organization_id then raise exception 'Creative binding denied';end if;
 select value into line from jsonb_array_elements(g.snapshot->'lines') where value->>'line_id'=p_line::text;
 if line is null or not p_slot=any(sales_private.creative_slots(line->>'product_code')) then raise exception 'Unknown line or placement slot';end if;
 if a.kind<>sales_private.slot_kind(p_slot) or a.current_version<>p_version or p_version=0 then raise exception 'Select the current compatible asset version';end if;
 if p_run_on is not null and not exists(select 1 from jsonb_array_elements_text(line->'run_dates') d where d.value=p_run_on::text) then raise exception 'Creative date is not a purchased placement date';end if;
 insert into public.sales_creative_bindings(id,agreement_id,line_id,slot,run_on,asset_id,asset_version,actor_id) values(gen_random_uuid(),g.id,p_line,p_slot,p_run_on,a.id,p_version,auth.uid()) on conflict(agreement_id,line_id,slot,run_on) do update set asset_id=excluded.asset_id,asset_version=excluded.asset_version,actor_id=excluded.actor_id,updated_at=now() returning id into result;return result;end;
$$;

create function sales_private.approval_deadline(agreement uuid,line_id uuid,on_date date) returns timestamptz language plpgsql stable security definer set search_path='' as $$
 declare line jsonb; result timestamptz;
 begin line=sales_private.agreement_line(agreement,line_id);
 select (d->>'approval_due_at')::timestamptz into result from jsonb_array_elements(line->'deadlines') d where line->>'product_code'<>'P05' or d->>'run_on'=on_date::text order by (d->>'approval_due_at')::timestamptz limit 1;
 select coalesce(min(proposed_due_at),result) into result from public.sales_deadline_amendments where agreement_id=agreement and sales_deadline_amendments.line_id=approval_deadline.line_id and run_on=on_date and state='accepted';return result;end;
$$;
create function public.sales_propose_approval_deadline(p_agreement uuid,p_line uuid,p_on date,p_key uuid,p_due timestamptz,p_reason text) returns void language plpgsql security definer set search_path='' as $$
 declare line jsonb; previous timestamptz;
 begin
 perform pg_advisory_xact_lock(730035);line=sales_private.agreement_line(p_agreement,p_line);
 if line is null or not sales_private.can_manage_district(line->>'district_key') then raise exception 'Deadline changes require scoped manager authority';end if;
 if not exists(select 1 from jsonb_array_elements_text(line->'run_dates') d where d.value=p_on::text) or (line->>'product_code'<>'P05' and p_on<>(line->>'start_date')::date) then raise exception 'Choose the applicable publication or first placement date';end if;
 previous=sales_private.approval_deadline(p_agreement,p_line,p_on);
 if p_due is null or p_due<=now() or p_due>=previous then raise exception 'An earlier future approval deadline is required';end if;
 insert into public.sales_deadline_amendments(id,agreement_id,line_id,run_on,previous_due_at,proposed_due_at,reason,actor_id) values(p_key,p_agreement,p_line,p_on,previous,p_due,btrim(p_reason),auth.uid());
 perform sales_private.finance_notice(p_agreement,'deadline-request:'||p_key,'An earlier approval deadline was proposed. The existing deadline remains in force until an authorized customer accepts; payment and delivery dates are unchanged.');end;
$$;
create function public.sales_decide_approval_deadline(p_id uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
 declare r public.sales_deadline_amendments; org uuid;
 begin perform pg_advisory_xact_lock(730035);select * into r from public.sales_deadline_amendments where id=p_id for update;
 select organization_id into org from public.sales_agreements where id=r.agreement_id;
 if not found or not sales_private.asset_customer(org,'sign') then raise exception 'Authorized customer agreement acceptance required';end if;
 if r.state='accepted' and p_accept then return;end if;
 if r.state<>'pending' then raise exception 'Deadline request is no longer pending';end if;
 if p_accept and (r.proposed_due_at<=now() or r.previous_due_at<>sales_private.approval_deadline(r.agreement_id,r.line_id,r.run_on)) then raise exception 'Deadline proposal expired or prior terms changed';end if;
 update public.sales_deadline_amendments set state=case when p_accept is true then 'accepted' else 'declined' end,accepted_by=auth.uid(),decided_at=now() where id=r.id;
 perform sales_private.finance_notice(r.agreement_id,'deadline-decision:'||r.id,case when p_accept is true then 'Customer accepted the earlier approval deadline. Payment and delivery dates are unchanged.' else 'Customer declined the proposed earlier approval deadline; existing terms remain in force.' end);end;
$$;
create function public.sales_set_readiness_exception(p_id uuid,p_agreement uuid,p_line uuid,p_on date,p_block text,p_reason text,p_confirm boolean,p_until timestamptz) returns void language plpgsql security definer set search_path='' as $$
 declare line jsonb;
 begin line=sales_private.agreement_line(p_agreement,p_line);
 if line is null or not sales_private.can_manage_district(line->>'district_key') or p_confirm is distinct from true then raise exception 'Explicit scoped manager exception confirmation required';end if;
 if p_block not in ('inputs','asset_approval','payment','approval_deadline','nrcs_handoff') then raise exception 'This block cannot be bypassed; inventory and date conflicts must be resolved';end if;
 if p_on is not null and not exists(select 1 from jsonb_array_elements_text(line->'run_dates') d where d.value=p_on::text) then raise exception 'Exception date is outside the purchased dates';end if;
 if p_until is null or p_until<=now() or p_until>((line->>'end_date')::date+1)::timestamp at time zone 'America/Chicago' or (p_on is not null and not exists(select 1 from jsonb_array_elements_text(line->'run_dates') d where d.value=p_on::text)) then raise exception 'Explicit purchased date scope and future expiry within the term required';end if;
 insert into public.sales_readiness_exceptions(id,agreement_id,line_id,run_on,block_code,reason,expires_at,actor_id) values(p_id,p_agreement,p_line,p_on,p_block,btrim(p_reason),p_until,auth.uid());
 perform sales_private.finance_notice(p_agreement,'readiness-exception:'||p_id,'Manager authorized a specific production exception. The underlying payment/approval facts remain unchanged.');end;
$$;
create table public.sales_exception_revocations (
 exception_id uuid primary key references public.sales_readiness_exceptions(id),actor_id uuid not null references public.sales_profiles(id),
 reason text not null check(char_length(btrim(reason)) between 1 and 2000),created_at timestamptz not null default now()
);
create function public.sales_revoke_readiness_exception(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
 declare r public.sales_readiness_exceptions; line jsonb;
 begin select * into r from public.sales_readiness_exceptions where id=p_id;line=sales_private.agreement_line(r.agreement_id,r.line_id);
 if line is null or not sales_private.can_manage_district(line->>'district_key') then raise exception 'Scoped manager authority required';end if;
 insert into public.sales_exception_revocations(exception_id,actor_id,reason) values(r.id,auth.uid(),btrim(p_reason));end;
$$;
create function sales_private.creative_readiness(p_agreement uuid,p_line uuid,p_on date) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare g public.sales_agreements; line jsonb; inv public.sales_invoices; slot_key text; b public.sales_creative_bindings; a public.sales_assets; v public.sales_asset_versions; intake jsonb; last_review public.sales_asset_reviews; blocks jsonb='[]'; materials jsonb='[]'; effective_blocks jsonb='[]'; code text; override_id uuid; due timestamptz; approved_at timestamptz;
 begin select * into g from public.sales_agreements where id=p_agreement;line=sales_private.agreement_line(p_agreement,p_line);
 if line is null or not exists(select 1 from jsonb_array_elements_text(line->'run_dates') d where d.value=p_on::text) then raise exception 'Unknown purchased placement';end if;
 select * into inv from public.sales_invoices where agreement_id=p_agreement and invoice_kind='agreement';
 if inv.collected_cents<>inv.total_cents or inv.refunded_cents>0 or inv.payment_review_required then blocks=blocks||'"payment"'::jsonb;end if;
 if not exists(select 1 from public.sales_inventory_units where agreement_id=p_agreement and line_id=p_line and run_on=p_on and state='booked') then blocks=blocks||'"inventory"'::jsonb;end if;
 if exists(select 1 from public.sales_invoices where agreement_id=p_agreement and invoice_kind='asset_work' and (collected_cents<>total_cents or refunded_cents>0 or payment_review_required)) then blocks=blocks||'"payment"'::jsonb;end if;
 due=sales_private.approval_deadline(p_agreement,p_line,case when line->>'product_code'='P05' then p_on else (line->>'start_date')::date end);
 foreach slot_key in array sales_private.creative_slots(line->>'product_code') loop
 b=null;a=null;v=null;intake=null;last_review=null;approved_at=null;
 select * into b from public.sales_creative_bindings where agreement_id=p_agreement and line_id=p_line and sales_creative_bindings.slot=slot_key and (run_on is null or run_on=p_on) order by run_on nulls last limit 1;
 if not found then blocks=blocks||'"asset_missing"'::jsonb;continue;end if;
 select * into a from public.sales_assets where id=b.asset_id;select * into v from public.sales_asset_versions where asset_id=b.asset_id and version=b.asset_version;
 select content into intake from public.sales_asset_intakes where asset_id=a.id and version=a.intake_version;
 if a.current_version<>b.asset_version or a.intake_version<>v.intake_version then blocks=blocks||'"asset_current"'::jsonb;end if;
 if coalesce(intake->>'logo_media_id','')='' or coalesce(btrim(intake->>'goal'),'')='' or coalesce(btrim(intake->>'approver'),'')='' or (line->>'product_code'='P05' and coalesce(btrim(intake->>'offer'),'')='') then blocks=blocks||'"inputs"'::jsonb;end if;
 -- The signed date is a date, not an invented hour. Later revisions retain
 -- the first complete submission's timeliness, but current fields must remain complete.
 if not exists(select 1 from public.sales_asset_intakes i where i.asset_id=a.id
 and coalesce(i.content->>'logo_media_id','')<>'' and coalesce(btrim(i.content->>'goal'),'')<>'' and coalesce(btrim(i.content->>'approver'),'')<>''
 and (line->>'product_code'<>'P05' or coalesce(btrim(i.content->>'offer'),'')<>'')
 and (i.created_at at time zone 'America/Chicago')::date <= (line->'deadlines'->0->>'production_inputs_due_on')::date) then blocks=blocks||'"inputs"'::jsonb;end if;
 select * into last_review from public.sales_asset_reviews where asset_id=a.id and version=a.current_version order by review_order desc limit 1;
 if last_review.decision is distinct from 'approved' then blocks=blocks||'"asset_approval"'::jsonb;
 else
 select max(created_at) into approved_at from public.sales_asset_reviews r where r.asset_id=a.id and r.version=a.current_version and r.decision='approved' and (r.agreement_id=p_agreement or (r.standing and p_on between r.valid_from and r.valid_until))
 and not exists(select 1 from public.sales_asset_reviews rev where rev.asset_id=r.asset_id and rev.version=r.version and rev.decision='revoked' and rev.review_order>=r.review_order);
 if approved_at is null then blocks=blocks||'"asset_approval"'::jsonb;end if;end if;
 if approved_at is not null and approved_at>due then blocks=blocks||'"approval_deadline"'::jsonb;end if;
 if (slot_key in ('web_banner','coverage_logo') and coalesce(btrim(v.content->>'destination_url'),'')='') or
 (slot_key in ('special_display','show_display','studio_display') and (coalesce(btrim(v.content->>'spoken_copy'),'')='' or (slot_key<>'special_display' and coalesce(btrim(v.content->>'post_copy'),'')=''))) or
 (slot_key='social_image' and coalesce(btrim(v.content->>'post_copy'),'')='') or (slot_key='coverage_logo' and coalesce(btrim(v.content->>'recognition'),'')='') then blocks=blocks||'"copy_missing"'::jsonb;end if;
 materials=materials||jsonb_build_array(jsonb_build_object('binding_id',b.id,'slot',slot_key,'asset_id',a.id,'version',b.asset_version,'media_id',v.media_id,'content',v.content));
 end loop;
 if line->>'product_code' in ('P04','P05','P07','P08','P09','P10','P11','P13') then blocks=blocks||'"nrcs_handoff"'::jsonb;end if;
 for code in select distinct value from jsonb_array_elements_text(blocks) loop
 select r.id into override_id from public.sales_readiness_exceptions r where r.agreement_id=p_agreement and r.line_id=p_line and (r.run_on is null or r.run_on=p_on) and r.block_code=code and r.expires_at>now() and not exists(select 1 from public.sales_exception_revocations x where x.exception_id=r.id) order by r.created_at desc limit 1;
 effective_blocks=effective_blocks||jsonb_build_array(jsonb_build_object('code',code,'exception_id',override_id,'fix',case when code='payment' then '/agreements/'||p_agreement when code='inventory' then '/inventory' else '/campaigns/'||p_agreement end));end loop;
 return jsonb_build_object('agreement_id',p_agreement,'line_id',p_line,'run_on',p_on,'approval_due_at',due,'blocks',effective_blocks,'materials',materials,'ready',not exists(select 1 from jsonb_array_elements(effective_blocks) x where x->'exception_id'='null'::jsonb),'has_exception',exists(select 1 from jsonb_array_elements(effective_blocks) x where x->'exception_id'<>'null'::jsonb));end;
$$;
create function public.sales_campaign_readiness(p_agreement uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare g public.sales_agreements; line jsonb; day text; result jsonb='[]';
 begin select * into g from public.sales_agreements where id=p_agreement;
 if not found or not sales_private.can_read_agreement(p_agreement) then raise exception 'Campaign access denied';end if;
 for line in select value from jsonb_array_elements(g.snapshot->'lines') loop
 for day in select jsonb_array_elements_text(line->'run_dates') loop result=result||jsonb_build_array(sales_private.creative_readiness(p_agreement,(line->>'line_id')::uuid,day::date));end loop;end loop;return result;end;
$$;

-- Extend provider-neutral finance to separate noncommissioned asset work.
create or replace function sales_private.expire_finance_hold(target uuid) returns boolean language plpgsql security definer set search_path='' as $$
 declare invoice public.sales_invoices;
 begin
 perform pg_advisory_xact_lock(730031);
 select * into invoice from public.sales_invoices where agreement_id=target and invoice_kind='agreement' for update;
 if not found or invoice.inventory_status<>'held' then return false;end if;
 if exists(select 1 from public.sales_inventory_units where agreement_id=target and (state='released' or (state='held' and (hold_until<=now() or payment_due_at<=now())))) then
 update public.sales_inventory_units set state='released' where agreement_id=target and state='held';
 update public.sales_invoices set inventory_status='released' where id=invoice.id;
 perform sales_private.finance_notice(target,'expired:'||target,'Unpaid hold expired. Inventory released; contact your salesperson for available new dates.');return true;end if;
 return false;end;
$$;
create or replace function public.sales_approve_takeover(p_agreement uuid,p_seller uuid,p_basis bigint,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
 declare a public.sales_agreements; inv public.sales_invoices; result uuid;
 begin
 perform pg_advisory_xact_lock(730032);select * into a from public.sales_agreements where id=p_agreement;
 select * into inv from public.sales_invoices where agreement_id=p_agreement and invoice_kind='agreement';
 if not found or not sales_private.can_manage_agreement(p_agreement) then raise exception 'Takeover allocation requires a manager over the entire agreement';end if;
 if inv.collected_cents<>inv.total_cents or inv.refunded_cents>0 or inv.inventory_status<>'booked' then raise exception 'Paid, active campaign required';end if;
 if not sales_private.eligible_seller(p_seller) or p_seller=a.seller_id or not exists(select 1 from public.sales_organizations where id=a.organization_id and salesperson_id=p_seller) then raise exception 'Takeover beneficiary must be the current new seller';end if;
 if p_basis is null or p_basis<=0 or p_basis>inv.advertising_cents or p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'Documented undelivered advertising value and reason required';end if;
 if not exists(select 1 from public.sales_inventory_units where agreement_id=p_agreement and run_on>=(now() at time zone 'America/Chicago')::date and state='booked') then raise exception 'No remaining campaign dates';end if;
 insert into public.sales_allocations(agreement_id,beneficiary_id,beneficiary_kind,kind,basis_cents,rate_bps,amount_cents,approved_by,reason,earned_at)
 values(p_agreement,p_seller,case when exists(select 1 from public.sales_owner where user_id=p_seller) then 'owner' else 'employee' end,'takeover',p_basis,500,round(p_basis::numeric*0.05)::bigint,auth.uid(),btrim(p_reason),now()) returning id into result;return result;end;
$$;
create or replace function public.sales_expire_holds() returns integer language plpgsql security definer set search_path='' as $$
 declare target uuid; total integer=0;
 begin
 if not sales_private.is_sales_staff() then raise exception 'Staff required';end if;
 for target in select i.agreement_id from public.sales_invoices i where i.inventory_status='held' and i.invoice_kind='agreement' and sales_private.can_work_agreement(i.agreement_id) loop
 if sales_private.expire_finance_hold(target) then total=total+1;end if;end loop;return total;end;
$$;
create or replace function public.sales_expire_all_holds() returns integer language plpgsql security definer set search_path='' as $$
 declare target uuid; total integer=0;
 begin
 for target in select agreement_id from public.sales_invoices where inventory_status='held' and invoice_kind='agreement' loop
 if sales_private.expire_finance_hold(target) then total=total+1;end if;end loop;return total;end;
$$;
create or replace function public.sales_receive_check(p_invoice uuid,p_key uuid,p_reference text,p_on date) returns uuid language plpgsql security definer set search_path='' as $$
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
 update public.sales_inventory_units set hold_until=least(inv.due_at,payment_due_at) where inv.invoice_kind='agreement' and agreement_id=inv.agreement_id and state='held' and hold_until>now() and inv.due_at>now();
 perform sales_private.finance_notice(inv.agreement_id,'check-received:'||p_key,'Check received, not cleared. Deposit and verification are still required.');return p_key;end;
$$;
create or replace function public.sales_payment_eligibility(p_invoice uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare inv public.sales_invoices;
 begin select * into inv from public.sales_invoices where id=p_invoice;
 if not found or not sales_private.can_read_agreement(inv.agreement_id) then raise exception 'Invoice unavailable';end if;
 if inv.invoice_kind='asset_work' then return jsonb_build_object('invoice_id',inv.id,'currency',inv.currency,'amount_cents',inv.total_cents,'eligible',inv.collected_cents=0 and inv.due_at>now() and not exists(select 1 from public.sales_checks where invoice_id=inv.id and state in ('received','deposited')));end if;
 return jsonb_build_object('invoice_id',inv.id,'currency',inv.currency,'amount_cents',inv.total_cents,'eligible',inv.collected_cents=0 and inv.inventory_status='held' and inv.due_at>now() and exists(select 1 from public.sales_inventory_units where agreement_id=inv.agreement_id) and not exists(select 1 from public.sales_inventory_units where agreement_id=inv.agreement_id and (state<>'held' or hold_until<=now() or payment_due_at<=now())) and not exists(select 1 from public.sales_checks where invoice_id=inv.id and state in ('received','deposited')));
 end;
$$;
create or replace function sales_private.post_finance_event(p_invoice uuid,p_provider text,p_key text,p_transaction text,p_kind text,p_cents bigint,p_currency text,p_occurred timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
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
 if inv.invoice_kind='asset_work' then
 if p_kind in ('captured','check_cleared') then
 update public.sales_invoices set collected_cents=collected_cents+p_cents,payment_review_required=(inv.collected_cents<>0 or p_cents<>inv.total_cents),inventory_status=case when inv.collected_cents=0 and p_cents=inv.total_cents then 'booked' else 'payment_conflict' end where id=inv.id;
 insert into public.sales_receipts(invoice_id,payment_event_id,kind,amount_cents,method,occurred_at) values(inv.id,event_id,'payment',p_cents,case when p_kind='check_cleared' then 'check' else 'card' end,p_occurred);
 elsif p_kind='refunded' then
 update public.sales_invoices set refunded_cents=refunded_cents+p_cents where id=inv.id;
 insert into public.sales_receipts(invoice_id,payment_event_id,kind,amount_cents,method,occurred_at) values(inv.id,event_id,'refund',p_cents,coalesce((select method from public.sales_receipts where invoice_id=inv.id and kind='payment' limit 1),'card'),p_occurred);
 end if;
 perform sales_private.finance_notice(inv.agreement_id,'asset-payment:'||event_id,'Asset-work payment facts were updated. Advertising terms, inventory and original commission were not changed.');return event_id;end if;
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

create function public.sales_production_work(p_asset uuid) returns table(id uuid,kind text,state text,revision_round integer) language sql stable security definer set search_path='' as $$
 select w.id,w.kind,w.state,w.revision_round from public.sales_asset_work w where w.asset_id=p_asset and (sales_private.asset_staff(p_asset) or sales_private.asset_producer(p_asset));
$$;
create function public.sales_claim_asset_notices() returns jsonb language plpgsql security definer set search_path='' as $$
 declare result jsonb;
 begin
 with pending as (select o.id from sales_private.asset_notice_outbox o where exists(select 1 from public.sales_profiles p join auth.users u on u.id=p.id where p.id=o.recipient_id and p.active and u.email_confirmed_at is not null) and sent_at is null and attempts<8 and available_at<=now() and (locked_until is null or locked_until<now()) order by available_at,id for update skip locked limit 20), claimed as (
 update sales_private.asset_notice_outbox o set claim_token=gen_random_uuid(),locked_until=now()+interval '2 minutes',attempts=attempts+1 from pending p where o.id=p.id returning o.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'claim_token',c.claim_token,'email',u.email,'subject',c.subject,'message',c.message,'action_path',c.action_path)),'[]') into result from claimed c join auth.users u on u.id=c.recipient_id join public.sales_profiles p on p.id=u.id where p.active and u.email_confirmed_at is not null;return result;end;
$$;
create function public.sales_finish_asset_notice(p_id uuid,p_token uuid,p_sent boolean,p_provider text default null,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
 begin update sales_private.asset_notice_outbox set sent_at=case when p_sent then now() end,provider_id=p_provider,last_error=left(p_error,1000),locked_until=null,claim_token=null,available_at=now()+interval '5 minutes' where id=p_id and claim_token=p_token and sent_at is null;
 if not found then raise exception 'Notification claim expired or changed';end if;end;
$$;
do $$ declare tab text;begin
 foreach tab in array array['sales_assets','sales_asset_intakes','sales_media_uploads','sales_asset_media','sales_asset_work','sales_asset_versions','sales_asset_reviews','sales_creative_bindings','sales_readiness_exceptions','sales_exception_revocations','sales_deadline_amendments'] loop
 execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from public,anon,authenticated',tab);execute format('grant select on public.%I to authenticated',tab);
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function sales_private.capture_audit()',tab||'_audit',tab);end loop;
 foreach tab in array array['sales_asset_intakes','sales_media_uploads','sales_asset_media','sales_asset_versions','sales_asset_reviews','sales_readiness_exceptions','sales_exception_revocations'] loop
 execute format('create trigger %I before update or delete on public.%I for each row execute function sales_private.immutable_record()',tab||'_immutable',tab);end loop;
end $$;
create function sales_private.asset_media_view(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sales_asset_media m where m.id=target and (sales_private.asset_view(m.asset_id) or exists(select 1 from public.sales_asset_intakes i where i.content->>'logo_media_id'=m.id::text and sales_private.asset_producer(i.asset_id))));
$$;
create policy sales_assets_view on public.sales_assets for select to authenticated using(sales_private.asset_view(id));
create policy sales_intakes_view on public.sales_asset_intakes for select to authenticated using(sales_private.asset_view(asset_id));
create policy sales_uploads_view on public.sales_media_uploads for select to authenticated using(sales_private.asset_edit(asset_id) and actor_id=(select auth.uid()));
create policy sales_media_view on public.sales_asset_media for select to authenticated using(sales_private.asset_media_view(id));
create policy sales_versions_view on public.sales_asset_versions for select to authenticated using(sales_private.asset_view(asset_id));
create policy sales_reviews_view on public.sales_asset_reviews for select to authenticated using(sales_private.asset_view(asset_id));
create policy sales_asset_work_view on public.sales_asset_work for select to authenticated using(sales_private.asset_staff(asset_id) or exists(select 1 from public.sales_assets a where a.id=asset_id and sales_private.asset_customer(a.organization_id)));
create policy sales_bindings_view on public.sales_creative_bindings for select to authenticated using(sales_private.can_read_agreement(agreement_id));
create policy sales_exceptions_view on public.sales_readiness_exceptions for select to authenticated using(sales_private.can_read_agreement(agreement_id));
create policy sales_exception_revocations_view on public.sales_exception_revocations for select to authenticated using(exists(select 1 from public.sales_readiness_exceptions e where e.id=exception_id and sales_private.can_read_agreement(e.agreement_id)));
create policy sales_deadlines_view on public.sales_deadline_amendments for select to authenticated using(sales_private.can_read_agreement(agreement_id));
create function public.sales_asset_work_terms(p_work uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare w public.sales_asset_work; a public.sales_assets; tax public.sales_tax_versions; amount bigint;
 begin select * into w from public.sales_asset_work where id=p_work;select * into a from public.sales_assets where id=w.asset_id;
 if a.id is null or not (sales_private.asset_staff(a.id) or sales_private.asset_customer(a.organization_id)) then raise exception 'Work terms access denied';end if;
 select * into tax from public.sales_tax_versions where district_key=a.district_key order by version desc limit 1;
 amount=case when tax.id is null then null when tax.asset_work_taxable then round(w.amount_cents*tax.rate_bps/10000.0)::bigint else 0 end;
 return jsonb_build_object('tax_id',tax.id,'tax_label',tax.label,'tax_cents',amount,'total_cents',w.amount_cents+amount);end;
$$;
create function public.sales_asset_producers(p_asset uuid) returns table(id uuid,display_name text) language sql stable security definer set search_path='' as $$
 select distinct p.id,p.display_name from public.sales_profiles p join public.sales_staff_scopes s on s.user_id=p.id join public.sales_assets a on a.id=p_asset where p.active and s.role='production_agent' and s.district_key=a.district_key and sales_private.asset_staff(a.id);
$$;

-- Do not widen prior financial grants when adding new RPCs.
do $$ declare fn record;begin
 for fn in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('sales_create_asset','sales_save_asset_intake','sales_assign_asset_producer','sales_begin_asset_upload','sales_register_asset_media','sales_propose_asset_work','sales_decide_asset_work','sales_publish_asset_version','sales_review_asset','sales_bind_creative','sales_propose_approval_deadline','sales_decide_approval_deadline','sales_set_readiness_exception','sales_revoke_readiness_exception','sales_campaign_readiness','sales_production_work','sales_asset_work_terms','sales_asset_producers','sales_claim_asset_notices','sales_finish_asset_notice') loop
 execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
 if fn.proname in ('sales_register_asset_media','sales_claim_asset_notices','sales_finish_asset_notice') then execute format('grant execute on function %s to service_role',fn.signature);else execute format('grant execute on function %s to authenticated',fn.signature);end if;end loop;
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sales_private' and p.proname in
 ('asset_media_view','asset_customer','asset_producer','asset_staff','asset_view','asset_edit','asset_notice','agreement_line','creative_slots','slot_kind','approval_deadline','creative_readiness') loop execute format('revoke all on function %s from public,anon,authenticated',fn.signature);end loop;
end $$;
grant execute on function sales_private.asset_media_view(uuid),sales_private.asset_view(uuid),sales_private.asset_edit(uuid),sales_private.asset_staff(uuid),sales_private.asset_customer(uuid,text) to authenticated;
commit;
