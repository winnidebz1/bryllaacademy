-- A paid enrolment becomes active once the student has chosen a password.

create or replace function public.activate_enrolments_on_password()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if coalesce(old.encrypted_password, '') = '' and coalesce(new.encrypted_password, '') <> '' then
		update public.enrollments
		set status = 'active'
		where user_id = new.id and status = 'pending_setup';
	end if;
	return new;
end;
$$;

revoke execute on function public.activate_enrolments_on_password() from public, anon, authenticated;

drop trigger if exists activate_enrolments_on_password on auth.users;
create trigger activate_enrolments_on_password
	after update of encrypted_password on auth.users
	for each row execute function public.activate_enrolments_on_password();

update public.enrollments e
set status = 'active'
from auth.users u
where u.id = e.user_id
	and e.status = 'pending_setup'
	and coalesce(u.encrypted_password, '') <> '';
