-- When the founder approves a student or instructor, email that address
-- that the account can now be used. The Resend key stays in Vault.

create extension if not exists http with schema extensions;

create or replace function public.founder_pending_accounts()
returns table (
	id uuid,
	full_name text,
	email text,
	created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
	if not exists (select 1 from public.profiles where profiles.id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;
	return query
	select p.id, coalesce(p.full_name, u.email)::text, u.email::text, p.created_at
	from public.profiles p
	join auth.users u on u.id = p.id
	where p.role in ('student', 'instructor') and p.account_status = 'pending'
	order by p.created_at desc;
end;
$$;

create or replace function public.founder_approve_student(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, vault, extensions
as $$
declare
	account_role text;
	account_name text;
	account_state text;
	account_email text;
	api_key text;
	safe_name text;
	login_url text := 'https://bryllaacademy.vercel.app/login';
	message text;
	response extensions.http_response;
begin
	if not exists (select 1 from public.profiles where profiles.id = auth.uid() and role = 'founder') then
		raise exception 'not allowed';
	end if;

	select p.role, p.full_name, p.account_status, u.email
	into account_role, account_name, account_state, account_email
	from public.profiles p
	join auth.users u on u.id = p.id
	where p.id = p_user;

	if account_role is null or account_role not in ('student', 'instructor') then
		raise exception 'That account cannot be approved.';
	end if;
	if account_state = 'approved' then
		raise exception 'That account is already approved.';
	end if;
	if account_email is null or btrim(account_email) = '' then
		raise exception 'That account has no email address.';
	end if;

	select decrypted_secret into api_key
	from vault.decrypted_secrets
	where name = 'resend_api_key'
	limit 1;
	if api_key is null or btrim(api_key) = '' then
		raise exception 'The approval email is not configured.';
	end if;

	safe_name := regexp_replace(coalesce(nullif(btrim(account_name), ''), 'there'), '[<>&]', '', 'g');
	message := '<div style="font-family:Arial,sans-serif;color:#122d49;max-width:520px"><p>Hello '
		|| safe_name
		|| ',</p><p>Your Brylla Academy account has been approved. You can sign in now.</p><p><a href="'
		|| login_url
		|| '" style="background:#073b70;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px">Sign in</a></p><p>Or open this link:<br><a href="'
		|| login_url
		|| '">'
		|| login_url
		|| '</a></p><p>Brylla Academy</p></div>';

	response := extensions.http((
		'POST',
		'https://api.resend.com/emails',
		ARRAY[
			extensions.http_header('Authorization', 'Bearer ' || api_key),
			extensions.http_header('Content-Type', 'application/json')
		],
		'application/json',
		jsonb_build_object(
			'from', 'Brylla Academy <noreply@brandedbywinni.com>',
			'to', account_email,
			'subject', 'Your Brylla Academy account is approved',
			'html', message
		)::text
	)::extensions.http_request);

	if response.status < 200 or response.status >= 300 then
		raise exception 'The approval email could not be sent. The account is still waiting.';
	end if;

	update public.profiles
	set account_status = 'approved'
	where id = p_user and role = account_role and account_status = 'pending';

	insert into public.email_events (email, kind, status)
	values (account_email, 'account_approved', 'sent');
end;
$$;

revoke all on function public.founder_pending_accounts() from public, anon;
grant execute on function public.founder_pending_accounts() to authenticated;

revoke all on function public.founder_approve_student(uuid) from public, anon;
grant execute on function public.founder_approve_student(uuid) to authenticated;

notify pgrst, 'reload schema';
