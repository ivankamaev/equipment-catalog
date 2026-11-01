-- Подкатегория: свободный текст, необязательная
alter table equipment add column subcategory text;

-- Приводим подкатегорию к единому виду, чтобы «микрофоны », «Микрофоны» и «микрофоны»
-- не стали тремя разными группами: убираем лишние пробелы, первая буква — заглавная,
-- пустая строка — значит «без подкатегории»
create function normalize_subcategory() returns trigger
language plpgsql as $$
begin
  new.subcategory = nullif(regexp_replace(trim(new.subcategory), '\s+', ' ', 'g'), '');
  if new.subcategory is not null then
    new.subcategory = upper(left(new.subcategory, 1)) || substr(new.subcategory, 2);
  end if;
  return new;
end;
$$;

create trigger equipment_normalize_subcategory
  before insert or update of subcategory on equipment
  for each row execute function normalize_subcategory();

-- Подкатегории для тестовых приборов
update equipment set subcategory = 'Микрофоны'          where model = 'SM58';
update equipment set subcategory = 'Акустика'           where model = 'K2';
update equipment set subcategory = 'Вращающиеся головы' where model = 'MegaPointe';
update equipment set subcategory = 'Заливной свет'      where model = 'COLORado 1 Solo';
update equipment set subcategory = 'Светодиодные экраны' where model = 'PL3.9 Pro';
update equipment set subcategory = 'Генераторы'         where model = 'J130K';
update equipment set subcategory = 'Дым и туман'        where model = 'Viper NT';
-- ATEM, ферма и интерком остаются без подкатегории — проверим группу «Прочее»
