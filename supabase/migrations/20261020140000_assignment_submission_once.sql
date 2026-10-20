-- A student can submit each module assignment only once.
create unique index if not exists assignment_submissions_one_per_module
	on public.assignment_submissions (user_id, course_id, module_week);
