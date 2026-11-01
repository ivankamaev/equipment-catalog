-- Хранилище файлов: две закрытые «папки» (bucket) — фото и мануалы
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('photos',  'photos',  false, 10 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp']),
  ('manuals', 'manuals', false, 50 * 1024 * 1024, array['application/pdf']);

-- Смотреть и скачивать файлы может вся команда
create policy "Команда видит файлы"
  on storage.objects for select
  to authenticated
  using (bucket_id in ('photos', 'manuals'));

-- Загружать может вся команда
create policy "Команда загружает файлы"
  on storage.objects for insert
  to authenticated
  with check (bucket_id in ('photos', 'manuals'));

-- Заменять файл может тот, кто его загрузил, или админ
create policy "Автор или админ заменяет файл"
  on storage.objects for update
  to authenticated
  using (bucket_id in ('photos', 'manuals') and (owner_id = auth.uid()::text or is_admin()));

-- Удалять файл может тот, кто его загрузил, или админ
create policy "Автор или админ удаляет файл"
  on storage.objects for delete
  to authenticated
  using (bucket_id in ('photos', 'manuals') and (owner_id = auth.uid()::text or is_admin()));
