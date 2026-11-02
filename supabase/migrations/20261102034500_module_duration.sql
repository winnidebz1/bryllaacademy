alter table public.course_modules
	add column if not exists duration_seconds integer;

alter table public.course_modules
	drop constraint if exists course_modules_duration_seconds_check;

alter table public.course_modules
	add constraint course_modules_duration_seconds_check
	check (duration_seconds is null or duration_seconds between 1 and 86400);
