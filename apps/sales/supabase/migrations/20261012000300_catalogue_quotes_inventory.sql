-- Dedicated Sales project ONLY. Catalogue/quoting and inventory foundation.
begin;
create table public.sales_products (
 code text primary key,name text not null,kind text not null,capacity smallint not null check(capacity in (1,4)),
 current_version integer not null default 1,active boolean not null default true
);
create table public.sales_product_versions (
 product_code text not null references public.sales_products(code),version integer not null,
 base_cents bigint not null check(base_cents>=0),additional_day_cents bigint not null default 0 check(additional_day_cents>=0),
 deliverables jsonb not null,created_by uuid references public.sales_profiles(id),created_at timestamptz not null default now(),
 primary key(product_code,version)
);
create table public.sales_policy_versions (
 id uuid primary key default gen_random_uuid(),version integer not null unique,terms jsonb not null,
 created_by uuid references public.sales_profiles(id),created_at timestamptz not null default now()
);
create table public.sales_tax_versions (
 id uuid primary key default gen_random_uuid(),district_key text not null references public.sales_districts(district_key),version integer not null,
 label text not null check(char_length(btrim(label)) between 1 and 100),rate_bps integer not null check(rate_bps between 0 and 10000),
 advertising_taxable boolean not null,asset_work_taxable boolean not null,
 configured_by uuid not null references public.sales_profiles(id),created_at timestamptz not null default now(),unique(district_key,version)
);
create table public.sales_calendar_exceptions (
 on_date date primary key,label text not null check(char_length(btrim(label)) between 1 and 200),
 created_by uuid not null references public.sales_profiles(id),created_at timestamptz not null default now()
);
create table public.sales_quotes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.sales_organizations(id),
 opportunity_id uuid references public.sales_opportunities(id),current_version integer not null default 0,
 status text not null default 'draft' check(status in ('draft','sent','withdrawn','accepted')),
 created_by uuid not null references public.sales_profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.sales_quote_versions (
 quote_id uuid not null references public.sales_quotes(id),version integer not null,
 policy_id uuid not null references public.sales_policy_versions(id),content jsonb not null,
 created_by uuid not null references public.sales_profiles(id),created_at timestamptz not null default now(),primary key(quote_id,version)
);
create table public.sales_quote_publications (
 id uuid primary key default gen_random_uuid(),quote_id uuid not null,version integer not null,
 event text not null check(event in ('sent','withdrawn')),actor_id uuid not null references public.sales_profiles(id),created_at timestamptz not null default now(),
 foreign key(quote_id,version) references public.sales_quote_versions(quote_id,version)
);
create table public.sales_quote_overrides (
 id uuid primary key default gen_random_uuid(),quote_id uuid not null,version integer not null,line_id uuid,
 scope_districts text[] not null,terms jsonb not null,line_snapshot jsonb not null,
 reason text not null check(char_length(btrim(reason)) between 1 and 2000),requested_by uuid not null references public.sales_profiles(id),
 decision text not null default 'pending' check(decision in ('pending','approved','denied','superseded')),
 decided_by uuid references public.sales_profiles(id),decision_reason text,decided_at timestamptz,created_at timestamptz not null default now(),
 foreign key(quote_id,version) references public.sales_quote_versions(quote_id,version)
);
-- Trusted signing code in Chunk 4 must register real agreement evidence here in
-- the SAME transaction as reservation. Neither sellers nor customers can insert it.
create table public.sales_inventory_agreements (
 agreement_id uuid primary key,quote_id uuid not null,version integer not null,
 signed_by uuid not null references public.sales_profiles(id),signed_at timestamptz not null,
 last_minute_ready boolean not null default false,
 foreign key(quote_id,version) references public.sales_quote_versions(quote_id,version),unique(quote_id,version)
);
create table public.sales_inventory_units (
 id uuid primary key default gen_random_uuid(),agreement_id uuid not null references public.sales_inventory_agreements(agreement_id),
 quote_id uuid not null,version integer not null,line_id uuid not null,organization_id uuid not null references public.sales_organizations(id),
 district_key text not null references public.sales_districts(district_key),product_code text not null references public.sales_products(code),
 resource_key text not null,run_on date not null,slot smallint not null check(slot between 1 and 4),
 state text not null check(state in ('held','booked','released')),hold_until timestamptz not null,payment_due_at timestamptz not null,
 created_at timestamptz not null default now(),foreign key(quote_id,version) references public.sales_quote_versions(quote_id,version),unique(agreement_id,line_id,run_on)
);
create unique index sales_inventory_slot_unique on public.sales_inventory_units(resource_key,run_on,slot) where state in ('held','booked');
create unique index sales_inventory_advertiser_unique on public.sales_inventory_units(resource_key,run_on,organization_id) where state in ('held','booked');
create index sales_inventory_scope_dates on public.sales_inventory_units(resource_key,run_on,state);

create function sales_private.immutable_record() returns trigger language plpgsql set search_path='' as $$
 begin raise exception 'Version/history records are immutable; create a new version'; end;
$$;
create function sales_private.observed_date(d date) returns date language sql immutable set search_path='' as $$
 select case extract(dow from d)::int when 6 then d-1 when 0 then d+1 else d end;
$$;
create function sales_private.nth_weekday(y integer,m integer,weekday integer,n integer) returns date language sql immutable set search_path='' as $$
 select make_date(y,m,1)+((weekday-extract(dow from make_date(y,m,1))::int+7)%7)+(n-1)*7;
$$;
create function sales_private.is_business_day(d date) returns boolean language plpgsql stable security definer set search_path='' as $$
 declare y integer; h date[]; last_may date;
 begin
 if extract(dow from d) not between 1 and 5 or exists(select 1 from public.sales_calendar_exceptions where on_date=d) then return false; end if;
 for y in extract(year from d)::int-1..extract(year from d)::int+1 loop
 last_may=(make_date(y,6,1)-1); last_may=last_may-((extract(dow from last_may)::int+6)%7);
 h=array[sales_private.observed_date(make_date(y,1,1)),sales_private.nth_weekday(y,1,1,3),sales_private.nth_weekday(y,2,1,3),last_may,
 sales_private.observed_date(make_date(y,6,19)),sales_private.observed_date(make_date(y,7,4)),sales_private.nth_weekday(y,9,1,1),
 sales_private.nth_weekday(y,10,1,2),sales_private.observed_date(make_date(y,11,11)),sales_private.nth_weekday(y,11,4,4),sales_private.observed_date(make_date(y,12,25))];
 if d=any(h) then return false; end if;
 end loop;return true;
 end;
$$;
create function sales_private.business_shift(d date,n integer) returns date language plpgsql stable security definer set search_path='' as $$
 declare result date=d; remaining integer=abs(n); direction integer=case when n<0 then -1 else 1 end;
 begin while remaining>0 loop result=result+direction;if sales_private.is_business_day(result) then remaining=remaining-1;end if;end loop;return result;end;
$$;
create function sales_private.central_deadline(d date) returns timestamptz language sql immutable set search_path='' as $$
 select (d+time '17:00') at time zone 'America/Chicago';
$$;
create function sales_private.can_manage_scope(keys text[]) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.is_owner() or (sales_private.active_user() and cardinality(keys)>0 and exists(select 1 from public.sales_staff_scopes s where s.user_id=auth.uid() and (
 (s.role='district_manager' and not exists(select 1 from unnest(keys) k where k<>s.district_key))
 or (s.role='regional_manager' and not exists(select 1 from unnest(keys) k left join public.sales_districts d on d.district_key=k where d.region_id is null or d.region_id<>s.region_id)))));
$$;
create function sales_private.can_work_quote(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.is_sales_staff() and exists(select 1 from public.sales_quotes q join public.sales_organizations o on o.id=q.organization_id where q.id=target and
 (sales_private.is_owner() or o.salesperson_id=auth.uid() or sales_private.can_manage_scope(array(select distinct l->>'district_key' from public.sales_quote_versions v cross join lateral jsonb_array_elements(v.content->'lines') l where v.quote_id=q.id and v.version=q.current_version))));
$$;
create function sales_private.customer_quote_access(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.active_user() and exists(select 1 from public.sales_quotes q join public.sales_organization_members m on m.organization_id=q.organization_id where q.id=target and m.user_id=auth.uid() and m.can_view);
$$;
create function sales_private.can_read_quote_version(target uuid,v integer) returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.can_work_quote(target) or (sales_private.customer_quote_access(target) and exists(select 1 from public.sales_quote_publications p where p.quote_id=target and p.version=v and p.event='sent'));
$$;

insert into public.sales_products(code,name,kind,capacity) values
 ('P01','Exclusive homepage banner','homepage_exclusive',1),('P02','Rotating story-page banner','story_rotating',4),('P03','Rotating lower-homepage banner','homepage_rotating',4),
 ('P04','Morning Kickstart sponsor','show',1),('P05','Daily Specials','specials',4),('P06','Community Calendar sponsor','calendar',1),
 ('P07','Elections coverage sponsor','coverage',1),('P08','Sports coverage sponsor','coverage',1),('P09','Local Government coverage sponsor','coverage',1),
 ('P10','Schools coverage sponsor','coverage',1),('P11','Events coverage sponsor','coverage',1),('P13','Studio Sponsor','studio',1);
insert into public.sales_product_versions(product_code,version,base_cents,additional_day_cents,deliverables) values
 ('P01',1,10000,1429,'{"term":"Seven calendar days minimum; additional days at stated rate","web_source":"1800x200","desktop_max":"900x100","delivery":"Exclusive persistent linked homepage banner; root shares DLPC inventory while it falls back to DLPC"}'),
 ('P02',1,7500,0,'{"term":"Two-week blocks","web_source":"1800x200","desktop_max":"900x100","delivery":"Linked story-page banner; even eligible rotation, four advertisers maximum; no impression guarantee"}'),
 ('P03',1,5000,0,'{"term":"Two-week blocks","web_source":"1800x200","desktop_max":"900x100","delivery":"Linked lower-homepage banner; even eligible rotation, four advertisers maximum; sold separately from story banner"}'),
 ('P04',1,30000,0,'{"term":"Two or four weeks beginning Monday; no four-week discount","delivery":"Opening spoken sponsor credit plus one short business detail in Show Open; display-area logo, persistent top-bar show bug, accompanying copy credit; distinct from studio naming"}'),
 ('P05',1,2500,0,'{"term":"Exact publication dates","display_source":"1080x1160","delivery":"One offer, about eight seconds spoken copy plus visual; max four businesses per episode"}'),
 ('P06',1,15000,0,'{"term":"Fourteen-day blocks Sunday through second Saturday; no multiple-block discount","web_source":"1800x200","desktop_max":"900x100","delivery":"Exclusive nonrotating linked Community Calendar banner"}'),
 ('P07',1,20000,0,'{"term":"Whole two-week increments","social_source":"1080x1080","logo_source":"Transparent 500x500","delivery":"Social image logo/copy credit, small linked article logo/recognition, visual category bug during matching story; archived credits retained; no fixed story count or editorial influence"}'),
 ('P08',1,20000,0,'{"term":"Whole two-week increments","social_source":"1080x1080","logo_source":"Transparent 500x500","delivery":"Sports includes school athletics; social image/copy, article recognition and story-only category bug; archived credits retained; no fixed story count or editorial influence"}'),
 ('P09',1,15000,0,'{"term":"Whole two-week increments","social_source":"1080x1080","logo_source":"Transparent 500x500","delivery":"Governmental decisions coverage; excludes election category; social image/copy, article recognition and story-only category bug; archived credits retained"}'),
 ('P10',1,15000,0,'{"term":"Whole two-week increments","social_source":"1080x1080","logo_source":"Transparent 500x500","delivery":"School operations coverage; athletics maps to Sports; social image/copy, article recognition and story-only category bug; archived credits retained"}'),
 ('P11',1,15000,0,'{"term":"Whole two-week increments","social_source":"1080x1080","logo_source":"Transparent 500x500","delivery":"Actual community-event coverage; distinct from Calendar sponsorship; social image/copy, article recognition and story-only category bug; archived credits retained"}'),
 ('P13',1,150000,0,'{"term":"Three whole consecutive calendar months; any month may start; $1500 upfront","display_source":"1080x1160","delivery":"Spoken studio-naming opening, branded opening graphic, accompanying studio credit for existing/new shows from that studio; distinct from show sponsorship"}');
insert into public.sales_policy_versions(version,terms) values(1,'{"currency":"USD","rounding":"Nearest cent, half up per line tax; integer cents; fees separated","asset_cents":1500,"additional_revision_cents":500,"consecutive_specials_discount_pct":10,"show_sponsor_specials_discount_pct":15,"discounts":"Larger eligible discount only, never stacked; exactly five consecutive publication dates per bundle","production_inputs":"Five business days before first placement; no unspecified cutoff time invented","non_specials_due":"Approved assets and full cleared payment by 5pm two business days before launch","specials_due":"Approved assets/copy and payment by 5pm previous calendar day; Monday due Friday; holiday conflicts require explicit review","hold":"Signed agreement only; five business days until 5pm, capped by earlier payment deadline","asset_policy":"Customer supplies logo; each paid unique asset includes one revision round; additional agreed rounds $5; KRTR corrections/reuse free; changed material requires approval","cancellation":"Non-Specials >=7 calendar days before launch: full refund less separately approved completed custom work. Under 7 days: one reschedule requested before launch to available dates within 60 days, maintaining product rules. After launch: no advertiser-requested unused-date refund. Specials may cancel/reschedule through submission deadline, afterward chargeable; recovered resale capped at original payment","make_good":"KRTR failures: agreed equivalent replacement or undelivered-portion refund; no automatic commission clawback","industry":"Placement/show starts at 2x; network-wide starts at 3x plus lost-revenue review; explicitly contracted districts/products/dates only; never editorial restrictions","commission":"30% of actual discounted advertising before processor fees, excluding taxes and asset/revision work; captured card or cleared check; original signed-sale seller retained","launch":"No founding discount, no Weather or standalone social sponsorship, no guaranteed reach/results"}');

create table public.sales_quote_asset_intents (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.sales_organizations(id),
 label text not null check(char_length(btrim(label)) between 1 and 200),created_by uuid not null references public.sales_profiles(id),created_at timestamptz not null default now()
);
create table public.sales_industry_contracts (
 id uuid primary key default gen_random_uuid(),agreement_id uuid not null unique references public.sales_inventory_agreements(agreement_id),
 organization_id uuid not null references public.sales_organizations(id),industry text not null,
 district_keys text[] not null,product_codes text[] not null,resource_keys text[],start_date date not null,end_date date not null,approval_id uuid not null references public.sales_quote_overrides(id),
 active boolean not null default true,created_at timestamptz not null default now(),check(end_date>=start_date)
);

create function sales_private.quote_line(org uuid,input jsonb,all_inputs jsonb,policy jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare product public.sales_products; rate public.sales_product_versions; tax public.sales_tax_versions; show public.sales_shows;
 code_key text=input->>'product_code'; district text=input->>'district_key'; first_day date; last_day date; days integer; run_dates date[];
 selected date[]; day date; resource text; line_id uuid=coalesce((input->>'line_id')::uuid,gen_random_uuid()); ad bigint=0; assets bigint=0;
 pct integer; five boolean=false; sponsor boolean; due date; deadlines jsonb='[]'; breakdown jsonb='[]'; asset jsonb; asset_id uuid; asset_list jsonb='[]'; warning jsonb='[]'; tax_amount bigint;
 begin
 select * into product from public.sales_products p where p.code=code_key and active;if not found then raise exception 'Product unavailable';end if;
 select * into rate from public.sales_product_versions where product_code=code_key and version=product.current_version;
 if not exists(select 1 from public.sales_organization_districts where organization_id=org and district_key=district) then raise exception 'Add this customer district before quoting';end if;
 if not exists(select 1 from public.sales_districts where district_key=district and active) then raise exception 'District unavailable';end if;
 if code_key in ('P04','P05') then
 select * into show from public.sales_shows where district_key=district and show_key='morning-kickstart' and active and ((input->>'show_id') is null or id=(input->>'show_id')::uuid) order by id limit 1;
 if not found then raise exception 'Select the district Morning Kickstart show';end if;
 end if;
 if code_key='P05' then
 if jsonb_typeof(input->'special_dates')<>'array' or jsonb_array_length(input->'special_dates')=0 then raise exception 'Select exact Specials dates';end if;
 select array_agg(d order by d) into selected from(select distinct value::date d from jsonb_array_elements_text(input->'special_dates')) s;
 if cardinality(selected)<>jsonb_array_length(input->'special_dates') then raise exception 'Duplicate Specials dates';end if;
 foreach day in array selected loop if not extract(dow from day)::int=any(show.publication_weekdays) then raise exception 'Specials must use show publication days';end if;end loop;
 first_day=selected[1];last_day=selected[cardinality(selected)];run_dates=selected;
 five=cardinality(selected)=5 and (select count(*) from generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') d where extract(dow from d)::int=any(show.publication_weekdays))=5;
 resource=district||':specials:'||show.id::text;
 foreach day in array selected loop
 sponsor=exists(select 1 from public.sales_inventory_units u where u.organization_id=org and u.product_code='P04' and u.resource_key=district||':show:'||show.id::text and u.run_on=day and u.state='booked')
 or exists(select 1 from jsonb_array_elements(all_inputs) s where s->>'product_code'='P04' and s->>'district_key'=district and coalesce(s->>'show_id',show.id::text)=show.id::text and day between (s->>'start_date')::date and (s->>'end_date')::date);
 pct=greatest(case when five then (policy->>'consecutive_specials_discount_pct')::int else 0 end,case when sponsor then (policy->>'show_sponsor_specials_discount_pct')::int else 0 end);
 ad=ad+round(rate.base_cents*(100-pct)/100.0)::bigint;
 breakdown=breakdown||jsonb_build_array(jsonb_build_object('date',day,'discount_pct',pct,'sponsor_required',sponsor,'cents',round(rate.base_cents*(100-pct)/100.0)::bigint));
 due=case when extract(dow from day)=1 then day-3 else day-1 end;
 if not sales_private.is_business_day(due) then warning=warning||jsonb_build_array('specials_holiday_deadline_review');end if;
 deadlines=deadlines||jsonb_build_array(jsonb_build_object('run_on',day,'approval_due_at',sales_private.central_deadline(due),'payment_due_at',sales_private.central_deadline(due),'production_inputs_due_on',sales_private.business_shift(first_day,-5)));
 end loop;
 else
 first_day=(input->>'start_date')::date;last_day=(input->>'end_date')::date;
 if first_day is null or last_day is null or last_day<first_day then raise exception 'Valid start/end dates required';end if;days=last_day-first_day+1;
 if code_key='P01' then if days<7 then raise exception 'Homepage banner requires seven calendar days minimum';end if;ad=rate.base_cents+(days-7)*rate.additional_day_cents;resource=district||':homepage-exclusive';
 elsif code_key in ('P02','P03','P06','P07','P08','P09','P10','P11') then
 if days<14 or days%14<>0 then raise exception 'This product requires whole two-week blocks';end if;
 if code_key='P06' and extract(dow from first_day)<>0 then raise exception 'Calendar blocks begin Sunday and end the second Saturday';end if;
 ad=rate.base_cents*(days/14);resource=district||':'||code_key;
 elsif code_key='P04' then
 if days not in (14,28) or extract(dow from first_day)<>1 then raise exception 'Kickstart sponsorship is two/four weeks beginning Monday';end if;
 ad=rate.base_cents*(days/14);resource=district||':show:'||show.id::text;
 elsif code_key='P13' then
 if extract(day from first_day)<>1 or last_day<>((first_day+interval '3 months')::date-1) then raise exception 'Studio term must cover three whole consecutive calendar months';end if;
 if not exists(select 1 from public.sales_studios s where s.id=(input->>'studio_id')::uuid and s.district_key=district) then raise exception 'Configure and select the actual studio first';end if;
 ad=rate.base_cents;resource='studio:'||(input->>'studio_id');
 if not exists(select 1 from public.sales_shows where studio_id=(input->>'studio_id')::uuid and active) then warning=warning||jsonb_build_array('studio_shows_not_linked');end if;
 else raise exception 'Unsupported product';end if;
 select array_agg(d::date order by d) into run_dates from generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') d;
 due=sales_private.business_shift(first_day,-2);
 deadlines=jsonb_build_array(jsonb_build_object('run_on',first_day,'approval_due_at',sales_private.central_deadline(due),'payment_due_at',sales_private.central_deadline(due),'production_inputs_due_on',sales_private.business_shift(first_day,-5)));
 end if;
 if first_day<(now() at time zone 'America/Chicago')::date then warning=warning||jsonb_build_array('past_launch_date');end if;
 if (deadlines->0->>'production_inputs_due_on')::date<(now() at time zone 'America/Chicago')::date then warning=warning||jsonb_build_array('short_production_lead_time');end if;
 for asset in select value from jsonb_array_elements(coalesce(input->'assets','[]')) loop
 asset_id=coalesce((asset->>'id')::uuid,gen_random_uuid());
 if exists(select 1 from public.sales_quote_asset_intents where id=asset_id and organization_id<>org) then raise exception 'Asset belongs to another customer';end if;
 insert into public.sales_quote_asset_intents(id,organization_id,label,created_by) values(asset_id,org,btrim(asset->>'label'),auth.uid()) on conflict(id) do nothing;
 asset_list=asset_list||jsonb_build_array(jsonb_build_object('id',asset_id,'label',(select label from public.sales_quote_asset_intents where id=asset_id),'cents',(policy->>'asset_cents')::bigint));
 end loop;
 if (select count(distinct a->>'id') from jsonb_array_elements(asset_list) a)<>jsonb_array_length(asset_list) then raise exception 'Duplicate asset identity on one line';end if;
 assets=jsonb_array_length(asset_list)*(policy->>'asset_cents')::bigint;
 select * into tax from public.sales_tax_versions where district_key=district order by version desc limit 1;
 if not found then warning=warning||jsonb_build_array('tax_not_configured');tax_amount=null;
 else tax_amount=round(((case when tax.advertising_taxable then ad else 0 end)+(case when tax.asset_work_taxable then assets else 0 end))*tax.rate_bps/10000.0)::bigint;end if;
 return jsonb_build_object('line_id',line_id,'product_code',code_key,'product_name',product.name,'product_version',product.current_version,'deliverables',rate.deliverables,'district_key',district,
 'show_id',case when code_key in ('P04','P05') then show.id else null end,'studio_id',input->>'studio_id','start_date',first_day,'end_date',last_day,'valid_from_at',first_day::timestamp at time zone 'America/Chicago','valid_until_at',(last_day+1)::timestamp at time zone 'America/Chicago','run_dates',to_jsonb(run_dates),'resource_key',resource,'capacity',product.capacity,
 'advertising_cents',ad,'standard_advertising_cents',ad,'asset_cents',assets,'assets',asset_list,'tax_cents',tax_amount,'tax',case when tax.id is null then null else to_jsonb(tax)-'configured_by' end,'deadlines',deadlines,'specials_prices',breakdown,'warnings',warning);
 end;
$$;

create function sales_private.industry_live(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sales_industry_contracts c where c.id=target and c.active and exists(select 1 from public.sales_inventory_units u where u.agreement_id=c.agreement_id and (u.state='booked' or (u.state='held' and u.hold_until>now()))));
$$;
create function sales_private.inventory_status(lines jsonb,org uuid,exclude_agreement uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare line jsonb; day date; used integer; minimum_remaining integer; conflicts jsonb='[]'; remaining integer; industry integer;
 begin
 for line in select value from jsonb_array_elements(lines) loop
 minimum_remaining=(line->>'capacity')::int;
 for day in select value::date from jsonb_array_elements_text(line->'run_dates') loop
 select count(*) into used from public.sales_inventory_units u where u.resource_key=line->>'resource_key' and u.run_on=day and u.state in ('held','booked') and (u.state='booked' or u.hold_until>now()) and (exclude_agreement is null or u.agreement_id<>exclude_agreement);
 remaining=(line->>'capacity')::int-used;minimum_remaining=least(minimum_remaining,remaining);
 if remaining<=0 or exists(select 1 from public.sales_inventory_units u where u.resource_key=line->>'resource_key' and u.run_on=day and u.organization_id=org and u.state in ('held','booked') and (u.state='booked' or u.hold_until>now()) and (exclude_agreement is null or u.agreement_id<>exclude_agreement)) then conflicts=conflicts||jsonb_build_array(jsonb_build_object('line_id',line->>'line_id','date',day,'reason','inventory_unavailable'));end if;
 select count(*) into industry from public.sales_industry_contracts c where sales_private.industry_live(c.id) and c.organization_id<>org and (line->>'district_key')=any(c.district_keys) and (line->>'product_code')=any(c.product_codes) and (c.resource_keys is null or (line->>'resource_key')=any(c.resource_keys)) and day between c.start_date and c.end_date;
 if industry>0 then conflicts=conflicts||jsonb_build_array(jsonb_build_object('line_id',line->>'line_id','date',day,'reason','paid_industry_scope_requires_manager_clearance'));end if;
 end loop;
 end loop;
 return jsonb_build_object('available',jsonb_array_length(conflicts)=0,'conflicts',conflicts,'no_reservation',true);
 end;
$$;

create table sales_private.override_industry_checks (
 override_id uuid not null references public.sales_quote_overrides(id),contract_id uuid not null references public.sales_industry_contracts(id),primary key(override_id,contract_id)
);
create function sales_private.apply_quote_overrides(lines jsonb,ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
 declare req public.sales_quote_overrides; result jsonb='[]'; line jsonb; terms jsonb; ad bigint; asset_total bigint; tax_amount bigint; deadline jsonb; due_list jsonb; rid uuid; warnings jsonb; factor integer; price_seen boolean; asset_seen text[]='{}'; asset jsonb; assets jsonb;
 begin
 for line in select value from jsonb_array_elements(lines) loop
 ad=(line->>'advertising_cents')::bigint;asset_total=0;assets='[]';price_seen=false;warnings=line->'warnings';
 for asset in select value from jsonb_array_elements(line->'assets') loop
 if not (asset->>'id')=any(asset_seen) then asset_total=asset_total+(asset->>'cents')::bigint;asset_seen=array_append(asset_seen,asset->>'id');assets=assets||jsonb_build_array(asset||jsonb_build_object('billed_here',true));
 else assets=assets||jsonb_build_array(asset||jsonb_build_object('billed_here',false));end if;
 end loop;
 due_list=line->'deadlines';
 foreach rid in array ids loop
 select * into req from public.sales_quote_overrides where id=rid;
 if req.line_id is not null and req.line_id::text<>line->>'line_id' then continue;end if;terms=req.terms;
 factor=case when terms ? 'industry_exclusivity' then case when terms->'industry_exclusivity'->>'scope'='network' then 3 else 2 end else 1 end;
 if terms ? 'price_cents' or terms ? 'prices' or factor>1 then
 if price_seen then raise exception 'Overlapping price overrides require one exact approval';end if;price_seen=true;
 ad=coalesce((terms->'prices'->>(line->>'line_id'))::bigint,(terms->>'price_cents')::bigint,coalesce((line->>'standard_advertising_cents')::bigint,ad)*factor);
 if ad<0 or (factor>1 and ad<coalesce((line->>'standard_advertising_cents')::bigint,(line->>'advertising_cents')::bigint)*factor) then raise exception 'Custom exclusivity price is below its starting floor';end if;
 end if;
 if coalesce((terms->>'allow_short_lead')::boolean,false) then select coalesce(jsonb_agg(w),'[]') into warnings from jsonb_array_elements(warnings) w where w#>>'{}'<>'short_production_lead_time';end if;
 if coalesce((terms->>'allow_holiday_deadline')::boolean,false) then select coalesce(jsonb_agg(w),'[]') into warnings from jsonb_array_elements(warnings) w where w#>>'{}'<>'specials_holiday_deadline_review';end if;
 if terms ? 'approval_due_at' or terms ? 'payment_due_at' or terms ? 'production_inputs_due_on' then
 select jsonb_agg(d || case when terms ? 'approval_due_at' then jsonb_build_object('approval_due_at',(terms->>'approval_due_at')::timestamptz) else '{}' end || case when terms ? 'payment_due_at' then jsonb_build_object('payment_due_at',(terms->>'payment_due_at')::timestamptz) else '{}' end || case when terms ? 'production_inputs_due_on' then jsonb_build_object('production_inputs_due_on',(terms->>'production_inputs_due_on')::date) else '{}' end) into due_list from jsonb_array_elements(due_list) d;
 end if;
 end loop;
 for deadline in select value from jsonb_array_elements(due_list) loop
 if (exists(select 1 from public.sales_quote_overrides r where r.id=any(ids) and r.terms ? 'payment_due_at' and (r.line_id is null or r.line_id::text=line->>'line_id')) and (deadline->>'payment_due_at')::timestamptz >= ((line->>'start_date')::date+case when line->>'product_code' in ('P04','P05') then time '05:00' else time '00:00' end) at time zone 'America/Chicago')
 or (deadline->>'approval_due_at')::timestamptz >= ((deadline->>'run_on')::date+case when line->>'product_code' in ('P04','P05') then time '05:00' else time '00:00' end) at time zone 'America/Chicago' then raise exception 'Payment and approval deadlines must precede launch';end if;
 if (deadline->>'production_inputs_due_on')::date>(line->>'start_date')::date then raise exception 'Production inputs must precede the first placement';end if;
 end loop;
 if line->'tax'='null'::jsonb then tax_amount=null;
 else tax_amount=round(((case when (line->'tax'->>'advertising_taxable')::boolean then ad else 0 end)+(case when (line->'tax'->>'asset_work_taxable')::boolean then asset_total else 0 end))*(line->'tax'->>'rate_bps')::int/10000.0)::bigint;end if;
 result=result||jsonb_build_array(line||jsonb_build_object('advertising_cents',ad,'asset_cents',asset_total,'assets',assets,'tax_cents',tax_amount,'deadlines',due_list,'warnings',warnings));
 end loop;return result;
 end;
$$;
create function sales_private.quote_availability(target uuid,v integer,exclude_agreement uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare content jsonb; org uuid; check_result jsonb; conflicts jsonb; item jsonb; line jsonb; clear boolean; cleaned jsonb='[]';
 begin
 select ver.content,q.organization_id into content,org from public.sales_quote_versions ver join public.sales_quotes q on q.id=ver.quote_id where ver.quote_id=target and ver.version=v;
 check_result=sales_private.inventory_status(content->'lines',org,exclude_agreement);
 for item in select value from jsonb_array_elements(check_result->'conflicts') loop
 if item->>'reason'='paid_industry_scope_requires_manager_clearance' then
 select value into line from jsonb_array_elements(content->'lines') where value->>'line_id'=item->>'line_id';
 clear=not exists(select 1 from public.sales_industry_contracts c where sales_private.industry_live(c.id) and c.organization_id<>org and (line->>'district_key')=any(c.district_keys) and (line->>'product_code')=any(c.product_codes) and (c.resource_keys is null or (line->>'resource_key')=any(c.resource_keys)) and (item->>'date')::date between c.start_date and c.end_date
 and not exists(select 1 from sales_private.override_industry_checks ic join public.sales_quote_overrides r on r.id=ic.override_id where ic.contract_id=c.id and r.decision='approved' and (r.id::text) in(select jsonb_array_elements_text(content->'override_ids')) and (r.line_id is null or r.line_id::text=line->>'line_id')));
 if clear then continue;end if;
 end if;cleaned=cleaned||jsonb_build_array(item);
 end loop;
 return jsonb_build_object('available',jsonb_array_length(cleaned)=0,'conflicts',cleaned,'no_reservation',true);
 end;
$$;

create function public.sales_save_quote(p_org uuid,p_lines jsonb,p_quote uuid default null,p_expected_version integer default null,p_overrides uuid[] default '{}',p_opportunity uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare q public.sales_quotes; policy public.sales_policy_versions; input jsonb; line jsonb; lines jsonb='[]'; inputs jsonb='[]'; keys text[]; req public.sales_quote_overrides;
 ad bigint; assets bigint; taxes bigint; warnings jsonb; overrides_public jsonb='[]'; old_version integer; rid uuid; effective_ids uuid[]='{}'; baseline jsonb;
 begin
 if not sales_private.is_sales_staff() then raise exception 'Sales staff required';end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'At least one product line required';end if;
 select array_agg(distinct value->>'district_key') into keys from jsonb_array_elements(p_lines);
 if not (sales_private.can_edit_customer(p_org) or sales_private.can_manage_scope(keys)) then raise exception 'Quote scope denied';end if;
 if p_opportunity is not null and not exists(select 1 from public.sales_opportunities where id=p_opportunity and organization_id=p_org and sales_private.can_work_opportunity(id)) then raise exception 'Opportunity does not belong to this customer';end if;
 if p_quote is null then
 insert into public.sales_quotes(organization_id,opportunity_id,created_by) values(p_org,p_opportunity,auth.uid()) returning * into q;
 else
 select * into q from public.sales_quotes where id=p_quote for update;
 if not found or q.organization_id<>p_org or not sales_private.can_work_quote(q.id) then raise exception 'Quote edit denied';end if;
 if q.status='accepted' then raise exception 'Accepted quote is immutable; create a new proposal';end if;
 if q.current_version<>p_expected_version then raise exception 'Quote changed. Reload before saving';end if;
 end if;
 select * into policy from public.sales_policy_versions order by version desc limit 1;
 foreach rid in array p_overrides loop
 select * into req from public.sales_quote_overrides where id=rid;
 if not found or req.quote_id<>q.id or req.version<>q.current_version or req.decision<>'approved' then raise exception 'Only approved exact terms for this unchanged quote version can be applied';end if;
 -- Approval cannot be carried to changed products/dates/districts/assets.
 if (select content->'input_lines' from public.sales_quote_versions where quote_id=q.id and version=q.current_version)<>p_lines then raise exception 'Approved baseline changed. Request a new approval';end if;
 overrides_public=overrides_public||jsonb_build_array(jsonb_build_object('id',req.id,'line_id',req.line_id,'terms',req.terms-'existing_contract_review'-'lost_revenue_review'-'industry_clearance'));
 end loop;
 if cardinality(p_overrides)>0 then
 select v.content into baseline from public.sales_quote_versions v where v.quote_id=q.id and v.version=q.current_version;
 select * into policy from public.sales_policy_versions where id=(select policy_id from public.sales_quote_versions where quote_id=q.id and version=q.current_version);
 lines=baseline->'lines';inputs=baseline->'input_lines';
 select coalesce(array_agg(value::uuid),'{}') into effective_ids from jsonb_array_elements_text(baseline->'override_ids');
 else
 for input in select value from jsonb_array_elements(p_lines) loop
 line=sales_private.quote_line(p_org,input,p_lines,policy.terms);lines=lines||jsonb_build_array(line);
 inputs=inputs||jsonb_build_array(input||jsonb_build_object('line_id',line->'line_id','assets',(select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','label',a->'label')),'[]') from jsonb_array_elements(line->'assets') a)));
 end loop;
 end if;
 effective_ids=effective_ids||p_overrides;
 if (select count(*) from public.sales_quote_overrides where id=any(effective_ids) and terms ? 'industry_exclusivity')>1 then raise exception 'Create a fresh proposal to replace an industry-exclusivity scope';end if;
 if exists(select 1 from jsonb_array_elements(lines) l cross join lateral jsonb_array_elements_text(l->'run_dates') d group by l->>'resource_key',d.value having count(*)>1) then raise exception 'Combine overlapping lines for the same location and dates';end if;
 if (select count(distinct l->>'line_id') from jsonb_array_elements(lines) l)<>jsonb_array_length(lines) then raise exception 'Duplicate quote line identity';end if;
 lines=sales_private.apply_quote_overrides(lines,p_overrides);
 select sum((l->>'advertising_cents')::bigint),sum((l->>'asset_cents')::bigint),case when count(*) filter(where l->'tax_cents'='null'::jsonb)>0 then null else sum((l->>'tax_cents')::bigint) end into ad,assets,taxes from jsonb_array_elements(lines) l;
 if ad+assets+coalesce(taxes,0)>9007199254740991 then raise exception 'Quote exceeds currency-safe numeric range';end if;
 select coalesce(jsonb_agg(distinct w),'[]') into warnings from jsonb_array_elements(lines) l cross join lateral jsonb_array_elements(l->'warnings') w;
 old_version=q.current_version;
 insert into public.sales_quote_versions(quote_id,version,policy_id,content,created_by) values(q.id,old_version+1,policy.id,jsonb_build_object('currency','USD','timezone','America/Chicago','lines',lines,'input_lines',inputs,'advertising_cents',ad,'asset_cents',assets,'tax_cents',taxes,'total_cents',case when taxes is null then null else ad+assets+taxes end,'policy_terms',policy.terms-'commission','warnings',warnings,'overrides',coalesce(baseline->'overrides','[]')||overrides_public,'override_ids',to_jsonb(effective_ids),'unsigned_does_not_reserve',true),auth.uid());
 update public.sales_quotes set current_version=old_version+1,status='draft',updated_at=now() where id=q.id;
 update public.sales_quote_overrides set decision='superseded',decision_reason='A new quote version replaced the requested baseline',decided_at=now(),decided_by=auth.uid() where quote_id=q.id and version=old_version and decision='pending';
 return q.id;
 end;
$$;
create function public.sales_quote_availability(p_quote uuid,p_version integer default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare v integer;
 begin select coalesce(p_version,current_version) into v from public.sales_quotes where id=p_quote;
 if v is null or not sales_private.can_read_quote_version(p_quote,v) then raise exception 'Quote availability denied';end if;
 return sales_private.quote_availability(p_quote,v);end;
$$;
create function public.sales_publish_quote(p_quote uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare q public.sales_quotes; content jsonb; check_line jsonb; deadline jsonb;
 begin
 select * into q from public.sales_quotes where id=p_quote for update;
 if not found or not sales_private.can_work_quote(q.id) then raise exception 'Quote publication denied';end if;
 if q.current_version<>p_version or q.status='accepted' then raise exception 'Quote changed or already accepted';end if;
 select v.content into content from public.sales_quote_versions v where v.quote_id=q.id and v.version=p_version;
 if jsonb_array_length(content->'warnings')>0 or content->'total_cents'='null'::jsonb then raise exception 'Resolve quote warnings before sharing final terms';end if;
 for check_line in select value from jsonb_array_elements(content->'lines') loop
 if (check_line->>'start_date')::date<(now() at time zone 'America/Chicago')::date then raise exception 'Launch date elapsed; revise quote';end if;
 for deadline in select value from jsonb_array_elements(check_line->'deadlines') loop
 if (deadline->>'payment_due_at')::timestamptz<=now() or (deadline->>'approval_due_at')::timestamptz<=now() then raise exception 'Quote deadlines elapsed; obtain approved new terms before sharing';end if;
 if (deadline->>'production_inputs_due_on')::date<(now() at time zone 'America/Chicago')::date and not exists(select 1 from public.sales_quote_overrides r where r.id::text in(select jsonb_array_elements_text(content->'override_ids')) and r.decision='approved' and coalesce((r.terms->>'allow_short_lead')::boolean,false) and (r.line_id is null or r.line_id::text=check_line->>'line_id')) then raise exception 'Production input deadline elapsed; scoped exception required';end if;
 end loop;end loop;
 if exists(select 1 from public.sales_quote_overrides where quote_id=q.id and version=p_version and decision='pending') then raise exception 'Pending overrides cannot become committed terms';end if;
 if not (sales_private.quote_availability(q.id,p_version)->>'available')::boolean then raise exception 'Inventory or industry clearance is unavailable; choose dates or seek review';end if;
 if q.status='sent' then return;end if;
 insert into public.sales_quote_publications(quote_id,version,event,actor_id) values(q.id,p_version,'sent',auth.uid());
 update public.sales_quotes set status='sent',updated_at=now() where id=q.id;
 insert into public.sales_notifications(recipient_id,event_key,organization_id,message,action_path)
 select m.user_id,'quote:'||q.id::text||':'||p_version,q.organization_id,'A proposal is ready to review. Unsigned proposals do not reserve inventory.','/quotes/'||q.id::text from public.sales_organization_members m where m.organization_id=q.organization_id and m.can_view on conflict do nothing;
 end;
$$;
create function public.sales_withdraw_quote(p_quote uuid) returns void language plpgsql security definer set search_path='' as $$
 declare q public.sales_quotes;
 begin select * into q from public.sales_quotes where id=p_quote for update;if not sales_private.can_work_quote(p_quote) or q.status='accepted' then raise exception 'Withdrawal denied';end if;
 insert into public.sales_quote_publications(quote_id,version,event,actor_id) values(q.id,q.current_version,'withdrawn',auth.uid());update public.sales_quotes set status='withdrawn',updated_at=now() where id=q.id;end;
$$;

create table sales_private.override_inventory_checks (
 override_id uuid not null references public.sales_quote_overrides(id),agreement_id uuid not null references public.sales_inventory_agreements(agreement_id),primary key(override_id,agreement_id)
);
create function public.sales_request_quote_override(p_quote uuid,p_version integer,p_line uuid,p_terms jsonb,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
 declare content jsonb; q public.sales_quotes; selected jsonb; keys text[]; proposed_industry jsonb; result uuid; k text; first_day date; last_day date; products text[];
 begin
 select * into q from public.sales_quotes where id=p_quote for update;
 if not found or q.current_version<>p_version or q.status='accepted' or not sales_private.can_work_quote(p_quote) then raise exception 'Quote override request denied or stale';end if;
 select v.content into content from public.sales_quote_versions v where v.quote_id=p_quote and v.version=p_version;
 if jsonb_typeof(p_terms) is distinct from 'object' or p_terms='{}'::jsonb then raise exception 'Exact proposed terms required';end if;
 for k in select jsonb_object_keys(p_terms) loop
 if k not in ('price_cents','prices','allow_short_lead','allow_holiday_deadline','approval_due_at','payment_due_at','production_inputs_due_on','signed_hold_until','industry_exclusivity','industry_clearance','existing_contract_review','lost_revenue_review') then raise exception 'Unsupported override term: %',k;end if;
 if p_terms->k='null'::jsonb then raise exception 'Override terms cannot be null';end if;
 if k in ('allow_short_lead','allow_holiday_deadline','industry_clearance') and jsonb_typeof(p_terms->k)<>'boolean' then raise exception 'Override flags must be booleans';end if;
 if k='price_cents' and (jsonb_typeof(p_terms->k)<>'number' or (p_terms->>k)!~'^[0-9]+$') then raise exception 'Price must be nonnegative integer cents';end if;
 end loop;
 if p_line is not null then
 select value into selected from jsonb_array_elements(content->'lines') where value->>'line_id'=p_line::text;
 if selected is null then raise exception 'Quote line not found';end if;keys=array[selected->>'district_key'];
 else selected=content->'lines';select array_agg(distinct value->>'district_key') into keys from jsonb_array_elements(selected);end if;
 if p_terms ? 'price_cents' and p_line is null then raise exception 'A single price override must identify its line';end if;
 if p_terms ? 'prices' then
 if jsonb_typeof(p_terms->'prices')<>'object' then raise exception 'Price map required';end if;
 for k in select jsonb_object_keys(p_terms->'prices') loop
 if not exists(select 1 from jsonb_array_elements(content->'lines') l where l->>'line_id'=k and (p_line is null or p_line::text=k)) then raise exception 'Price map contains a line outside this request';end if;
 if jsonb_typeof(p_terms->'prices'->k) is distinct from 'number' or coalesce(p_terms->'prices'->>k,'')!~'^[0-9]+$' or (p_terms->'prices'->>k)::bigint<0 then raise exception 'Price cannot be negative';end if;
 end loop;
 end if;
 if p_terms ? 'price_cents' and (p_terms->>'price_cents')::bigint<0 then raise exception 'Price cannot be negative';end if;
 proposed_industry=p_terms->'industry_exclusivity';
 if proposed_industry is not null then
 if jsonb_typeof(proposed_industry) is distinct from 'object' or not proposed_industry ?& array['scope','industry','districts','products','start_date','end_date'] or jsonb_typeof(proposed_industry->'districts') is distinct from 'array' or jsonb_typeof(proposed_industry->'products') is distinct from 'array' or coalesce(proposed_industry->>'scope','') not in ('placement','network') or char_length(btrim(coalesce(proposed_industry->>'industry',''))) not between 1 and 200 then raise exception 'Narrow industry and explicit scope required';end if;
 select array_agg(value) into keys from jsonb_array_elements_text(proposed_industry->'districts');
 select array_agg(value) into products from jsonb_array_elements_text(proposed_industry->'products');
 if cardinality(keys) is null or cardinality(keys)=0 or cardinality(products) is null or cardinality(products)=0 then raise exception 'Explicit districts and products required';end if;
 if exists(select 1 from unnest(keys) d where not exists(select 1 from public.sales_organization_districts od where od.organization_id=q.organization_id and od.district_key=d)) then raise exception 'Exclusivity district is not bound to this customer';end if;
 if exists(select 1 from unnest(products) c where not exists(select 1 from public.sales_products where code=c and active)) then raise exception 'Exclusivity includes an unavailable product';end if;
 if proposed_industry->>'scope'='placement' and (p_line is null or keys<>array[selected->>'district_key'] or products<>array[selected->>'product_code']) then raise exception 'Placement exclusivity must match its selected location/show';end if;
 if proposed_industry->>'scope'='network' and p_line is not null then raise exception 'Network scope must be approved for the whole quote';end if;
 first_day=(proposed_industry->>'start_date')::date;last_day=(proposed_industry->>'end_date')::date;
 if first_day is null or last_day is null or last_day<first_day then raise exception 'Explicit exclusivity dates required';end if;
 if exists(select 1 from jsonb_array_elements(content->'lines') l where (p_line is null or l->>'line_id'=p_line::text) and (not (l->>'district_key')=any(keys) or not (l->>'product_code')=any(products) or (l->>'start_date')::date<first_day or (l->>'end_date')::date>last_day)) then raise exception 'Exclusivity scope must include the purchased placements';end if;
 if char_length(btrim(coalesce(p_terms->>'existing_contract_review',''))) =0 or (proposed_industry->>'scope'='network' and char_length(btrim(coalesce(p_terms->>'lost_revenue_review','')))=0) then raise exception 'Existing-contract review and network displaced-revenue review required';end if;
 end if;
 if coalesce((p_terms->>'industry_clearance')::boolean,false) and btrim(coalesce(p_terms->>'existing_contract_review',''))='' then raise exception 'Industry clearance requires explicit contract review';end if;
 insert into public.sales_quote_overrides(quote_id,version,line_id,scope_districts,terms,line_snapshot,reason,requested_by)
 values(p_quote,p_version,p_line,keys,p_terms,selected,btrim(p_reason),auth.uid()) returning id into result;
 if coalesce((p_terms->>'industry_clearance')::boolean,false) then
 insert into sales_private.override_industry_checks(override_id,contract_id)
 select distinct result,c.id from public.sales_industry_contracts c cross join lateral jsonb_array_elements(content->'lines') l where sales_private.industry_live(c.id) and c.organization_id<>q.organization_id and (p_line is null or l->>'line_id'=p_line::text) and (l->>'district_key')=any(c.district_keys) and (l->>'product_code')=any(c.product_codes) and (c.resource_keys is null or (l->>'resource_key')=any(c.resource_keys)) and daterange((l->>'start_date')::date,(l->>'end_date')::date+1,'[)') && daterange(c.start_date,c.end_date+1,'[)') on conflict do nothing;
 end if;
 if proposed_industry is not null then
 insert into sales_private.override_inventory_checks(override_id,agreement_id)
 select distinct result,u.agreement_id from public.sales_inventory_units u where u.district_key=any(keys) and u.product_code=any(products) and (proposed_industry->>'scope'='network' or u.resource_key=selected->>'resource_key') and u.run_on between first_day and last_day and (u.state='booked' or (u.state='held' and u.hold_until>now())) on conflict do nothing;
 end if;
 foreach k in array keys loop perform sales_private.notify_managers(k,'quote-override:'||result::text,q.organization_id,'An exact quote override needs approval.','/quote-overrides');end loop;
 return result;
 end;
$$;
create function public.sales_decide_quote_override(p_id uuid,p_approve boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
 declare req public.sales_quote_overrides; q public.sales_quotes; lines jsonb;
 begin
 select * into req from public.sales_quote_overrides where id=p_id;
 if not found then raise exception 'Override not found';end if;
 select * into q from public.sales_quotes where id=req.quote_id for update;
 select * into req from public.sales_quote_overrides where id=p_id for update;
 if not sales_private.can_manage_scope(req.scope_districts) or (req.requested_by=auth.uid() and not sales_private.is_owner()) then raise exception 'Scoped manager approval required; no salesperson self approval';end if;
 if req.decision<>'pending' then return;end if;
 if q.current_version<>req.version or q.status='accepted' then raise exception 'Quote changed; request new exact approval';end if;
 if char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'Decision reason required';end if;
 if p_approve then
 select content->'lines' into lines from public.sales_quote_versions where quote_id=q.id and version=req.version;
 perform sales_private.apply_quote_overrides(lines,array[req.id]);
 end if;
 update public.sales_quote_overrides set decision=case when p_approve then 'approved' else 'denied' end,decided_by=auth.uid(),decision_reason=btrim(p_reason),decided_at=now() where id=req.id;
 insert into public.sales_notifications(recipient_id,event_key,organization_id,message,action_path) values(req.requested_by,'quote-decision:'||req.id::text,q.organization_id,case when p_approve then 'Quote override approved. Apply it to the unchanged version before sharing.' else 'Quote override denied. Review the decision reason.' end,'/quotes/'||q.id::text) on conflict do nothing;
 end;
$$;
create function public.sales_configure_tax(p_district text,p_label text,p_bps integer,p_advertising boolean,p_assets boolean) returns uuid language plpgsql security definer set search_path='' as $$
 declare result uuid; v integer;
 begin
 if not sales_private.can_manage_district(p_district) then raise exception 'Tax settings require a scoped Sales Manager or higher';end if;
 perform 1 from public.sales_districts where district_key=p_district for update;
 select coalesce(max(version),0)+1 into v from public.sales_tax_versions where district_key=p_district;
 insert into public.sales_tax_versions(district_key,version,label,rate_bps,advertising_taxable,asset_work_taxable,configured_by) values(p_district,v,btrim(p_label),p_bps,p_advertising,p_assets,auth.uid()) returning id into result;return result;
 end;
$$;
create function public.sales_publish_product_version(p_code text,p_base bigint,p_extra_day bigint,p_deliverables jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare product public.sales_products;
 begin
 if not sales_private.is_owner() then raise exception 'Owner only';end if;
 select * into product from public.sales_products where code=p_code for update;
 if not found or jsonb_typeof(p_deliverables) is distinct from 'object' then raise exception 'Product/deliverables required';end if;
 if p_code<>'P01' and p_extra_day<>0 then raise exception 'Additional-day pricing applies only to P01';end if;
 insert into public.sales_product_versions(product_code,version,base_cents,additional_day_cents,deliverables,created_by) values(p_code,product.current_version+1,p_base,p_extra_day,p_deliverables,auth.uid());
 update public.sales_products set current_version=current_version+1 where code=p_code;
 end;
$$;
create function public.sales_publish_policy_version(p_terms jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare v integer; k text;
 begin
 if not sales_private.is_owner() then raise exception 'Owner only';end if;
 perform 1 from public.sales_owner for update;
 if jsonb_typeof(p_terms) is distinct from 'object' or not p_terms ?& array['currency','rounding','asset_cents','additional_revision_cents','consecutive_specials_discount_pct','show_sponsor_specials_discount_pct','production_inputs','non_specials_due','specials_due','hold','asset_policy','cancellation','make_good','industry','commission','launch'] then raise exception 'All required policy fields must be present';end if;
 for k in select jsonb_object_keys(p_terms) loop
 if p_terms->k='null'::jsonb then raise exception 'Policy terms cannot be null';end if;
 if k in ('asset_cents','additional_revision_cents','consecutive_specials_discount_pct','show_sponsor_specials_discount_pct') then
 if jsonb_typeof(p_terms->k)<>'number' or (p_terms->>k)!~'^[0-9]+$' then raise exception 'Policy amounts must be nonnegative integers';end if;
 elsif jsonb_typeof(p_terms->k)<>'string' or btrim(p_terms->>k)='' then raise exception 'Policy text must be nonempty';end if;
 end loop;
 if p_terms->>'currency'<>'USD' or (p_terms->>'asset_cents')::bigint<0 or (p_terms->>'additional_revision_cents')::bigint<0 or (p_terms->>'consecutive_specials_discount_pct')::int not between 0 and 100 or (p_terms->>'show_sponsor_specials_discount_pct')::int not between 0 and 100 then raise exception 'Invalid currency, fees or discounts';end if;
 select max(version)+1 into v from public.sales_policy_versions;insert into public.sales_policy_versions(version,terms,created_by) values(v,p_terms,auth.uid());
 end;
$$;
create function public.sales_set_calendar_exception(p_date date,p_label text) returns void language plpgsql security definer set search_path='' as $$
 begin if not sales_private.is_owner() then raise exception 'Owner only';end if;
 insert into public.sales_calendar_exceptions(on_date,label,created_by) values(p_date,btrim(p_label),auth.uid()) on conflict(on_date) do update set label=excluded.label,created_by=auth.uid();end;
$$;
create function public.sales_configure_studio(p_district text,p_name text,p_show uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare studio uuid;
 begin if not sales_private.can_manage_district(p_district) then raise exception 'Scoped studio management required';end if;
 if char_length(btrim(p_name)) not between 1 and 200 then raise exception 'Actual studio name required';end if;
 insert into public.sales_studios(name,district_key) values(btrim(p_name),p_district) returning id into studio;
 if p_show is not null then update public.sales_shows set studio_id=studio where id=p_show and district_key=p_district;
 if not found then raise exception 'Show does not belong to this district';end if;end if;return studio;end;
$$;

alter table public.sales_inventory_agreements add column signing_method text not null default 'digital' check(signing_method in ('digital','paper'));
alter table public.sales_inventory_agreements add column paper_signer_name text;
alter table public.sales_inventory_agreements add column paper_signature_ref text;
alter table public.sales_inventory_agreements add constraint sales_paper_evidence check(signing_method<>'paper' or (char_length(btrim(paper_signer_name))>0 and char_length(btrim(paper_signature_ref))>0));
create function sales_private.reserve_signed_quote(p_agreement uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare evidence public.sales_inventory_agreements; q public.sales_quotes; content jsonb; org uuid; line jsonb; d jsonb; day date; hold_deadline timestamptz; payment_deadline timestamptz; slot_number integer; req public.sales_quote_overrides; rid uuid; proposed_industry jsonb; keys text[]; products text[];
 begin
 -- Quote commitments are rare compared with ad/page loads. One transaction-level
 -- booking mutex serializes capacity AND cross-resource industry checks. Readers
 -- never take this lock; unique partial indexes are an independent backstop.
 perform pg_advisory_xact_lock(730031);
 select * into evidence from public.sales_inventory_agreements where agreement_id=p_agreement for update;
 if not found then raise exception 'Registered signed agreement evidence required';end if;
 select * into q from public.sales_quotes where id=evidence.quote_id for update;
 if q.current_version<>evidence.version then raise exception 'Signed quote version changed';end if;
 if exists(select 1 from public.sales_inventory_units where agreement_id=p_agreement) then
 if exists(select 1 from public.sales_inventory_units where agreement_id=p_agreement and (state='released' or (state='held' and hold_until<=now()))) then raise exception 'Released inventory cannot be silently reactivated';end if;
 return jsonb_build_object('agreement_id',p_agreement,'already_reserved',true);
 end if;
 if q.status<>'sent' then raise exception 'Only a shared, unwithdrawn quote can reserve after signing';end if;
 org=q.organization_id;
 if evidence.signing_method='digital' and not exists(select 1 from public.sales_organization_members m join public.sales_profiles p on p.id=m.user_id where m.organization_id=org and m.user_id=evidence.signed_by and m.can_view and m.can_sign_agreements and p.active) then raise exception 'Authorized customer signing permission required';end if;
 select v.content into content from public.sales_quote_versions v where v.quote_id=q.id and v.version=evidence.version;
 if jsonb_array_length(content->'warnings')>0 or content->'total_cents'='null'::jsonb then raise exception 'Quote has unresolved requirements';end if;
 if exists(select 1 from public.sales_quote_overrides where quote_id=q.id and version=evidence.version and decision='pending') then raise exception 'Pending override cannot reserve';end if;
 if exists(select 1 from jsonb_array_elements(content->'overrides') o where coalesce((o->'terms'->>'allow_short_lead')::boolean,false)) and not evidence.last_minute_ready then raise exception 'Last-minute booking needs verified payment, approved materials and production capacity';end if;
 select min((deadline->>'payment_due_at')::timestamptz) into payment_deadline from jsonb_array_elements(content->'lines') l cross join lateral jsonb_array_elements(l->'deadlines') deadline;
 hold_deadline=least(sales_private.central_deadline(sales_private.business_shift((evidence.signed_at at time zone 'America/Chicago')::date,5)),payment_deadline);
 for rid in select value::uuid from jsonb_array_elements_text(content->'override_ids') loop
 select * into req from public.sales_quote_overrides where id=rid;
 if req.decision<>'approved' then raise exception 'Approved exception evidence unavailable';end if;
 if req.terms ? 'signed_hold_until' then hold_deadline=least((req.terms->>'signed_hold_until')::timestamptz,payment_deadline);end if;
 end loop;
 if hold_deadline<=now() then raise exception 'Payment/hold deadline has passed; obtain approved new terms or dates';end if;
 update public.sales_inventory_units set state='released' where state='held' and hold_until<=now();
 if not (sales_private.quote_availability(q.id,evidence.version)->>'available')::boolean then raise exception 'Inventory conflict at signing; no reservation created';end if;
 -- Discount entitlement is rechecked at signing, not inferred from lifetime or
 -- from another advertiser's contract. Same-quote show sponsorship is atomic.
 for line in select value from jsonb_array_elements(content->'lines') where value->>'product_code'='P05' loop
 for d in select value from jsonb_array_elements(line->'specials_prices') where (value->>'sponsor_required')::boolean loop
 if not exists(select 1 from jsonb_array_elements(content->'lines') s where s->>'product_code'='P04' and s->>'show_id'=line->>'show_id' and (d->>'date')::date between (s->>'start_date')::date and (s->>'end_date')::date)
 and not exists(select 1 from public.sales_inventory_units u where u.organization_id=org and u.resource_key=(line->>'district_key')||':show:'||(line->>'show_id') and u.run_on=(d->>'date')::date and u.state='booked') then raise exception 'Sponsor discount entitlement changed; revise quote before signing';end if;
 end loop;end loop;
 for rid in select value::uuid from jsonb_array_elements_text(content->'override_ids') loop
 select * into req from public.sales_quote_overrides where id=rid;proposed_industry=req.terms->'industry_exclusivity';
 if proposed_industry is not null then
 select array_agg(value) into keys from jsonb_array_elements_text(proposed_industry->'districts');select array_agg(value) into products from jsonb_array_elements_text(proposed_industry->'products');
 if exists(select 1 from public.sales_inventory_units u where u.organization_id<>org and u.district_key=any(keys) and u.product_code=any(products) and (proposed_industry->>'scope'='network' or u.resource_key=req.line_snapshot->>'resource_key') and u.run_on between (proposed_industry->>'start_date')::date and (proposed_industry->>'end_date')::date and (u.state='booked' or (u.state='held' and u.hold_until>now())) and not exists(select 1 from sales_private.override_inventory_checks ic where ic.override_id=rid and ic.agreement_id=u.agreement_id)) then raise exception 'Paid inventory changed since industry review; obtain new approval';end if;
 if exists(select 1 from public.sales_industry_contracts c where sales_private.industry_live(c.id) and c.organization_id<>org and lower(btrim(c.industry))=lower(btrim(proposed_industry->>'industry')) and c.district_keys && keys and c.product_codes && products and (proposed_industry->>'scope'='network' or c.resource_keys is null or (req.line_snapshot->>'resource_key')=any(c.resource_keys)) and daterange(c.start_date,c.end_date+1,'[)') && daterange((proposed_industry->>'start_date')::date,(proposed_industry->>'end_date')::date+1,'[)')) then raise exception 'Conflicting industry agreement requires amendment, not automatic override';end if;
 end if;
 end loop;
 for line in select value from jsonb_array_elements(content->'lines') loop
 for day in select value::date from jsonb_array_elements_text(line->'run_dates') loop
 select s into slot_number from generate_series(1,(line->>'capacity')::integer) s where not exists(select 1 from public.sales_inventory_units u where u.resource_key=line->>'resource_key' and u.run_on=day and u.slot=s and u.state in ('held','booked')) order by s limit 1;
 if slot_number is null then raise exception 'Inventory conflict at signing';end if;
 select min((value->>'payment_due_at')::timestamptz) into payment_deadline from jsonb_array_elements(line->'deadlines');
 insert into public.sales_inventory_units(agreement_id,quote_id,version,line_id,organization_id,district_key,product_code,resource_key,run_on,slot,state,hold_until,payment_due_at)
 values(p_agreement,q.id,evidence.version,(line->>'line_id')::uuid,org,line->>'district_key',line->>'product_code',line->>'resource_key',day,slot_number,'held',hold_deadline,payment_deadline);
 end loop;end loop;
 for rid in select value::uuid from jsonb_array_elements_text(content->'override_ids') loop
 select * into req from public.sales_quote_overrides where id=rid;proposed_industry=req.terms->'industry_exclusivity';
 if proposed_industry is not null then
 insert into public.sales_industry_contracts(agreement_id,organization_id,industry,district_keys,product_codes,resource_keys,start_date,end_date,approval_id)
 values(p_agreement,org,btrim(proposed_industry->>'industry'),array(select jsonb_array_elements_text(proposed_industry->'districts')),array(select jsonb_array_elements_text(proposed_industry->'products')),case when proposed_industry->>'scope'='placement' then array[req.line_snapshot->>'resource_key'] else null end,(proposed_industry->>'start_date')::date,(proposed_industry->>'end_date')::date,rid);
 end if;end loop;
 update public.sales_quotes set status='accepted',updated_at=now() where id=q.id;
 return jsonb_build_object('agreement_id',p_agreement,'hold_until',hold_deadline,'reserved_units',(select count(*) from public.sales_inventory_units where agreement_id=p_agreement));
 end;
$$;
create function public.sales_reserve_signed_quote(p_agreement uuid) returns jsonb language sql security definer set search_path='' as $$select sales_private.reserve_signed_quote(p_agreement);$$;

-- Customer visibility is limited to shared quote versions. Internal requests,
-- tax administration, paid inventory and competing contracts are never public.
do $$ declare tab text;begin
 foreach tab in array array['sales_products','sales_product_versions','sales_policy_versions','sales_tax_versions','sales_calendar_exceptions','sales_quotes','sales_quote_versions','sales_quote_publications','sales_quote_overrides','sales_inventory_agreements','sales_inventory_units','sales_quote_asset_intents','sales_industry_contracts'] loop
 execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from anon,authenticated',tab);execute format('grant select on public.%I to authenticated',tab);
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function sales_private.capture_audit()',tab||'_audit',tab);
 end loop;
 foreach tab in array array['sales_product_versions','sales_policy_versions','sales_tax_versions','sales_quote_versions','sales_quote_publications','sales_quote_asset_intents'] loop
 execute format('create trigger %I before update or delete on public.%I for each row execute function sales_private.immutable_record()',tab||'_immutable',tab);
 end loop;
end $$;
create policy sales_products_read on public.sales_products for select to authenticated using(sales_private.is_sales_staff());
create policy sales_product_versions_read on public.sales_product_versions for select to authenticated using(sales_private.is_sales_staff());
create policy sales_policy_versions_read on public.sales_policy_versions for select to authenticated using(sales_private.is_sales_staff());
create policy sales_tax_versions_read on public.sales_tax_versions for select to authenticated using(sales_private.is_sales_staff() and sales_private.can_view_district(district_key));
create policy sales_calendar_exceptions_read on public.sales_calendar_exceptions for select to authenticated using(sales_private.is_sales_staff());
create policy sales_quotes_read on public.sales_quotes for select to authenticated using(sales_private.can_work_quote(id) or (sales_private.customer_quote_access(id) and exists(select 1 from public.sales_quote_publications p where p.quote_id=sales_quotes.id and p.event='sent')));
create policy sales_quote_versions_read on public.sales_quote_versions for select to authenticated using(sales_private.can_read_quote_version(quote_id,version));
create policy sales_publications_read on public.sales_quote_publications for select to authenticated using(sales_private.can_read_quote_version(quote_id,version));
create policy sales_override_read on public.sales_quote_overrides for select to authenticated using((sales_private.active_user() and requested_by=auth.uid() and sales_private.can_work_quote(quote_id)) or sales_private.can_manage_scope(scope_districts));
create policy sales_inventory_agreements_read on public.sales_inventory_agreements for select to authenticated using(sales_private.can_work_quote(quote_id));
create policy sales_inventory_units_read on public.sales_inventory_units for select to authenticated using(sales_private.is_sales_staff() and (sales_private.can_manage_district(district_key) or sales_private.can_work_quote(quote_id)));
create policy sales_asset_intents_read on public.sales_quote_asset_intents for select to authenticated using(sales_private.can_read_staff_customer(organization_id));
create policy sales_industry_contracts_read on public.sales_industry_contracts for select to authenticated using(sales_private.can_manage_scope(district_keys));

-- Revoke default EXECUTE for these functions only; preserve earlier chunks'
-- carefully scoped Auth and invitation transport grants.
do $$ declare fn record;begin
 for fn in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('sales_save_quote','sales_quote_availability','sales_publish_quote','sales_withdraw_quote','sales_request_quote_override','sales_decide_quote_override','sales_configure_tax','sales_publish_product_version','sales_publish_policy_version','sales_set_calendar_exception','sales_configure_studio','sales_reserve_signed_quote') loop
 execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
 if fn.proname='sales_reserve_signed_quote' then execute format('grant execute on function %s to service_role',fn.signature);else execute format('grant execute on function %s to authenticated',fn.signature);end if;
 end loop;
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sales_private' and p.proname in
 ('immutable_record','observed_date','nth_weekday','is_business_day','business_shift','central_deadline','can_manage_scope','can_work_quote','customer_quote_access','can_read_quote_version','quote_line','inventory_status','apply_quote_overrides','quote_availability','industry_live','reserve_signed_quote') loop execute format('revoke all on function %s from public,anon,authenticated',fn.signature);end loop;
end $$;
grant execute on function sales_private.can_manage_scope(text[]),sales_private.can_work_quote(uuid),sales_private.customer_quote_access(uuid),sales_private.can_read_quote_version(uuid,integer) to authenticated;
commit;
