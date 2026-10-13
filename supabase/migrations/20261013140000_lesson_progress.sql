-- Lesson progress is stored per student so it follows them across devices.

alter table public.enrollments add column if not exists started_at timestamptz;

create table if not exists public.lesson_progress (
	user_id uuid not null references auth.users (id) on delete cascade,
	course_id text not null references public.courses (id),
	item_id text not null check (item_id ~ '^w[0-9]+(l[0-9]+|live)$'),
	kind text not null check (kind in ('lesson', 'live')),
	completed_at timestamptz not null default now(),
	primary key (user_id, course_id, item_id),
	check ((kind = 'live') = (item_id like '%live'))
);

alter table public.lesson_progress enable row level security;

revoke all on public.lesson_progress from anon;
grant select, insert on public.lesson_progress to authenticated;

drop policy if exists "students read own progress" on public.lesson_progress;
create policy "students read own progress" on public.lesson_progress
	for select using (auth.uid() = user_id);

drop policy if exists "enrolled students record own progress" on public.lesson_progress;
create policy "enrolled students record own progress" on public.lesson_progress
	for insert with check (
		auth.uid() = user_id
		and exists (
			select 1 from public.enrollments e
			where e.user_id = auth.uid() and e.course_id = lesson_progress.course_id
		)
	);

-- Students cannot update enrolments directly, so starting a course goes through this function.
create or replace function public.start_course(p_course text)
returns void
language sql
security definer
set search_path = public
as $$
	update public.enrollments
	set started_at = now()
	where user_id = auth.uid() and course_id = p_course and started_at is null;
$$;

revoke execute on function public.start_course(text) from public, anon;
grant execute on function public.start_course(text) to authenticated;
