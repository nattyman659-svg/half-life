# HALF LIFE
1. Create a Supabase project; run `supabase/schema.sql` in the SQL editor.
2. Make yourself admin (SQL, never from the client): `update public.profiles set role='admin' where id=(select id from auth.users where email='YOU@mail.com');`
3. Auth > Providers: enable Email (confirm email ON), Google (Google Cloud OAuth client), Apple (Apple Developer Services ID + key). Add your site URL under Auth > URL Configuration.
4. `cp .env.example .env`, fill URL + anon key. `npm install && npm run dev`.
Security: all permissions are enforced by RLS + SECURITY DEFINER functions; votes can only be inserted through `cast_vote()`; UNIQUE(voter_id, category_id) blocks duplicates; results come only from `admin_results()` (admins, or everyone once published).
