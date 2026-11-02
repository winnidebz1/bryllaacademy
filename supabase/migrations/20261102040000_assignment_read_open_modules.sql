drop policy if exists "students read unlocked course assignments" on public.course_assignments;
create policy "students read unlocked course assignments" on public.course_assignments
	for select to authenticated
	using (
		exists (
			select 1
			from public.course_module_unlocks
			where course_module_unlocks.course_id = course_assignments.course_id
				and course_module_unlocks.module_key = course_assignments.module_week::text
		)
	);
