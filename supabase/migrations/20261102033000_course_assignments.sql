-- Assignments saved by an instructor are readable by enrolled students.

create table if not exists public.course_assignments (
	id uuid primary key default gen_random_uuid(),
	course_id text not null references public.courses (id) on delete cascade,
	module_week integer not null check (module_week between 1 and 52),
	kind text not null check (kind in ('instructions', 'assignment')),
	title text not null default '',
	instructions text not null default '',
	due_at timestamptz,
	marks integer,
	updated_at timestamptz not null default now(),
	constraint course_assignments_title_length check (char_length(title) <= 160),
	constraint course_assignments_instructions_length check (char_length(instructions) <= 4000)
);

create unique index if not exists course_assignments_one_instruction
	on public.course_assignments (course_id, module_week)
	where kind = 'instructions';

alter table public.course_assignments enable row level security;

drop policy if exists "staff manage course assignments" on public.course_assignments;
create policy "staff manage course assignments" on public.course_assignments
	for all to authenticated
	using (public.caller_is_staff())
	with check (public.caller_is_staff());

drop policy if exists "students read course assignments" on public.course_assignments;
create policy "students read course assignments" on public.course_assignments
	for select to authenticated
	using (
		exists (
			select 1 from public.enrollments
			where enrollments.course_id = course_assignments.course_id
				and enrollments.user_id = auth.uid()
				and enrollments.status = 'active'
		)
		or exists (
			select 1 from public.course_access
			where course_access.course_id = course_assignments.course_id
				and course_access.user_id = auth.uid()
		)
	);

grant select, insert, update, delete on public.course_assignments to authenticated;
