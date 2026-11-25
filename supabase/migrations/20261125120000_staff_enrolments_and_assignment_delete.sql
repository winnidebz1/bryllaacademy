-- Instructors and founders can list live enrolments for dashboard student counts.
-- Staff can delete course assignments they created.

create or replace function public.staff_enrolments()
returns table (
	id uuid,
	user_id uuid,
	student_name text,
	email text,
	course_id text,
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
	if not public.caller_is_staff() then
		raise exception 'not allowed';
	end if;
	return query
	select
		e.id,
		e.user_id,
		coalesce(nullif(trim(p.full_name), ''), nullif(trim(o.full_name), ''), e.email)::text,
		e.email::text,
		e.course_id::text,
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
		a.user_id,
		coalesce(nullif(trim(p.full_name), ''), u.email)::text,
		u.email::text,
		a.course_id::text,
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
	order by 8 desc;
end;
$$;

revoke all on function public.staff_enrolments() from public, anon;
grant execute on function public.staff_enrolments() to authenticated;

create or replace function public.delete_course_assignment(p_assignment uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
	deleted integer := 0;
begin
	if not public.caller_is_staff() then
		raise exception 'not allowed';
	end if;
	if p_assignment is null then
		raise exception 'assignment required';
	end if;
	delete from public.course_assignments
	where id = p_assignment
		and kind = 'assignment';
	get diagnostics deleted = row_count;
	if deleted = 0 then
		raise exception 'assignment not found';
	end if;
	return true;
end;
$$;

revoke all on function public.delete_course_assignment(uuid) from public, anon;
grant execute on function public.delete_course_assignment(uuid) to authenticated;

notify pgrst, 'reload schema';
