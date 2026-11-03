-- A signed-in student enrols in a course that is already open.
-- Payment stays on the public registration page. This does not take payment.

create or replace function public.enrol_open_course(p_course text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
	student_email text;
	student_role text;
	student_status text;
begin
	if auth.uid() is null then
		raise exception 'sign in to enrol';
	end if;
	select role, account_status into student_role, student_status
	from public.profiles
	where id = auth.uid();
	if student_role is distinct from 'student' or student_status is distinct from 'approved' then
		raise exception 'this account cannot enrol yet';
	end if;
	if not exists (
		select 1 from public.courses c
		where c.id = p_course
			and c.status = 'published'
			and c.visibility = 'public'
			and c.approval_status = 'approved'
	) then
		raise exception 'this course is not open';
	end if;
	select lower(email) into student_email from auth.users where id = auth.uid();
	if student_email is null then
		raise exception 'sign in to enrol';
	end if;
	insert into public.course_access (user_id, course_id)
	values (auth.uid(), p_course)
	on conflict do nothing;
	insert into public.enrollments (course_id, email, user_id, status, started_at)
	values (p_course, student_email, auth.uid(), 'active', now())
	on conflict (email, course_id) do update
		set user_id = excluded.user_id,
			status = 'active',
			started_at = coalesce(public.enrollments.started_at, excluded.started_at);
end;
$$;

revoke all on function public.enrol_open_course(text) from public, anon;
grant execute on function public.enrol_open_course(text) to authenticated;
