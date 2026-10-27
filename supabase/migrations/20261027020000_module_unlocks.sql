-- The founder opens each course module when students should see it.
-- A missing row means the module stays hidden. The welcome does not use this table.

create table if not exists public.course_module_unlocks (
	course_id text not null references public.courses (id) on delete cascade,
	week integer not null check (week between 1 and 12),
	unlocked_at timestamptz not null default now(),
	unlocked_by uuid,
	primary key (course_id, week)
);

alter table public.course_module_unlocks enable row level security;

drop policy if exists "signed in read module unlocks" on public.course_module_unlocks;
create policy "signed in read module unlocks" on public.course_module_unlocks
	for select to authenticated using (true);

revoke all on public.course_module_unlocks from public, anon, authenticated;
grant select on public.course_module_unlocks to authenticated;

create or replace function public.set_module_unlock(
	p_course text,
	p_week integer,
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
	if p_course is null or p_week is null or p_week < 1 or p_week > 12 then
		raise exception 'Choose a course module.';
	end if;
	if not exists (select 1 from public.courses where id = p_course) then
		raise exception 'That course was not found.';
	end if;
	if p_open then
		insert into public.course_module_unlocks (course_id, week, unlocked_at, unlocked_by)
		values (p_course, p_week, now(), auth.uid())
		on conflict (course_id, week) do update
			set unlocked_at = excluded.unlocked_at,
				unlocked_by = excluded.unlocked_by;
	else
		delete from public.course_module_unlocks
		where course_id = p_course and week = p_week;
	end if;
end;
$$;

revoke all on function public.set_module_unlock(text, integer, boolean) from public, anon;
grant execute on function public.set_module_unlock(text, integer, boolean) to authenticated;
