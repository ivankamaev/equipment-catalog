// Форма добавления прибора. Подключается после app.js и пользуется его функциями:
// db, CATEGORIES, allItems, selectedCategory, loadEquipment, translateError.

const formDialog = document.getElementById('form-dialog');
const itemForm = document.getElementById('item-form');
const formMessage = document.getElementById('form-message');
const formCategory = document.getElementById('form-category');
const saveButton = itemForm.querySelector('button[type="submit"]');

// Список категорий в выпадающем меню — из того же CATEGORIES, что и кнопки над списком
for (const { value, label } of CATEGORIES) {
  formCategory.append(new Option(label, value));
}

// Уникальные непустые значения по алфавиту
function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
}

// Свои подсказки под полем ввода. Встроенные подсказки браузера (datalist) в Safari
// и на iPhone работают ненадёжно, поэтому рисуем список сами.
// getValues — функция, которая возвращает все варианты для этого поля.
function attachSuggestions(input, getValues) {
  const box = document.createElement('ul');
  box.className = 'suggest';
  box.hidden = true;
  input.after(box);

  let options = []; // что сейчас показано
  let active = -1;  // какой пункт выделен стрелками

  // Показать варианты, в которых есть введённый текст (без учёта регистра, ё = е)
  function render() {
    const query = normalize(input.value.trim());
    options = getValues()
      .filter((v) => normalize(v).includes(query) && v !== input.value.trim())
      .slice(0, 8);
    box.replaceChildren(...options.map((v, i) => {
      const li = document.createElement('li');
      li.textContent = v;
      li.classList.toggle('active', i === active);
      return li;
    }));
    box.hidden = options.length === 0;
  }

  function pick(value) {
    input.value = value;
    box.hidden = true;
    formDirty = true;
  }

  input.addEventListener('focus', () => { active = -1; render(); });
  input.addEventListener('input', () => { active = -1; render(); });
  input.addEventListener('blur', () => { box.hidden = true; });

  // Нажатие на подсказку не должно уводить фокус с поля раньше, чем сработает выбор
  // (pointerdown — палец на iPhone, mousedown — мышь)
  box.addEventListener('pointerdown', (e) => e.preventDefault());
  box.addEventListener('mousedown', (e) => e.preventDefault());
  box.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) pick(li.textContent);
  });

  // Клавиатура: стрелки — выбор, Enter — подставить, Esc — спрятать подсказки
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + options.length) % options.length;
      render();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault(); // иначе Enter отправит форму
      pick(options[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault(); // иначе Esc закроет всю форму
      box.hidden = true;
    }
  });
}

// Фирмам — подсказки из всех уже известных
attachSuggestions(itemForm.elements.manufacturer, () =>
  uniqueSorted(allItems.map((item) => item.manufacturer)));

// Подкатегория выбирается из списка подкатегорий выбранной категории (в том же порядке, что в списке).
// Если названия повторяются, к ним дописываем фирмы приборов внутри, чтобы различать.
const formSubcategory = document.getElementById('form-subcategory');
const newSubcategoryRow = document.getElementById('new-subcategory-row');
function fillSubcategorySelect(selectedId = '') {
  const subs = allSubcategories.filter((s) => s.category === formCategory.value);
  const options = subs.map((sub) => {
    let label = sub.name;
    if (subs.filter((s) => s.name === sub.name).length > 1) {
      const makers = uniqueSorted(allItems.filter((i) => i.subcategory_id === sub.id).map((i) => i.manufacturer));
      label += makers.length ? ` — ${makers.slice(0, 3).join(', ')}` : ` — №${sub.id}`;
    }
    return new Option(label, sub.id);
  });
  formSubcategory.replaceChildren(
    new Option('— без подкатегории (Прочее) —', ''),
    ...options,
    new Option('+ Новая подкатегория…', 'new'),
  );
  formSubcategory.value = String(selectedId ?? '');
  newSubcategoryRow.hidden = true;
}
formCategory.addEventListener('change', () => fillSubcategorySelect());
formSubcategory.addEventListener('change', () => {
  newSubcategoryRow.hidden = formSubcategory.value !== 'new';
  if (!newSubcategoryRow.hidden) itemForm.elements.new_subcategory.focus();
});

function showFormMessage(text, isError = false) {
  formMessage.textContent = text;
  formMessage.classList.toggle('error', isError);
}

// Поля, которые переносятся из записи в форму и обратно как есть
const FORM_FIELDS = ['name', 'category', 'manufacturer', 'model', 'website_url',
  'rental_price', 'power_w', 'weight_kg', 'length_mm', 'width_mm', 'height_mm'];

// Открыть форму. Без item — пустая форма нового прибора, с item — форма изменения этого прибора.
let formDirty = false;     // есть ли несохранённые изменения
let editingItem = null;    // какой прибор меняем (null — добавляем новый)
function openForm(item = null) {
  editingItem = item;
  itemForm.reset();
  document.getElementById('form-title').textContent = item ? 'Изменить прибор' : 'Новый прибор';

  if (item) {
    for (const name of FORM_FIELDS) {
      const value = item[name];
      // Числа показываем по-русски: 5,4 вместо 5.4
      itemForm.elements[name].value = value == null ? '' : String(value).replace('.', ',');
    }
  } else {
    formCategory.value = selectedCategory || CATEGORIES[0].value; // та категория, что выбрана над списком
  }
  fillSubcategorySelect(item?.subcategory_id);
  // «Удалить текущее фото/мануал» — только если они есть
  document.getElementById('remove-photo-row').hidden = !item?.photo_path;
  document.getElementById('remove-manual-row').hidden = !item?.manual_path;

  showFormMessage('');
  formDirty = false;
  formDialog.showModal();
  itemForm.elements.name.focus();
}
document.getElementById('add-button').addEventListener('click', () => openForm());
itemForm.addEventListener('input', () => { formDirty = true; });

// Закрыть форму; если что-то уже введено — переспросить, чтобы не потерять
function closeForm() {
  if (formDirty && !confirm('Закрыть без сохранения? Введённые данные пропадут.')) return;
  formDirty = false;
  formDialog.close();
}
document.getElementById('close-form-button').addEventListener('click', closeForm);
document.getElementById('cancel-form-button').addEventListener('click', closeForm);
formDialog.addEventListener('cancel', (e) => {
  e.preventDefault(); // Esc — тоже через вопрос
  closeForm();
});

// Число из поля: пусто — null; запятая годится вместо точки, пробелы в «15 000» убираем.
// Если ввели не число — NaN, это поймает проверка ниже.
function parseNumber(text) {
  const clean = text.replace(/\s/g, '').replace(',', '.');
  return clean === '' ? null : Number(clean);
}

// Случайное имя файла, чтобы файлы разных людей не перезаписали друг друга
function randomName(ext) {
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${id}.${ext}`;
}

// Фото с телефона весит 3–10 МБ и бывает в HEIC. Уменьшаем до 1600 px по длинной стороне
// и сохраняем как JPEG — получается 200–500 КБ, и открывается в любом браузере.
async function prepareImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  } catch {
    throw new Error('Не удалось прочитать фото — попробуйте другой файл');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Загрузить файл в хранилище и вернуть путь к нему
async function uploadFile(bucket, blob, ext, contentType) {
  const path = randomName(ext);
  const { error } = await db.storage.from(bucket).upload(path, blob, { contentType });
  if (error) throw error;
  return path;
}

// Сохранение
itemForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = itemForm.elements;
  const text = (name) => f[name].value.trim() || null;

  // Собираем запись для базы
  const record = {
    name: text('name'),
    category: f.category.value,
    subcategory_id: f.subcategory_id.value && f.subcategory_id.value !== 'new' ? Number(f.subcategory_id.value) : null,
    manufacturer: text('manufacturer'),
    model: text('model'),
    website_url: text('website_url'),
  };
  const newSubcategory = f.subcategory_id.value === 'new' ? text('new_subcategory') : null;
  if (f.subcategory_id.value === 'new' && !newSubcategory) {
    showFormMessage('Введите название новой подкатегории', true);
    f.new_subcategory.focus();
    return;
  }
  if (!record.name) {
    showFormMessage('Заполните наименование', true);
    f.name.focus();
    return;
  }
  // Адрес без http — допишем сами
  if (record.website_url && !/^https?:\/\//i.test(record.website_url)) {
    record.website_url = 'https://' + record.website_url;
  }

  // Числа: [поле, название для ошибки, только целое?]
  const numbers = [
    ['rental_price', 'Цена аренды', false],
    ['power_w', 'Мощность', true],
    ['weight_kg', 'Вес', false],
    ['length_mm', 'Длина', true],
    ['width_mm', 'Ширина', true],
    ['height_mm', 'Высота', true],
  ];
  for (const [name, label, integer] of numbers) {
    const value = parseNumber(f[name].value);
    if (value !== null && (Number.isNaN(value) || value < 0 || (integer && !Number.isInteger(value)))) {
      showFormMessage(`«${label}» — нужно ${integer ? 'целое ' : ''}число не меньше нуля`, true);
      f[name].focus();
      return;
    }
    record[name] = value;
  }

  const photo = f.photo.files[0];
  const manual = f.manual.files[0];
  if (manual && manual.size > 50 * 1024 * 1024) {
    showFormMessage('Мануал больше 50 МБ — такой хранилище не примет', true);
    return;
  }

  saveButton.disabled = true;
  const uploaded = []; // что успели загрузить — удалим, если запись не сохранится
  const replaced = []; // старые файлы, которые станут не нужны, — удалим, если запись сохранится
  let createdSubcategoryId = null; // новая подкатегория — удалим, если прибор не сохранится
  try {
    if (photo) {
      showFormMessage('Загружаем фото…');
      const blob = await prepareImage(photo);
      record.photo_path = await uploadFile('photos', blob, 'jpg', 'image/jpeg');
      uploaded.push(['photos', record.photo_path]);
    } else if (f.remove_photo.checked) {
      record.photo_path = null;
    }
    if (manual) {
      showFormMessage('Загружаем мануал…');
      record.manual_path = await uploadFile('manuals', manual, 'pdf', 'application/pdf');
      uploaded.push(['manuals', record.manual_path]);
    } else if (f.remove_manual.checked) {
      record.manual_path = null;
    }
    // Если у прибора было фото или мануал, а теперь другой или никакого — старый файл больше не нужен
    if (editingItem?.photo_path && 'photo_path' in record) replaced.push(['photos', editingItem.photo_path]);
    if (editingItem?.manual_path && 'manual_path' in record) replaced.push(['manuals', editingItem.manual_path]);

    showFormMessage('Сохраняем…');
    // Новая подкатегория — сначала создаём её, в конце списка своей категории
    if (newSubcategory) {
      const last = Math.max(0, ...allSubcategories.filter((s) => s.category === record.category).map((s) => s.position));
      const { data: sub, error: subError } = await db.from('subcategories')
        .insert({ category: record.category, name: newSubcategory, position: last + 1 })
        .select('id').single();
      if (subError) throw subError;
      createdSubcategoryId = sub.id;
      record.subcategory_id = sub.id;
    }

    // Новый прибор или прибор, перенесённый в другую подкатегорию, — в конец своей подкатегории
    const moved = !editingItem || editingItem.subcategory_id !== record.subcategory_id ||
      editingItem.category !== record.category;
    if (moved) {
      const neighbours = allItems.filter((i) => i.category === record.category &&
        (i.subcategory_id ?? null) === record.subcategory_id && i.id !== editingItem?.id);
      record.position = Math.max(0, ...neighbours.map((i) => i.position || 0)) + 1;
    }

    // Новый прибор — insert, существующий — update по его id
    const query = editingItem
      ? db.from('equipment').update(record).eq('id', editingItem.id)
      : db.from('equipment').insert(record);
    const { data, error } = await query.select('id').single();
    if (error) throw error;

    for (const [bucket, path] of replaced) {
      db.storage.from(bucket).remove([path]); // не вышло (чужой файл) — останется лишний файл, не страшно
    }

    // Готово: закрываем форму, обновляем список и показываем карточку прибора
    formDirty = false;
    formDialog.close();
    loadEquipment();
    if (editingItem) {
      openItem(data.id); // карточка уже открыта — перерисовать с новыми данными
    } else {
      openedFromList = true;
      location.hash = `#item/${data.id}`;
    }
  } catch (error) {
    for (const [bucket, path] of uploaded) {
      db.storage.from(bucket).remove([path]); // убираем «осиротевшие» файлы
    }
    // и только что созданную подкатегорию, раз прибор в неё не попал
    if (createdSubcategoryId) db.from('subcategories').delete().eq('id', createdSubcategoryId);
    showFormMessage(translateError(error), true);
  } finally {
    saveButton.disabled = false;
  }
});
