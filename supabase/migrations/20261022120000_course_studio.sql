-- Course drafts, private share links, media, topics, FAQs, and founder approval.
-- Prices stay in the currency the instructor chose. Visitor conversion uses a buffer.

alter table public.courses add column if not exists visibility text not null default 'public';
alter table public.courses add column if not exists approval_status text not null default 'approved';
alter table public.courses add column if not exists short_description text not null default '';
alter table public.courses add column if not exists description text not null default '';
alter table public.courses add column if not exists level text not null default '';
alter table public.courses add column if not exists price_amount numeric(12,2) not null default 0;
alter table public.courses add column if not exists share_code text;
alter table public.courses add column if not exists created_by uuid references auth.users (id);
alter table public.courses add column if not exists intro_video_url text not null default '';

update public.courses
set price_amount = round(price_minor / 100.0, 2)
where price_amount = 0 and price_minor > 0;

alter table public.courses drop constraint if exists courses_visibility_check;
alter table public.courses add constraint courses_visibility_check check (visibility in ('public', 'private'));
alter table public.courses drop constraint if exists courses_approval_check;
alter table public.courses add constraint courses_approval_check check (approval_status in ('draft', 'pending', 'approved', 'rejected'));
create unique index if not exists courses_share_code_idx on public.courses (share_code) where share_code is not null;

create table if not exists public.course_topics (
	id uuid primary key default gen_random_uuid(),
	course_id text not null references public.courses (id) on delete cascade,
	title text not null check (char_length(title) between 1 and 160),
	position integer not null default 0,
	created_at timestamptz not null default now()
);

create table if not exists public.course_faqs (
	id uuid primary key default gen_random_uuid(),
	course_id text not null references public.courses (id) on delete cascade,
	question text not null check (char_length(question) between 1 and 200),
	answer text not null check (char_length(answer) between 1 and 2000),
	enabled boolean not null default true,
	position integer not null default 0,
	created_at timestamptz not null default now()
);

create table if not exists public.course_files (
	id uuid primary key default gen_random_uuid(),
	course_id text not null references public.courses (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	kind text not null check (kind in ('thumbnail', 'video', 'material', 'study')),
	storage_path text not null,
	file_name text not null check (char_length(file_name) between 1 and 180),
	content_type text not null,
	size_bytes integer not null check (size_bytes > 0 and size_bytes <= 524288000),
	created_at timestamptz not null default now()
);

create table if not exists public.course_access (
	user_id uuid not null references auth.users (id) on delete cascade,
	course_id text not null references public.courses (id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (user_id, course_id)
);

create table if not exists public.academy_settings (
	key text primary key check (key in ('academy_name', 'support_email', 'inflation_percent', 'default_currency')),
	value text not null,
	updated_at timestamptz not null default now()
);

insert into public.academy_settings (key, value)
values
	('academy_name', 'Brylla Academy'),
	('support_email', 'hello@bryllaacademy.com'),
	('inflation_percent', '3'),
	('default_currency', 'GHS')
on conflict (key) do nothing;

alter table public.course_topics enable row level security;
alter table public.course_faqs enable row level security;
alter table public.course_files enable row level security;
alter table public.course_access enable row level security;
alter table public.academy_settings enable row level security;

create or replace function public.can_edit_course(p_course text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1
		from public.courses c
		join public.profiles p on p.id = auth.uid()
		where c.id = p_course
			and p.role in ('instructor', 'founder')
			and (p.role = 'founder' or c.created_by = auth.uid())
	);
$$;

revoke all on function public.can_edit_course(text) from public;
grant execute on function public.can_edit_course(text) to authenticated;

drop policy if exists "published courses are readable" on public.courses;
create policy "published courses are readable" on public.courses
	for select using (status = 'published' and visibility = 'public' and approval_status = 'approved');

drop policy if exists "staff read own courses" on public.courses;
create policy "staff read own courses" on public.courses
	for select to authenticated
	using (public.can_edit_course(id) or exists (
		select 1 from public.course_access a where a.course_id = courses.id and a.user_id = auth.uid()
	));

drop policy if exists "staff create draft courses" on public.courses;
create policy "staff create draft courses" on public.courses
	for insert to authenticated
	with check (
		created_by = auth.uid()
		and public.caller_is_staff()
		and status = 'draft'
		and approval_status = 'draft'
	);

drop policy if exists "staff update own drafts" on public.courses;
create policy "staff update own drafts" on public.courses
	for update to authenticated
	using (created_by = auth.uid() and public.caller_is_staff() and approval_status in ('draft', 'pending') and status = 'draft')
	with check (created_by = auth.uid() and approval_status in ('draft', 'pending') and status = 'draft');

drop policy if exists "editors read topics" on public.course_topics;
create policy "editors read topics" on public.course_topics
	for select to authenticated using (public.can_edit_course(course_id));
drop policy if exists "editors add topics" on public.course_topics;
create policy "editors add topics" on public.course_topics
	for insert to authenticated with check (public.can_edit_course(course_id));
drop policy if exists "editors delete topics" on public.course_topics;
create policy "editors delete topics" on public.course_topics
	for delete to authenticated using (public.can_edit_course(course_id));

drop policy if exists "editors read faqs" on public.course_faqs;
create policy "editors read faqs" on public.course_faqs
	for select to authenticated using (public.can_edit_course(course_id));
drop policy if exists "editors add faqs" on public.course_faqs;
create policy "editors add faqs" on public.course_faqs
	for insert to authenticated with check (public.can_edit_course(course_id));
drop policy if exists "editors delete faqs" on public.course_faqs;
create policy "editors delete faqs" on public.course_faqs
	for delete to authenticated using (public.can_edit_course(course_id));

drop policy if exists "editors read course files" on public.course_files;
create policy "editors read course files" on public.course_files
	for select to authenticated using (public.can_edit_course(course_id));
drop policy if exists "editors add course files" on public.course_files;
create policy "editors add course files" on public.course_files
	for insert to authenticated with check (public.can_edit_course(course_id) and user_id = auth.uid());
drop policy if exists "editors delete course files" on public.course_files;
create policy "editors delete course files" on public.course_files
	for delete to authenticated using (public.can_edit_course(course_id) and user_id = auth.uid());

drop policy if exists "students read own course access" on public.course_access;
create policy "students read own course access" on public.course_access
	for select to authenticated using (user_id = auth.uid());

grant select, insert, update on public.courses to authenticated;
grant select, insert, delete on public.course_topics to authenticated;
grant select, insert, delete on public.course_faqs to authenticated;
grant select, insert, delete on public.course_files to authenticated;
grant select on public.course_access to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('course-media', 'course-media', false, 524288000)
on conflict (id) do update
set public = false,
	file_size_limit = excluded.file_size_limit;

drop policy if exists "staff upload course media" on storage.objects;
create policy "staff upload course media" on storage.objects
	for insert to authenticated
	with check (
		bucket_id = 'course-media'
		and public.caller_is_staff()
		and (storage.foldername(name))[1] = auth.uid()::text
	);

drop policy if exists "staff read own course media" on storage.objects;
create policy "staff read own course media" on storage.objects
	for select to authenticated
	using (
		bucket_id = 'course-media'
		and (storage.foldername(name))[1] = auth.uid()::text
	);

drop policy if exists "staff delete own course media" on storage.objects;
create policy "staff delete own course media" on storage.objects
	for delete to authenticated
	using (
		bucket_id = 'course-media'
		and (storage.foldername(name))[1] = auth.uid()::text
	);

drop policy if exists "founders read course media" on storage.objects;
create policy "founders read course media" on storage.objects
	for select to authenticated
	using (bucket_id = 'course-media' and public.caller_is_staff());

create or replace function public.submit_course(p_course text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
	shared text;
begin
	if not public.can_edit_course(p_course) then
		raise exception 'not allowed';
	end if;
	update public.courses
	set approval_status = 'pending',
		status = 'draft',
		share_code = coalesce(share_code, encode(extensions.gen_random_bytes(9), 'hex'))
	where id = p_course
	returning share_code into shared;
	if shared is null then
		raise exception 'course not found';
	end if;
	return shared;
end;
$$;

revoke all on function public.submit_course(text) from public;
grant execute on function public.submit_course(text) to authenticated;

create or replace function public.founder_pending_courses()
returns table (id text, title text, visibility text, price_amount numeric, currency text, created_at timestamptz, share_code text)
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
	select c.id, c.title, c.visibility, c.price_amount, c.currency, c.created_at, c.share_code
	from public.courses c
	where c.approval_status = 'pending'
	order by c.created_at desc;
end;
$$;

revoke all on function public.founder_pending_courses() from public, anon;
grant execute on function public.founder_pending_courses() to authenticated;

create or replace function public.founder_review_course(p_course text, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	update public.courses
	set approval_status = case when p_approve then 'approved' else 'rejected' end,
		status = case when p_approve then 'published' else 'draft' end
	where id = p_course and approval_status = 'pending';
end;
$$;

revoke all on function public.founder_review_course(text, boolean) from public, anon;
grant execute on function public.founder_review_course(text, boolean) to authenticated;

create or replace function public.open_shared_course(p_code text)
returns table (id text, title text, short_description text, description text, level text, visibility text, price_amount numeric, currency text)
language plpgsql
security definer
set search_path = public
as $$
begin
	return query
	select c.id, c.title, c.short_description, c.description, c.level, c.visibility, c.price_amount, c.currency
	from public.courses c
	where c.share_code = p_code
		and c.approval_status in ('pending', 'approved');
end;
$$;

revoke all on function public.open_shared_course(text) from public;
grant execute on function public.open_shared_course(text) to anon, authenticated;

create or replace function public.claim_shared_course(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
	course_key text;
begin
	if auth.uid() is null then
		raise exception 'sign in to open this course';
	end if;
	select c.id into course_key from public.courses c
	where c.share_code = p_code and c.approval_status in ('pending', 'approved');
	if course_key is null then
		raise exception 'this course link is not valid';
	end if;
	insert into public.course_access (user_id, course_id)
	values (auth.uid(), course_key)
	on conflict do nothing;
	return course_key;
end;
$$;

revoke all on function public.claim_shared_course(text) from public;
grant execute on function public.claim_shared_course(text) to authenticated;

create or replace function public.founder_course_performance()
returns table (course_id text, title text, students integer, lessons_recorded integer, progress_percent integer)
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
	select
		c.id,
		c.title,
		count(distinct e.user_id)::integer,
		count(distinct p.item_id)::integer,
		case
			when count(distinct e.user_id) = 0 then 0
			else least(100, round(count(p.item_id)::numeric / count(distinct e.user_id)))::integer
		end
	from public.courses c
	left join public.enrollments e on e.course_id = c.id and e.status = 'active' and e.user_id is not null
	left join public.lesson_progress p on p.course_id = c.id and p.user_id = e.user_id
	where c.approval_status = 'approved' and c.status = 'published'
	group by c.id, c.title
	order by c.title;
end;
$$;

revoke all on function public.founder_course_performance() from public, anon;
grant execute on function public.founder_course_performance() to authenticated;

create or replace function public.founder_academy_counts()
returns table (active_courses integer, enrolled_students integer, enrolments integer)
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
	select
		(select count(*)::integer from public.courses where status = 'published' and approval_status = 'approved'),
		(select count(distinct user_id)::integer from public.enrollments where status = 'active' and user_id is not null),
		(select count(*)::integer from public.enrollments where status = 'active');
end;
$$;

revoke all on function public.founder_academy_counts() from public, anon;
grant execute on function public.founder_academy_counts() to authenticated;

create or replace function public.founder_list_instructors()
returns table (id uuid, full_name text, email text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
	if not exists (select 1 from public.profiles where profiles.id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	return query
	select p.id, coalesce(p.full_name, '')::text, coalesce(u.email::text, ''), p.created_at
	from public.profiles p
	join auth.users u on u.id = p.id
	where p.role = 'instructor'
	order by p.created_at desc;
end;
$$;

revoke all on function public.founder_list_instructors() from public, anon;
grant execute on function public.founder_list_instructors() to authenticated;

create or replace function public.founder_create_instructor(p_name text, p_email text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
	new_id uuid;
	clean_email text;
	clean_name text;
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	clean_email := lower(trim(coalesce(p_email, '')));
	clean_name := trim(coalesce(p_name, ''));
	if clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
		raise exception 'Enter a valid email address.';
	end if;
	if char_length(clean_name) < 2 or char_length(clean_name) > 120 then
		raise exception 'Enter the instructor name.';
	end if;
	if p_password is null or char_length(p_password) < 8 then
		raise exception 'Use a password of at least 8 characters.';
	end if;
	if exists (select 1 from auth.users where lower(email) = clean_email) then
		raise exception 'An account with this email already exists.';
	end if;
	new_id := gen_random_uuid();
	insert into auth.users (
		instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
		raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
		confirmation_token, recovery_token, email_change_token_new, email_change
	) values (
		'00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated', clean_email,
		crypt(p_password, gen_salt('bf')), now(),
		'{"provider":"email","providers":["email"]}'::jsonb,
		jsonb_build_object('full_name', clean_name), now(), now(), '', '', '', ''
	);
	insert into auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
	values (
		new_id, new_id,
		jsonb_build_object('sub', new_id::text, 'email', clean_email, 'email_verified', true),
		'email', new_id::text, now(), now()
	);
	insert into public.profiles (id, full_name, role) values (new_id, clean_name, 'instructor');
	return new_id;
end;
$$;

revoke all on function public.founder_create_instructor(text, text, text) from public, anon;
grant execute on function public.founder_create_instructor(text, text, text) to authenticated;

create or replace function public.post_audience_notice(
	p_audience text,
	p_title text,
	p_message text,
	p_key text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
	actor uuid := auth.uid();
	actor_role text;
	sent integer := 0;
	recipient record;
	notice_title text := trim(coalesce(p_title, ''));
	notice_body text := trim(coalesce(p_message, ''));
	source text;
begin
	if actor is null or not public.caller_is_staff() then
		raise exception 'not allowed';
	end if;
	select role into actor_role from public.profiles where id = actor;
	if p_audience not in ('students', 'instructors', 'both') then
		raise exception 'choose an audience';
	end if;
	if actor_role is distinct from 'founder' and p_audience is distinct from 'students' then
		raise exception 'instructors can notify students';
	end if;
	if p_key is null or p_key !~ '^[A-Za-z0-9:_-]{8,80}$' then
		raise exception 'idempotency key required';
	end if;
	if char_length(notice_title) < 1 or char_length(notice_body) < 1 then
		raise exception 'title and message are required';
	end if;
	source := 'announcement:' || p_key;
	for recipient in
		select p.id as user_id, p.role
		from public.profiles p
		where (p_audience = 'both' and p.role in ('student', 'instructor'))
			or (p_audience = 'students' and p.role = 'student')
			or (p_audience = 'instructors' and p.role = 'instructor')
	loop
		insert into public.notifications (user_id, type, title, message, destination_url, source_key, metadata)
		values (
			recipient.user_id,
			'announcement',
			left(notice_title, 140),
			left(notice_body, 2000),
			case when recipient.role = 'instructor' then 'instructor-dashboard' else 'student-dashboard' end,
			source,
			jsonb_build_object('sender_id', actor, 'audience', p_audience)
		)
		on conflict (user_id, source_key) do nothing;
		if found then
			sent := sent + 1;
		end if;
	end loop;
	return sent;
end;
$$;

revoke all on function public.post_audience_notice(text, text, text, text) from public, anon;
grant execute on function public.post_audience_notice(text, text, text, text) to authenticated;

create or replace function public.my_notifications()
returns table (id uuid, title text, message text, destination_url text, created_at timestamptz, read_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
	select n.id, n.title, n.message, n.destination_url, n.created_at, n.read_at
	from public.notifications n
	where n.user_id = auth.uid()
	order by n.created_at desc
	limit 30;
$$;

revoke all on function public.my_notifications() from public;
grant execute on function public.my_notifications() to authenticated;

create or replace function public.public_pricing_settings()
returns table (inflation_percent numeric, default_currency text)
language sql
stable
security definer
set search_path = public
as $$
	select
		coalesce((select value::numeric from public.academy_settings where key = 'inflation_percent'), 3),
		coalesce((select value from public.academy_settings where key = 'default_currency'), 'GHS');
$$;

revoke all on function public.public_pricing_settings() from public;
grant execute on function public.public_pricing_settings() to anon, authenticated;

create or replace function public.founder_settings()
returns table (key text, value text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	return query select s.key, s.value from public.academy_settings s order by s.key;
end;
$$;

revoke all on function public.founder_settings() from public, anon;
grant execute on function public.founder_settings() to authenticated;

create or replace function public.founder_save_setting(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	if p_key not in ('academy_name', 'support_email', 'inflation_percent', 'default_currency') then
		raise exception 'unknown setting';
	end if;
	if p_key = 'inflation_percent' and (p_value !~ '^[0-9]{1,2}(\.[0-9])?$' or p_value::numeric > 25) then
		raise exception 'inflation must be from 0 to 25';
	end if;
	insert into public.academy_settings (key, value, updated_at)
	values (p_key, left(trim(p_value), 160), now())
	on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

revoke all on function public.founder_save_setting(text, text) from public, anon;
grant execute on function public.founder_save_setting(text, text) to authenticated;
