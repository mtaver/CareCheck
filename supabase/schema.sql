begin;

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  community text not null check (length(trim(community)) between 2 and 80),
  address text not null check (length(trim(address)) between 2 and 180),
  phone text not null check (phone ~ '^[+]?[0-9]{7,15}$'),
  kind text not null check (kind in ('Hospital', 'Clinic', 'Laboratory', 'Pharmacy')),
  approved boolean not null default false
);

create table public.services (
  facility_id uuid not null references public.facilities on delete cascade,
  service text not null check (length(trim(service)) between 2 and 100),
  status text not null check (status in ('available', 'unavailable')),
  price integer check (price between 0 and 100000000),
  cutoff time,
  confirmed_at timestamptz not null default now(),
  primary key (facility_id, service)
);

alter table public.facilities enable row level security;
alter table public.services enable row level security;
revoke all on public.facilities, public.services from anon, authenticated;
grant select (id, name, community, address, phone, kind, approved) on public.facilities to anon, authenticated;
grant select (owner_id) on public.facilities to authenticated;
grant insert (name, community, address, phone, kind) on public.facilities to authenticated;
grant select on public.services to anon, authenticated;

create policy "Read approved facilities" on public.facilities for select to anon, authenticated using (approved);
create policy "Read own facilities" on public.facilities for select to authenticated using (owner_id = auth.uid());
create policy "Register own facility" on public.facilities for insert to authenticated
  with check (owner_id = auth.uid() and not approved);
create policy "Read listed services" on public.services for select to anon, authenticated using (
  exists (select 1 from public.facilities f where f.id = facility_id)
);

create function public.confirm_service(
  facility uuid, service_name text, availability text, quote integer, arrival_cutoff time
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.facilities where id = facility and owner_id = auth.uid()
  ) then
    raise exception 'You can only update your own facility.';
  end if;

  insert into public.services (facility_id, service, status, price, cutoff)
    values (facility, lower(trim(service_name)), availability, quote, arrival_cutoff)
    on conflict (facility_id, service) do update set
      status = excluded.status, price = excluded.price, cutoff = excluded.cutoff, confirmed_at = now();
end;
$$;
revoke all on function public.confirm_service(uuid, text, text, integer, time) from public, anon;
grant execute on function public.confirm_service(uuid, text, text, integer, time) to authenticated;

commit;
