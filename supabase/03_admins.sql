-- Администраторы: им можно всё со всеми строками
create table admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Список админов закрыт: правил нет, из приложения его не прочитать и не изменить
alter table admins enable row level security;

-- Проверка «текущий пользователь — админ?»
-- security definer: функция смотрит в admins с правами владельца, мимо закрытых правил
create function is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Удалять: автор — своё, админ — всё
drop policy if exists "Автор удаляет своё оборудование" on equipment;

create policy "Автор или админ удаляет оборудование"
  on equipment for delete
  to authenticated
  using (created_by = auth.uid() or is_admin());

-- Админ может исправить автора и дату добавления, остальные — нет
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  if not public.is_admin() then
    new.created_by = old.created_by;
    new.created_at = old.created_at;
  end if;
  return new;
end;
$$;
