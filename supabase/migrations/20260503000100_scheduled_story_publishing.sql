drop policy if exists "Stories public read published" on stories;
create policy "Stories public read published"
on stories for select
using (
  status = 'published'
  and (published_at is null or published_at <= now())
);
