-- Send a contact to Resend once. Later freebie or waitlist submits with the
-- same email stay in Brylla records and do not create extra Resend contacts.

create or replace function public.submit_lead(
	p_kind text,
	p_full_name text,
	p_email text,
	p_consent boolean,
	p_course text default null,
	p_freebie text default null,
	p_source text default 'website',
	p_honeypot text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	clean_name text := btrim(coalesce(p_full_name, ''));
	clean_email text := lower(btrim(coalesce(p_email, '')));
	contact_row public.contacts;
	freebie_row public.freebies;
	download_url text := '';
	already boolean := false;
	provider_name text := coalesce((select value from public.academy_settings where key = 'email_provider'), 'resend');
	existing_status text;
	sync_needed boolean := false;
begin
	if coalesce(btrim(p_honeypot), '') <> '' then
		return jsonb_build_object('ok', true, 'ignored', true, 'sync_needed', false, 'message', 'Thank you.');
	end if;
	if p_kind not in ('waitlist', 'freebie') then
		return jsonb_build_object('ok', false, 'error', 'Choose a waitlist or a free resource.');
	end if;
	if char_length(clean_name) < 2 or char_length(clean_name) > 120 then
		return jsonb_build_object('ok', false, 'error', 'Enter your full name.');
	end if;
	if clean_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
		return jsonb_build_object('ok', false, 'error', 'Enter a valid email address.');
	end if;
	if (
		select count(*) from public.lead_attempts
		where normalized_email = clean_email and created_at > now() - interval '1 hour'
	) >= 8 then
		return jsonb_build_object('ok', false, 'error', 'Too many attempts. Try again later.');
	end if;
	insert into public.lead_attempts (normalized_email, kind) values (clean_email, p_kind);

	insert into public.contacts (full_name, email, normalized_email, marketing_consent, consent_timestamp, consent_source)
	values (
		clean_name,
		clean_email,
		clean_email,
		false,
		null,
		null
	)
	on conflict (normalized_email) do update
		set full_name = excluded.full_name,
			updated_at = now()
	returning * into contact_row;

	select * into contact_row from public.contacts where normalized_email = clean_email;
	if p_consent and contact_row.unsubscribe_status is not true then
		update public.contacts
		set marketing_consent = true,
			consent_timestamp = coalesce(consent_timestamp, now()),
			consent_source = coalesce(consent_source, p_source),
			updated_at = now()
		where id = contact_row.id
		returning * into contact_row;
	end if;

	if p_kind = 'waitlist' then
		if p_course is null or not public.course_is_waitlist_open(p_course) then
			return jsonb_build_object('ok', false, 'error', 'This waitlist is not open.');
		end if;
		insert into public.course_waitlist (
			course_id, full_name, email, student_id, marketing_consent, consent_timestamp, status
		) values (
			p_course, clean_name, clean_email, contact_row.id, contact_row.marketing_consent, contact_row.consent_timestamp, 'active'
		)
		on conflict (course_id, email) do nothing;
		if not found then already := true; end if;
	else
		select * into freebie_row from public.freebies where (id = p_freebie or slug = p_freebie) and is_active = true;
		if freebie_row.id is null then
			return jsonb_build_object('ok', false, 'error', 'That resource is not available.');
		end if;
		insert into public.freebie_downloads (student_id, freebie_id, signup_source)
		values (contact_row.id, freebie_row.id, coalesce(nullif(p_source, ''), 'website'))
		on conflict (student_id, freebie_id) do update set downloaded_at = now();
		download_url := freebie_row.file_location;
	end if;

	select sync_status into existing_status
	from public.email_provider_sync
	where student_id = contact_row.id and provider = provider_name;

	if existing_status is null or existing_status = 'failed' then
		sync_needed := true;
		insert into public.email_provider_sync (student_id, provider, sync_status)
		values (contact_row.id, provider_name, 'pending')
		on conflict (student_id, provider) do update set sync_status = 'pending';
	else
		sync_needed := false;
	end if;

	return jsonb_build_object(
		'ok', true,
		'duplicate', already,
		'sync_needed', sync_needed,
		'download_url', download_url,
		'contact_id', contact_row.id,
		'marketing_consent', contact_row.marketing_consent,
		'unsubscribed', contact_row.unsubscribe_status,
		'message', case
			when p_kind = 'waitlist' and already then 'You are already on this waitlist.'
			when p_kind = 'waitlist' then 'You are on the waitlist. We will email you when the course opens.'
			else 'Your download is starting.'
		end
	);
end;
$$;

revoke all on function public.submit_lead(text, text, text, boolean, text, text, text, text) from public;
grant execute on function public.submit_lead(text, text, text, boolean, text, text, text, text) to anon, authenticated;
