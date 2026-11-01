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
    document.getElementById('user-email').textContent = session.user.email;
    showScreen('app-screen');
  } else {
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
  document.getElementById('user-email').textContent = data.user.email;
  showScreen('app-screen');
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
