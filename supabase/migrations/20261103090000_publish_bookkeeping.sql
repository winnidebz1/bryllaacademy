-- Bookkeeping is the open enrolment course. A later submit left it pending.

update public.courses
set status = 'published',
	visibility = 'public',
	approval_status = 'approved'
where id = 'bookkeeping';
