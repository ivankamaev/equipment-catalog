-- Таблица оборудования
create table equipment (
  id            bigint generated always as identity primary key,
  name          text not null,
  manufacturer  text,
  model         text,
  rental_price  numeric(10, 2) check (rental_price >= 0),
  category      text not null default 'прочее' check (category in (
                  'звук', 'свет', 'видео', 'сцена', 'энергетика',
                  'спецэффекты', 'спецсвязь', 'прочее')),
  weight_kg     numeric(8, 2) check (weight_kg >= 0),
  length_mm     integer check (length_mm >= 0),
  width_mm      integer check (width_mm >= 0),
  height_mm     integer check (height_mm >= 0),
  power_w       integer check (power_w >= 0),
  photo_path    text,
  manual_path   text,
  website_url   text,
  created_by    uuid default auth.uid() references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Сразу закрываем таблицу: без правил доступа никто ничего не прочитает
alter table equipment enable row level security;

-- updated_at обновляется сам при каждом изменении строки
create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger equipment_updated_at
  before update on equipment
  for each row execute function set_updated_at();
