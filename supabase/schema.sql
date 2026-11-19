-- HALF LIFE schema. Run in Supabase SQL editor. Promote first admin manually (never from the client):
--   update public.profiles set role='admin' where id=(select id from auth.users where email='YOU@mail.com');
create table public.profiles(id uuid primary key references auth.users on delete cascade,
 full_name text, avatar_url text, role text not null default 'voter' check(role in('voter','admin')), created_at timestamptz default now());
create table public.categories(id uuid primary key default gen_random_uuid(), name text not null unique, description text,
 image_url text, is_open boolean not null default false, starts_at timestamptz, ends_at timestamptz, sort int default 0);
create table public.candidates(id uuid primary key default gen_random_uuid(), category_id uuid not null references categories on delete cascade,
 full_name text not null check(length(full_name) between 2 and 80), bio text check(length(bio)<=500), photo_url text,
 instagram text, telegram text, linkedin text, profile_id uuid references profiles, unique(id,category_id));
create index on candidates(category_id);
create table public.votes(id uuid primary key default gen_random_uuid(), voter_id uuid not null references profiles,
 category_id uuid not null, candidate_id uuid not null, created_at timestamptz default now(),
 unique(voter_id,category_id),
 foreign key(candidate_id,category_id) references candidates(id,category_id) on delete cascade);
create index on votes(category_id,candidate_id);
create table public.settings(id int primary key default 1 check(id=1), results_published boolean not null default false);
insert into settings default values;
create table public.audit_logs(id bigserial primary key, actor uuid, action text, table_name text, row_data jsonb, at timestamptz default now());

create function public.is_admin() returns boolean language sql security definer stable set search_path=public
 as $$ select exists(select 1 from profiles where id=auth.uid() and role='admin') $$;

-- Role is ALWAYS 'voter' at signup; client metadata is ignored.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,full_name) values(new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1))); return new; end $$;
create trigger on_signup after insert on auth.users for each row execute function handle_new_user();

create function public.audit() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into audit_logs(actor,action,table_name,row_data) values(auth.uid(),tg_op,tg_table_name,to_jsonb(coalesce(new,old))); return coalesce(new,old); end $$;
create trigger a1 after insert or update or delete on categories for each row execute function audit();
create trigger a2 after insert or update or delete on candidates for each row execute function audit();
create trigger a3 after update on settings for each row execute function audit();

alter table profiles enable row level security; alter table categories enable row level security; alter table candidates enable row level security;
alter table votes enable row level security; alter table settings enable row level security; alter table audit_logs enable row level security;
create policy p_sel on profiles for select using(id=auth.uid() or is_admin());
create policy p_upd on profiles for update using(id=auth.uid());
revoke update on profiles from authenticated; grant update(full_name,avatar_url) on profiles to authenticated; -- role is never client-editable
create policy c_sel on categories for select to authenticated using(true);
create policy c_all on categories for all using(is_admin()) with check(is_admin());
create policy k_sel on candidates for select to authenticated using(true);
create policy k_all on candidates for all using(is_admin()) with check(is_admin());
create policy v_own on votes for select using(voter_id=auth.uid()); -- no write policies: votes only via cast_vote()
create policy s_sel on settings for select to authenticated using(true);
create policy s_upd on settings for update using(is_admin());
create policy l_sel on audit_logs for select using(is_admin());

create function public.cast_vote(p_category uuid, p_candidate uuid) returns void language plpgsql security definer set search_path=public as $$
declare c categories;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into c from categories where id=p_category;
 if not found or not c.is_open or (c.starts_at is not null and now()<c.starts_at) or (c.ends_at is not null and now()>c.ends_at)
  then raise exception 'voting_closed'; end if;
 begin insert into votes(voter_id,category_id,candidate_id) values(auth.uid(),p_category,p_candidate);
 exception when unique_violation then raise exception 'already_voted'; end;
end $$;

create function public.admin_stats() returns json language sql security definer set search_path=public as $$
 select case when is_admin() then json_build_object('voters',(select count(*) from profiles),'candidates',(select count(*) from candidates),
 'categories',(select count(*) from categories),'votes',(select count(*) from votes),'active',(select count(*) from categories where is_open)) end $$;
create function public.admin_results() returns table(category_id uuid,candidate_id uuid,full_name text,votes bigint) language sql security definer set search_path=public as $$
 select k.category_id,k.id,k.full_name,count(v.id) from candidates k left join votes v on v.candidate_id=k.id
 where is_admin() or (select results_published from settings) group by k.id order by 1,4 desc $$;

insert into categories(name,sort) values('Best Couple',1),('Best Dresser – Male',2),('Best Dresser – Female',3),('Best Social Media Influencer',4),
('Best Singer',5),('Best Footballer',6),('Miss Software',7),('Mister Software',8),('Best Photogenic – Male',9),('Best Photogenic – Female',10),('Best Dancer',11),('Best Coder',12);

insert into storage.buckets(id,name,public) values('photos','photos',true) on conflict do nothing;
create policy ph_read on storage.objects for select using(bucket_id='photos');
create policy ph_admin on storage.objects for all using(bucket_id='photos' and public.is_admin()) with check(bucket_id='photos' and public.is_admin());
