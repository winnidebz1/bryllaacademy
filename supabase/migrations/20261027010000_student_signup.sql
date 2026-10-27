-- Students create an account directly. No payment is required.

create or replace function public.register_student(
	p_name text,
	p_email text,
	p_password text
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
	values (new_id, clean_name, 'student');

	return new_id;
end;
$$;

revoke all on function public.register_student(text, text, text) from public;
grant execute on function public.register_student(text, text, text) to anon, authenticated;
