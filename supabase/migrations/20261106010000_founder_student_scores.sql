-- Founder download of quiz scores for one or more students.

create or replace function public.founder_student_scores()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
	if not exists (
		select 1 from public.profiles
		where profiles.id = auth.uid() and profiles.role = 'founder'
	) then
		raise exception 'not allowed';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', student.id,
			'name', student.full_name,
			'email', student.email,
			'scores', student.scores
		) order by student.full_name, student.email)
		from (
			select
				p.id,
				coalesce(nullif(btrim(p.full_name), ''), 'Student') as full_name,
				coalesce(u.email, '') as email,
				coalesce((
					select jsonb_agg(jsonb_build_object(
						'title', q.title,
						'percent', a.percent,
						'passed', coalesce(a.passed, false),
						'attempt', a.attempt_no,
						'submitted_at', a.submitted_at
					) order by a.submitted_at desc)
					from (
						select
							attempt.quiz_id,
							attempt.percent,
							attempt.passed,
							attempt.submitted_at,
							row_number() over (
								partition by attempt.quiz_id, attempt.user_id
								order by attempt.started_at
							) as attempt_no
						from public.course_quiz_attempts attempt
						where attempt.user_id = p.id
							and attempt.submitted_at is not null
					) a
					join public.course_quizzes q on q.id = a.quiz_id
				), '[]'::jsonb) as scores
			from public.profiles p
			join auth.users u on u.id = p.id
			where p.role = 'student'
		) student
	), '[]'::jsonb);
end;
$$;

revoke all on function public.founder_student_scores() from public, anon;
grant execute on function public.founder_student_scores() to authenticated;

notify pgrst, 'reload schema';
