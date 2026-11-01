// Импорт приборов из сметы Excel. Подключается после app.js и form.js и пользуется их функциями:
// db, CATEGORIES, allItems, normalize, loadEquipment, translateError, parseNumber.
//
// Как устроена смета (как ref1.xlsx):
//   «Звуковое оборудование»                         ← раздел: строка, за которой идёт шапка
//   Наименование | | Фирма | Модель | Кол | Коэф | Цена аренды | Сумма   ← шапка
//   «Акустические системы LINE ARRAY»               ← подкатегория: только текст, без фирмы/модели/цены
//   Элемент линейного массива … | | L-Acoustics | KIVA | 8 | 1 | 3600 | …   ← прибор
//   «Итого …»                                       ← пропускаем

// Библиотека SheetJS читает файлы Excel прямо в браузере.
// Грузим её только когда нажали «Импорт», чтобы не замедлять открытие приложения.
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let xlsxLoading = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve();
  xlsxLoading ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = XLSX_URL;
    script.onload = resolve;
    script.onerror = () => {
      xlsxLoading = null;
      reject(new Error('Не удалось загрузить модуль для чтения Excel — проверьте интернет'));
    };
    document.head.append(script);
  });
  return xlsxLoading;
}

const importDialog = document.getElementById('import-dialog');
const importFile = document.getElementById('import-file');
const importMessage = document.getElementById('import-message');
const importPreview = document.getElementById('import-preview');
const importButtons = document.getElementById('import-buttons');
const runImportButton = document.getElementById('run-import-button');
const cancelImportButton = document.getElementById('cancel-import-button');

let sections = [];      // что нашли в файле: разделы → подкатегории → приборы
let importing = false;  // идёт запись в базу — окно закрывать нельзя

function showImportMessage(text, isError = false) {
  importMessage.textContent = text;
  importMessage.classList.toggle('error', isError);
}

// Открыть окно импорта с чистого листа
document.getElementById('import-button').addEventListener('click', () => {
  sections = [];
  importFile.value = '';
  importFile.disabled = false;
  importPreview.replaceChildren();
  importButtons.hidden = true;
  runImportButton.hidden = false;
  cancelImportButton.textContent = 'Отмена';
  showImportMessage('');
  importDialog.showModal();
  loadXlsx().catch(() => {}); // начинаем грузить библиотеку заранее, пока выбирают файл
});

function closeImport() {
  if (importing) return; // во время записи не закрываем
  importDialog.close();
}
document.getElementById('close-import-button').addEventListener('click', closeImport);
cancelImportButton.addEventListener('click', closeImport);
importDialog.addEventListener('cancel', (e) => {
  e.preventDefault();
  closeImport();
});

// Угадать нашу категорию по названию раздела или подкатегории
function guessCategory(title) {
  const t = normalize(title);
  if (t.includes('звук')) return 'звук';
  if (t.includes('свет')) return 'свет';
  if (t.includes('видео')) return 'видео';
  if (t.includes('сцен')) return 'сцена';
  if (t.includes('энерг') || t.includes('электр') || t.includes('силов')) return 'энергетика';
  if (t.includes('спецэфф') || t.includes('эффект')) return 'спецэффекты';
  if (t.includes('связ') || t.includes('интерком')) return 'спецсвязь';
  return 'прочее';
}

// Разобрать строки листа на разделы, подкатегории и приборы
function parseRows(rows) {
  const text = (row, i) => (i >= 0 && row[i] != null ? String(row[i]).trim() : '');
  const isEmpty = (row) => !row || row.every((v) => String(v ?? '').trim() === '');
  const isHeader = (row) => /^наименование/i.test(text(row, 0));

  // Номера колонок берём из шапки; пока шапки не было — как в нашей смете
  let cols = { name: 0, maker: 2, model: 3, price: 6, power: 9 };
  const readHeader = (row) => {
    const find = (re) => row.findIndex((v) => re.test(String(v ?? '').trim()));
    cols = {
      name: Math.max(find(/^наименование/i), 0),
      maker: find(/^(фирма|производитель|бренд)/i),
      model: find(/^модель/i),
      price: find(/^цена/i),
      power: find(/^мощность/i), // «Мощность, кВт» — на один прибор
    };
  };

  // Число из ячейки: в Excel оно бывает и числом, и текстом «3 600»; не число — null
  const numberAt = (row, i) => {
    if (i < 0) return null;
    const v = row[i];
    const n = typeof v === 'number' ? v : parseNumber(String(v ?? ''));
    return n === null || Number.isNaN(n) || n < 0 ? null : n;
  };

  // Ключ для поиска дублей: название + фирма + модель без учёта регистра
  const keyOf = (i) => [i.name, i.manufacturer, i.model].map((v) => normalize(v || '')).join('|');
  // Что уже есть в справочнике: ключ → номер подкатегории этого прибора
  const existing = new Map(allItems.map((i) => [keyOf(i), i.subcategory_id]));

  const result = [];
  let section = null;
  let group = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (isEmpty(row)) continue;
    if (isHeader(row)) { readHeader(row); continue; }

    const name = text(row, cols.name);
    if (!name || /^итого/i.test(name)) continue;

    // Раздел — строка, сразу за которой (через пустые строки) идёт шапка
    let next = i + 1;
    while (next < rows.length && isEmpty(rows[next])) next++;
    if (next < rows.length && isHeader(rows[next])) {
      const category = guessCategory(name);
      section = {
        title: name,
        category,
        include: !/монтаж|персонал/i.test(name), // услуги и персонал по умолчанию не берём
        groups: [],
      };
      result.push(section);
      group = null;
      continue;
    }
    if (!section) continue; // шапка документа до первого раздела: дата, заказчик и т. п.

    const manufacturer = text(row, cols.maker);
    const model = text(row, cols.model);
    const price = numberAt(row, cols.price);
    // Мощность берём как есть (считаем, что в смете уже ватты) и округляем до целых —
    // в базе мощность целым числом. 0 значит «не потребляет» — не записываем.
    const power = Math.round(numberAt(row, cols.power) ?? 0) || null;

    // Подкатегория — строка только с текстом, без фирмы, модели и цены.
    // Или строка-заголовок вроде «Светодиодный экран P1,5 | Размеры экрана Ш x В: | 6 | x | 4»:
    // вместо модели там подпись с двоеточием, а дальше размеры — их пропускаем.
    const isLabel = /:\s*$/.test(model);
    if (isLabel || (!manufacturer && !model && price === null)) {
      group = {
        subcategory: name,
        // Раздел «Прочее…» бывает сборным — тогда угадываем категорию по подкатегории
        category: section.category !== 'прочее' ? section.category : guessCategory(name),
        include: true,
        items: [],
      };
      section.groups.push(group);
      continue;
    }

    if (!group) {
      group = { subcategory: null, category: section.category, include: true, items: [] };
      section.groups.push(group);
    }
    const item = {
      name,
      manufacturer: manufacturer || null,
      model: model || null,
      rental_price: price === null ? null : Math.round(price * 100) / 100,
      power_w: power,
    };
    const key = keyOf(item);
    // Пропускаем только то, что уже есть в справочнике. Повторы внутри файла (один прибор
    // в нескольких комплектах сметы) импортируются каждый в свою подкатегорию.
    item.duplicate = existing.has(key);
    // В каких подкатегориях справочника уже лежат приборы этой группы — пригодится,
    // чтобы при повторной загрузке дополнить ту же подкатегорию, а не создать копию
    if (existing.get(key)) (group.existingSubcategoryIds ||= new Set()).add(existing.get(key));
    group.items.push(item);
  }

  // Подкатегории без приборов (примечания внизу сметы и т. п.) не показываем
  for (const s of result) s.groups = s.groups.filter((g) => g.items.length);
  return result.filter((s) => s.groups.length);
}

// Выбрали файл — читаем и показываем, что нашли
importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  importPreview.replaceChildren();
  importButtons.hidden = true;
  if (!file) return;

  try {
    showImportMessage('Читаем файл…');
    await loadXlsx();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    sections = parseRows(rows);
  } catch (error) {
    showImportMessage(translateError(error), true);
    return;
  }

  if (!sections.length) {
    showImportMessage('В файле не нашлось приборов. Нужна шапка со столбцом «Наименование».', true);
    return;
  }
  renderPreview();
  importButtons.hidden = false;
});

// Выпадающий список категорий
function categorySelect(value, onChange) {
  const select = document.createElement('select');
  for (const c of CATEGORIES) select.append(new Option(c.label, c.value));
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function checkbox(checked, onChange) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return input;
}

// Предпросмотр: разделы с галочкой и категорией, внутри — подкатегории со своими галочкой и категорией
function renderPreview() {
  importPreview.replaceChildren();

  for (const section of sections) {
    const box = document.createElement('section');
    box.className = 'import-section';

    // Строка раздела: галочка и категория меняют все его подкатегории разом
    const head = document.createElement('div');
    head.className = 'import-row import-section-head';
    const title = document.createElement('span');
    title.className = 'import-name';
    title.textContent = section.title;
    head.append(
      checkbox(section.include, (on) => {
        section.include = on;
        for (const g of section.groups) g.include = on;
        renderPreview();
      }),
      title,
      categorySelect(section.category, (value) => {
        section.category = value;
        for (const g of section.groups) g.category = value;
        renderPreview();
      }),
    );
    box.append(head);

    for (const group of section.groups) {
      const row = document.createElement('div');
      row.className = 'import-row';
      row.classList.toggle('off', !section.include || !group.include);

      const fresh = group.items.filter((i) => !i.duplicate).length;
      const dups = group.items.length - fresh;
      const name = document.createElement('span');
      name.className = 'import-name';
      name.textContent = group.subcategory || '(без подкатегории)';
      name.title = group.items.slice(0, 8).map((i) => i.name).join('\n'); // подсказка: первые приборы
      const count = document.createElement('span');
      count.className = 'import-count';
      // Повторы — приборы, которые уже есть в справочнике
      count.textContent = dups ? `${fresh} новых, ${dups} уже есть` : `${fresh} новых`;

      const groupCheck = checkbox(group.include, (on) => { group.include = on; renderPreview(); });
      groupCheck.disabled = !section.include;
      row.append(groupCheck, name, count,
        categorySelect(group.category, (value) => { group.category = value; renderPreview(); }));
      box.append(row);
    }
    importPreview.append(box);
  }
  updateSummary();
}

// Какие приборы уйдут в базу: [{ group, record }] — запись прибора и группа (подкатегория), из которой он
function recordsToImport() {
  const records = [];
  for (const section of sections) {
    if (!section.include) continue;
    for (const group of section.groups) {
      if (!group.include) continue;
      for (const item of group.items) {
        if (item.duplicate) continue;
        records.push({
          group,
          record: {
            name: item.name,
            manufacturer: item.manufacturer,
            model: item.model,
            rental_price: item.rental_price,
            power_w: item.power_w,
            category: group.category,
          },
        });
      }
    }
  }
  return records;
}

function updateSummary() {
  const total = sections.flatMap((s) => s.groups).flatMap((g) => g.items);
  const dups = total.filter((i) => i.duplicate).length;
  const count = recordsToImport().length;
  showImportMessage(`В файле ${total.length} приборов, из них ${dups} уже есть в справочнике. ` +
    `Будет добавлено: ${count}.`);
  runImportButton.textContent = `Импортировать (${count})`;
  runImportButton.disabled = count === 0;
}

// Подкатегории для импорта. Каждая группа сметы — своя подкатегория, даже если название
// повторяется (пять «Акустические системы LINE ARRAY» разных фирм останутся пятью).
// Новые встают в конец своей категории в том же порядке, что в смете.
async function prepareSubcategories(groups) {
  const toCreate = [];
  for (const group of groups) {
    if (group.subcategoryId || !group.subcategory) continue; // уже есть или приборы без подкатегории
    // Та же подкатегория — там уже лежат приборы этой группы, и название с категорией совпадают.
    // Одного совпадения приборов мало: прибор из нескольких комплектов лежит в разных подкатегориях.
    const sameName = (a, b) => normalize(a.replace(/\s+/g, ' ').trim()) === normalize(b.replace(/\s+/g, ' ').trim());
    const old = allSubcategories.find((s) => group.existingSubcategoryIds?.has(s.id) &&
      s.category === group.category && sameName(s.name, group.subcategory));
    if (old) {
      group.subcategoryId = old.id; // этот файл уже загружали — дополняем ту же подкатегорию
    } else {
      toCreate.push(group);
    }
  }
  if (!toCreate.length) return;

  const lastPosition = {}; // последнее место в каждой категории
  for (const s of allSubcategories) lastPosition[s.category] = Math.max(lastPosition[s.category] || 0, s.position);
  const rows = toCreate.map((g) => ({
    category: g.category,
    name: g.subcategory,
    position: (lastPosition[g.category] = (lastPosition[g.category] || 0) + 1),
  }));

  // Создаём все одним запросом; база возвращает номера в том же порядке
  const { data, error } = await db.from('subcategories').insert(rows).select('id');
  if (error) throw error;
  toCreate.forEach((group, i) => { group.subcategoryId = data[i].id; });
}

// Запись в базу: сначала подкатегории, потом приборы пачками по 200 строк — так быстрее, чем по одной
runImportButton.addEventListener('click', async () => {
  const records = recordsToImport();
  if (!records.length) return;

  importing = true;
  runImportButton.disabled = true;
  cancelImportButton.disabled = true;
  importFile.disabled = true;
  let done = 0;
  try {
    showImportMessage('Создаём подкатегории…');
    await prepareSubcategories([...new Set(records.map((r) => r.group))]);
    // Приборы встают в конец своей подкатегории в том порядке, в каком идут в смете
    const lastPosition = new Map(); // «категория|подкатегория» → последнее занятое место
    for (const i of allItems) {
      const key = `${i.category}|${i.subcategory_id ?? ''}`;
      lastPosition.set(key, Math.max(lastPosition.get(key) || 0, i.position || 0));
    }
    const rows = records.map(({ group, record }) => {
      const subcategory_id = group.subcategoryId || null;
      const key = `${record.category}|${subcategory_id ?? ''}`;
      const position = (lastPosition.get(key) || 0) + 1;
      lastPosition.set(key, position);
      return { ...record, subcategory_id, position };
    });

    for (let i = 0; i < rows.length; i += 200) {
      showImportMessage(`Добавляем… ${done} из ${rows.length}`);
      const { error } = await db.from('equipment').insert(rows.slice(i, i + 200));
      if (error) throw error;
      done += Math.min(200, rows.length - i);
    }
    showImportMessage(`Готово: добавлено ${done} приборов.`);
    importPreview.replaceChildren();
    runImportButton.hidden = true;
    cancelImportButton.textContent = 'Закрыть';
  } catch (error) {
    showImportMessage(`${translateError(error)}. Успели добавить: ${done}.`, true);
    runImportButton.disabled = false;
  } finally {
    importing = false;
    cancelImportButton.disabled = false;
    loadEquipment(); // обновить список и подкатегории — новые сразу видны
  }
});
