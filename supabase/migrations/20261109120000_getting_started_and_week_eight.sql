-- Getting started is an editable Bookkeeping topic so the founder can add
-- the welcome video and platform walkthrough. Week 7 and week 8 follow the
-- same open schedule as the earlier weeks.

insert into public.course_topics (course_id, title, position)
select 'bookkeeping', 'Getting started', 0
where exists (select 1 from public.courses where id = 'bookkeeping')
	and not exists (
		select 1
		from public.course_topics
		where course_id = 'bookkeeping'
			and lower(title) = 'getting started'
	);

insert into public.course_modules (course_id, topic_id, title, position)
select 'bookkeeping', topics.id, lesson.title, lesson.position
from public.course_topics as topics
join (
	values
		(1, 'Welcome to Brylla Academy'),
		(2, 'How to use the learning platform')
) as lesson(position, title) on true
where topics.course_id = 'bookkeeping'
	and lower(topics.title) = 'getting started'
	and not exists (
		select 1
		from public.course_modules as modules
		where modules.topic_id = topics.id
			and lower(modules.title) = lower(lesson.title)
	);

insert into public.course_topics (course_id, title, position)
select 'bookkeeping', week.title, week.position
from (
	values
		(7, 'Week 7: Catch-up'),
		(8, 'Week 8: Mentorship')
) as week(position, title)
where exists (select 1 from public.courses where id = 'bookkeeping')
	and not exists (
		select 1
		from public.course_topics
		where course_id = 'bookkeeping'
			and (position = week.position or lower(title) = lower(week.title))
	);

insert into public.course_modules (course_id, topic_id, title, position)
select 'bookkeeping', topics.id, lesson.title, lesson.position
from public.course_topics as topics
join (
	values
		(7, 1, 'Time to finish outstanding assignments from weeks 1 to 6'),
		(7, 2, 'No new lessons are added this week'),
		(8, 1, 'Mentorship on the bookkeeping work and professional readiness'),
		(8, 2, 'Guidance on applying the skills. Mentorship does not guarantee employment, clients, or income')
) as lesson(week_pos, position, title) on topics.position = lesson.week_pos
where topics.course_id = 'bookkeeping'
	and not exists (
		select 1
		from public.course_modules as modules
		where modules.topic_id = topics.id
			and lower(modules.title) = lower(lesson.title)
	);

insert into public.course_module_schedule (course_id, module_key, opens_at)
values
	('bookkeeping', '7', timestamptz '2027-02-16 00:00:00+00'),
	('bookkeeping', '8', timestamptz '2027-02-23 00:00:00+00')
on conflict (course_id, module_key) do update
	set opens_at = excluded.opens_at;

create or replace function public.student_can_read_media(p_course text, p_module uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1
		from public.course_module_unlocks as opened
		where opened.course_id = p_course
			and (
				p_module is null
				or opened.module_key = (
					select modules.topic_id::text
					from public.course_modules as modules
					where modules.id = p_module
				)
				or opened.module_key = (
					select topics.position::text
					from public.course_modules as modules
					join public.course_topics as topics on topics.id = modules.topic_id
					where modules.id = p_module
				)
				or (
					opened.module_key = 'getting-started'
					and exists (
						select 1
						from public.course_modules as modules
						join public.course_topics as topics on topics.id = modules.topic_id
						where modules.id = p_module
							and topics.course_id = p_course
							and (
								topics.position = 0
								or lower(topics.title) = 'getting started'
							)
					)
				)
			)
	);
$$;

revoke all on function public.student_can_read_media(text, uuid) from public, anon;
grant execute on function public.student_can_read_media(text, uuid) to authenticated;
