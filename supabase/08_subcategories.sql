-- Подкатегории — отдельная таблица. У каждой свой номер (id) и место в списке (position),
-- поэтому в одной категории может быть несколько подкатегорий с одинаковым названием.
create table subcategories (
  id          bigint generated always as identity primary key,
  category    text not null check (category in (
                'звук', 'свет', 'видео', 'сцена', 'энергетика',
                'спецэффекты', 'спецсвязь', 'прочее')),
  name        text not null check (trim(name) <> ''),
  position    integer not null default 0,
  created_by  uuid default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now()
);

alter table subcategories enable row level security;

create policy "Команда видит подкатегории"
  on subcategories for select to authenticated using (true);
create policy "Команда добавляет подкатегории"
  on subcategories for insert to authenticated with check (true);
create policy "Команда меняет подкатегории"
  on subcategories for update to authenticated using (true) with check (true);
create policy "Автор или админ удаляет подкатегорию"
  on subcategories for delete to authenticated using (created_by = auth.uid() or is_admin());

-- Название к единому виду: без лишних пробелов, первая буква заглавная
create function normalize_subcategory_name() returns trigger
language plpgsql as $$
begin
  new.name = regexp_replace(trim(new.name), '\s+', ' ', 'g');
  new.name = upper(left(new.name, 1)) || substr(new.name, 2);
  return new;
end;
$$;

create trigger subcategories_normalize_name
  before insert or update of name on subcategories
  for each row execute function normalize_subcategory_name();

-- У прибора вместо текста подкатегории — ссылка на подкатегорию.
-- Удалили подкатегорию — её приборы не пропадут, а попадут в «Прочее» своей категории.
alter table equipment add column subcategory_id bigint references subcategories (id) on delete set null;
create index equipment_subcategory_id_idx on equipment (subcategory_id);

-- Перенос того, что уже есть: каждая пара «категория + название» становится подкатегорией,
-- порядок внутри категории — по алфавиту (потом его можно поменять перетаскиванием)
insert into subcategories (category, name, position)
select category, subcategory, row_number() over (partition by category order by subcategory)
from (select distinct category, subcategory from equipment where subcategory is not null) s;

update equipment e
set subcategory_id = s.id
from subcategories s
where s.category = e.category and s.name = e.subcategory;

-- Старое текстовое поле больше не нужно
drop trigger equipment_normalize_subcategory on equipment;
drop function normalize_subcategory();
alter table equipment drop column subcategory;

-- Категория прибора всегда совпадает с категорией его подкатегории
create function equipment_category_from_subcategory() returns trigger
language plpgsql as $$
begin
  if new.subcategory_id is not null then
    select category into new.category from subcategories where id = new.subcategory_id;
  end if;
  return new;
end;
$$;

create trigger equipment_category_sync
  before insert or update of subcategory_id, category on equipment
  for each row execute function equipment_category_from_subcategory();

-- Перенесли подкатегорию в другую категорию — её приборы переезжают вместе с ней
create function subcategory_category_cascade() returns trigger
language plpgsql as $$
begin
  update equipment set category = new.category where subcategory_id = new.id;
  return new;
end;
$$;

create trigger subcategories_category_cascade
  after update of category on subcategories
  for each row when (old.category is distinct from new.category)
  execute function subcategory_category_cascade();

-- Новый порядок подкатегорий одним запросом: ids — номера подкатегорий в нужном порядке
create function reorder_subcategories(ids bigint[]) returns void
language sql as $$
  update subcategories set position = array_position(ids, id) where id = any(ids);
$$;
