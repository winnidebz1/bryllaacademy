-- Restore Bookkeeping after it was deleted, including the weeks and lessons
-- shown on the homepage syllabus.

insert into public.courses (
	id,
	title,
	price_minor,
	currency,
	status,
	visibility,
	approval_status,
	short_description,
	description,
	price_amount,
	registration_fee_minor,
	enrolment_fee_minor,
	highlights,
	includes_note,
	fee_note,
	duration_note,
	cohort_label
) values (
	'bookkeeping',
	'Bookkeeping',
	95000,
	'GHS',
	'published',
	'public',
	'approved',
	'US bookkeeping training over six weeks, with about eight weeks of learning and support. Record transactions, work in QuickBooks Online and Xero, reconcile accounts, and close a client''s books.',
	'US bookkeeping training over six weeks, with about eight weeks of learning and support. Record transactions, work in QuickBooks Online and Xero, reconcile accounts, and close a client''s books.',
	600,
	5000,
	55000,
	array[
		'Debits, credits, and the chart of accounts',
		'QuickBooks Online, payables, and reconciliations',
		'Xero, merchant payouts, and month-end reports'
	]::text[],
	'Includes bookkeeping training and mentorship.',
	'Pay the GHS 50 registration fee first. The remaining GHS 550 covers enrolment in the course.',
	'6 weeks of training, about 8 weeks with support',
	'4 January 2027'
)
on conflict (id) do update
set title = excluded.title,
	status = 'published',
	visibility = 'public',
	approval_status = 'approved',
	price_amount = excluded.price_amount,
	registration_fee_minor = excluded.registration_fee_minor,
	enrolment_fee_minor = excluded.enrolment_fee_minor,
	short_description = excluded.short_description,
	highlights = excluded.highlights,
	includes_note = excluded.includes_note,
	fee_note = excluded.fee_note,
	duration_note = excluded.duration_note,
	cohort_label = excluded.cohort_label,
	description = case
		when coalesce(btrim(public.courses.description), '') = '' then excluded.description
		else public.courses.description
	end;

with inserted as (
	insert into public.course_topics (course_id, title, position)
	select 'bookkeeping', week.title, week.position
	from (
		values
			(1, 'Week 1: Bookkeeping foundations'),
			(2, 'Week 2: QuickBooks Online'),
			(3, 'Week 3: Payables and reconciliations'),
			(4, 'Week 4: Assets, loans, and adjustments'),
			(5, 'Week 5: Xero and merchant apps'),
			(6, 'Week 6: Month-end close and career'),
			(7, 'Week 7: Catch-up'),
			(8, 'Week 8: Mentorship')
	) as week(position, title)
	where not exists (
		select 1 from public.course_topics where course_id = 'bookkeeping'
	)
	returning id, position
)
insert into public.course_modules (course_id, topic_id, title, position)
select 'bookkeeping', inserted.id, lesson.title, lesson.position
from inserted
join (
	values
		(1, 1, 'What a US bookkeeper does'),
		(1, 2, 'Debits, credits, and journal entries'),
		(1, 3, 'Chart of accounts'),
		(1, 4, 'Live session: Chart of accounts build-off'),
		(1, 5, 'Assignment: Journal entries, a trial balance, and a chart of accounts cleanup'),
		(2, 1, 'QuickBooks Online setup and navigation'),
		(2, 2, 'Bank feeds, bank rules, and categorizing'),
		(2, 3, 'Accounts receivable'),
		(2, 4, 'Live session: The shoebox challenge'),
		(2, 5, 'Assignment: Set up the client and complete February bookkeeping in QuickBooks Online'),
		(3, 1, 'Accounts payable'),
		(3, 2, 'Bank reconciliation'),
		(3, 3, 'Credit card reconciliation'),
		(3, 4, 'Live session: Find the difference'),
		(3, 5, 'Assignment: Accounts payable, bank, and credit card reconciliations'),
		(4, 1, 'Fixed assets and depreciation'),
		(4, 2, 'Amortization, prepaid expenses, and accruals'),
		(4, 3, 'Loan accounts'),
		(4, 4, 'Live session: Schedule lab'),
		(4, 5, 'Assignment: Depreciation, amortization, and loan schedules'),
		(4, 6, 'Quiz and mid-course test covering weeks 1 to 4'),
		(5, 1, 'Xero from start to finish'),
		(5, 2, 'Stripe'),
		(5, 3, 'PayPal and reconciling merchant payouts'),
		(5, 4, 'Live session: Messy e-commerce month'),
		(5, 5, 'Assignment: Xero bookkeeping, plus Stripe and PayPal reconciliation'),
		(6, 1, 'Month-end close and financial reports'),
		(6, 2, 'Real-world practice: cleanup and catch-up'),
		(6, 3, 'Job sites, applications, and using AI'),
		(6, 4, 'Live session: Capstone presentations and mock interviews'),
		(6, 5, 'Capstone: Close the client''s first-quarter books and present the results'),
		(6, 6, 'Final test covering all modules'),
		(7, 1, 'Time to finish outstanding assignments from weeks 1 to 6'),
		(7, 2, 'No new lessons are added this week'),
		(8, 1, 'Mentorship on the bookkeeping work and professional readiness'),
		(8, 2, 'Guidance on applying the skills. Mentorship does not guarantee employment, clients, or income')
) as lesson(week_pos, position, title) on lesson.week_pos = inserted.position;
