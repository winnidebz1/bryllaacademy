-- Quizzes are stored for instructors to write and for students to take.
-- Scores are calculated in the database. Module dates open Getting started
-- at midnight on 4 January 2027, week 1 the next midnight, then one module
-- each week. Midnight is Ghana time (Africa/Accra).

create table if not exists public.course_module_schedule (
	course_id text not null references public.courses (id) on delete cascade,
	module_key text not null,
	opens_at timestamptz not null,
	primary key (course_id, module_key)
);

create table if not exists public.course_module_holds (
	course_id text not null references public.courses (id) on delete cascade,
	module_key text not null,
	closed_at timestamptz not null default now(),
	closed_by uuid,
	primary key (course_id, module_key)
);

alter table public.course_module_schedule enable row level security;
alter table public.course_module_holds enable row level security;
revoke all on public.course_module_schedule from public, anon, authenticated;
revoke all on public.course_module_holds from public, anon, authenticated;
grant select on public.course_module_schedule to authenticated;

insert into public.course_module_schedule (course_id, module_key, opens_at)
values
	('bookkeeping', 'getting-started', timestamptz '2027-01-04 00:00:00+00'),
	('bookkeeping', '1', timestamptz '2027-01-05 00:00:00+00'),
	('bookkeeping', '2', timestamptz '2027-01-12 00:00:00+00'),
	('bookkeeping', '3', timestamptz '2027-01-19 00:00:00+00'),
	('bookkeeping', '4', timestamptz '2027-01-26 00:00:00+00'),
	('bookkeeping', '5', timestamptz '2027-02-02 00:00:00+00'),
	('bookkeeping', '6', timestamptz '2027-02-09 00:00:00+00')
on conflict (course_id, module_key) do update
	set opens_at = excluded.opens_at;

create or replace function public.sync_scheduled_unlocks()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into public.course_module_unlocks (course_id, module_key, unlocked_at)
	select s.course_id, s.module_key, now()
	from public.course_module_schedule s
	where s.opens_at <= now()
		and not exists (
			select 1 from public.course_module_holds h
			where h.course_id = s.course_id and h.module_key = s.module_key
		)
	on conflict (course_id, module_key) do nothing;
end;
$$;

revoke all on function public.sync_scheduled_unlocks() from public, anon;
grant execute on function public.sync_scheduled_unlocks() to authenticated;

create or replace function public.founder_module_holds()
returns table (course_id text, module_key text)
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
	select h.course_id, h.module_key from public.course_module_holds h;
end;
$$;

revoke all on function public.founder_module_holds() from public, anon;
grant execute on function public.founder_module_holds() to authenticated;

create or replace function public.set_module_unlock(
	p_course text,
	p_module text,
	p_open boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role = 'founder') then
		raise exception 'Only the founder can open or close a module.';
	end if;
	if p_course is null or p_module is null or char_length(trim(p_module)) < 1 or char_length(trim(p_module)) > 80 then
		raise exception 'Choose a course module.';
	end if;
	if not exists (select 1 from public.courses where id = p_course) then
		raise exception 'That course was not found.';
	end if;
	if p_open then
		delete from public.course_module_holds
		where course_id = p_course and module_key = trim(p_module);
		insert into public.course_module_unlocks (course_id, module_key, unlocked_at, unlocked_by)
		values (p_course, trim(p_module), now(), auth.uid())
		on conflict (course_id, module_key) do update
			set unlocked_at = excluded.unlocked_at,
				unlocked_by = excluded.unlocked_by;
	else
		delete from public.course_module_unlocks
		where course_id = p_course and module_key = trim(p_module);
		insert into public.course_module_holds (course_id, module_key, closed_at, closed_by)
		values (p_course, trim(p_module), now(), auth.uid())
		on conflict (course_id, module_key) do update
			set closed_at = excluded.closed_at,
				closed_by = excluded.closed_by;
	end if;
end;
$$;

create table if not exists public.course_quizzes (
	id uuid primary key default gen_random_uuid(),
	course_id text not null references public.courses (id) on delete cascade,
	module_key text not null,
	title text not null,
	time_limit_seconds integer not null check (time_limit_seconds between 60 and 10800),
	pass_percent integer not null default 70 check (pass_percent between 1 and 100),
	created_by uuid,
	updated_at timestamptz not null default now(),
	unique (course_id, module_key)
);

create table if not exists public.course_quiz_questions (
	id uuid primary key default gen_random_uuid(),
	quiz_id uuid not null references public.course_quizzes (id) on delete cascade,
	position integer not null check (position > 0),
	prompt text not null,
	choices jsonb not null,
	correct_index integer not null check (correct_index >= 0),
	explanation text not null default '',
	unique (quiz_id, position)
);

create table if not exists public.course_quiz_attempts (
	id uuid primary key default gen_random_uuid(),
	quiz_id uuid not null references public.course_quizzes (id) on delete cascade,
	user_id uuid not null,
	answers jsonb,
	correct_count integer,
	total_count integer,
	percent integer,
	passed boolean,
	started_at timestamptz not null default now(),
	submitted_at timestamptz
);

create index if not exists course_quiz_attempts_user_idx
	on public.course_quiz_attempts (quiz_id, user_id, started_at);

alter table public.course_quizzes enable row level security;
alter table public.course_quiz_questions enable row level security;
alter table public.course_quiz_attempts enable row level security;
revoke all on public.course_quizzes from public, anon, authenticated;
revoke all on public.course_quiz_questions from public, anon, authenticated;
revoke all on public.course_quiz_attempts from public, anon, authenticated;

create or replace function public.save_course_quiz(
	p_course text,
	p_module text,
	p_title text,
	p_minutes integer,
	p_pass integer,
	p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	quiz_id uuid;
	item jsonb;
	choice jsonb;
	index integer := 0;
	choice_count integer;
	correct integer;
begin
	if not public.caller_is_staff() then
		raise exception 'Only an instructor or the founder can save a quiz.';
	end if;
	if p_course is null or not exists (select 1 from public.courses where id = p_course) then
		raise exception 'Choose a course.';
	end if;
	if p_module is null or char_length(trim(p_module)) < 1 or char_length(trim(p_module)) > 80 then
		raise exception 'Choose a module.';
	end if;
	if p_title is null or char_length(trim(p_title)) < 2 or char_length(trim(p_title)) > 140 then
		raise exception 'Enter a quiz title.';
	end if;
	if p_minutes is null or p_minutes < 1 or p_minutes > 180 then
		raise exception 'Set a time from 1 to 180 minutes.';
	end if;
	if p_pass is null or p_pass < 1 or p_pass > 100 then
		raise exception 'Set a pass mark from 1 to 100.';
	end if;
	if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) < 1 or jsonb_array_length(p_questions) > 40 then
		raise exception 'Add at least one question.';
	end if;

	insert into public.course_quizzes (course_id, module_key, title, time_limit_seconds, pass_percent, created_by, updated_at)
	values (p_course, trim(p_module), trim(p_title), p_minutes * 60, p_pass, auth.uid(), now())
	on conflict (course_id, module_key) do update
		set title = excluded.title,
			time_limit_seconds = excluded.time_limit_seconds,
			pass_percent = excluded.pass_percent,
			updated_at = now()
	returning id into quiz_id;

	delete from public.course_quiz_questions where course_quiz_questions.quiz_id = quiz_id;

	for item in select value from jsonb_array_elements(p_questions)
	loop
		index := index + 1;
		if coalesce(trim(item->>'prompt'), '') = '' then
			raise exception 'Every question needs text.';
		end if;
		if jsonb_typeof(item->'choices') <> 'array' then
			raise exception 'Every question needs answer choices.';
		end if;
		choice_count := jsonb_array_length(item->'choices');
		if choice_count < 2 or choice_count > 6 then
			raise exception 'Each question needs between 2 and 6 answers.';
		end if;
		for choice in select value from jsonb_array_elements(item->'choices')
		loop
			if jsonb_typeof(choice) <> 'string' or char_length(trim(choice #>> '{}')) < 1 then
				raise exception 'Every answer needs text.';
			end if;
		end loop;
		begin
			correct := (item->>'correct_index')::integer;
		exception when others then
			raise exception 'Mark the correct answer for every question.';
		end;
		if correct is null or correct < 0 or correct >= choice_count then
			raise exception 'Mark the correct answer for every question.';
		end if;
		insert into public.course_quiz_questions (quiz_id, position, prompt, choices, correct_index, explanation)
		values (quiz_id, index, trim(item->>'prompt'), item->'choices', correct, left(coalesce(item->>'explanation', ''), 500));
	end loop;
	return quiz_id;
end;
$$;

revoke all on function public.save_course_quiz(text, text, text, integer, integer, jsonb) from public, anon;
grant execute on function public.save_course_quiz(text, text, text, integer, integer, jsonb) to authenticated;

create or replace function public.delete_course_quiz(p_quiz uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if not public.caller_is_staff() then
		raise exception 'Only an instructor or the founder can delete a quiz.';
	end if;
	delete from public.course_quizzes where id = p_quiz;
end;
$$;

revoke all on function public.delete_course_quiz(uuid) from public, anon;
grant execute on function public.delete_course_quiz(uuid) to authenticated;

create or replace function public.staff_course_quizzes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
	if not public.caller_is_staff() then
		raise exception 'not allowed';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', q.id,
			'course_id', q.course_id,
			'module_key', q.module_key,
			'title', q.title,
			'minutes', q.time_limit_seconds / 60,
			'pass_percent', q.pass_percent,
			'questions', coalesce((
				select jsonb_agg(jsonb_build_object(
					'prompt', qq.prompt,
					'choices', qq.choices,
					'correct_index', qq.correct_index,
					'explanation', qq.explanation
				) order by qq.position)
				from public.course_quiz_questions qq
				where qq.quiz_id = q.id
			), '[]'::jsonb)
		) order by q.course_id, q.module_key)
		from public.course_quizzes q
	), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_course_quizzes() from public, anon;
grant execute on function public.staff_course_quizzes() to authenticated;

create or replace function public.staff_quiz_results()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
	if not public.caller_is_staff() then
		raise exception 'not allowed';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', a.id,
			'quiz_id', q.id,
			'quiz_title', q.title,
			'student', coalesce(p.full_name, u.email, 'Student'),
			'percent', a.percent,
			'passed', a.passed,
			'submitted_at', a.submitted_at,
			'attempt', a.attempt_no
		) order by a.submitted_at desc)
		from (
			select attempt.*,
				row_number() over (partition by attempt.quiz_id, attempt.user_id order by attempt.started_at) as attempt_no
			from public.course_quiz_attempts attempt
			where attempt.submitted_at is not null
		) a
		join public.course_quizzes q on q.id = a.quiz_id
		left join public.profiles p on p.id = a.user_id
		left join auth.users u on u.id = a.user_id
	), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_quiz_results() from public, anon;
grant execute on function public.staff_quiz_results() to authenticated;

create or replace function public.student_open_quizzes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
	if auth.uid() is null then
		raise exception 'Sign in to see quizzes.';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', q.id,
			'course_id', q.course_id,
			'module_key', q.module_key,
			'title', q.title,
			'minutes', q.time_limit_seconds / 60,
			'pass_percent', q.pass_percent,
			'question_count', (select count(*) from public.course_quiz_questions qq where qq.quiz_id = q.id),
			'attempts_used', (
				select count(*) from public.course_quiz_attempts a
				where a.quiz_id = q.id and a.user_id = auth.uid() and a.submitted_at is not null
			)
		) order by q.module_key)
		from public.course_quizzes q
		where exists (
			select 1 from public.course_module_unlocks u
			where u.course_id = q.course_id and u.module_key = q.module_key
		)
		and (
			exists (
				select 1 from public.enrollments e
				where e.user_id = auth.uid() and e.course_id = q.course_id and e.status = 'active'
			)
			or exists (
				select 1 from public.course_access c
				where c.user_id = auth.uid() and c.course_id = q.course_id
			)
		)
	), '[]'::jsonb);
end;
$$;

revoke all on function public.student_open_quizzes() from public, anon;
grant execute on function public.student_open_quizzes() to authenticated;

create or replace function public.student_quiz_questions(p_quiz uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
	quiz public.course_quizzes%rowtype;
begin
	if auth.uid() is null then
		raise exception 'Sign in to take a quiz.';
	end if;
	select * into quiz from public.course_quizzes where id = p_quiz;
	if quiz.id is null then
		raise exception 'That quiz was not found.';
	end if;
	if not exists (
		select 1 from public.course_module_unlocks u
		where u.course_id = quiz.course_id and u.module_key = quiz.module_key
	) then
		raise exception 'This quiz is not open yet.';
	end if;
	if not exists (
		select 1 from public.enrollments e
		where e.user_id = auth.uid() and e.course_id = quiz.course_id and e.status = 'active'
	) and not exists (
		select 1 from public.course_access c
		where c.user_id = auth.uid() and c.course_id = quiz.course_id
	) then
		raise exception 'Enrol in the course before taking this quiz.';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'position', qq.position,
			'prompt', qq.prompt,
			'choices', qq.choices
		) order by qq.position)
		from public.course_quiz_questions qq
		where qq.quiz_id = quiz.id
	), '[]'::jsonb);
end;
$$;

revoke all on function public.student_quiz_questions(uuid) from public, anon;
grant execute on function public.student_quiz_questions(uuid) to authenticated;

create or replace function public.start_quiz_attempt(p_quiz uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	quiz public.course_quizzes%rowtype;
	used integer;
	open_attempt public.course_quiz_attempts%rowtype;
	new_id uuid;
begin
	if auth.uid() is null then
		raise exception 'Sign in to take a quiz.';
	end if;
	select * into quiz from public.course_quizzes where id = p_quiz;
	if quiz.id is null then
		raise exception 'That quiz was not found.';
	end if;
	if not exists (
		select 1 from public.course_module_unlocks u
		where u.course_id = quiz.course_id and u.module_key = quiz.module_key
	) then
		raise exception 'This quiz is not open yet.';
	end if;
	perform public.student_quiz_questions(p_quiz);
	select * into open_attempt
	from public.course_quiz_attempts
	where quiz_id = p_quiz and user_id = auth.uid() and submitted_at is null
	order by started_at desc
	limit 1;
	if open_attempt.id is not null and open_attempt.started_at + make_interval(secs => quiz.time_limit_seconds) > now() then
		return jsonb_build_object(
			'attempt_id', open_attempt.id,
			'seconds_left', floor(extract(epoch from (open_attempt.started_at + make_interval(secs => quiz.time_limit_seconds) - now())))::integer
		);
	end if;
	if open_attempt.id is not null then
		update public.course_quiz_attempts
		set submitted_at = now(), correct_count = 0, total_count = 0, percent = 0, passed = false, answers = '[]'::jsonb
		where id = open_attempt.id;
	end if;
	select count(*) into used
	from public.course_quiz_attempts
	where quiz_id = p_quiz and user_id = auth.uid() and submitted_at is not null;
	if used >= 2 then
		raise exception 'No attempts left. Ask your instructor for help.';
	end if;
	insert into public.course_quiz_attempts (quiz_id, user_id)
	values (p_quiz, auth.uid())
	returning id into new_id;
	return jsonb_build_object('attempt_id', new_id, 'seconds_left', quiz.time_limit_seconds);
end;
$$;

revoke all on function public.start_quiz_attempt(uuid) from public, anon;
grant execute on function public.start_quiz_attempt(uuid) to authenticated;

create or replace function public.submit_quiz_attempt(p_attempt uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	attempt public.course_quiz_attempts%rowtype;
	quiz public.course_quizzes%rowtype;
	question record;
	given integer;
	correct integer := 0;
	total integer := 0;
	percent integer;
	did_pass boolean;
	late boolean;
	review jsonb := '[]'::jsonb;
begin
	if auth.uid() is null then
		raise exception 'Sign in to submit a quiz.';
	end if;
	select * into attempt
	from public.course_quiz_attempts
	where id = p_attempt and user_id = auth.uid();
	if attempt.id is null or attempt.submitted_at is not null then
		raise exception 'That attempt is already finished.';
	end if;
	select * into quiz from public.course_quizzes where id = attempt.quiz_id;
	late := now() > attempt.started_at + make_interval(secs => quiz.time_limit_seconds + 30);
	if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
		p_answers := '[]'::jsonb;
	end if;
	for question in
		select position, prompt, choices, correct_index, explanation
		from public.course_quiz_questions
		where quiz_id = quiz.id
		order by position
	loop
		total := total + 1;
		given := null;
		if not late and jsonb_array_length(p_answers) >= question.position and jsonb_typeof(p_answers->(question.position - 1)) = 'number' then
			given := (p_answers->>(question.position - 1))::integer;
		end if;
		if given is not null and given = question.correct_index then
			correct := correct + 1;
		end if;
		review := review || jsonb_build_array(jsonb_build_object(
			'prompt', question.prompt,
			'choices', question.choices,
			'given', given,
			'correct_index', question.correct_index,
			'explanation', question.explanation,
			'right', given is not null and given = question.correct_index
		));
	end loop;
	percent := case when total = 0 then 0 else round(correct * 100.0 / total)::integer end;
	did_pass := percent >= quiz.pass_percent and not late;
	if late then
		correct := 0;
		percent := 0;
		did_pass := false;
	end if;
	update public.course_quiz_attempts
	set answers = p_answers,
		correct_count = correct,
		total_count = total,
		percent = percent,
		passed = did_pass,
		submitted_at = now()
	where id = attempt.id;
	return jsonb_build_object(
		'correct', correct,
		'total', total,
		'percent', percent,
		'passed', did_pass,
		'pass_percent', quiz.pass_percent,
		'late', late,
		'review', review
	);
end;
$$;

revoke all on function public.submit_quiz_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;

insert into public.course_quizzes (id, course_id, module_key, title, time_limit_seconds, pass_percent)
values ('6f5c1a20-7c3e-4b1a-9d44-2a6e8b0c11d3', 'bookkeeping', '3', 'Bank reconciliation', 600, 70)
on conflict (course_id, module_key) do nothing;

insert into public.course_quiz_questions (quiz_id, position, prompt, choices, correct_index, explanation)
select '6f5c1a20-7c3e-4b1a-9d44-2a6e8b0c11d3', seed.position, seed.prompt, seed.choices, seed.correct_index, seed.explanation
from (
	values
		(1, 'What is the main purpose of a bank reconciliation?', '["Match your cash book to your bank statement","Work out the profit for the year","Record sales to customers","Prepare staff payroll"]'::jsonb, 0, 'A reconciliation compares your own records with the bank''s, so you can find and explain any differences.'),
		(2, 'A cheque you have written that the bank has not yet paid is called:', '["A dishonoured cheque","An unpresented cheque","A direct debit","A bank charge"]'::jsonb, 1, 'Until the payee banks it, the money is still in your account even though your cash book shows it as paid.'),
		(3, 'Bank charges appear on the statement but not in your cash book. What should you do?', '["Ignore them until next year","Ask the bank to remove them","Record them in the cash book","Record them as sales"]'::jsonb, 2, 'The bank has already taken the money, so your cash book must be updated to match.'),
		(4, 'A deposit made late in the day shows in your cash book but not yet on the statement. This is called:', '["An overdraft","A standing order","An accrual","A deposit in transit"]'::jsonb, 3, 'The money is on its way and will appear on the statement in the next day or so.'),
		(5, 'After reconciling, your adjusted cash book balance should equal:', '["Last month''s balance","The adjusted bank statement balance","Total sales for the month","Zero"]'::jsonb, 1, 'When both sides agree after adjustments, the reconciliation is complete.')
) as seed(position, prompt, choices, correct_index, explanation)
where not exists (
	select 1 from public.course_quiz_questions
	where quiz_id = '6f5c1a20-7c3e-4b1a-9d44-2a6e8b0c11d3'
);

notify pgrst, 'reload schema';
