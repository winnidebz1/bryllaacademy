-- The founder can edit a published course.
-- A student with course access is recorded as enrolled, even when there is no payment order.

alter table public.enrollments alter column order_id drop not null;

drop policy if exists "founders update any course" on public.courses;
create policy "founders update any course" on public.courses
	for update to authenticated
	using (
		exists (
			select 1 from public.profiles
			where profiles.id = auth.uid() and profiles.role = 'founder'
		)
	)
	with check (
		exists (
			select 1 from public.profiles
			where profiles.id = auth.uid() and profiles.role = 'founder'
		)
	);

create or replace function public.claim_shared_course(p_code text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
	course_key text;
	student_email text;
begin
	if auth.uid() is null then
		raise exception 'sign in to open this course';
	end if;
	select c.id into course_key from public.courses c
	where c.share_code = p_code and c.approval_status in ('pending', 'approved');
	if course_key is null then
		raise exception 'this course link is not valid';
	end if;
	insert into public.course_access (user_id, course_id)
	values (auth.uid(), course_key)
	on conflict do nothing;
	select lower(u.email) into student_email from auth.users u where u.id = auth.uid();
	if student_email is not null then
		insert into public.enrollments (course_id, email, user_id, status)
		values (course_key, student_email, auth.uid(), 'active')
		on conflict (email, course_id) do update
			set user_id = excluded.user_id,
				status = 'active';
	end if;
	return course_key;
end;
$$;

update public.enrollments e
set user_id = a.user_id
from public.course_access a
join auth.users u on u.id = a.user_id
where e.course_id = a.course_id
	and e.user_id is null
	and lower(e.email) = lower(u.email);

insert into public.enrollments (course_id, email, user_id, status)
select a.course_id, lower(u.email), a.user_id, 'active'
from public.course_access a
join auth.users u on u.id = a.user_id
where u.email is not null
	and not exists (
		select 1 from public.enrollments e
		where e.course_id = a.course_id
			and (e.user_id = a.user_id or lower(e.email) = lower(u.email))
	);

create or replace function public.founder_enrolments()
returns table (
	id uuid,
	student_name text,
	email text,
	course_title text,
	status text,
	enrolled_at timestamptz
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
	select
		e.id,
		coalesce(nullif(trim(p.full_name), ''), nullif(trim(o.full_name), ''), e.email)::text,
		e.email::text,
		coalesce(c.title, e.course_id)::text,
		e.status::text,
		e.created_at
	from public.enrollments e
	left join public.orders o on o.id = e.order_id
	left join public.profiles p on p.id = e.user_id
	left join public.courses c on c.id = e.course_id
	where e.status in ('active', 'pending_setup')
	union all
	select
		md5(a.user_id::text || ':' || a.course_id)::uuid,
		coalesce(nullif(trim(p.full_name), ''), u.email)::text,
		u.email::text,
		coalesce(c.title, a.course_id)::text,
		'active'::text,
		a.created_at
	from public.course_access a
	join auth.users u on u.id = a.user_id
	left join public.profiles p on p.id = a.user_id
	left join public.courses c on c.id = a.course_id
	where u.email is not null
		and not exists (
			select 1 from public.enrollments e
			where e.course_id = a.course_id
				and e.status in ('active', 'pending_setup')
				and (e.user_id = a.user_id or lower(e.email) = lower(u.email))
		)
	order by 6 desc;
end;
$$;

notify pgrst, 'reload schema';
