-- List students on the certificate board even when they are not yet enrolled.

create or replace function public.founder_certificate_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role in ('founder', 'instructor')) then
		raise exception 'not allowed';
	end if;
	return coalesce((
		select jsonb_agg(row_to_json(item))
		from (
			select
				p.id as user_id,
				coalesce(p.full_name, u.email) as student_name,
				u.email,
				c.id as course_id,
				c.title as course_title,
				e.created_at as enrolled_at,
				coalesce((
					select round(avg(a.percent)::numeric, 1)
					from public.course_quiz_attempts a
					join public.course_quizzes q on q.id = a.quiz_id
					where a.user_id = p.id and q.course_id = c.id and a.submitted_at is not null
				), 0) as assessment_score,
				coalesce((
					select round(avg(q.pass_percent)::numeric, 1)
					from public.course_quizzes q
					where q.course_id = c.id
				), 70) as pass_mark,
				r.result as result_override,
				r.completion_date,
				cert.certificate_number,
				cert.status as certificate_status,
				cert.issue_date,
				cert.display_name,
				cert.id as certificate_id
			from public.profiles p
			join auth.users u on u.id = p.id
			join public.courses c on
				(
					(c.status = 'published' and c.visibility = 'public' and c.approval_status = 'approved')
					or exists (
						select 1 from public.enrollments e2
						where e2.user_id = p.id and e2.course_id = c.id and e2.status = 'active'
					)
					or exists (
						select 1 from public.course_results r2
						where r2.user_id = p.id and r2.course_id = c.id
					)
					or exists (
						select 1 from public.certificates x
						where x.user_id = p.id and x.course_id = c.id
					)
				)
			left join public.enrollments e
				on e.user_id = p.id and e.course_id = c.id and e.status = 'active'
			left join public.course_results r
				on r.user_id = p.id and r.course_id = c.id
			left join public.certificates cert
				on cert.user_id = p.id and cert.course_id = c.id and cert.status = 'issued'
			where p.role = 'student'
			order by coalesce(p.full_name, u.email), c.title
		) item
	), '[]'::jsonb);
end;
$$;

revoke all on function public.founder_certificate_board() from public, anon;
grant execute on function public.founder_certificate_board() to authenticated;

notify pgrst, 'reload schema';
