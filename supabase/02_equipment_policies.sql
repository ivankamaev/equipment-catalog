-- Правила доступа к таблице equipment.
-- Все правила только для вошедших (authenticated): без входа доступа нет.

-- Читать могут все из команды
create policy "Команда видит всё оборудование"
  on equipment for select
  to authenticated
  using (true);

-- Добавлять могут все, но только от своего имени
create policy "Команда добавляет оборудование"
  on equipment for insert
  to authenticated
  with check (created_by = auth.uid());

-- Исправлять могут все: справочник общий
create policy "Команда редактирует оборудование"
  on equipment for update
  to authenticated
  using (true)
  with check (true);

-- Удалять можно только то, что добавил сам
create policy "Автор удаляет своё оборудование"
  on equipment for delete
  to authenticated
  using (created_by = auth.uid());

-- При редактировании нельзя подменить автора и дату добавления
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  new.created_by = old.created_by;
  new.created_at = old.created_at;
  return new;
end;
$$;
