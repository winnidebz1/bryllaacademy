-- A private course link is created only when that course is submitted.
-- Published public courses can be listed on the homepage.
-- A new student stays pending until the founder approves the account.

create or replace function public.submit_course(p_course text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
	updated_id text;
	shared text;
begin
	if not public.can_edit_course(p_course) then
		raise exception 'not allowed';
	end if;
	update public.courses
	set approval_status = 'pending',
		status = 'draft',
		share_code = case
			when visibility = 'private' then coalesce(share_code, encode(extensions.gen_random_bytes(9), 'hex'))
			else null
		end
	where id = p_course
	returning id, share_code into updated_id, shared;
	if updated_id is null then
		raise exception 'course not found';
	end if;
	return coalesce(shared, '');
end;
$$;

create or replace function public.public_open_courses()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
	select coalesce(jsonb_agg(jsonb_build_object(
		'id', c.id,
		'title', c.title,
		'summary', coalesce(nullif(trim(c.short_description), ''), nullif(trim(c.description), ''), ''),
		'currency', coalesce(nullif(c.currency, ''), 'GHS'),
		'price_amount', coalesce(c.price_amount, round(c.price_minor / 100.0, 2), 0),
		'bullets', coalesce((
			select jsonb_agg(item.title order by item.position)
			from (
				select topic.title, topic.position
				from public.course_topics topic
				where topic.course_id = c.id
				order by topic.position
				limit 3
			) item
		), '[]'::jsonb)
	) order by c.title), '[]'::jsonb)
	from public.courses c
	where c.status = 'published'
		and c.visibility = 'public'
		and c.approval_status = 'approved'
		and c.id <> 'bookkeeping';
$$;

revoke all on function public.public_open_courses() from public;
grant execute on function public.public_open_courses() to anon, authenticated;

alter table public.profiles
	add column if not exists account_status text not null default 'approved';

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles
	add constraint profiles_account_status_check check (account_status in ('pending', 'approved'));

create or replace function public.mark_new_student_pending()
returns trigger
language plpgsql
as $$
begin
	if new.role = 'student' then
		new.account_status := 'pending';
	end if;
	return new;
end;
$$;

drop trigger if exists mark_new_student_pending on public.profiles;
create trigger mark_new_student_pending
	before insert on public.profiles
	for each row execute function public.mark_new_student_pending();

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if auth.role() is distinct from 'service_role' and new.role is distinct from old.role then
		raise exception 'role cannot be changed from the client';
	end if;
	if new.account_status is distinct from old.account_status
		and auth.role() is distinct from 'service_role'
		and not exists (select 1 from public.profiles where id = auth.uid() and role = 'founder') then
		raise exception 'account status cannot be changed from the client';
	end if;
	return new;
end;
$$;

create or replace function public.founder_pending_accounts()
returns table (
	id uuid,
	full_name text,
	email text,
	created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
	if not exists (select 1 from public.profiles where profiles.id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	return query
	select p.id, coalesce(p.full_name, u.email)::text, u.email::text, p.created_at
	from public.profiles p
	join auth.users u on u.id = p.id
	where p.role = 'student' and p.account_status = 'pending'
	order by p.created_at desc;
end;
$$;

revoke all on function public.founder_pending_accounts() from public, anon;
grant execute on function public.founder_pending_accounts() to authenticated;

create or replace function public.founder_approve_student(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if not exists (select 1 from public.profiles where profiles.id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	update public.profiles
	set account_status = 'approved'
	where id = p_user and role = 'student';
end;
$$;

revoke all on function public.founder_approve_student(uuid) from public, anon;
grant execute on function public.founder_approve_student(uuid) to authenticated;

notify pgrst, 'reload schema';
