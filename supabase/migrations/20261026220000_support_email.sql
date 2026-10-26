update public.academy_settings
set value = 'admin@bryllagroup.org',
	updated_at = now()
where key = 'support_email';
