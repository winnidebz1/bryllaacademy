-- Student payment-before-signup tables. Safe to run on an existing database:
-- creates missing tables and does not drop course, student, or instructor data.

create table if not exists public.courses (
	id text primary key,
	title text not null,
	price_minor integer not null check (price_minor >= 0),
	currency text not null default 'GHS',
	status text not null default 'draft' check (status in ('published', 'draft', 'coming_soon')),
	created_at timestamptz not null default now()
);

insert into public.courses (id, title, price_minor, currency, status)
values
	('bookkeeping', 'Bookkeeping', 95000, 'GHS', 'published'),
	('remote-support', 'Remote support', 0, 'GHS', 'coming_soon'),
	('digital-marketing', 'Digital marketing', 0, 'GHS', 'coming_soon'),
	('project-management', 'Project management', 0, 'GHS', 'coming_soon')
on conflict (id) do nothing;

create table if not exists public.profiles (
	id uuid primary key references auth.users (id) on delete cascade,
	full_name text,
	role text not null default 'student' check (role in ('student', 'instructor', 'founder')),
	created_at timestamptz not null default now()
);

create table if not exists public.orders (
	id uuid primary key default gen_random_uuid(),
	course_id text not null references public.courses (id),
	full_name text not null,
	email text not null,
	amount_minor integer not null check (amount_minor > 0),
	currency text not null,
	status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'abandoned', 'refunded')),
	paystack_reference text unique,
	authorization_url text,
	user_id uuid references auth.users (id),
	fulfilled_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists orders_email_course_idx on public.orders (email, course_id, status);

create table if not exists public.payments (
	id uuid primary key default gen_random_uuid(),
	order_id uuid not null references public.orders (id),
	paystack_reference text not null unique,
	paystack_id bigint,
	status text not null,
	amount_minor integer not null,
	currency text not null,
	verified_at timestamptz,
	created_at timestamptz not null default now()
);

create table if not exists public.enrollments (
	id uuid primary key default gen_random_uuid(),
	order_id uuid not null unique references public.orders (id),
	course_id text not null references public.courses (id),
	email text not null,
	user_id uuid references auth.users (id),
	status text not null default 'pending_setup' check (status in ('pending_setup', 'active')),
	created_at timestamptz not null default now(),
	unique (email, course_id)
);

create table if not exists public.email_events (
	id uuid primary key default gen_random_uuid(),
	order_id uuid references public.orders (id),
	email text not null,
	kind text not null,
	status text not null,
	created_at timestamptz not null default now(),
	unique (order_id, kind)
);

alter table public.courses enable row level security;
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.enrollments enable row level security;
alter table public.email_events enable row level security;

drop policy if exists "published courses are readable" on public.courses;
create policy "published courses are readable" on public.courses
	for select using (status = 'published');

drop policy if exists "students read own profile" on public.profiles;
create policy "students read own profile" on public.profiles
	for select using (auth.uid() = id);

drop policy if exists "students update own name" on public.profiles;
create policy "students update own name" on public.profiles
	for update using (auth.uid() = id)
	with check (auth.uid() = id);

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
begin
	if auth.role() is distinct from 'service_role' and new.role is distinct from old.role then
		raise exception 'role cannot be changed from the client';
	end if;
	return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
	before update on public.profiles
	for each row execute function public.protect_profile_role();

drop policy if exists "students read own orders" on public.orders;
create policy "students read own orders" on public.orders
	for select using (auth.uid() = user_id);

drop policy if exists "students read own payments" on public.payments;
create policy "students read own payments" on public.payments
	for select using (exists (
		select 1 from public.orders
		where orders.id = payments.order_id and orders.user_id = auth.uid()
	));

drop policy if exists "students read own enrolments" on public.enrollments;
create policy "students read own enrolments" on public.enrollments
	for select using (auth.uid() = user_id);

-- No insert, update, or delete policies for orders, payments, enrolments, or roles.
-- Checkout and fulfilment use the service role inside Edge Functions only.
