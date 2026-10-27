-- An existing student can choose a password from the sign-up form.
-- Module opening uses a module key so it works for every course, not only Bookkeeping weeks.

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
	existing_id uuid;
	existing_role text;
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

	select u.id, p.role into existing_id, existing_role
	from auth.users u
	left join public.profiles p on p.id = u.id
	where lower(u.email) = clean_email
	limit 1;

	if existing_id is not null then
		if existing_role is distinct from 'student' then
			raise exception 'An account with this email already exists. Sign in instead.';
		end if;
		update auth.users
		set encrypted_password = crypt(p_password, gen_salt('bf', 10)),
			email_confirmed_at = coalesce(email_confirmed_at, now()),
			raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{full_name}', to_jsonb(clean_name)),
			updated_at = now()
		where id = existing_id;
		update public.profiles
		set full_name = clean_name
		where id = existing_id and role = 'student';
		update auth.identities
		set id = gen_random_uuid(),
			identity_data = jsonb_build_object('sub', existing_id::text, 'email', clean_email, 'email_verified', true),
			updated_at = now()
		where user_id = existing_id and provider = 'email' and id = user_id;
		return existing_id;
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
		crypt(p_password, gen_salt('bf', 10)),
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
		gen_random_uuid(),
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

update auth.identities
set id = gen_random_uuid()
where provider = 'email' and id = user_id;

alter table public.course_module_unlocks add column if not exists module_key text;
update public.course_module_unlocks
set module_key = week::text
where module_key is null and week is not null;
alter table public.course_module_unlocks drop constraint if exists course_module_unlocks_pkey;
alter table public.course_module_unlocks drop column if exists week;
delete from public.course_module_unlocks where module_key is null;
alter table public.course_module_unlocks alter column module_key set not null;
alter table public.course_module_unlocks drop constraint if exists course_module_unlocks_pkey;
alter table public.course_module_unlocks add primary key (course_id, module_key);

drop function if exists public.set_module_unlock(text, integer, boolean);

create or replace function public.set_module_unlock(
	p_course text,
	p_module text,
	p_open boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if not exists (select 1 from public.profiles where id = auth.uid() and role = 'founder') then
		raise exception 'Only the founder can open or close a module.';
	end if;
	if p_course is null or p_module is null or char_length(trim(p_module)) < 1 or char_length(trim(p_module)) > 80 then
		raise exception 'Choose a course module.';
	end if;
	if not exists (select 1 from public.courses where id = p_course) then
		raise exception 'That course was not found.';
	end if;
	if p_open then
		insert into public.course_module_unlocks (course_id, module_key, unlocked_at, unlocked_by)
		values (p_course, trim(p_module), now(), auth.uid())
		on conflict (course_id, module_key) do update
			set unlocked_at = excluded.unlocked_at,
				unlocked_by = excluded.unlocked_by;
	else
		delete from public.course_module_unlocks
		where course_id = p_course and module_key = trim(p_module);
	end if;
end;
$$;

revoke all on function public.set_module_unlock(text, text, boolean) from public, anon;
grant execute on function public.set_module_unlock(text, text, boolean) to authenticated;

drop policy if exists "students read unlocked topics" on public.course_topics;
create policy "students read unlocked topics" on public.course_topics
	for select to authenticated using (
		exists (
			select 1 from public.course_module_unlocks u
			where u.course_id = course_topics.course_id
				and u.module_key = course_topics.id::text
		)
	);

drop policy if exists "students read unlocked modules" on public.course_modules;
create policy "students read unlocked modules" on public.course_modules
	for select to authenticated using (
		exists (
			select 1 from public.course_module_unlocks u
			where u.course_id = course_modules.course_id
				and (
					u.module_key = course_modules.id::text
					or u.module_key = course_modules.topic_id::text
				)
		)
	);
