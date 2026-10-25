-- Modules belong to a curriculum topic and can carry an optional lesson video.

create table if not exists public.course_modules (
	id uuid primary key default gen_random_uuid(),
	course_id text not null references public.courses (id) on delete cascade,
	topic_id uuid not null references public.course_topics (id) on delete cascade,
	title text not null check (char_length(title) between 1 and 160),
	video_url text not null default '' check (video_url = '' or (char_length(video_url) between 8 and 500 and video_url ~* '^https?://')),
	position integer not null default 0,
	created_at timestamptz not null default now()
);

alter table public.course_modules enable row level security;

drop policy if exists "editors read modules" on public.course_modules;
create policy "editors read modules" on public.course_modules
	for select to authenticated using (public.can_edit_course(course_id));
drop policy if exists "students read modules" on public.course_modules;
create policy "students read modules" on public.course_modules
	for select to authenticated using (
		exists (
			select 1 from public.enrollments e
			where e.course_id = course_modules.course_id and e.user_id = auth.uid() and e.status = 'active'
		)
		or exists (
			select 1 from public.course_access a
			where a.course_id = course_modules.course_id and a.user_id = auth.uid()
		)
	);
drop policy if exists "editors add modules" on public.course_modules;
create policy "editors add modules" on public.course_modules
	for insert to authenticated with check (public.can_edit_course(course_id));
drop policy if exists "editors delete modules" on public.course_modules;
create policy "editors delete modules" on public.course_modules
	for delete to authenticated using (public.can_edit_course(course_id));

drop policy if exists "students read topics" on public.course_topics;
create policy "students read topics" on public.course_topics
	for select to authenticated using (
		exists (
			select 1 from public.enrollments e
			where e.course_id = course_topics.course_id and e.user_id = auth.uid() and e.status = 'active'
		)
		or exists (
			select 1 from public.course_access a
			where a.course_id = course_topics.course_id and a.user_id = auth.uid()
		)
	);

grant select, insert, delete on public.course_modules to authenticated;
