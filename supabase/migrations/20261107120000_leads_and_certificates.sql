-- Restore Project Management, own the lead records, and issue course certificates.

insert into public.courses (
	id, title, price_minor, currency, status, visibility, approval_status, short_description, description
) values (
	'project-management',
	'Project Management',
	0,
	'GHS',
	'coming_soon',
	'public',
	'approved',
	'Plan projects, organize tasks, manage timelines, and track progress.',
	'Learn the fundamentals of project management, including how to plan projects, organize tasks, manage timelines, coordinate teams, and track progress.'
)
on conflict (id) do update
set title = excluded.title,
	status = 'coming_soon',
	visibility = 'public',
	approval_status = 'approved',
	short_description = excluded.short_description,
	description = case
		when coalesce(btrim(public.courses.description), '') = '' then excluded.description
		else public.courses.description
	end;

create table if not exists public.contacts (
	id uuid primary key default gen_random_uuid(),
	full_name text not null,
	email text not null,
	normalized_email text not null unique,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	marketing_consent boolean not null default false,
	consent_timestamp timestamptz,
	consent_source text,
	unsubscribe_status boolean not null default false
);

create table if not exists public.freebies (
	id text primary key,
	title text not null,
	slug text not null unique,
	description text not null default '',
	cover_image text not null default '',
	file_location text not null,
	category text not null default 'guide',
	is_active boolean not null default true,
	created_at timestamptz not null default now()
);

create table if not exists public.freebie_downloads (
	id uuid primary key default gen_random_uuid(),
	student_id uuid not null references public.contacts (id) on delete cascade,
	freebie_id text not null references public.freebies (id),
	downloaded_at timestamptz not null default now(),
	signup_source text not null default 'website'
);

create unique index if not exists freebie_downloads_once
	on public.freebie_downloads (student_id, freebie_id);

alter table public.course_waitlist
	add column if not exists student_id uuid references public.contacts (id),
	add column if not exists marketing_consent boolean not null default false,
	add column if not exists consent_timestamp timestamptz,
	add column if not exists status text not null default 'active';

create table if not exists public.email_provider_sync (
	id uuid primary key default gen_random_uuid(),
	student_id uuid not null references public.contacts (id) on delete cascade,
	provider text not null default 'resend',
	external_contact_id text,
	sync_status text not null default 'pending',
	last_sync_attempt timestamptz,
	last_synced_at timestamptz,
	error_message text,
	unique (student_id, provider)
);

create table if not exists public.lead_attempts (
	id uuid primary key default gen_random_uuid(),
	normalized_email text not null,
	kind text not null,
	created_at timestamptz not null default now()
);

create index if not exists lead_attempts_email_time on public.lead_attempts (normalized_email, created_at desc);

create table if not exists public.course_results (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	course_id text not null references public.courses (id),
	result text not null check (result in ('passed', 'failed')),
	completion_date date,
	updated_by uuid references auth.users (id),
	updated_at timestamptz not null default now(),
	unique (user_id, course_id)
);

create table if not exists public.certificate_templates (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	image_path text not null,
	fields jsonb not null default '{}'::jsonb,
	is_active boolean not null default true,
	created_at timestamptz not null default now()
);

create table if not exists public.certificates (
	id uuid primary key default gen_random_uuid(),
	certificate_number text not null unique,
	user_id uuid not null references auth.users (id),
	course_id text not null references public.courses (id),
	template_id uuid references public.certificate_templates (id),
	display_name text not null,
	course_title text not null,
	issue_date date not null,
	completion_date date,
	status text not null default 'issued' check (status in ('issued', 'revoked', 'replaced')),
	issued_by uuid references auth.users (id),
	created_at timestamptz not null default now()
);

create unique index if not exists certificates_one_issued
	on public.certificates (user_id, course_id)
	where status = 'issued';

create table if not exists public.certificate_events (
	id uuid primary key default gen_random_uuid(),
	certificate_id uuid not null references public.certificates (id) on delete cascade,
	action text not null,
	reason text,
	actor_id uuid references auth.users (id),
	created_at timestamptz not null default now()
);

insert into public.freebies (id, title, slug, description, cover_image, file_location, category, is_active)
values
	(
		'linkedin-profile-guide',
		'Free LinkedIn Profile Optimization Guide',
		'linkedin-profile-guide',
		'Write a LinkedIn profile that shows your skills, experience, and the work you want.',
		'assets/img/logo.png',
		'assets/resources/linkedin-profile-optimization-guide.html',
		'career',
		true
	),
	(
		'client-readiness-checklist',
		'Client Readiness Checklist',
		'client-readiness-checklist',
		'A checklist to help you prepare for client work and remote professional delivery.',
		'assets/img/logo.png',
		'assets/resources/Client-Readiness-Checklist.pdf',
		'career',
		true
	),
	(
		'job-boards-and-platforms',
		'Job Boards and Platforms',
		'job-boards-and-platforms',
		'A guide to job boards and platforms used for remote work search.',
		'assets/img/logo.png',
		'assets/resources/Job-Boards-and-Platforms.pdf',
		'career',
		true
	),
	(
		'linkedin-optimisation-guide-pdf',
		'LinkedIn Optimisation Guide',
		'linkedin-optimisation-guide-pdf',
		'A printable LinkedIn optimisation guide.',
		'assets/img/logo.png',
		'assets/resources/LinkedIn-Optimisation-Guide.pdf',
		'career',
		true
	)
on conflict (id) do update
set title = excluded.title,
	description = excluded.description,
	file_location = excluded.file_location,
	is_active = true;

insert into public.certificate_templates (id, name, image_path, fields, is_active)
select
	'8c1f0d2a-4b33-4a1e-9c77-2d6b1f0a9c11'::uuid,
	'Brylla Academy certificate of graduation',
	'assets/img/certificates/brylla-certificate.jpg',
	jsonb_build_object(
		'student_name', jsonb_build_object('x', 0.5, 'y', 0.48, 'size', 42, 'color', '#13b8ad'),
		'course_title', jsonb_build_object('x', 0.5, 'y', 0.58, 'size', 22, 'color', '#13b8ad'),
		'issue_date', jsonb_build_object('x', 0.78, 'y', 0.78, 'size', 16, 'color', '#122d49'),
		'certificate_number', jsonb_build_object('x', 0.5, 'y', 0.92, 'size', 12, 'color', '#60748a')
	),
	true
where not exists (select 1 from public.certificate_templates);

do $$
declare
	item record;
begin
	for item in
		select conname from pg_constraint
		where conrelid = 'public.academy_settings'::regclass and contype = 'c'
	loop
		execute 'alter table public.academy_settings drop constraint ' || quote_ident(item.conname);
	end loop;
end $$;
alter table public.academy_settings add constraint academy_settings_key_check
	check (key in ('academy_name', 'support_email', 'inflation_percent', 'default_currency', 'email_provider'));

insert into public.academy_settings (key, value, updated_at)
values ('email_provider', 'resend', now())
on conflict (key) do nothing;

alter table public.contacts enable row level security;
alter table public.freebies enable row level security;
alter table public.freebie_downloads enable row level security;
alter table public.email_provider_sync enable row level security;
alter table public.lead_attempts enable row level security;
alter table public.course_results enable row level security;
alter table public.certificate_templates enable row level security;
alter table public.certificates enable row level security;
alter table public.certificate_events enable row level security;

drop policy if exists "public read active freebies" on public.freebies;
create policy "public read active freebies" on public.freebies
	for select to anon, authenticated
	using (is_active = true);

drop policy if exists "founder read contacts" on public.contacts;
create policy "founder read contacts" on public.contacts
	for select to authenticated
	using (exists (select 1 from public.profiles where id = auth.uid() and role = 'founder'));

drop policy if exists "founder read downloads" on public.freebie_downloads;
create policy "founder read downloads" on public.freebie_downloads
	for select to authenticated
	using (exists (select 1 from public.profiles where id = auth.uid() and role = 'founder'));

drop policy if exists "founder read email sync" on public.email_provider_sync;
create policy "founder read email sync" on public.email_provider_sync
	for select to authenticated
	using (exists (select 1 from public.profiles where id = auth.uid() and role = 'founder'));

drop policy if exists "staff read certificates" on public.certificates;
create policy "staff read certificates" on public.certificates
	for select to authenticated
	using (
		user_id = auth.uid()
		or exists (select 1 from public.profiles where id = auth.uid() and role in ('founder', 'instructor'))
	);

drop policy if exists "public read active templates" on public.certificate_templates;
create policy "public read active templates" on public.certificate_templates
	for select to anon, authenticated
	using (is_active = true);

grant select on public.freebies to anon, authenticated;
grant select on public.contacts to authenticated;
grant select on public.freebie_downloads to authenticated;
grant select on public.email_provider_sync to authenticated;
grant select on public.certificates to authenticated;
grant select on public.certificate_templates to anon, authenticated;

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
	if p_key not in ('academy_name', 'support_email', 'inflation_percent', 'default_currency', 'email_provider') then
		raise exception 'unknown setting';
	end if;
	if p_key = 'email_provider' and p_value not in ('resend', 'mailerlite', 'kit', 'brevo') then
		raise exception 'Choose resend, mailerlite, kit, or brevo.';
	end if;
	insert into public.academy_settings (key, value, updated_at)
	values (p_key, left(trim(p_value), 160), now())
	on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

create or replace function public.submit_lead(
	p_kind text,
	p_full_name text,
	p_email text,
	p_consent boolean,
	p_course text default null,
	p_freebie text default null,
	p_source text default 'website',
	p_honeypot text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	clean_name text := btrim(coalesce(p_full_name, ''));
	clean_email text := lower(btrim(coalesce(p_email, '')));
	contact_row public.contacts;
	freebie_row public.freebies;
	download_url text := '';
	already boolean := false;
begin
	if coalesce(btrim(p_honeypot), '') <> '' then
		return jsonb_build_object('ok', true, 'ignored', true, 'message', 'Thank you.');
	end if;
	if p_kind not in ('waitlist', 'freebie') then
		return jsonb_build_object('ok', false, 'error', 'Choose a waitlist or a free resource.');
	end if;
	if char_length(clean_name) < 2 or char_length(clean_name) > 120 then
		return jsonb_build_object('ok', false, 'error', 'Enter your full name.');
	end if;
	if clean_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
		return jsonb_build_object('ok', false, 'error', 'Enter a valid email address.');
	end if;
	if (
		select count(*) from public.lead_attempts
		where normalized_email = clean_email and created_at > now() - interval '1 hour'
	) >= 8 then
		return jsonb_build_object('ok', false, 'error', 'Too many attempts. Try again later.');
	end if;
	insert into public.lead_attempts (normalized_email, kind) values (clean_email, p_kind);

	insert into public.contacts (full_name, email, normalized_email, marketing_consent, consent_timestamp, consent_source)
	values (
		clean_name,
		clean_email,
		clean_email,
		false,
		null,
		null
	)
	on conflict (normalized_email) do update
		set full_name = excluded.full_name,
			updated_at = now()
	returning * into contact_row;

	select * into contact_row from public.contacts where normalized_email = clean_email;
	if p_consent and contact_row.unsubscribe_status is not true then
		update public.contacts
		set marketing_consent = true,
			consent_timestamp = coalesce(consent_timestamp, now()),
			consent_source = coalesce(consent_source, p_source),
			updated_at = now()
		where id = contact_row.id
		returning * into contact_row;
	end if;

	if p_kind = 'waitlist' then
		if p_course is null or not public.course_is_waitlist_open(p_course) then
			return jsonb_build_object('ok', false, 'error', 'This waitlist is not open.');
		end if;
		insert into public.course_waitlist (
			course_id, full_name, email, student_id, marketing_consent, consent_timestamp, status
		) values (
			p_course, clean_name, clean_email, contact_row.id, contact_row.marketing_consent, contact_row.consent_timestamp, 'active'
		)
		on conflict (course_id, email) do nothing;
		if not found then already := true; end if;
	else
		select * into freebie_row from public.freebies where (id = p_freebie or slug = p_freebie) and is_active = true;
		if freebie_row.id is null then
			return jsonb_build_object('ok', false, 'error', 'That resource is not available.');
		end if;
		insert into public.freebie_downloads (student_id, freebie_id, signup_source)
		values (contact_row.id, freebie_row.id, coalesce(nullif(p_source, ''), 'website'))
		on conflict (student_id, freebie_id) do update set downloaded_at = now();
		download_url := freebie_row.file_location;
	end if;

	insert into public.email_provider_sync (student_id, provider, sync_status)
	values (contact_row.id, coalesce((select value from public.academy_settings where key = 'email_provider'), 'resend'), 'pending')
	on conflict (student_id, provider) do update set sync_status = case
		when public.email_provider_sync.sync_status = 'synced' then 'synced'
		else 'pending'
	end;

	return jsonb_build_object(
		'ok', true,
		'duplicate', already,
		'download_url', download_url,
		'contact_id', contact_row.id,
		'marketing_consent', contact_row.marketing_consent,
		'unsubscribed', contact_row.unsubscribe_status,
		'message', case
			when p_kind = 'waitlist' and already then 'You are already on this waitlist.'
			when p_kind = 'waitlist' then 'You are on the waitlist. We will email you when the course opens.'
			else 'Your download is starting.'
		end
	);
end;
$$;

revoke all on function public.submit_lead(text, text, text, boolean, text, text, text, text) from public;
grant execute on function public.submit_lead(text, text, text, boolean, text, text, text, text) to anon, authenticated;

create or replace function public.public_freebies()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
	select coalesce(jsonb_agg(jsonb_build_object(
		'id', f.id,
		'title', f.title,
		'slug', f.slug,
		'description', f.description,
		'cover_image', f.cover_image,
		'category', f.category,
		'signup_count', (select count(*) from public.freebie_downloads d where d.freebie_id = f.id)
	) order by f.title), '[]'::jsonb)
	from public.freebies f
	where f.is_active = true;
$$;

revoke all on function public.public_freebies() from public;
grant execute on function public.public_freebies() to anon, authenticated;

create or replace function public.record_email_sync(
	p_contact uuid,
	p_provider text,
	p_status text,
	p_external text,
	p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into public.email_provider_sync (
		student_id, provider, sync_status, external_contact_id, last_sync_attempt, last_synced_at, error_message
	) values (
		p_contact,
		p_provider,
		p_status,
		p_external,
		now(),
		case when p_status = 'synced' then now() else null end,
		p_error
	)
	on conflict (student_id, provider) do update
		set sync_status = excluded.sync_status,
			external_contact_id = coalesce(excluded.external_contact_id, public.email_provider_sync.external_contact_id),
			last_sync_attempt = now(),
			last_synced_at = case when excluded.sync_status = 'synced' then now() else public.email_provider_sync.last_synced_at end,
			error_message = excluded.error_message;
end;
$$;

revoke all on function public.record_email_sync(uuid, text, text, text, text) from public;
grant execute on function public.record_email_sync(uuid, text, text, text, text) to service_role;

create or replace function public.founder_contacts(
	p_query text default '',
	p_kind text default 'all',
	p_course text default '',
	p_freebie text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	return coalesce((
		select jsonb_agg(row_to_json(item))
		from (
			select
				c.id,
				c.full_name,
				c.email,
				c.created_at,
				c.marketing_consent,
				c.consent_timestamp,
				c.unsubscribe_status,
				coalesce((
					select jsonb_agg(jsonb_build_object('course_id', w.course_id, 'joined_at', w.created_at))
					from public.course_waitlist w where w.student_id = c.id or lower(w.email) = c.normalized_email
				), '[]'::jsonb) as waitlists,
				coalesce((
					select jsonb_agg(jsonb_build_object('freebie_id', d.freebie_id, 'downloaded_at', d.downloaded_at))
					from public.freebie_downloads d where d.student_id = c.id
				), '[]'::jsonb) as downloads,
				s.sync_status,
				s.provider,
				s.last_synced_at,
				s.error_message
			from public.contacts c
			left join public.email_provider_sync s on s.student_id = c.id
			where (
				p_query = ''
				or c.full_name ilike '%' || p_query || '%'
				or c.email ilike '%' || p_query || '%'
			)
			and (
				p_kind = 'all'
				or (p_kind = 'waitlist' and exists (
					select 1 from public.course_waitlist w
					where (w.student_id = c.id or lower(w.email) = c.normalized_email)
						and (p_course = '' or w.course_id = p_course)
				))
				or (p_kind = 'freebie' and exists (
					select 1 from public.freebie_downloads d
					where d.student_id = c.id
						and (p_freebie = '' or d.freebie_id = p_freebie)
				))
			)
			order by c.created_at desc
		) item
	), '[]'::jsonb);
end;
$$;

revoke all on function public.founder_contacts(text, text, text, text) from public, anon;
grant execute on function public.founder_contacts(text, text, text, text) to authenticated;

create or replace function public.founder_lead_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	return jsonb_build_object(
		'contacts', (select count(*) from public.contacts),
		'waitlist', (select count(*) from public.course_waitlist),
		'downloads', (select count(*) from public.freebie_downloads),
		'freebies', (
			select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'title', f.title, 'count', (
				select count(*) from public.freebie_downloads d where d.freebie_id = f.id
			))), '[]'::jsonb) from public.freebies f
		),
		'courses', (
			select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'count', (
				select count(*) from public.course_waitlist w where w.course_id = c.id
			))), '[]'::jsonb) from public.courses c where c.status = 'coming_soon'
		)
	);
end;
$$;

revoke all on function public.founder_lead_stats() from public, anon;
grant execute on function public.founder_lead_stats() to authenticated;

create or replace function public.unsubscribe_contact(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	clean_email text := lower(btrim(coalesce(p_email, '')));
begin
	if clean_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
		return jsonb_build_object('ok', false, 'error', 'Enter a valid email address.');
	end if;
	update public.contacts
	set unsubscribe_status = true,
		marketing_consent = false,
		updated_at = now()
	where normalized_email = clean_email;
	return jsonb_build_object('ok', true, 'message', 'You will not be added to marketing messages.');
end;
$$;

revoke all on function public.unsubscribe_contact(text) from public;
grant execute on function public.unsubscribe_contact(text) to anon, authenticated;

create or replace function public.founder_certificate_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role in ('founder', 'instructor')) then
		raise exception 'not allowed';
	end if;
	return coalesce((
		select jsonb_agg(row_to_json(item))
		from (
			select
				p.id as user_id,
				coalesce(p.full_name, u.email) as student_name,
				u.email,
				e.course_id,
				c.title as course_title,
				e.created_at as enrolled_at,
				coalesce((
					select round(avg(a.percent)::numeric, 1)
					from public.course_quiz_attempts a
					join public.course_quizzes q on q.id = a.quiz_id
					where a.user_id = p.id and q.course_id = e.course_id and a.submitted_at is not null
				), 0) as assessment_score,
				coalesce((
					select round(avg(q.pass_percent)::numeric, 1)
					from public.course_quizzes q
					where q.course_id = e.course_id
				), 70) as pass_mark,
				r.result as result_override,
				r.completion_date,
				cert.certificate_number,
				cert.status as certificate_status,
				cert.issue_date,
				cert.display_name,
				cert.id as certificate_id
			from public.enrollments e
			join public.profiles p on p.id = e.user_id
			join auth.users u on u.id = p.id
			join public.courses c on c.id = e.course_id
			left join public.course_results r on r.user_id = p.id and r.course_id = e.course_id
			left join public.certificates cert on cert.user_id = p.id and cert.course_id = e.course_id and cert.status = 'issued'
			where e.status = 'active' and p.role = 'student'
			order by coalesce(p.full_name, u.email)
		) item
	), '[]'::jsonb);
end;
$$;

revoke all on function public.founder_certificate_board() from public, anon;
grant execute on function public.founder_certificate_board() to authenticated;

create or replace function public.founder_set_course_result(
	p_user uuid,
	p_course text,
	p_result text,
	p_completion date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	if p_result not in ('passed', 'failed') then
		raise exception 'Choose passed or failed.';
	end if;
	insert into public.course_results (user_id, course_id, result, completion_date, updated_by)
	values (p_user, p_course, p_result, p_completion, auth.uid())
	on conflict (user_id, course_id) do update
		set result = excluded.result,
			completion_date = excluded.completion_date,
			updated_by = auth.uid(),
			updated_at = now();
end;
$$;

revoke all on function public.founder_set_course_result(uuid, text, text, date) from public, anon;
grant execute on function public.founder_set_course_result(uuid, text, text, date) to authenticated;

create or replace function public.founder_issue_certificate(
	p_user uuid,
	p_course text,
	p_display_name text,
	p_course_title text,
	p_issue_date date,
	p_completion date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	result_row public.course_results;
	template_row public.certificate_templates;
	existing public.certificates;
	new_cert public.certificates;
	number_text text;
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	select * into result_row from public.course_results where user_id = p_user and course_id = p_course;
	if result_row.result is distinct from 'passed' then
		raise exception 'Only a student marked as passed can receive a certificate.';
	end if;
	select * into existing from public.certificates where user_id = p_user and course_id = p_course and status = 'issued';
	if existing.id is not null then
		raise exception 'A certificate has already been issued for this student and course.';
	end if;
	select * into template_row from public.certificate_templates where is_active = true order by created_at limit 1;
	number_text := 'BRY-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
	insert into public.certificates (
		certificate_number, user_id, course_id, template_id, display_name, course_title, issue_date, completion_date, status, issued_by
	) values (
		number_text,
		p_user,
		p_course,
		template_row.id,
		btrim(p_display_name),
		btrim(p_course_title),
		coalesce(p_issue_date, current_date),
		p_completion,
		'issued',
		auth.uid()
	) returning * into new_cert;
	insert into public.certificate_events (certificate_id, action, actor_id)
	values (new_cert.id, 'issued', auth.uid());
	return to_jsonb(new_cert);
end;
$$;

revoke all on function public.founder_issue_certificate(uuid, text, text, text, date, date) from public, anon;
grant execute on function public.founder_issue_certificate(uuid, text, text, text, date, date) to authenticated;

create or replace function public.founder_revoke_certificate(p_certificate uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	update public.certificates set status = 'revoked' where id = p_certificate and status = 'issued';
	insert into public.certificate_events (certificate_id, action, reason, actor_id)
	values (p_certificate, 'revoked', left(btrim(coalesce(p_reason, '')), 240), auth.uid());
end;
$$;

revoke all on function public.founder_revoke_certificate(uuid, text) from public, anon;
grant execute on function public.founder_revoke_certificate(uuid, text) to authenticated;

create or replace function public.founder_reissue_certificate(
	p_certificate uuid,
	p_display_name text,
	p_course_title text,
	p_issue_date date,
	p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	old_cert public.certificates;
	new_cert jsonb;
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	select * into old_cert from public.certificates where id = p_certificate;
	if old_cert.id is null then raise exception 'Certificate not found.'; end if;
	update public.certificates set status = 'replaced' where id = old_cert.id and status = 'issued';
	insert into public.certificate_events (certificate_id, action, reason, actor_id)
	values (old_cert.id, 'replaced', left(btrim(coalesce(p_reason, '')), 240), auth.uid());
	return public.founder_issue_certificate(
		old_cert.user_id,
		old_cert.course_id,
		coalesce(nullif(btrim(p_display_name), ''), old_cert.display_name),
		coalesce(nullif(btrim(p_course_title), ''), old_cert.course_title),
		coalesce(p_issue_date, current_date),
		old_cert.completion_date
	);
end;
$$;

revoke all on function public.founder_reissue_certificate(uuid, text, text, date, text) from public, anon;
grant execute on function public.founder_reissue_certificate(uuid, text, text, date, text) to authenticated;

create or replace function public.verify_certificate(p_number text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
	row public.certificates;
begin
	select * into row from public.certificates where certificate_number = upper(btrim(coalesce(p_number, '')));
	if row.id is null then
		return jsonb_build_object('valid', false, 'message', 'No certificate matches that number.');
	end if;
	if row.status is distinct from 'issued' then
		return jsonb_build_object(
			'valid', false,
			'message', 'This certificate is not currently valid.',
			'certificate_number', row.certificate_number
		);
	end if;
	return jsonb_build_object(
		'valid', true,
		'student_name', row.display_name,
		'course_title', row.course_title,
		'issue_date', row.issue_date,
		'certificate_number', row.certificate_number
	);
end;
$$;

revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;

create or replace function public.student_certificates()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
	if auth.uid() is null then raise exception 'sign in'; end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', c.id,
			'certificate_number', c.certificate_number,
			'course_title', c.course_title,
			'display_name', c.display_name,
			'issue_date', c.issue_date,
			'status', c.status
		) order by c.issue_date desc)
		from public.certificates c
		where c.user_id = auth.uid() and c.status = 'issued'
	), '[]'::jsonb);
end;
$$;

revoke all on function public.student_certificates() from public, anon;
grant execute on function public.student_certificates() to authenticated;

notify pgrst, 'reload schema';
