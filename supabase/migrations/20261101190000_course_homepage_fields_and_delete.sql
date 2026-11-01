-- Homepage cards keep their own highlights, fees, and dates.
-- The founder can delete a course without deleting student accounts.

alter table public.courses
	add column if not exists highlights text[] not null default '{}',
	add column if not exists includes_note text not null default '',
	add column if not exists fee_note text not null default '',
	add column if not exists duration_note text not null default '',
	add column if not exists cohort_label text not null default '';

update public.courses
set
	short_description = case
		when coalesce(btrim(short_description), '') = '' then 'US bookkeeping training over six weeks, with about eight weeks of learning and support. Record transactions, work in QuickBooks Online and Xero, reconcile accounts, and close a client''s books.'
		else short_description
	end,
	description = case
		when coalesce(btrim(description), '') = '' then 'US bookkeeping training over six weeks, with about eight weeks of learning and support. Record transactions, work in QuickBooks Online and Xero, reconcile accounts, and close a client''s books.'
		else description
	end,
	highlights = case
		when coalesce(cardinality(highlights), 0) = 0 then array[
			'Debits, credits, and the chart of accounts',
			'QuickBooks Online, payables, and reconciliations',
			'Xero, merchant payouts, and month-end reports'
		]::text[]
		else highlights
	end,
	includes_note = case
		when coalesce(btrim(includes_note), '') = '' then 'Includes bookkeeping training and mentorship.'
		else includes_note
	end,
	fee_note = case
		when coalesce(btrim(fee_note), '') = '' then 'Pay the GHS 50 registration fee first. The remaining GHS 550 covers enrolment in the course.'
		else fee_note
	end,
	duration_note = case
		when coalesce(btrim(duration_note), '') = '' then '6 weeks of training, about 8 weeks with support'
		else duration_note
	end,
	cohort_label = case
		when coalesce(btrim(cohort_label), '') = '' then '4 January 2027'
		else cohort_label
	end,
	price_amount = coalesce(price_amount, 600),
	registration_fee_minor = coalesce(registration_fee_minor, 5000),
	enrolment_fee_minor = coalesce(enrolment_fee_minor, 55000)
where id = 'bookkeeping';

create or replace function public.public_course_listing(p_course text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
	select jsonb_build_object(
		'id', c.id,
		'title', c.title,
		'summary', coalesce(nullif(btrim(c.short_description), ''), nullif(btrim(c.description), ''), ''),
		'currency', coalesce(nullif(c.currency, ''), 'GHS'),
		'price_amount', coalesce(c.price_amount, round(c.price_minor / 100.0, 2), 0),
		'registration_fee', round(coalesce(c.registration_fee_minor, 0) / 100.0, 2),
		'enrolment_fee', round(coalesce(c.enrolment_fee_minor, 0) / 100.0, 2),
		'highlights', coalesce(to_jsonb(c.highlights), '[]'::jsonb),
		'includes_note', coalesce(c.includes_note, ''),
		'fee_note', coalesce(c.fee_note, ''),
		'duration_note', coalesce(c.duration_note, ''),
		'cohort_label', coalesce(c.cohort_label, '')
	)
	from public.courses c
	where c.id = p_course
		and c.status = 'published'
		and c.visibility = 'public'
		and c.approval_status = 'approved';
$$;

revoke all on function public.public_course_listing(text) from public;
grant execute on function public.public_course_listing(text) to anon, authenticated;

create or replace function public.public_open_courses()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
	select coalesce(jsonb_agg(jsonb_build_object(
		'id', c.id,
		'title', c.title,
		'summary', coalesce(nullif(btrim(c.short_description), ''), nullif(btrim(c.description), ''), ''),
		'currency', coalesce(nullif(c.currency, ''), 'GHS'),
		'price_amount', coalesce(c.price_amount, round(c.price_minor / 100.0, 2), 0),
		'registration_fee', round(coalesce(c.registration_fee_minor, 0) / 100.0, 2),
		'enrolment_fee', round(coalesce(c.enrolment_fee_minor, 0) / 100.0, 2),
		'includes_note', coalesce(c.includes_note, ''),
		'fee_note', coalesce(c.fee_note, ''),
		'duration_note', coalesce(c.duration_note, ''),
		'cohort_label', coalesce(c.cohort_label, ''),
		'highlights', coalesce(to_jsonb(c.highlights), '[]'::jsonb),
		'bullets', case
			when coalesce(cardinality(c.highlights), 0) > 0 then to_jsonb(c.highlights)
			else coalesce((
				select jsonb_agg(item.title order by item.position)
				from (
					select topic.title, topic.position
					from public.course_topics topic
					where topic.course_id = c.id
					order by topic.position
					limit 3
				) item
			), '[]'::jsonb)
		end
	) order by c.title), '[]'::jsonb)
	from public.courses c
	where c.status = 'published'
		and c.visibility = 'public'
		and c.approval_status = 'approved'
		and c.id <> 'bookkeeping';
$$;

create or replace function public.founder_delete_course(p_course text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if not exists (
		select 1 from public.profiles
		where id = auth.uid() and role = 'founder'
	) then
		raise exception 'Only the founder can delete a course';
	end if;
	if not exists (select 1 from public.courses where id = p_course) then
		raise exception 'course not found';
	end if;

	delete from public.lesson_progress where course_id = p_course;
	delete from public.assignment_submissions where course_id = p_course;
	delete from public.course_waitlist where course_id = p_course;
	delete from public.enrollments where course_id = p_course;
	delete from public.email_events
	where order_id in (select id from public.orders where course_id = p_course);
	delete from public.payments
	where order_id in (select id from public.orders where course_id = p_course);
	delete from public.orders where course_id = p_course;
	delete from public.courses where id = p_course;
end;
$$;

revoke all on function public.founder_delete_course(text) from public;
grant execute on function public.founder_delete_course(text) to authenticated;

notify pgrst, 'reload schema';
