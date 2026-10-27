-- Email codes are required before a student password is saved.
-- Each course other than Bookkeeping has its own public details.

create table if not exists public.signup_codes (
	email text primary key,
	full_name text not null,
	code_salt text not null,
	code_hash text not null,
	expires_at timestamptz not null,
	attempts integer not null default 0,
	token_hash text,
	token_expires_at timestamptz,
	updated_at timestamptz not null default now()
);

alter table public.signup_codes enable row level security;
revoke all on table public.signup_codes from public, anon, authenticated;
grant all on table public.signup_codes to service_role;

create or replace function public.account_role_for_email(p_email text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
	select p.role
	from auth.users u
	join public.profiles p on p.id = u.id
	where lower(u.email) = lower(trim(coalesce(p_email, '')))
	limit 1;
$$;

revoke all on function public.account_role_for_email(text) from public, anon, authenticated;
grant execute on function public.account_role_for_email(text) to service_role;

create or replace function public.user_id_for_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
	select u.id
	from auth.users u
	where lower(u.email) = lower(trim(coalesce(p_email, '')))
	limit 1;
$$;

revoke all on function public.user_id_for_email(text) from public, anon, authenticated;
grant execute on function public.user_id_for_email(text) to service_role;

create or replace function public.register_student(
	p_name text,
	p_email text,
	p_password text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
	raise exception 'Verify your email, then choose a password.';
end;
$$;

create or replace function public.course_public_details(
	p_course text default null,
	p_share text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
	found public.courses%rowtype;
	topics jsonb;
	visible boolean;
begin
	if coalesce(trim(p_share), '') <> '' then
		select * into found from public.courses where share_code = trim(p_share) limit 1;
	elsif coalesce(trim(p_course), '') <> '' and trim(p_course) <> 'bookkeeping' then
		select * into found from public.courses where id = trim(p_course) limit 1;
	else
		return null;
	end if;

	if found.id is null then
		return jsonb_build_object('state', 'missing');
	end if;
	if found.id = 'bookkeeping' then
		return null;
	end if;

	visible :=
		(found.visibility = 'public' and found.approval_status = 'approved' and found.status in ('published', 'coming_soon'))
		or (coalesce(trim(p_share), '') <> '' and found.share_code = trim(p_share) and found.approval_status = 'approved')
		or public.can_edit_course(found.id);

	if not visible then
		return jsonb_build_object('state', 'unavailable');
	end if;

	select coalesce(jsonb_agg(jsonb_build_object(
		'title', topic.title,
		'lessons', coalesce((
			select jsonb_agg(module.title order by module.position)
			from public.course_modules module
			where module.topic_id = topic.id
		), '[]'::jsonb)
	) order by topic.position), '[]'::jsonb)
	into topics
	from public.course_topics topic
	where topic.course_id = found.id;

	return jsonb_build_object(
		'state', 'ready',
		'id', found.id,
		'title', found.title,
		'short_description', found.short_description,
		'description', found.description,
		'level', found.level,
		'currency', found.currency,
		'price_amount', found.price_amount,
		'topics', coalesce(topics, '[]'::jsonb)
	);
end;
$$;

revoke all on function public.course_public_details(text, text) from public;
grant execute on function public.course_public_details(text, text) to anon, authenticated;
