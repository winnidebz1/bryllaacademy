-- Centralized activity / audit logs. Owner-only (founder role) read access.
-- Inserts happen via security-definer helpers, triggers, or the service role.

create or replace function public.caller_is_founder()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1 from public.profiles
		where id = auth.uid() and role = 'founder'
	);
$$;

revoke all on function public.caller_is_founder() from public, anon;
grant execute on function public.caller_is_founder() to authenticated;

create table if not exists public.activity_logs (
	id uuid primary key default gen_random_uuid(),
	event_type text not null,
	category text not null,
	action text not null,
	description text not null default '',
	actor_id uuid,
	actor_name text,
	actor_email text,
	actor_role text not null default 'System',
	target_type text,
	target_id text,
	target_name text,
	metadata jsonb not null default '{}'::jsonb,
	previous_values jsonb,
	new_values jsonb,
	status text not null default 'Success',
	severity text not null default 'Info',
	session_id text,
	request_id text,
	ip_address inet,
	user_agent text,
	created_at timestamptz not null default timezone('utc', now()),
	constraint activity_logs_event_type_length check (char_length(event_type) between 3 and 120),
	constraint activity_logs_category_length check (char_length(category) between 2 and 40),
	constraint activity_logs_action_length check (char_length(action) between 2 and 160),
	constraint activity_logs_description_length check (char_length(description) <= 2000),
	constraint activity_logs_actor_role_check check (actor_role in ('Student', 'Instructor', 'Admin', 'Anonymous', 'System')),
	constraint activity_logs_status_check check (status in ('Success', 'Failed', 'Pending', 'Warning')),
	constraint activity_logs_severity_check check (severity in ('Info', 'Warning', 'Error', 'Critical'))
);

create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_actor_id_idx on public.activity_logs (actor_id);
create index if not exists activity_logs_event_type_idx on public.activity_logs (event_type);
create index if not exists activity_logs_category_idx on public.activity_logs (category);
create index if not exists activity_logs_severity_idx on public.activity_logs (severity);
create index if not exists activity_logs_status_idx on public.activity_logs (status);
create index if not exists activity_logs_target_id_idx on public.activity_logs (target_id);
create index if not exists activity_logs_actor_role_idx on public.activity_logs (actor_role);
create index if not exists activity_logs_feed_idx on public.activity_logs (created_at desc, category, severity);

alter table public.activity_logs enable row level security;

revoke all on public.activity_logs from public, anon, authenticated;

drop policy if exists "founder read activity logs" on public.activity_logs;
create policy "founder read activity logs" on public.activity_logs
	for select to authenticated
	using (public.caller_is_founder());

grant select on public.activity_logs to authenticated;
grant select, insert on public.activity_logs to service_role;

create or replace function public._write_activity_log(
	p_event_type text,
	p_category text,
	p_action text,
	p_description text default '',
	p_actor_id uuid default null,
	p_actor_name text default null,
	p_actor_email text default null,
	p_actor_role text default 'System',
	p_target_type text default null,
	p_target_id text default null,
	p_target_name text default null,
	p_metadata jsonb default '{}'::jsonb,
	p_previous_values jsonb default null,
	p_new_values jsonb default null,
	p_status text default 'Success',
	p_severity text default 'Info',
	p_session_id text default null,
	p_request_id text default null,
	p_ip_address inet default null,
	p_user_agent text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	log_id uuid;
	safe_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
	safe_metadata := safe_metadata
		- 'password'
		- 'token'
		- 'access_token'
		- 'refresh_token'
		- 'authorization'
		- 'api_key'
		- 'secret'
		- 'card'
		- 'cvv'
		- 'otp'
		- 'code';

	insert into public.activity_logs (
		event_type, category, action, description,
		actor_id, actor_name, actor_email, actor_role,
		target_type, target_id, target_name,
		metadata, previous_values, new_values,
		status, severity, session_id, request_id, ip_address, user_agent
	) values (
		left(trim(p_event_type), 120),
		left(trim(p_category), 40),
		left(trim(p_action), 160),
		left(coalesce(p_description, ''), 2000),
		p_actor_id,
		nullif(left(coalesce(p_actor_name, ''), 160), ''),
		nullif(left(lower(coalesce(p_actor_email, '')), 254), ''),
		coalesce(nullif(p_actor_role, ''), 'System'),
		nullif(left(coalesce(p_target_type, ''), 80), ''),
		nullif(left(coalesce(p_target_id, ''), 160), ''),
		nullif(left(coalesce(p_target_name, ''), 200), ''),
		safe_metadata,
		p_previous_values,
		p_new_values,
		coalesce(nullif(p_status, ''), 'Success'),
		coalesce(nullif(p_severity, ''), 'Info'),
		nullif(left(coalesce(p_session_id, ''), 120), ''),
		nullif(left(coalesce(p_request_id, ''), 120), ''),
		p_ip_address,
		nullif(left(coalesce(p_user_agent, ''), 400), '')
	)
	returning id into log_id;
	return log_id;
exception
	when others then
		raise warning 'activity log write failed: %', sqlerrm;
		return null;
end;
$$;

revoke all on function public._write_activity_log(
	text, text, text, text, uuid, text, text, text, text, text, text, jsonb, jsonb, jsonb, text, text, text, text, inet, text
) from public, anon, authenticated;

create or replace function public.log_client_activity(
	p_event_type text,
	p_category text,
	p_action text,
	p_description text default '',
	p_target_type text default null,
	p_target_id text default null,
	p_target_name text default null,
	p_metadata jsonb default '{}'::jsonb,
	p_status text default 'Success',
	p_severity text default 'Info',
	p_session_id text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	actor uuid := auth.uid();
	actor_name text := null;
	actor_role_value text := null;
	role_label text := 'Anonymous';
	allowed boolean := false;
begin
	if p_event_type ~ '^(website\.|auth\.|student\.|instructor\.|admin\.|payment\.|notification\.|security\.)' then
		allowed := true;
	end if;
	if not allowed then
		raise exception 'event type not allowed';
	end if;

	if actor is not null then
		select full_name, role into actor_name, actor_role_value from public.profiles where id = actor;
		if actor_role_value = 'founder' then role_label := 'Admin';
		elsif actor_role_value = 'instructor' then role_label := 'Instructor';
		elsif actor_role_value = 'student' then role_label := 'Student';
		else role_label := 'Anonymous';
		end if;
	elsif p_event_type not like 'website.%' and p_event_type not like 'auth.login.failed%' then
		raise exception 'authentication required';
	end if;

	if p_severity = 'Critical' and not public.caller_is_founder() and actor is not null then
		p_severity := 'Warning';
	end if;

	return public._write_activity_log(
		p_event_type,
		p_category,
		p_action,
		p_description,
		actor,
		actor_name,
		null,
		role_label,
		p_target_type,
		p_target_id,
		p_target_name,
		p_metadata,
		null,
		null,
		p_status,
		p_severity,
		p_session_id,
		null,
		null,
		null
	);
end;
$$;

revoke all on function public.log_client_activity(text, text, text, text, text, text, text, jsonb, text, text, text) from public;
grant execute on function public.log_client_activity(text, text, text, text, text, text, text, jsonb, text, text, text) to anon, authenticated;

create or replace function public.activity_logs_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
	since timestamptz := timezone('utc', now()) - make_interval(days => greatest(coalesce(p_days, 30), 1));
	day_start timestamptz := date_trunc('day', timezone('utc', now()));
begin
	if not public.caller_is_founder() then
		raise exception 'not allowed';
	end if;
	return jsonb_build_object(
		'total', (select count(*) from public.activity_logs),
		'today', (select count(*) from public.activity_logs where created_at >= day_start),
		'active_users_today', (
			select count(distinct actor_id) from public.activity_logs
			where created_at >= day_start and actor_id is not null
		),
		'failed', (
			select count(*) from public.activity_logs
			where created_at >= since and status = 'Failed'
		),
		'critical', (
			select count(*) from public.activity_logs
			where created_at >= since and severity = 'Critical'
		),
		'system_errors', (
			select count(*) from public.activity_logs
			where created_at >= since and category = 'System' and severity in ('Error', 'Critical')
		)
	);
end;
$$;

revoke all on function public.activity_logs_summary(integer) from public, anon;
grant execute on function public.activity_logs_summary(integer) to authenticated;

create or replace function public.activity_logs_page(
	p_limit integer default 50,
	p_offset integer default 0,
	p_category text default null,
	p_severity text default null,
	p_status text default null,
	p_role text default null,
	p_search text default null,
	p_event_type text default null,
	p_target_id text default null,
	p_from timestamptz default null,
	p_to timestamptz default null
) returns table (
	id uuid,
	event_type text,
	category text,
	action text,
	description text,
	actor_id uuid,
	actor_name text,
	actor_email text,
	actor_role text,
	target_type text,
	target_id text,
	target_name text,
	metadata jsonb,
	previous_values jsonb,
	new_values jsonb,
	status text,
	severity text,
	session_id text,
	request_id text,
	created_at timestamptz,
	total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
	needle text := nullif(lower(trim(coalesce(p_search, ''))), '');
	lim integer := least(greatest(coalesce(p_limit, 50), 1), 200);
	off integer := greatest(coalesce(p_offset, 0), 0);
begin
	if not public.caller_is_founder() then
		raise exception 'not allowed';
	end if;
	return query
	with filtered as (
		select l.*
		from public.activity_logs l
		where (p_category is null or p_category = '' or p_category = 'All' or l.category = p_category)
			and (p_severity is null or p_severity = '' or p_severity = 'All' or l.severity = p_severity)
			and (p_status is null or p_status = '' or p_status = 'All' or l.status = p_status)
			and (p_role is null or p_role = '' or p_role = 'All' or l.actor_role = p_role)
			and (p_event_type is null or p_event_type = '' or l.event_type ilike '%' || p_event_type || '%')
			and (p_target_id is null or p_target_id = '' or l.target_id = p_target_id)
			and (p_from is null or l.created_at >= p_from)
			and (p_to is null or l.created_at <= p_to)
			and (
				needle is null
				or lower(coalesce(l.actor_name, '')) like '%' || needle || '%'
				or lower(coalesce(l.actor_email, '')) like '%' || needle || '%'
				or lower(coalesce(l.description, '')) like '%' || needle || '%'
				or lower(coalesce(l.action, '')) like '%' || needle || '%'
				or lower(coalesce(l.target_name, '')) like '%' || needle || '%'
				or lower(coalesce(l.event_type, '')) like '%' || needle || '%'
			)
	)
	select
		f.id, f.event_type, f.category, f.action, f.description,
		f.actor_id, f.actor_name, f.actor_email, f.actor_role,
		f.target_type, f.target_id, f.target_name,
		f.metadata, f.previous_values, f.new_values,
		f.status, f.severity, f.session_id, f.request_id, f.created_at,
		count(*) over() as total_count
	from filtered f
	order by f.created_at desc
	limit lim offset off;
end;
$$;

revoke all on function public.activity_logs_page(
	integer, integer, text, text, text, text, text, text, text, timestamptz, timestamptz
) from public, anon;
grant execute on function public.activity_logs_page(
	integer, integer, text, text, text, text, text, text, text, timestamptz, timestamptz
) to authenticated;

-- Triggers for important data changes ---------------------------------------

create or replace function public.activity_log_enrollment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if tg_op = 'INSERT' then
		perform public._write_activity_log(
			'student.course.enrolled',
			'Enrollment',
			'Student enrolled',
			'Enrollment created for ' || coalesce(new.email, 'a student') || ' in ' || coalesce(new.course_id, 'a course'),
			new.user_id,
			null,
			new.email,
			'Student',
			'enrollment',
			new.id::text,
			new.course_id,
			jsonb_build_object('status', new.status, 'course_id', new.course_id),
			null,
			jsonb_build_object('status', new.status),
			'Success',
			'Info'
		);
	elsif tg_op = 'UPDATE' and (old.status is distinct from new.status or old.user_id is distinct from new.user_id) then
		perform public._write_activity_log(
			'enrollment.status.changed',
			'Enrollment',
			'Enrollment updated',
			'Enrollment status changed for ' || coalesce(new.email, 'a student'),
			new.user_id,
			null,
			new.email,
			'Student',
			'enrollment',
			new.id::text,
			new.course_id,
			jsonb_build_object('course_id', new.course_id),
			jsonb_build_object('status', old.status, 'user_id', old.user_id),
			jsonb_build_object('status', new.status, 'user_id', new.user_id),
			'Success',
			'Info'
		);
	end if;
	return coalesce(new, old);
end;
$$;

drop trigger if exists activity_log_enrollment_change on public.enrollments;
create trigger activity_log_enrollment_change
	after insert or update of status, user_id on public.enrollments
	for each row execute function public.activity_log_enrollment_change();

create or replace function public.activity_log_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if tg_op = 'INSERT' then
		perform public._write_activity_log(
			case when new.role = 'student' then 'student.registered' when new.role = 'instructor' then 'instructor.created' else 'admin.account.created' end,
			case when new.role = 'student' then 'Student' when new.role = 'instructor' then 'Instructor' else 'Admin' end,
			'Account created',
			'A ' || coalesce(new.role, 'user') || ' account was created',
			new.id,
			new.full_name,
			null,
			case when new.role = 'founder' then 'Admin' when new.role = 'instructor' then 'Instructor' when new.role = 'student' then 'Student' else 'System' end,
			'profile',
			new.id::text,
			new.full_name,
			jsonb_build_object('role', new.role, 'account_status', new.account_status),
			null,
			jsonb_build_object('role', new.role, 'account_status', new.account_status),
			'Success',
			'Info'
		);
	elsif tg_op = 'UPDATE' then
		if old.account_status is distinct from new.account_status then
			perform public._write_activity_log(
				'account.status.changed',
				'Admin',
				'Account status changed',
				'Account status changed for ' || coalesce(new.full_name, new.id::text),
				auth.uid(),
				null,
				null,
				case when public.caller_is_founder() then 'Admin' when public.caller_is_staff() then 'Instructor' else 'System' end,
				'profile',
				new.id::text,
				new.full_name,
				jsonb_build_object('role', new.role),
				jsonb_build_object('account_status', old.account_status),
				jsonb_build_object('account_status', new.account_status),
				'Success',
				case when new.account_status = 'approved' then 'Info' else 'Warning' end
			);
		end if;
		if old.role is distinct from new.role then
			perform public._write_activity_log(
				'security.role.changed',
				'Security',
				'Role changed',
				'Role changed for ' || coalesce(new.full_name, new.id::text),
				auth.uid(),
				null,
				null,
				'Admin',
				'profile',
				new.id::text,
				new.full_name,
				'{}'::jsonb,
				jsonb_build_object('role', old.role),
				jsonb_build_object('role', new.role),
				'Success',
				'Critical'
			);
		end if;
		if old.full_name is distinct from new.full_name then
			perform public._write_activity_log(
				'student.profile.updated',
				case when new.role = 'instructor' then 'Instructor' when new.role = 'founder' then 'Admin' else 'Student' end,
				'Profile updated',
				'Display name updated',
				new.id,
				new.full_name,
				null,
				case when new.role = 'founder' then 'Admin' when new.role = 'instructor' then 'Instructor' else 'Student' end,
				'profile',
				new.id::text,
				new.full_name,
				'{}'::jsonb,
				jsonb_build_object('full_name', old.full_name),
				jsonb_build_object('full_name', new.full_name),
				'Success',
				'Info'
			);
		end if;
	end if;
	return coalesce(new, old);
end;
$$;

drop trigger if exists activity_log_profile_change on public.profiles;
create trigger activity_log_profile_change
	after insert or update of full_name, role, account_status on public.profiles
	for each row execute function public.activity_log_profile_change();

create or replace function public.activity_log_course_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if tg_op = 'INSERT' then
		perform public._write_activity_log(
			'instructor.course.created',
			'Course',
			'Course created',
			'Course created: ' || coalesce(new.title, new.id),
			coalesce(new.created_by, auth.uid()),
			null,
			null,
			case when public.caller_is_founder() then 'Admin' else 'Instructor' end,
			'course',
			new.id,
			new.title,
			jsonb_build_object('status', new.status, 'approval_status', new.approval_status),
			null,
			jsonb_build_object('title', new.title, 'status', new.status, 'approval_status', new.approval_status),
			'Success',
			'Info'
		);
	elsif tg_op = 'UPDATE' then
		perform public._write_activity_log(
			'instructor.course.updated',
			'Course',
			'Course updated',
			'Course updated: ' || coalesce(new.title, new.id),
			auth.uid(),
			null,
			null,
			case when public.caller_is_founder() then 'Admin' when public.caller_is_staff() then 'Instructor' else 'System' end,
			'course',
			new.id,
			new.title,
			'{}'::jsonb,
			jsonb_build_object('title', old.title, 'status', old.status, 'approval_status', old.approval_status),
			jsonb_build_object('title', new.title, 'status', new.status, 'approval_status', new.approval_status),
			'Success',
			'Info'
		);
	elsif tg_op = 'DELETE' then
		perform public._write_activity_log(
			'admin.course.deleted',
			'Course',
			'Course deleted',
			'Course deleted: ' || coalesce(old.title, old.id),
			auth.uid(),
			null,
			null,
			'Admin',
			'course',
			old.id,
			old.title,
			'{}'::jsonb,
			jsonb_build_object('title', old.title, 'status', old.status),
			null,
			'Success',
			'Warning'
		);
	end if;
	return coalesce(new, old);
end;
$$;

drop trigger if exists activity_log_course_change on public.courses;
create trigger activity_log_course_change
	after insert or delete or update of title, status, approval_status on public.courses
	for each row execute function public.activity_log_course_change();

create or replace function public.activity_log_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if tg_op = 'INSERT' and new.kind = 'assignment' then
		perform public._write_activity_log(
			'instructor.assignment.created',
			'Course',
			'Assignment created',
			'Assignment created: ' || coalesce(new.title, 'Untitled'),
			auth.uid(),
			null,
			null,
			case when public.caller_is_founder() then 'Admin' else 'Instructor' end,
			'assignment',
			new.id::text,
			new.title,
			jsonb_build_object('course_id', new.course_id, 'module_week', new.module_week),
			null,
			jsonb_build_object('title', new.title, 'marks', new.marks),
			'Success',
			'Info'
		);
	elsif tg_op = 'DELETE' and old.kind = 'assignment' then
		perform public._write_activity_log(
			'instructor.assignment.deleted',
			'Course',
			'Assignment deleted',
			'Assignment deleted: ' || coalesce(old.title, 'Untitled'),
			auth.uid(),
			null,
			null,
			case when public.caller_is_founder() then 'Admin' else 'Instructor' end,
			'assignment',
			old.id::text,
			old.title,
			jsonb_build_object('course_id', old.course_id, 'module_week', old.module_week),
			jsonb_build_object('title', old.title),
			null,
			'Success',
			'Warning'
		);
	end if;
	return coalesce(new, old);
end;
$$;

drop trigger if exists activity_log_assignment_change on public.course_assignments;
create trigger activity_log_assignment_change
	after insert or delete on public.course_assignments
	for each row execute function public.activity_log_assignment_change();

create or replace function public.activity_log_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if tg_op = 'INSERT' then
		perform public._write_activity_log(
			'payment.recorded',
			'Payment',
			'Payment recorded',
			'Payment recorded',
			null,
			null,
			null,
			'System',
			'payment',
			new.id::text,
			coalesce(new.paystack_reference, new.id::text),
			jsonb_build_object('status', new.status, 'amount_minor', new.amount_minor, 'currency', new.currency),
			null,
			jsonb_build_object('status', new.status),
			case when new.status in ('failed', 'Failed') then 'Failed' else 'Success' end,
			case when new.status in ('failed', 'Failed') then 'Error' else 'Info' end
		);
	elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
		perform public._write_activity_log(
			'payment.status.changed',
			'Payment',
			'Payment status changed',
			'Payment status changed',
			null,
			null,
			null,
			'System',
			'payment',
			new.id::text,
			coalesce(new.paystack_reference, new.id::text),
			'{}'::jsonb,
			jsonb_build_object('status', old.status),
			jsonb_build_object('status', new.status),
			case when new.status in ('failed', 'Failed') then 'Failed' else 'Success' end,
			case when new.status in ('failed', 'Failed') then 'Error' else 'Info' end
		);
	end if;
	return coalesce(new, old);
end;
$$;

do $$
begin
	if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'payments') then
		drop trigger if exists activity_log_payment_change on public.payments;
		create trigger activity_log_payment_change
			after insert or update of status on public.payments
			for each row execute function public.activity_log_payment_change();
	end if;
end $$;

create or replace function public.activity_log_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	perform public._write_activity_log(
		'notification.created',
		'Notification',
		'Notification created',
		coalesce(new.title, 'Notification created'),
		null,
		null,
		null,
		'System',
		'notification',
		new.id::text,
		new.title,
		jsonb_build_object('user_id', new.user_id, 'type', new.type),
		null,
		null,
		'Success',
		'Info'
	);
	return new;
end;
$$;

drop trigger if exists activity_log_notification_insert on public.notifications;
create trigger activity_log_notification_insert
	after insert on public.notifications
	for each row execute function public.activity_log_notification_insert();

do $$
begin
	if not exists (
		select 1 from pg_publication_tables
		where pubname = 'supabase_realtime'
			and schemaname = 'public'
			and tablename = 'activity_logs'
	) then
		alter publication supabase_realtime add table public.activity_logs;
	end if;
end $$;

notify pgrst, 'reload schema';
