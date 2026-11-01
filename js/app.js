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
  return 'Ошибка: ' + text;
}

// Показать основной экран и загрузить список (один раз за вход)
let listLoaded = false;
function showApp(user) {
  document.getElementById('user-email').textContent = user.email;
  showScreen('app-screen');
  if (!listLoaded) {
    listLoaded = true;
    loadEquipment();
  }
}

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
    .select('id, name, manufacturer, model, category, rental_price, weight_kg, power_w')
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
    const text = normalize([item.name, item.manufacturer, item.model].join(' ')); // пустые поля join пропускает
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

// Нарисовать список группами по категориям, внутри группы — по наименованию
function renderEquipment(items) {
  const list = document.getElementById('equipment-list');
  list.replaceChildren(); // очистить старый список

  for (const { value, label } of CATEGORIES) {
    const groupItems = items
      .filter((item) => item.category === value)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    if (!groupItems.length) continue; // пустые группы не показываем

    const group = document.createElement('section');
    group.className = 'group';

    const title = document.createElement('h2');
    title.textContent = label;

    const ul = document.createElement('ul');
    ul.append(...groupItems.map(renderRow));

    group.append(title, ul);
    list.append(group);
  }
}

// Одна строка списка: название · производитель · модель · цена · мощность · вес
function renderRow(item) {
  const li = document.createElement('li');
  li.className = 'item';

  // Ячейка строки; пустая ячейка тоже нужна, чтобы колонки не съезжали
  function cell(className, text) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  }

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

// Выход — экран входа покажет onAuthStateChange
logoutButton.addEventListener('click', async () => {
  await db.auth.signOut();
  showMessage('');
});
