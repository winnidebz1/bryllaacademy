-- Bookkeeping is paid in two steps: GHS 50 registration, then GHS 550 enrolment.
-- Existing paid orders stay enrolment payments, so current students keep access.

alter table public.courses add column if not exists registration_fee_minor integer;
alter table public.courses add column if not exists enrolment_fee_minor integer;

alter table public.courses drop constraint if exists courses_registration_fee_check;
alter table public.courses add constraint courses_registration_fee_check
	check (registration_fee_minor is null or registration_fee_minor >= 0);
alter table public.courses drop constraint if exists courses_enrolment_fee_check;
alter table public.courses add constraint courses_enrolment_fee_check
	check (enrolment_fee_minor is null or enrolment_fee_minor >= 0);

update public.courses
set registration_fee_minor = 5000,
	enrolment_fee_minor = 55000,
	price_amount = 600
where id = 'bookkeeping';

insert into public.courses (id, title, price_minor, currency, status, short_description)
values (
	'podcast-management',
	'Podcast Management',
	0,
	'GHS',
	'coming_soon',
	'Planning, coordination, and publishing support for podcasters.'
)
on conflict (id) do update
set title = excluded.title,
	status = 'coming_soon',
	short_description = excluded.short_description;

update public.courses
set title = 'Project Management',
	short_description = 'Plan projects, organize tasks, manage timelines, and track progress.'
where id = 'project-management';

update public.courses
set title = 'Digital Marketing',
	short_description = 'Social media, content, and online audience engagement for businesses.'
where id = 'digital-marketing';

alter table public.orders add column if not exists purpose text not null default 'enrolment';
alter table public.orders drop constraint if exists orders_purpose_check;
alter table public.orders add constraint orders_purpose_check
	check (purpose in ('registration', 'enrolment'));

create table if not exists public.course_waitlist (
	id uuid primary key default gen_random_uuid(),
	course_id text not null references public.courses (id),
	full_name text not null,
	email text not null,
	created_at timestamptz not null default now(),
	unique (course_id, email)
);

create or replace function public.normalize_waitlist()
returns trigger
language plpgsql
as $$
begin
	new.full_name = btrim(new.full_name);
	new.email = lower(btrim(new.email));
	new.course_id = btrim(new.course_id);
	return new;
end;
$$;

drop trigger if exists normalize_waitlist on public.course_waitlist;
create trigger normalize_waitlist
	before insert or update on public.course_waitlist
	for each row execute function public.normalize_waitlist();

create or replace function public.course_is_waitlist_open(p_course text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1 from public.courses
		where id = p_course and status = 'coming_soon'
	);
$$;

revoke all on function public.course_is_waitlist_open(text) from public;
grant execute on function public.course_is_waitlist_open(text) to anon, authenticated;

alter table public.course_waitlist enable row level security;

drop policy if exists "anyone can join an open waitlist" on public.course_waitlist;
create policy "anyone can join an open waitlist" on public.course_waitlist
	for insert to anon, authenticated
	with check (
		char_length(btrim(full_name)) between 2 and 120
		and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
		and public.course_is_waitlist_open(course_id)
	);

drop policy if exists "founders read the waitlist" on public.course_waitlist;
create policy "founders read the waitlist" on public.course_waitlist
	for select to authenticated
	using (
		exists (
			select 1 from public.profiles
			where id = auth.uid() and role = 'founder'
		)
	);

grant insert on public.course_waitlist to anon, authenticated;
grant select on public.course_waitlist to authenticated;
