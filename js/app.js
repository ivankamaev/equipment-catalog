// Клиент Supabase: через него идут все запросы к базе, хранилищу и авторизации
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Ссылка из письма (приглашение или сброс пароля) приносит в адресе #...&type=invite или type=recovery.
// Читаем это до того, как Supabase разберёт и очистит адрес.
const hashParams = new URLSearchParams(location.hash.slice(1));
let needsPassword = ['invite', 'recovery'].includes(hashParams.get('type'));

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
  status.textContent = data.length ? `Позиций: ${data.length}` : 'Пока ничего не добавлено';
  renderEquipment(data);
}

// Нарисовать карточки списка
function renderEquipment(items) {
  const list = document.getElementById('equipment-list');
  list.replaceChildren(); // очистить старый список

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'item';

    // Строка 1: название и цена
    const row = document.createElement('div');
    row.className = 'item-row';
    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = item.name;
    const price = document.createElement('span');
    price.className = 'item-price';
    price.textContent = item.rental_price != null ? `${formatNumber(item.rental_price)} ₽/сут` : '';
    row.append(name, price);

    // Строка 2: производитель и модель
    const model = document.createElement('div');
    model.className = 'item-model';
    model.textContent = [item.manufacturer, item.model].filter(Boolean).join(' ');

    // Строка 3: вес и потребление
    const specs = document.createElement('div');
    specs.className = 'item-specs';
    specs.textContent = [
      item.weight_kg != null ? `${formatNumber(item.weight_kg)} кг` : '',
      item.power_w != null ? `${formatNumber(item.power_w)} Вт` : '',
    ].filter(Boolean).join(' · ');

    const category = document.createElement('span');
    category.className = 'item-category';
    category.textContent = item.category;

    li.append(row, model, specs, category);
    list.append(li);
  }
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
