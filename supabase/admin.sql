begin;

alter table public.facilities add column moderation_status text not null default 'pending'
  check (moderation_status in ('pending', 'approved', 'removed'));
update public.facilities set moderation_status = 'approved' where approved;

create schema carecheck_private;
revoke all on schema carecheck_private from public, anon, authenticated;
create table carecheck_private.admins (
  user_id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('main', 'admin'))
);
create unique index carecheck_one_main_admin on carecheck_private.admins (role) where role = 'main';
create table carecheck_private.suspensions (
  user_id uuid primary key references auth.users on delete cascade,
  reason text not null
);
create table carecheck_private.moderation_log (
  occurred_at timestamptz not null default now(),
  actor uuid not null,
  action text not null,
  target uuid not null,
  reason text
);

create function carecheck_private.require_admin(main_only boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare current_role_name text;
begin
  select role into current_role_name from carecheck_private.admins where user_id = auth.uid();
  if current_role_name is null or (main_only and current_role_name <> 'main') then
    raise exception 'This action requires administrator access.' using errcode = '42501';
  end if;
  return current_role_name;
end;
$$;

create function carecheck_private.check_active_staff()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  end if;
  if exists (select 1 from carecheck_private.suspensions where user_id = auth.uid()) then
    raise exception 'This account is suspended from CareCheck submissions.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger facility_active_staff before insert on public.facilities
for each row execute function carecheck_private.check_active_staff();
create trigger service_active_staff before insert or update on public.services
for each row execute function carecheck_private.check_active_staff();

create function public.admin_dashboard()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare access_role text := carecheck_private.require_admin();
begin
  return jsonb_build_object(
    'role', access_role,
    'facilities', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'kind', f.kind,
        'community', f.community, 'address', f.address, 'phone', f.phone,
        'status', f.moderation_status, 'owner_email', u.email,
        'services', coalesce((select jsonb_agg(jsonb_build_object('name', s.service,
          'price', s.price, 'status', s.status, 'cutoff', s.cutoff) order by s.service)
          from public.services s where s.facility_id = f.id), '[]'::jsonb))
        order by f.name, f.id)
      from public.facilities f join auth.users u on u.id = f.owner_id
    ), '[]'::jsonb),
    'admins', case when access_role = 'main' then coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'role', a.role) order by u.email)
      from carecheck_private.admins a join auth.users u on u.id = a.user_id
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

create function public.admin_review_facility(facility_id uuid, decision text, reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform carecheck_private.require_admin();
  if decision is null or decision not in ('approved', 'removed') then
    raise exception 'Choose Approve or Remove.';
  end if;
  if decision = 'removed' and nullif(trim(reason), '') is null then
    raise exception 'Enter a reason for removal.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(f.owner_id::text, 0))
    from public.facilities f where f.id = facility_id;
  update public.facilities f
  set approved = (decision = 'approved'), moderation_status = decision
  where f.id = facility_id and (decision <> 'approved' or not exists (
    select 1 from carecheck_private.suspensions s where s.user_id = f.owner_id
  ));
  if not found then raise exception 'Facility unavailable or its owner is suspended.'; end if;
  insert into carecheck_private.moderation_log(actor, action, target, reason)
    values (auth.uid(), 'facility_' || decision, facility_id, reason);
end;
$$;

create function public.admin_manage_account(account_email text, action text, reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  perform carecheck_private.require_admin(action in ('grant_admin', 'revoke_admin'));
  select id into target_id from auth.users where lower(email) = lower(trim(account_email));
  if target_id is null then raise exception 'No registered CareCheck account has that email.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_id::text, 0));

  case action
    when 'grant_admin' then
      if exists (select 1 from carecheck_private.suspensions where user_id = target_id) then
        raise exception 'Restore the account before granting admin access.';
      end if;
      insert into carecheck_private.admins(user_id, role) values (target_id, 'admin') on conflict do nothing;
    when 'revoke_admin' then
      delete from carecheck_private.admins where user_id = target_id and role = 'admin';
      if not found then raise exception 'Only a regular admin can be removed here.'; end if;
    when 'suspend' then
      if nullif(trim(reason), '') is null then raise exception 'Enter a reason for suspension.'; end if;
      if exists (select 1 from carecheck_private.admins where user_id = target_id) then
        raise exception 'The main admin must revoke regular admin access before suspension.';
      end if;
      insert into carecheck_private.suspensions(user_id, reason) values (target_id, reason)
        on conflict (user_id) do update set reason = excluded.reason;
      update public.facilities set approved = false, moderation_status = 'removed' where owner_id = target_id;
    when 'restore' then
      delete from carecheck_private.suspensions where user_id = target_id;
    else raise exception 'Unknown account action.';
  end case;

  insert into carecheck_private.moderation_log(actor, action, target, reason)
    values (auth.uid(), 'account_' || action, target_id, reason);
end;
$$;

revoke all on function public.admin_dashboard(),
  public.admin_review_facility(uuid, text, text),
  public.admin_manage_account(text, text, text) from public, anon;
grant execute on function public.admin_dashboard(),
  public.admin_review_facility(uuid, text, text),
  public.admin_manage_account(text, text, text) to authenticated;

commit;

-- Bootstrap once in the SQL Editor with the verified main administrator's existing Auth user ID:
-- insert into carecheck_private.admins (user_id, role) values ('YOUR-AUTH-USER-UUID', 'main');
