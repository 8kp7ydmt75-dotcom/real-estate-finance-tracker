-- Apply once to existing databases; repeatable. Back up before any migration.
-- No rows are deleted or silently reclassified. Invalid legacy rows abort this transaction.
begin;
alter table public.projects add column if not exists created_by uuid references auth.users(id);
alter table public.projects alter column created_by set default auth.uid();
alter table public.projects add column if not exists version integer not null default 1;
alter table public.units add column if not exists version integer not null default 1;
alter table public.transactions add column if not exists version integer not null default 1;
alter table public.transactions add column if not exists request_id uuid;
alter table public.transactions alter column details set default '{}';
alter table public.transactions add column if not exists invoice_id uuid references public.transactions(id);
create unique index if not exists transaction_request_unique on public.transactions(project_id, request_id) where request_id is not null;
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id), user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','accountant','viewer')), primary key(project_id,user_id)
);
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id), name text not null,
  normalized_name text generated always as (lower(regexp_replace(trim(name), '\s+', ' ', 'g'))) stored,
  unique(project_id,normalized_name)
);
alter table public.transactions add column if not exists vendor_id uuid references public.vendors(id);
-- Preserve legacy party labels; assign one stable identity per normalized vendor.
insert into public.vendors(project_id,name)
select distinct on (project_id,lower(regexp_replace(trim(party), '\s+', ' ', 'g'))) project_id,trim(party)
from public.transactions where type in ('VendorInvoice','VendorPayment') and nullif(trim(party),'') is not null
on conflict do nothing;
update public.transactions t set vendor_id=v.id from public.vendors v
where t.vendor_id is null and t.project_id=v.project_id and t.type in ('VendorInvoice','VendorPayment')
and lower(regexp_replace(trim(t.party),'\s+',' ','g'))=v.normalized_name;

-- Reject invalid historical amounts/links so an operator can explicitly correct them.
alter table public.transactions drop constraint if exists finance_amount_valid;
alter table public.transactions add constraint finance_amount_valid check (amount > 0 and amount <= 999999999999.99 and amount=round(amount,2));
alter table public.transactions drop constraint if exists finance_scope_valid;
alter table public.transactions add constraint finance_scope_valid check (
 (scope='PerUnit' and unit_id is not null) or (scope='ProjectWide' and unit_id is null));
alter table public.transactions drop constraint if exists finance_status_valid;
alter table public.transactions add constraint finance_status_valid check (status in ('Pending','Completed'));
alter table public.units drop constraint if exists finance_unit_values;
alter table public.units add constraint finance_unit_values check (
 carpet_area_sqft between 0 and 10000000 and saleable_area_sqft between 0 and 10000000
 and rate_per_sqft between 0 and 999999999999.99 and rate_per_sqft=round(rate_per_sqft,2)
 and amenities_cost between 0 and 999999999999.99 and amenities_cost=round(amenities_cost,2)
 and abs(adjustments)<=999999999999.99 and adjustments=round(adjustments,2)
 and agreed_price between 0 and 999999999999.99 and agreed_price=round(agreed_price,2)
 and length(trim(tower))>0 and length(trim(flat_no))>0
 and (not is_sold or (ownership_type='Developer' and nullif(trim(buyer_name),'') is not null)));
do $$ begin
 if exists(select 1 from public.transactions t left join public.units u on u.id=t.unit_id
   where t.deleted_at is null and ((t.scope='PerUnit' and (u.id is null or u.project_id<>t.project_id or u.deleted_at is not null))
   or (t.type='BuyerReceipt' and (t.scope<>'PerUnit' or u.ownership_type<>'Developer' or not u.is_sold))
   or (t.type in ('LandownerReimbursable','LandownerReimbursableReceipt') and (t.scope<>'PerUnit' or u.ownership_type<>'Landowner'))
   or (t.type in ('VendorInvoice','VendorPayment') and t.vendor_id is null))) then
   raise exception 'Legacy transactions have invalid unit/vendor links. Correct those records explicitly before applying this migration.';
 end if;
end $$;

create table if not exists public.audit_events (
 id bigint generated always as identity primary key, project_id uuid not null references public.projects(id),
 entity text not null, entity_id uuid not null, action text not null,
 actor_id uuid references auth.users(id), occurred_at timestamptz not null default now(),
 old_record jsonb, new_record jsonb, reason text
);
create index if not exists audit_project_time on public.audit_events(project_id,occurred_at desc);

create or replace function public.finance_role(target_project uuid) returns text
language sql stable security definer set search_path='' as $$
 select role from public.project_members where project_id=target_project and user_id=(select auth.uid());
$$;
revoke all on function public.finance_role(uuid) from public, anon;
grant execute on function public.finance_role(uuid) to authenticated;

-- Definer functions have a fixed search_path. Trigger functions cannot be called through RPC.
create or replace function public.finance_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare linked public.units; invoice public.transactions; vendor public.vendors; pid uuid; role_name text; detail jsonb;
begin
 pid := coalesce((to_jsonb(new)->>'project_id')::uuid,new.id);
 if tg_table_name='projects' and (nullif(trim(to_jsonb(new)->>'name'),'') is null or (to_jsonb(new)->>'code') !~ '^[A-Z0-9_]+$') then raise exception 'Project name/code is invalid'; end if;
 if tg_table_name='projects' and tg_op='INSERT' then
   if auth.uid() is null or new.created_by is distinct from auth.uid() then raise exception 'Authentication required' using errcode='42501'; end if;
 else
   role_name := public.finance_role(pid);
   if role_name is null or role_name not in ('owner','accountant') then raise exception 'Project write access required' using errcode='42501'; end if;
 end if;
 if tg_op='UPDATE' then
   if (to_jsonb(new)->>'project_id') is distinct from (to_jsonb(old)->>'project_id') then raise exception 'Project cannot be changed'; end if;
   if new.id<>old.id or new.created_at<>old.created_at then raise exception 'Record identity cannot be changed'; end if;
   if (to_jsonb(new)->>'created_by') is distinct from (to_jsonb(old)->>'created_by') then raise exception 'Project creator cannot be changed'; end if;
   if (to_jsonb(new)->>'code') is distinct from (to_jsonb(old)->>'code') then raise exception 'Project code cannot be changed'; end if;
   new.version := old.version+1;
 else new.version:=1;
 end if;
 -- Serialize related writes to avoid archive/receipt and invoice/payment races.
 if tg_table_name<>'projects' then perform 1 from public.projects where id=pid for update; end if;
 if tg_table_name='units' then
   if tg_op='UPDATE' then
     if old.deleted_at is not null then raise exception 'Archived units are immutable'; end if;
     if exists(select 1 from public.transactions where unit_id=old.id) and
       (new.deleted_at is not null or new.ownership_type<>old.ownership_type or (old.is_sold and not new.is_sold)) then
       raise exception 'Units with financial history cannot be archived, change ownership or become unsold';
     end if;
   end if;
 elsif tg_table_name='transactions' then
   -- Legacy free-text details are retained until the client saves the merged JSON object.
   if tg_op='INSERT' or new.details is distinct from old.details then
     detail:=new.details::jsonb;
     if detail is null or jsonb_typeof(detail)<>'object' then raise exception 'Transaction details must be an object'; end if;
     if nullif(detail->>'dueDate','') is not null and to_char((detail->>'dueDate')::date,'YYYY-MM-DD')<>detail->>'dueDate' then raise exception 'Invalid invoice due date'; end if;
   end if;

   if tg_op='UPDATE' then
     if old.deleted_at is not null then raise exception 'Voided transactions are immutable'; end if;
     if new.request_id is distinct from old.request_id then raise exception 'Submission identity cannot change'; end if;
     if exists(select 1 from public.transactions where invoice_id=old.id and deleted_at is null) and
       (new.deleted_at is not null or new.type<>old.type or new.party is distinct from old.party) then
       raise exception 'Void linked payments before changing invoice vendor/type or voiding invoice';
     end if;
   end if;
   if new.scope='PerUnit' then
     select * into linked from public.units where id=new.unit_id and project_id=pid and deleted_at is null;
     if not found then raise exception 'Unit must be active and in the same project'; end if;
   end if;
   if new.type='BuyerReceipt' and (new.scope<>'PerUnit' or linked.ownership_type<>'Developer' or not linked.is_sold) then raise exception 'Buyer receipts require a sold developer unit'; end if;
   if new.type in ('LandownerReimbursable','LandownerReimbursableReceipt') and (new.scope<>'PerUnit' or linked.ownership_type<>'Landowner') then raise exception 'Reimbursements require a landowner unit'; end if;
   if new.type in ('VendorInvoice','VendorPayment') then
     if nullif(trim(new.party),'') is null then raise exception 'Vendor name is required'; end if;
     new.party := regexp_replace(trim(new.party),'\s+',' ','g');
     insert into public.vendors(project_id,name) values(pid,new.party) on conflict do nothing;
     select * into vendor from public.vendors where project_id=pid and normalized_name=lower(new.party);
     new.vendor_id:=vendor.id;
   else new.vendor_id:=null;
   end if;
   if new.invoice_id is not null then
     select * into invoice from public.transactions where id=new.invoice_id and project_id=pid and type='VendorInvoice' and deleted_at is null;
     if not found or new.type<>'VendorPayment' or invoice.vendor_id is distinct from new.vendor_id then raise exception 'Payment must reference an active invoice for the same project and vendor'; end if;
   end if;
 end if;
 if to_jsonb(new)->>'deleted_at' is not null then
   if nullif(trim(new.delete_reason),'') is null then raise exception 'A reason is required'; end if;
   new.deleted_at:=now(); new.deleted_by:=auth.uid()::text;
 end if;
 return new;
end $$;

create or replace function public.finance_audit() returns trigger
language plpgsql security definer set search_path='' as $$
declare pid uuid; old_json jsonb; new_json jsonb;
begin
 new_json:=to_jsonb(new);
 pid:=coalesce((new_json->>'project_id')::uuid,new.id);
 if tg_op='INSERT' and tg_table_name='projects' then
   insert into public.project_members(project_id,user_id,role) values(new.id,auth.uid(),'owner');
 end if;
 if tg_op='UPDATE' then old_json:=to_jsonb(old); end if;
 insert into public.audit_events(project_id,entity,entity_id,action,actor_id,old_record,new_record,reason)
 values(pid,tg_table_name,new.id,case when new_json->>'deleted_at' is not null then 'VOID' else tg_op end,auth.uid(),old_json,new_json,new_json->>'delete_reason');
 return new;
end $$;
revoke all on function public.finance_guard() from public,anon,authenticated;
revoke all on function public.finance_audit() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['projects','units','transactions'] loop
 execute format('drop trigger if exists finance_guard on public.%I',t);
 execute format('create trigger finance_guard before insert or update on public.%I for each row execute function public.finance_guard()',t);
 execute format('drop trigger if exists finance_audit on public.%I',t);
 execute format('create trigger finance_audit after insert or update on public.%I for each row execute function public.finance_audit()',t);
 end loop;
end $$;

-- Remove pre-existing permissive policies before installing the complete policy set.
do $$ declare p record; t text; begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('projects','units','transactions','project_members','vendors','audit_events','transaction_audit_log') loop
 execute format('drop policy %I on public.%I',p.policyname,p.tablename);
 end loop;
 foreach t in array array['projects','units','transactions','project_members','vendors','audit_events','transaction_audit_log'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
grant update on public.projects to authenticated;
grant insert,update on public.units,public.transactions to authenticated;
create policy project_read on public.projects for select to authenticated using (public.finance_role(id) is not null);
create policy project_create on public.projects for insert to authenticated with check(created_by=(select auth.uid()));
create policy project_edit on public.projects for update to authenticated using (public.finance_role(id) in ('owner','accountant')) with check(public.finance_role(id) in ('owner','accountant'));
create policy member_read on public.project_members for select to authenticated using(user_id=(select auth.uid()) or public.finance_role(project_id)='owner');
create policy vendor_read on public.vendors for select to authenticated using(public.finance_role(project_id) is not null);
create policy audit_read on public.audit_events for select to authenticated using(public.finance_role(project_id) is not null);
create policy legacy_audit_read on public.transaction_audit_log for select to authenticated using(exists(select 1 from public.transactions t where t.id=transaction_id and public.finance_role(t.project_id) is not null));
do $$ declare t text; begin
 foreach t in array array['units','transactions'] loop
 execute format('create policy member_read on public.%I for select to authenticated using(public.finance_role(project_id) is not null)',t);
 execute format('create policy writer_create on public.%I for insert to authenticated with check(public.finance_role(project_id) in (''owner'',''accountant''))',t);
 execute format('create policy writer_edit on public.%I for update to authenticated using(public.finance_role(project_id) in (''owner'',''accountant'')) with check(public.finance_role(project_id) in (''owner'',''accountant''))',t);
 end loop;
end $$;

-- Return the newly created project only after its membership and audit exist.
create or replace function public.finance_create_project(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved public.projects;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 insert into public.projects(code,name,location,created_by)
 values(upper(trim(payload->>'code')),trim(payload->>'name'),nullif(trim(payload->>'location'),''),auth.uid()) returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function public.finance_create_project(jsonb) from public,anon;
grant execute on function public.finance_create_project(jsonb) to authenticated;

-- One statement gives a consistent complete project snapshot, independent of PostgREST's row cap.
create or replace function public.finance_snapshot(target_project uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('role',public.finance_role(target_project),
 'units',coalesce((select jsonb_agg(u order by u.tower,u.flat_no,u.id) from public.units u where u.project_id=target_project and u.deleted_at is null),'[]'::jsonb),
 'transactions',coalesce((select jsonb_agg(t order by t.date,t.created_at,t.id) from public.transactions t where t.project_id=target_project and t.deleted_at is null),'[]'::jsonb));
$$;
create or replace function public.finance_projects() returns jsonb
language sql stable security invoker set search_path='' as $$ select coalesce(jsonb_agg(p order by p.created_at,p.id),'[]'::jsonb) from public.projects p; $$;
create or replace function public.finance_project_stats() returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(p.id,jsonb_build_object('unitCount',(select count(*) from public.units u where u.project_id=p.id and u.deleted_at is null),
 'lastTransactionDate',(select max(date) from public.transactions t where t.project_id=p.id and t.deleted_at is null))),'{}'::jsonb) from public.projects p;
$$;
-- Idempotent retries return the original committed transaction. Conflicting reuse is rejected.
create or replace function public.finance_create_transaction(payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior public.transactions; saved public.transactions; pid uuid; rid uuid;
begin
 pid:=(payload->>'project_id')::uuid; rid:=(payload->>'request_id')::uuid;
 if rid is null then raise exception 'Submission id is required'; end if;
 if public.finance_role(pid) is null or public.finance_role(pid) not in ('owner','accountant') then raise exception 'Write access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||rid::text,0));
 select * into prior from public.transactions where project_id=pid and request_id=rid;
 if found then
   if prior.deleted_at is not null or (to_jsonb(prior) - array['id','version','created_at','updated_at','deleted_at','deleted_by','delete_reason','vendor_id']) @> payload is not true then raise exception 'Submission already exists with different values'; end if;
   return to_jsonb(prior);
 end if;
 insert into public.transactions(project_id,request_id,unit_id,scope,type,date,amount,party,details,mode,status,invoice_id)
 values(pid,rid,(payload->>'unit_id')::uuid,payload->>'scope',payload->>'type',(payload->>'date')::date,(payload->>'amount')::numeric,payload->>'party',payload->>'details',payload->>'mode',payload->>'status',(payload->>'invoice_id')::uuid)
 returning * into saved;
 return to_jsonb(saved);
end $$;
create or replace function public.finance_schema_version() returns integer language sql stable security invoker set search_path='' as $$ select 20261016; $$;
revoke all on function public.finance_snapshot(uuid),public.finance_projects(),public.finance_project_stats(),public.finance_create_transaction(jsonb),public.finance_schema_version() from public,anon;
grant execute on function public.finance_snapshot(uuid),public.finance_projects(),public.finance_project_stats(),public.finance_create_transaction(jsonb),public.finance_schema_version() to authenticated;
commit;
