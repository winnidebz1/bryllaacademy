-- Student notifications. Students can read and mark their own rows as read.
-- Payment, enrolment, and account events are inserted by triggers.
-- Instructor and founder messages go through post_student_notice.

create table if not exists public.notifications (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	type text not null check (type in ('payment_confirmed', 'account_setup', 'enrolment', 'announcement', 'message')),
	title text not null check (char_length(title) between 1 and 140),
	message text not null check (char_length(message) between 1 and 2000),
	destination_url text check (destination_url is null or destination_url ~ '^[a-z0-9][a-z0-9-]{0,60}$'),
	read_at timestamptz,
	source_key text not null check (char_length(source_key) between 8 and 120),
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	unique (user_id, source_key)
);

create index if not exists notifications_user_created_idx
	on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
	on public.notifications (user_id, created_at desc)
	where read_at is null;

alter table public.notifications replica identity full;

create or replace function public.enqueue_notification(
	p_user uuid,
	p_type text,
	p_title text,
	p_message text,
	p_destination text,
	p_source text,
	p_created timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if p_user is null or p_source is null then
		return;
	end if;
	insert into public.notifications (user_id, type, title, message, destination_url, source_key, created_at)
	values (p_user, p_type, left(p_title, 140), left(p_message, 2000), p_destination, p_source, coalesce(p_created, now()))
	on conflict (user_id, source_key) do nothing;
end;
$$;

revoke all on function public.enqueue_notification(uuid, text, text, text, text, text, timestamptz) from public, anon, authenticated;

create or replace function public.notify_from_enrolment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	ord public.orders;
	course_title text;
	email_status text;
begin
	if new.user_id is null then
		return new;
	end if;
	select * into ord from public.orders where id = new.order_id;
	if ord.id is null or ord.status is distinct from 'paid' then
		return new;
	end if;
	select title into course_title from public.courses where id = new.course_id;
	course_title := coalesce(course_title, 'your course');
	perform public.enqueue_notification(
		new.user_id, 'payment_confirmed', 'Payment confirmed',
		'Your payment for ' || course_title || ' is confirmed.',
		'student-courses', 'payment:' || ord.id::text, coalesce(ord.fulfilled_at, ord.created_at)
	);
	perform public.enqueue_notification(
		new.user_id, 'enrolment', 'You are enrolled',
		'You are enrolled in ' || course_title || '.',
		'course-watch', 'enrolment:' || new.id::text, new.created_at
	);
	select status into email_status from public.email_events where order_id = ord.id and kind = 'account_setup';
	if email_status = 'sent' then
		perform public.enqueue_notification(
			new.user_id, 'account_setup', 'Account email sent',
			'We sent the email to finish setting up your account.',
			'login', 'account-email:' || ord.id::text, now()
		);
	end if;
	if new.status = 'active' then
		perform public.enqueue_notification(
			new.user_id, 'account_setup', 'Account ready',
			'Your account is active. You can open ' || course_title || '.',
			'student-dashboard', 'account-active:' || new.id::text, now()
		);
	end if;
	return new;
end;
$$;

drop trigger if exists notify_from_enrolment on public.enrollments;
create trigger notify_from_enrolment
	after insert or update of user_id, status on public.enrollments
	for each row execute function public.notify_from_enrolment();

create or replace function public.notify_from_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	recipient uuid;
begin
	if new.kind is distinct from 'account_setup' or new.status is distinct from 'sent' or new.order_id is null then
		return new;
	end if;
	select user_id into recipient from public.enrollments where order_id = new.order_id and user_id is not null limit 1;
	perform public.enqueue_notification(
		recipient, 'account_setup', 'Account email sent',
		'We sent the email to finish setting up your account.',
		'login', 'account-email:' || new.order_id::text, new.created_at
	);
	return new;
end;
$$;

drop trigger if exists notify_from_email on public.email_events;
create trigger notify_from_email
	after insert or update of status on public.email_events
	for each row execute function public.notify_from_email();

create or replace function public.protect_notification_fields()
returns trigger
language plpgsql
as $$
begin
	if auth.role() = 'service_role' then
		return new;
	end if;
	if new.id is distinct from old.id
		or new.user_id is distinct from old.user_id
		or new.type is distinct from old.type
		or new.title is distinct from old.title
		or new.message is distinct from old.message
		or new.destination_url is distinct from old.destination_url
		or new.source_key is distinct from old.source_key
		or new.metadata is distinct from old.metadata
		or new.created_at is distinct from old.created_at
	then
		raise exception 'only the read state of a notification can change';
	end if;
	return new;
end;
$$;

drop trigger if exists protect_notification_fields on public.notifications;
create trigger protect_notification_fields
	before update on public.notifications
	for each row execute function public.protect_notification_fields();

alter table public.notifications enable row level security;

drop policy if exists "students read own notifications" on public.notifications;
create policy "students read own notifications" on public.notifications
	for select using (auth.uid() = user_id);

drop policy if exists "students mark own notifications read" on public.notifications;
create policy "students mark own notifications read" on public.notifications
	for update using (auth.uid() = user_id)
	with check (auth.uid() = user_id);

revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.caller_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1 from public.profiles
		where id = auth.uid() and role in ('instructor', 'founder')
	);
$$;

revoke all on function public.caller_is_staff() from public, anon;
grant execute on function public.caller_is_staff() to authenticated;

create or replace function public.staff_student_directory()
returns table (user_id uuid, full_name text, email text, course_id text, course_title text)
language plpgsql
security definer
set search_path = public
as $$
begin
	if not public.caller_is_staff() then
		raise exception 'not allowed';
	end if;
	return query
	select e.user_id, coalesce(p.full_name, e.email), e.email, e.course_id, c.title
	from public.enrollments e
	join public.courses c on c.id = e.course_id
	left join public.profiles p on p.id = e.user_id
	where e.user_id is not null and e.status = 'active'
	order by c.title, 2;
end;
$$;

revoke all on function public.staff_student_directory() from public, anon;
grant execute on function public.staff_student_directory() to authenticated;

create or replace function public.post_student_notice(
	p_type text,
	p_title text,
	p_message text,
	p_destination text,
	p_course_id text,
	p_student_id uuid,
	p_idempotency_key text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
	actor uuid := auth.uid();
	actor_role text;
	sent integer := 0;
	recipient uuid;
	destination text := nullif(trim(coalesce(p_destination, '')), '');
	notice_title text := trim(coalesce(p_title, ''));
	notice_body text := trim(coalesce(p_message, ''));
	source text;
begin
	if actor is null or not public.caller_is_staff() then
		raise exception 'not allowed';
	end if;
	select role into actor_role from public.profiles where id = actor;
	if p_type not in ('message', 'announcement') then
		raise exception 'unsupported notification type';
	end if;
	if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9:_-]{8,80}$' then
		raise exception 'idempotency key required';
	end if;
	if char_length(notice_title) < 1 or char_length(notice_title) > 140 then
		raise exception 'title must be 1 to 140 characters';
	end if;
	if char_length(notice_body) < 1 or char_length(notice_body) > 2000 then
		raise exception 'message must be 1 to 2000 characters';
	end if;
	if destination is not null and destination !~ '^[a-z0-9][a-z0-9-]{0,60}$' then
		raise exception 'invalid destination';
	end if;
	source := p_type || ':' || p_idempotency_key;

	if p_student_id is not null then
		if not exists (
			select 1 from public.enrollments
			where user_id = p_student_id and status = 'active'
		) then
			raise exception 'student not found';
		end if;
		insert into public.notifications (user_id, type, title, message, destination_url, source_key, metadata)
		values (p_student_id, p_type, notice_title, notice_body, destination, source, jsonb_build_object('sender_id', actor))
		on conflict (user_id, source_key) do nothing;
		get diagnostics sent = row_count;
		return sent;
	end if;

	if p_course_id is null and actor_role is distinct from 'founder' then
		raise exception 'choose a course or a student';
	end if;
	if p_course_id is not null and not exists (select 1 from public.courses where id = p_course_id) then
		raise exception 'course not found';
	end if;

	for recipient in
		select distinct e.user_id
		from public.enrollments e
		where e.user_id is not null
			and e.status = 'active'
			and (p_course_id is null or e.course_id = p_course_id)
	loop
		insert into public.notifications (user_id, type, title, message, destination_url, source_key, metadata)
		values (recipient, p_type, notice_title, notice_body, destination, source, jsonb_build_object('sender_id', actor))
		on conflict (user_id, source_key) do nothing;
		if found then
			sent := sent + 1;
		end if;
	end loop;
	return sent;
end;
$$;

revoke all on function public.post_student_notice(text, text, text, text, text, uuid, text) from public, anon;
grant execute on function public.post_student_notice(text, text, text, text, text, uuid, text) to authenticated;

-- Real events already stored for paid enrolments. Retries do not create a second row.
insert into public.notifications (user_id, type, title, message, destination_url, source_key, created_at)
select e.user_id, 'payment_confirmed', 'Payment confirmed',
	'Your payment for ' || c.title || ' is confirmed.',
	'student-courses', 'payment:' || o.id::text, coalesce(o.fulfilled_at, o.created_at)
from public.enrollments e
join public.orders o on o.id = e.order_id
join public.courses c on c.id = e.course_id
where e.user_id is not null and o.status = 'paid'
on conflict (user_id, source_key) do nothing;

insert into public.notifications (user_id, type, title, message, destination_url, source_key, created_at)
select e.user_id, 'enrolment', 'You are enrolled',
	'You are enrolled in ' || c.title || '.',
	'course-watch', 'enrolment:' || e.id::text, e.created_at
from public.enrollments e
join public.orders o on o.id = e.order_id
join public.courses c on c.id = e.course_id
where e.user_id is not null and o.status = 'paid'
on conflict (user_id, source_key) do nothing;

insert into public.notifications (user_id, type, title, message, destination_url, source_key, created_at)
select e.user_id, 'account_setup', 'Account ready',
	'Your account is active. You can open ' || c.title || '.',
	'student-dashboard', 'account-active:' || e.id::text, e.created_at
from public.enrollments e
join public.courses c on c.id = e.course_id
where e.user_id is not null and e.status = 'active'
on conflict (user_id, source_key) do nothing;

insert into public.notifications (user_id, type, title, message, destination_url, source_key, created_at)
select e.user_id, 'account_setup', 'Account email sent',
	'We sent the email to finish setting up your account.',
	'login', 'account-email:' || ev.order_id::text, ev.created_at
from public.email_events ev
join public.enrollments e on e.order_id = ev.order_id
where ev.kind = 'account_setup' and ev.status = 'sent' and e.user_id is not null
on conflict (user_id, source_key) do nothing;

do $$
begin
	if not exists (
		select 1 from pg_publication_tables
		where pubname = 'supabase_realtime'
			and schemaname = 'public'
			and tablename = 'notifications'
	) then
		alter publication supabase_realtime add table public.notifications;
	end if;
end $$;
