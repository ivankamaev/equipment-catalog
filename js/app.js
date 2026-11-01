// Клиент Supabase: через него идут все запросы к базе, хранилищу и авторизации
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Ссылка из письма (приглашение или сброс пароля) приносит в адресе #...&type=invite или type=recovery.
// Читаем это до того, как Supabase разберёт и очистит адрес.
const hashParams = new URLSearchParams(location.hash.slice(1));
let needsPassword = ['invite', 'recovery'].includes(hashParams.get('type'));

// Категории в порядке показа: value — как хранится в базе, label — как показываем
const CATEGORIES = [
  { value: 'звук', label: 'Звук' },
  { value: 'свет', label: 'Свет' },
  { value: 'видео', label: 'Видео' },
  { value: 'сцена', label: 'Сцена' },
  { value: 'энергетика', label: 'Энергетика' },
  { value: 'спецэффекты', label: 'Спецэффекты' },
  { value: 'спецсвязь', label: 'Спецсвязь' },
  { value: 'прочее', label: 'Прочее' },
];

// Элементы страницы
const loginForm = document.getElementById('login-form');
const passwordForm = document.getElementById('password-form');
const forgotButton = document.getElementById('forgot-button');
const logoutButton = document.getElementById('logout-button');
const message = document.getElementById('message');

// Показать один экран, остальные спрятать
function showScreen(id) {
  for (const screen of document.querySelectorAll('.screen')) {
    screen.hidden = screen.id !== id;
  }
}

// Вывести сообщение под формой; isError — красным
function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
}

// Понятные ошибки вместо английских из Supabase
function translateError(error) {
  const text = error.message || '';
  if (text.includes('Invalid login credentials')) return 'Неверная почта или пароль';
  if (text.includes('Password should be')) return 'Пароль слишком короткий';
  if (text.includes('rate limit')) return 'Слишком много попыток, подождите немного';
  if (text.includes('same password')) return 'Новый пароль совпадает со старым';
  if (text.includes('mime type')) return 'Такой тип файла хранилище не принимает';
  if (text.includes('maximum allowed size')) return 'Файл слишком большой';
  if (text.includes('row-level security')) return 'Нет прав на это действие';
  if (text.includes('Failed to fetch') || text.includes('Load failed')) return 'Нет связи с сервером, проверьте интернет';
  return 'Ошибка: ' + text;
}

// Показать приложение после входа и загрузить список (один раз за вход)
let listLoaded = false;
let signedIn = false;
function showApp(user) {
  signedIn = true;
  document.getElementById('user-email').textContent = user.email;
  route();
  if (!listLoaded) {
    listLoaded = true;
    loadEquipment();
  }
}

// Что показать, решает адрес: #item/12 — список и поверх него карточка прибора 12, иначе — только список.
// Так работают кнопка «Назад» браузера, свайп назад на iPhone и ссылка на конкретный прибор.
const itemDialog = document.getElementById('item-dialog');
let openedFromList = false;
function route() {
  showScreen('app-screen');
  const match = location.hash.match(/^#item\/(\d+)$/);
  if (match) {
    openItem(Number(match[1]));
  } else {
    openedItemId = null;
    if (itemDialog.open) itemDialog.close();
  }
}
window.addEventListener('hashchange', () => {
  if (signedIn) route();
});

// Нажатие на строку прибора — открыть его карточку
document.getElementById('equipment-list').addEventListener('click', (e) => {
  const row = e.target.closest('li.item');
  if (!row) return;
  openedFromList = true;
  location.hash = `#item/${row.dataset.id}`;
});

// Закрыть карточку: если открыли из списка — шаг назад по истории, иначе просто убрать #item из адреса
function closeItem() {
  if (openedFromList) {
    openedFromList = false;
    history.back();
  } else {
    location.hash = '';
  }
}

// Закрывают карточку: крестик, Esc и нажатие на затемнённый фон вокруг окна
document.getElementById('close-item-button').addEventListener('click', closeItem);
itemDialog.addEventListener('cancel', (e) => {
  e.preventDefault(); // Esc: закрываем сами, чтобы поправить адрес
  closeItem();
});
itemDialog.addEventListener('click', (e) => {
  if (e.target === itemDialog) closeItem(); // нажали на сам фон, а не на содержимое окна
});

// Число в русском формате: 15 000
function formatNumber(value) {
  return Number(value).toLocaleString('ru-RU');
}

// Загрузить оборудование из базы
async function loadEquipment() {
  const status = document.getElementById('list-status');
  status.textContent = 'Загружаем…';

  const { data, error } = await db
    .from('equipment')
    .select('id, name, manufacturer, model, category, subcategory, rental_price, weight_kg, power_w')
    .order('name');

  if (error) {
    status.textContent = translateError(error);
    listLoaded = false; // при следующем входе попробуем ещё раз
    return;
  }
  allItems = data;
  applyFilters();
}

// Всё загруженное оборудование и выбранная категория ('' — все)
let allItems = [];
let selectedCategory = '';

// Текст для сравнения: маленькие буквы, ё = е
function normalize(text) {
  return (text || '').toLowerCase().replaceAll('ё', 'е');
}

// Отобрать приборы по поиску и категории и показать их
function applyFilters() {
  const words = normalize(document.getElementById('search').value).split(/\s+/).filter(Boolean);

  const found = allItems.filter((item) => {
    if (selectedCategory && item.category !== selectedCategory) return false;
    const text = normalize([item.name, item.manufacturer, item.model, item.subcategory].join(' ')); // пустые поля join пропускает
    return words.every((word) => text.includes(word)); // каждое слово запроса должно найтись
  });

  const status = document.getElementById('list-status');
  if (!allItems.length) {
    status.textContent = 'Пока ничего не добавлено';
  } else if (found.length === allItems.length) {
    status.textContent = `Позиций: ${allItems.length}`;
  } else {
    status.textContent = `Найдено: ${found.length} из ${allItems.length}`;
  }
  renderEquipment(found);
}

// Кнопки категорий: «Все» и по одной на категорию из CATEGORIES
function buildCategoryChips() {
  const chips = document.getElementById('categories');
  for (const { value, label } of [{ value: '', label: 'Все' }, ...CATEGORIES]) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.classList.toggle('active', value === selectedCategory);
    chip.dataset.category = value;
    chip.textContent = label;
    chips.append(chip);
  }
}
buildCategoryChips();

// Поиск срабатывает на каждую набранную букву
document.getElementById('search').addEventListener('input', applyFilters);

// Нажатие на кнопку категории
document.getElementById('categories').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  selectedCategory = chip.dataset.category;
  for (const other of document.querySelectorAll('.chip')) {
    other.classList.toggle('active', other === chip);
  }
  applyFilters();
});

// Подгруппа для приборов без подкатегории — всегда в конце категории
const OTHER_SUBCATEGORY = 'Прочее';

// Нарисовать список: категории → подкатегории → приборы по наименованию
function renderEquipment(items) {
  const list = document.getElementById('equipment-list');
  list.replaceChildren(); // очистить старый список

  for (const { value, label } of CATEGORIES) {
    const groupItems = items.filter((item) => item.category === value);
    if (!groupItems.length) continue; // пустые группы не показываем

    const group = document.createElement('section');
    group.className = 'group';
    // Категория — общая плашка: сверху её название и шапка с колонками, ниже плашки подкатегорий
    const title = document.createElement('h2');
    title.textContent = label;
    group.append(title, renderHeader());

    // Раскладываем приборы по подкатегориям: { 'Микрофоны': [...], 'Прочее': [...] }
    const bySub = {};
    for (const item of groupItems) {
      const sub = item.subcategory || OTHER_SUBCATEGORY;
      (bySub[sub] ||= []).push(item);
    }

    // Подкатегории по алфавиту, «Прочее» — последней
    const subs = Object.keys(bySub).sort((a, b) => {
      if (a === OTHER_SUBCATEGORY) return 1;
      if (b === OTHER_SUBCATEGORY) return -1;
      return a.localeCompare(b, 'ru');
    });

    for (const sub of subs) {
      const subtitle = document.createElement('h3');
      subtitle.textContent = sub;

      const ul = document.createElement('ul');
      const sorted = bySub[sub].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      ul.append(...sorted.map(renderRow));

      // Каждая подкатегория со своими приборами — отдельная скруглённая плашка
      const block = document.createElement('div');
      block.className = 'block';
      block.append(subtitle, ul);
      group.append(block);
    }
    list.append(group);
  }
}

// Ячейка строки; пустая ячейка тоже нужна, чтобы колонки не съезжали
function cell(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

// Шапка таблицы — те же ячейки, что у прибора, поэтому колонки совпадают
function renderHeader() {
  const head = document.createElement('div');
  head.className = 'item item-head';
  head.append(
    cell('item-name', 'Наименование'),
    cell('item-maker', 'Фирма'),
    cell('item-model', 'Модель'),
    cell('item-price', 'Цена аренды'),
    cell('item-power', 'Мощность'),
    cell('item-weight', 'Вес'),
  );
  return head;
}

// Одна строка списка: название · производитель · модель · цена · мощность · вес
function renderRow(item) {
  const li = document.createElement('li');
  li.className = 'item';
  li.dataset.id = item.id; // по нему откроется карточка

  li.append(
    cell('item-name', item.name),
    cell('item-maker', item.manufacturer || ''),
    cell('item-model', item.model || ''),
    // То же вместе — для телефона, на ноутбуке спрятано
    cell('item-maker-model', [item.manufacturer, item.model].filter(Boolean).join(' ')),
    cell('item-price', item.rental_price != null ? `${formatNumber(item.rental_price)} ₽` : ''),
    cell('item-power', item.power_w != null ? `${formatNumber(item.power_w)} Вт` : ''),
    cell('item-weight', item.weight_kg != null ? `${formatNumber(item.weight_kg)} кг` : ''),
  );
  return li;
}

// Открыть карточку: загрузить прибор целиком из базы и показать
let openedItemId = null; // какая карточка открыта сейчас — чтобы не дорисовать в неё старую
async function openItem(id) {
  openedItemId = id;
  if (!itemDialog.open) itemDialog.showModal();
  itemDialog.scrollTop = 0;
  const status = document.getElementById('item-status');
  const card = document.getElementById('item-card');
  card.replaceChildren();
  status.textContent = 'Загружаем…';

  const { data: item, error } = await db.from('equipment').select('*').eq('id', id).maybeSingle();

  if (openedItemId !== id) return; // пока грузили, человек ушёл на другой экран
  if (error) {
    status.textContent = translateError(error);
    return;
  }
  if (!item) {
    status.textContent = 'Такого прибора нет — возможно, его удалили';
    return;
  }
  status.textContent = '';
  renderItem(item);
}

// Временная ссылка на закрытый файл в хранилище (действует час)
async function fileUrl(bucket, path) {
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return error ? null : data.signedUrl;
}

// Нарисовать карточку прибора
async function renderItem(item) {
  const card = document.getElementById('item-card');
  const category = CATEGORIES.find((c) => c.value === item.category);

  // Заголовок: название и «Звук › Микрофоны»
  const title = document.createElement('h1');
  title.textContent = item.name;
  const path = document.createElement('p');
  path.className = 'card-path';
  path.textContent = [category ? category.label : item.category, item.subcategory].filter(Boolean).join(' › ');
  card.append(title, path);

  // Фото — если загружено
  if (item.photo_path) {
    const url = await fileUrl('photos', item.photo_path);
    if (openedItemId !== item.id) return;
    if (url) {
      const img = document.createElement('img');
      img.className = 'card-photo';
      img.src = url;
      img.alt = item.name;
      card.append(img);
    }
  }

  // Характеристики таблицей: название поля — значение. Пустые поля не показываем.
  const size = [item.length_mm, item.width_mm, item.height_mm];
  const fields = [
    ['Фирма', item.manufacturer],
    ['Модель', item.model],
    ['Цена аренды', item.rental_price != null ? `${formatNumber(item.rental_price)} ₽` : null],
    ['Мощность', item.power_w != null ? `${formatNumber(item.power_w)} Вт` : null],
    ['Вес', item.weight_kg != null ? `${formatNumber(item.weight_kg)} кг` : null],
    ['Габариты (Д × Ш × В)', size.some((v) => v != null)
      ? size.map((v) => (v != null ? formatNumber(v) : '—')).join(' × ') + ' мм'
      : null],
  ];
  const table = document.createElement('dl');
  table.className = 'card-fields';
  for (const [label, value] of fields) {
    if (value == null || value === '') continue;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    table.append(dt, dd);
  }
  card.append(table);

  // Ссылки: мануал и сайт производителя
  const links = document.createElement('div');
  links.className = 'card-links';
  if (item.manual_path) {
    const url = await fileUrl('manuals', item.manual_path);
    if (openedItemId !== item.id) return;
    if (url) links.append(makeLink(url, 'Мануал (PDF)'));
  }
  // Только http/https — чтобы в ссылку нельзя было подсунуть исполняемый код
  if (item.website_url && /^https?:\/\//i.test(item.website_url)) {
    links.append(makeLink(item.website_url, 'Сайт производителя'));
  }
  if (links.children.length) card.append(links);

  // Когда добавлен и изменён
  const dates = document.createElement('p');
  dates.className = 'card-dates';
  dates.textContent = `Добавлен ${formatDate(item.created_at)}` +
    (item.updated_at !== item.created_at ? ` · изменён ${formatDate(item.updated_at)}` : '');
  card.append(dates);
}

// Ссылка, открывающаяся в новой вкладке
function makeLink(url, text) {
  const a = document.createElement('a');
  a.href = url;
  a.textContent = text;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

// Дата по-русски: 1 ноября 2026
function formatDate(value) {
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Ссылка из письма просрочена или уже использована
if (hashParams.get('error_code') === 'otp_expired') {
  showMessage('Ссылка из письма устарела. Нажмите «Забыли пароль?», чтобы получить новую.', true);
}

// Главный переключатель: Supabase сообщает о входе, выходе и открытии сайта
db.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') needsPassword = true;

  if (session && needsPassword) {
    showScreen('password-screen');
  } else if (session) {
    // setTimeout: Supabase не советует обращаться к базе прямо внутри этого обработчика
    setTimeout(() => showApp(session.user), 0);
  } else {
    listLoaded = false;
    signedIn = false;
    if (itemDialog.open) itemDialog.close();
    showScreen('login-screen');
  }
});

// Вход по почте и паролю
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = loginForm.querySelector('button');
  button.disabled = true;
  showMessage('Входим…');

  const { error } = await db.auth.signInWithPassword({
    email: document.getElementById('login-email').value.trim(),
    password: document.getElementById('login-password').value,
  });

  button.disabled = false;
  showMessage(error ? translateError(error) : '', Boolean(error));
});

// Установка нового пароля
passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = passwordForm.querySelector('button');
  button.disabled = true;

  const { data, error } = await db.auth.updateUser({
    password: document.getElementById('new-password').value,
  });

  button.disabled = false;
  if (error) {
    showMessage(translateError(error), true);
    return;
  }
  needsPassword = false;
  history.replaceState(null, '', location.pathname); // убираем остатки ссылки из адреса
  showMessage('Пароль сохранён');
  showApp(data.user);
});

// «Забыли пароль?» — письмо со ссылкой, которая вернёт сюда же
forgotButton.addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  if (!email) {
    showMessage('Сначала введите почту', true);
    return;
  }

  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname,
  });
  showMessage(error ? translateError(error) : 'Письмо отправлено, проверьте почту', Boolean(error));
});

// Тема оформления: light, dark или system (как в системе)
const themeButton = document.getElementById('theme-button');
const themeMenu = document.getElementById('theme-menu');
const systemDark = matchMedia('(prefers-color-scheme: dark)');

// Применить выбор: поставить тему странице и отметить пункт меню
function applyTheme(choice) {
  const dark = choice === 'dark' || (choice === 'system' && systemDark.matches);
  document.documentElement.dataset.themeChoice = choice;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  for (const item of themeMenu.querySelectorAll('[data-choice]')) {
    item.setAttribute('aria-checked', String(item.dataset.choice === choice));
  }
}
applyTheme(document.documentElement.dataset.themeChoice);

// В режиме «Как в системе» следим, когда Mac или iPhone сами переключат тему (например, вечером)
systemDark.addEventListener('change', () => {
  if (document.documentElement.dataset.themeChoice === 'system') applyTheme('system');
});

// Кнопка открывает и закрывает меню
themeButton.addEventListener('click', () => {
  themeMenu.hidden = !themeMenu.hidden;
});

// Выбор пункта меню; выбор запоминается на этом устройстве
themeMenu.addEventListener('click', (e) => {
  const item = e.target.closest('[data-choice]');
  if (!item) return;
  applyTheme(item.dataset.choice);
  try { localStorage.setItem('theme', item.dataset.choice); } catch (e) {} // в приватном режиме может не сохраниться
  themeMenu.hidden = true;
});

// Нажатие мимо меню или Esc — закрыть
document.addEventListener('click', (e) => {
  if (!e.target.closest('#theme-switcher')) themeMenu.hidden = true;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') themeMenu.hidden = true;
});

// Выход — экран входа покажет onAuthStateChange
logoutButton.addEventListener('click', async () => {
  await db.auth.signOut();
  showMessage('');
});
