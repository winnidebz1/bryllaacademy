-- Private instructor registration. The invite code is stored in the database
-- and is not written into the site, so students never see a signup link.

create table if not exists public.instructor_invites (
	id uuid primary key default gen_random_uuid(),
	code text not null unique,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	constraint instructor_invites_code_length check (char_length(code) between 24 and 80)
);

alter table public.instructor_invites enable row level security;

create or replace function public.register_instructor(
	p_name text,
	p_email text,
	p_password text,
	p_code text
)
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
	if p_code is null or not exists (
		select 1 from public.instructor_invites
		where code = p_code and active
	) then
		raise exception 'This registration link is not valid.';
	end if;

	clean_email := lower(trim(coalesce(p_email, '')));
	clean_name := trim(coalesce(p_name, ''));
	if clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
		raise exception 'Enter a valid email address.';
	end if;
	if char_length(clean_name) < 2 or char_length(clean_name) > 120 then
		raise exception 'Enter your full name.';
	end if;
	if p_password is null or char_length(p_password) < 8 or char_length(p_password) > 72 then
		raise exception 'Use a password of at least 8 characters.';
	end if;
	if exists (select 1 from auth.users where lower(email) = clean_email) then
		raise exception 'An account with this email already exists. Sign in instead.';
	end if;

	new_id := gen_random_uuid();
	insert into auth.users (
		instance_id,
		id,
		aud,
		role,
		email,
		encrypted_password,
		email_confirmed_at,
		raw_app_meta_data,
		raw_user_meta_data,
		created_at,
		updated_at,
		confirmation_token,
		recovery_token,
		email_change_token_new,
		email_change
	) values (
		'00000000-0000-0000-0000-000000000000',
		new_id,
		'authenticated',
		'authenticated',
		clean_email,
		crypt(p_password, gen_salt('bf')),
		now(),
		'{"provider":"email","providers":["email"]}'::jsonb,
		jsonb_build_object('full_name', clean_name),
		now(),
		now(),
		'',
		'',
		'',
		''
	);

	insert into auth.identities (
		id,
		user_id,
		identity_data,
		provider,
		provider_id,
		last_sign_in_at,
		created_at,
		updated_at
	) values (
		new_id,
		new_id,
		jsonb_build_object('sub', new_id::text, 'email', clean_email, 'email_verified', true),
		'email',
		new_id::text,
		now(),
		now(),
		now()
	);

	insert into public.profiles (id, full_name, role)
	values (new_id, clean_name, 'instructor');

	return new_id;
end;
$$;

revoke all on function public.register_instructor(text, text, text, text) from public;
grant execute on function public.register_instructor(text, text, text, text) to anon, authenticated;

create or replace function public.founder_instructor_invite()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
	actor_role text;
	invite_code text;
begin
	select role into actor_role from public.profiles where id = auth.uid();
	if actor_role is distinct from 'founder' then
		raise exception 'not allowed';
	end if;
	select code into invite_code
	from public.instructor_invites
	where active
	order by created_at desc
	limit 1;
	return invite_code;
end;
$$;

revoke all on function public.founder_instructor_invite() from public, anon;
grant execute on function public.founder_instructor_invite() to authenticated;
