-- Students can submit more than one file for a module assignment.
-- Instructors and founders can read those submissions.

create table if not exists public.assignment_submissions (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	course_id text not null references public.courses (id),
	module_week integer not null check (module_week between 1 and 12),
	student_name text not null default '',
	note text not null default '',
	created_at timestamptz not null default now(),
	constraint assignment_submissions_note_length check (char_length(note) <= 2000),
	constraint assignment_submissions_name_length check (char_length(student_name) <= 120)
);

create table if not exists public.assignment_files (
	id uuid primary key default gen_random_uuid(),
	submission_id uuid not null references public.assignment_submissions (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	storage_path text not null,
	file_name text not null,
	content_type text not null,
	size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
	created_at timestamptz not null default now(),
	constraint assignment_files_name_length check (char_length(file_name) between 1 and 180),
	constraint assignment_files_type check (content_type in ('image/jpeg', 'application/pdf'))
);

create index if not exists assignment_submissions_course_idx
	on public.assignment_submissions (course_id, module_week, created_at desc);
create unique index if not exists assignment_submissions_one_per_module
	on public.assignment_submissions (user_id, course_id, module_week);
create index if not exists assignment_files_submission_idx
	on public.assignment_files (submission_id);

create or replace function public.assignment_file_matches_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
	if not exists (
		select 1 from public.assignment_submissions
		where id = new.submission_id and user_id = new.user_id
	) then
		raise exception 'file does not match submission';
	end if;
	return new;
end;
$$;

drop trigger if exists assignment_file_matches_owner on public.assignment_files;
create trigger assignment_file_matches_owner
	before insert on public.assignment_files
	for each row execute function public.assignment_file_matches_owner();

alter table public.assignment_submissions enable row level security;
alter table public.assignment_files enable row level security;

drop policy if exists "students read own assignment submissions" on public.assignment_submissions;
create policy "students read own assignment submissions" on public.assignment_submissions
	for select using (auth.uid() = user_id);

drop policy if exists "enrolled students submit assignments" on public.assignment_submissions;
create policy "enrolled students submit assignments" on public.assignment_submissions
	for insert with check (
		auth.uid() = user_id
		and exists (
			select 1 from public.enrollments
			where user_id = auth.uid()
				and course_id = assignment_submissions.course_id
				and status = 'active'
		)
	);

drop policy if exists "students delete own assignment submissions" on public.assignment_submissions;
create policy "students delete own assignment submissions" on public.assignment_submissions
	for delete using (auth.uid() = user_id);

drop policy if exists "staff read assignment submissions" on public.assignment_submissions;
create policy "staff read assignment submissions" on public.assignment_submissions
	for select using (public.caller_is_staff());

drop policy if exists "students read own assignment files" on public.assignment_files;
create policy "students read own assignment files" on public.assignment_files
	for select using (auth.uid() = user_id);

drop policy if exists "students add own assignment files" on public.assignment_files;
create policy "students add own assignment files" on public.assignment_files
	for insert with check (auth.uid() = user_id);

drop policy if exists "students delete own assignment files" on public.assignment_files;
create policy "students delete own assignment files" on public.assignment_files
	for delete using (auth.uid() = user_id);

drop policy if exists "staff read assignment files" on public.assignment_files;
create policy "staff read assignment files" on public.assignment_files
	for select using (public.caller_is_staff());

revoke all on public.assignment_submissions from public, anon, authenticated;
revoke all on public.assignment_files from public, anon, authenticated;
grant select, insert, delete on public.assignment_submissions to authenticated;
grant select, insert, delete on public.assignment_files to authenticated;

create or replace function public.staff_assignment_submissions()
returns table (
	id uuid,
	user_id uuid,
	student_name text,
	course_id text,
	module_week integer,
	note text,
	created_at timestamptz,
	files jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
	if not public.caller_is_staff() then
		raise exception 'not allowed';
	end if;
	return query
	select
		s.id,
		s.user_id,
		s.student_name,
		s.course_id,
		s.module_week,
		s.note,
		s.created_at,
		coalesce((
			select jsonb_agg(jsonb_build_object(
				'file_name', f.file_name,
				'storage_path', f.storage_path,
				'content_type', f.content_type,
				'size_bytes', f.size_bytes
			) order by f.created_at)
			from public.assignment_files f
			where f.submission_id = s.id
		), '[]'::jsonb)
	from public.assignment_submissions s
	order by s.created_at desc;
end;
$$;

revoke all on function public.staff_assignment_submissions() from public, anon;
grant execute on function public.staff_assignment_submissions() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assignment-files', 'assignment-files', false, 10485760, array['image/jpeg', 'application/pdf']::text[])
on conflict (id) do update
set public = false,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "students upload own assignment files" on storage.objects;
create policy "students upload own assignment files" on storage.objects
	for insert to authenticated
	with check (
		bucket_id = 'assignment-files'
		and (storage.foldername(name))[1] = auth.uid()::text
	);

drop policy if exists "students read own assignment objects" on storage.objects;
create policy "students read own assignment objects" on storage.objects
	for select to authenticated
	using (
		bucket_id = 'assignment-files'
		and (storage.foldername(name))[1] = auth.uid()::text
	);

drop policy if exists "students delete own assignment objects" on storage.objects;
create policy "students delete own assignment objects" on storage.objects
	for delete to authenticated
	using (
		bucket_id = 'assignment-files'
		and (storage.foldername(name))[1] = auth.uid()::text
	);

drop policy if exists "staff read assignment objects" on storage.objects;
create policy "staff read assignment objects" on storage.objects
	for select to authenticated
	using (
		bucket_id = 'assignment-files'
		and public.caller_is_staff()
	);
