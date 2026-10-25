-- Founders can see every enrolment, including a student who has paid and is still setting up their account.

drop policy if exists "founders read enrolments" on public.enrollments;
create policy "founders read enrolments" on public.enrollments
	for select using (
		exists (
			select 1 from public.profiles
			where profiles.id = auth.uid() and profiles.role = 'founder'
		)
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
set search_path = public
as $$
begin
	if not exists (select 1 from public.profiles where profiles.id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	return query
	select
		e.id,
		coalesce(nullif(trim(o.full_name), ''), nullif(trim(p.full_name), ''), e.email)::text,
		e.email::text,
		coalesce(c.title, e.course_id)::text,
		e.status::text,
		e.created_at
	from public.enrollments e
	left join public.orders o on o.id = e.order_id
	left join public.profiles p on p.id = e.user_id
	left join public.courses c on c.id = e.course_id
	where e.status in ('active', 'pending_setup')
	order by e.created_at desc;
end;
$$;

revoke all on function public.founder_enrolments() from public, anon;
grant execute on function public.founder_enrolments() to authenticated;

create or replace function public.founder_academy_counts()
returns table (active_courses integer, enrolled_students integer, enrolments integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	return query
	select
		(select count(*)::integer from public.courses where status = 'published' and approval_status = 'approved'),
		(select count(distinct lower(email))::integer from public.enrollments where status in ('active', 'pending_setup')),
		(select count(*)::integer from public.enrollments where status in ('active', 'pending_setup'));
end;
$$;

do $$
begin
	if not exists (
		select 1 from pg_publication_tables
		where pubname = 'supabase_realtime'
			and schemaname = 'public'
			and tablename = 'enrollments'
	) then
		alter publication supabase_realtime add table public.enrollments;
	end if;
end $$;
