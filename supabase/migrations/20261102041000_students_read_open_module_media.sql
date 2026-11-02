create or replace function public.student_can_read_media(p_course text, p_module uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1
		from public.course_module_unlocks as opened
		where opened.course_id = p_course
			and (
				p_module is null
				or opened.module_key = (
					select modules.topic_id::text
					from public.course_modules as modules
					where modules.id = p_module
				)
				or opened.module_key = (
					select topics.position::text
					from public.course_modules as modules
					join public.course_topics as topics on topics.id = modules.topic_id
					where modules.id = p_module
				)
			)
	);
$$;

revoke all on function public.student_can_read_media(text, uuid) from public, anon;
grant execute on function public.student_can_read_media(text, uuid) to authenticated;

drop policy if exists "students read open module rows" on public.course_modules;
create policy "students read open module rows" on public.course_modules
	for select to authenticated
	using (public.student_can_read_media(course_id, id));

drop policy if exists "students read open module files" on public.course_files;
create policy "students read open module files" on public.course_files
	for select to authenticated
	using (public.student_can_read_media(course_id, module_id));

drop policy if exists "students read open lesson links" on public.course_video_links;
create policy "students read open lesson links" on public.course_video_links
	for select to authenticated
	using (public.student_can_read_media(course_id, null));

drop policy if exists "students read open course media" on storage.objects;
create policy "students read open course media" on storage.objects
	for select to authenticated
	using (
		bucket_id = 'course-media'
		and exists (
			select 1
			from public.course_files
			where course_files.storage_path = name
				and public.student_can_read_media(course_files.course_id, course_files.module_id)
		)
	);
