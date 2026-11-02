-- Lesson videos and files belong to a module, and enrolled students can play them.

alter table public.course_files
	add column if not exists module_id uuid references public.course_modules (id) on delete cascade;

with ordered_files as (
	select id, course_id, kind,
		row_number() over (partition by course_id, kind order by created_at) as n
	from public.course_files
	where module_id is null
		and kind in ('video', 'material', 'study')
),
ordered_modules as (
	select modules.id, modules.course_id,
		row_number() over (partition by modules.course_id order by topics.position, modules.position, modules.created_at) as n
	from public.course_modules as modules
	join public.course_topics as topics on topics.id = modules.topic_id
)
update public.course_files as files
set module_id = ordered_modules.id
from ordered_files
join ordered_modules on ordered_modules.course_id = ordered_files.course_id and ordered_modules.n = ordered_files.n
where files.id = ordered_files.id;

drop policy if exists "students read course files" on public.course_files;
create policy "students read course files" on public.course_files
	for select to authenticated
	using (
		exists (
			select 1 from public.enrollments
			where enrollments.course_id = course_files.course_id
				and enrollments.user_id = auth.uid()
				and enrollments.status = 'active'
		)
		or exists (
			select 1 from public.course_access
			where course_access.course_id = course_files.course_id
				and course_access.user_id = auth.uid()
		)
	);

drop policy if exists "editors update modules" on public.course_modules;
create policy "editors update modules" on public.course_modules
	for update to authenticated
	using (public.can_edit_course(course_id))
	with check (public.can_edit_course(course_id));

grant update on public.course_modules to authenticated;

drop policy if exists "students read enrolled course media" on storage.objects;
create policy "students read enrolled course media" on storage.objects
	for select to authenticated
	using (
		bucket_id = 'course-media'
		and exists (
			select 1
			from public.course_files
			where course_files.storage_path = name
				and (
					exists (
						select 1 from public.enrollments
						where enrollments.course_id = course_files.course_id
							and enrollments.user_id = auth.uid()
							and enrollments.status = 'active'
					)
					or exists (
						select 1 from public.course_access
						where course_access.course_id = course_files.course_id
							and course_access.user_id = auth.uid()
					)
				)
		)
	);
