-- Lesson video links, contact messages, and founder payment records.

create table if not exists public.course_video_links (
	id uuid primary key default gen_random_uuid(),
	course_id text not null references public.courses (id) on delete cascade,
	title text not null check (char_length(title) between 1 and 160),
	video_url text not null check (char_length(video_url) between 8 and 500 and video_url ~* '^https?://'),
	position integer not null default 0,
	created_at timestamptz not null default now()
);

alter table public.course_video_links enable row level security;

drop policy if exists "editors read lesson links" on public.course_video_links;
create policy "editors read lesson links" on public.course_video_links
	for select to authenticated using (public.can_edit_course(course_id));
drop policy if exists "students read lesson links" on public.course_video_links;
create policy "students read lesson links" on public.course_video_links
	for select to authenticated using (
		exists (
			select 1 from public.enrollments e
			where e.course_id = course_video_links.course_id and e.user_id = auth.uid() and e.status = 'active'
		)
		or exists (
			select 1 from public.course_access a
			where a.course_id = course_video_links.course_id and a.user_id = auth.uid()
		)
	);
drop policy if exists "editors add lesson links" on public.course_video_links;
create policy "editors add lesson links" on public.course_video_links
	for insert to authenticated with check (public.can_edit_course(course_id));
drop policy if exists "editors delete lesson links" on public.course_video_links;
create policy "editors delete lesson links" on public.course_video_links
	for delete to authenticated using (public.can_edit_course(course_id));

grant select, insert, delete on public.course_video_links to authenticated;

create table if not exists public.contact_messages (
	id uuid primary key default gen_random_uuid(),
	sender_name text not null check (char_length(sender_name) between 2 and 120),
	email text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
	phone text not null default '' check (char_length(phone) <= 40),
	subject text not null default '' check (char_length(subject) <= 140),
	message text not null check (char_length(message) between 4 and 2000),
	created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

drop policy if exists "anyone can send a contact message" on public.contact_messages;
create policy "anyone can send a contact message" on public.contact_messages
	for insert to anon, authenticated
	with check (
		char_length(sender_name) between 2 and 120
		and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
		and char_length(message) between 4 and 2000
	);

grant insert on public.contact_messages to anon, authenticated;

create or replace function public.founder_contact_messages()
returns table (sender_name text, email text, phone text, subject text, message text, created_at timestamptz)
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
	select m.sender_name::text, m.email::text, m.phone::text, m.subject::text, m.message::text, m.created_at
	from public.contact_messages m
	order by m.created_at desc
	limit 50;
end;
$$;

revoke all on function public.founder_contact_messages() from public, anon;
grant execute on function public.founder_contact_messages() to authenticated;

create or replace function public.founder_payment_records(p_days integer)
returns table (
	paid_at timestamptz,
	student_name text,
	email text,
	course_title text,
	amount_minor integer,
	currency text,
	payment_status text,
	enrollment_status text
)
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
		coalesce(p.verified_at, p.created_at),
		o.full_name::text,
		o.email::text,
		c.title::text,
		p.amount_minor,
		p.currency::text,
		p.status::text,
		coalesce(e.status, 'not enrolled')::text
	from public.payments p
	join public.orders o on o.id = p.order_id
	join public.courses c on c.id = o.course_id
	left join public.enrollments e on e.order_id = o.id
	where p.status = 'success'
		and (p_days is null or p_days <= 0 or coalesce(p.verified_at, p.created_at) >= now() - make_interval(days => greatest(p_days, 0)))
	order by 1 desc;
end;
$$;

revoke all on function public.founder_payment_records(integer) from public, anon;
grant execute on function public.founder_payment_records(integer) to authenticated;
