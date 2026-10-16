-- Original pre-hardening schema, used only for upgrade tests.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  unit_code text not null,
  tower text not null,
  flat_no text not null,
  floor_no integer not null default 0,
  bhk text not null check (bhk in ('2BHK', '3BHK')),
  area_sqft numeric not null default 0,
  carpet_area_sqft numeric not null default 0,
  saleable_area_sqft numeric not null default 0,
  ownership_type text not null default 'Developer' check (ownership_type in ('Developer', 'Landowner')),
  status text,
  buyer_name text,
  buyer_phone text,
  agreed_price numeric not null default 0,
  rate_per_sqft numeric not null default 0,
  amenities_cost numeric not null default 0,
  adjustments numeric not null default 0,
  handover_date date,
  is_sold boolean not null default false,
  is_settled boolean not null default false,
  deleted_at timestamptz,
  deleted_by text,
  delete_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  unit_id uuid references units(id) on delete set null,
  type text not null check (type in (
    'BuyerReceipt',
    'VendorInvoice',
    'VendorPayment',
    'LandownerReimbursable',
    'LandownerReimbursableReceipt'
  )),
  scope text not null default 'ProjectWide' check (scope in ('ProjectWide', 'PerUnit')),
  date date not null,
  amount numeric not null default 0 check (amount >= 0),
  party text,
  details text,
  mode text,
  status text not null default 'Pending',
  deleted_at timestamptz,
  deleted_by text,
  delete_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_scope_unit_check check (scope <> 'PerUnit' or unit_id is not null)
);

create table if not exists transaction_audit_log (
  id bigserial primary key,
  transaction_id uuid not null references transactions(id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by text not null,
  field_name text not null,
  old_value text,
  new_value text,
  change_reason text not null
);

create index if not exists units_project_active_idx
  on units(project_id, tower, flat_no)
  where deleted_at is null;

create unique index if not exists units_project_unit_code_unique
  on units(project_id, unit_code)
  where deleted_at is null;

create unique index if not exists units_project_tower_flat_active_unique
  on units(project_id, tower, flat_no)
  where deleted_at is null;

create index if not exists transactions_project_active_idx
  on transactions(project_id, date, created_at)
  where deleted_at is null;

create index if not exists transactions_project_deleted_idx
  on transactions(project_id, deleted_at);

create index if not exists transactions_unit_idx
  on transactions(unit_id)
  where unit_id is not null;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists units_set_updated_at on units;
create trigger units_set_updated_at
before update on units
for each row execute function set_updated_at();

drop trigger if exists projects_set_updated_at on projects;
create trigger projects_set_updated_at
before update on projects
for each row execute function set_updated_at();

drop trigger if exists transactions_set_updated_at on transactions;
create trigger transactions_set_updated_at
before update on transactions
for each row execute function set_updated_at();

-- This app currently runs as a local/internal Vite admin tool using the public
-- anon key. Keep RLS disabled so the frontend can create the active project,
-- units, transactions, and audit rows.
alter table projects disable row level security;
alter table units disable row level security;
alter table transactions disable row level security;
alter table transaction_audit_log disable row level security;
