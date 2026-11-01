// Порядок подкатегорий: окно со списком подкатегорий одной категории, их перетаскивают за ручку.
// Подключается после app.js и пользуется его функциями: db, CATEGORIES, allItems, allSubcategories,
// loadEquipment, translateError.

const reorderDialog = document.getElementById('reorder-dialog');
const reorderList = document.getElementById('reorder-list');
const reorderMessage = document.getElementById('reorder-message');
const saveReorderButton = document.getElementById('save-reorder-button');

// Переименования и удаления сохраняются сразу; если они были — при закрытии окна обновим список
let subcategoriesChanged = false;

// Открыть окно для категории (value из CATEGORIES)
function openReorder(category) {
  const label = CATEGORIES.find((c) => c.value === category)?.label || category;
  document.getElementById('reorder-title').textContent = `Подкатегории: ${label}`;
  reorderMessage.textContent = '';
  subcategoriesChanged = false;

  const subs = allSubcategories.filter((s) => s.category === category);
  reorderList.replaceChildren(...subs.map((sub) => {
    const items = allItems.filter((item) => item.subcategory_id === sub.id);
    // Подсказка, чтобы различать подкатегории с одинаковыми названиями: сколько приборов и каких фирм
    const makers = [...new Set(items.map((i) => i.manufacturer).filter(Boolean))].slice(0, 3);

    const li = document.createElement('li');
    li.dataset.id = sub.id;

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.setAttribute('aria-label', `Переместить «${sub.name}» (стрелки вверх и вниз)`);

    const name = document.createElement('span');
    name.className = 'reorder-name';
    name.textContent = sub.name;

    const hint = document.createElement('span');
    hint.className = 'reorder-hint';
    hint.textContent = [`${items.length} шт.`, ...makers].join(' · ');

    // Кнопки справа: переименовать и удалить
    const renameButton = iconButton('✎', `Переименовать «${sub.name}»`, () => startRename(li, sub));
    const deleteButton = iconButton('✕', `Удалить «${sub.name}»`, () => deleteSubcategory(li, sub, items.length));
    deleteButton.classList.add('danger-icon');
    const actions = document.createElement('span');
    actions.className = 'reorder-actions';
    actions.append(renameButton, deleteButton);

    li.append(handle, name, hint, actions);
    return li;
  }));

  if (!subs.length) reorderMessage.textContent = 'В этой категории пока нет подкатегорий.';
  saveReorderButton.disabled = !subs.length;
  reorderDialog.showModal();
}

// Перетаскивание. Pointer-события одинаково работают с мышью и пальцем.
let dragged = null;

reorderList.addEventListener('pointerdown', (e) => {
  const handle = e.target.closest('.drag-handle');
  if (!handle) return;
  e.preventDefault();
  dragged = handle.closest('li');
  dragged.classList.add('dragging');
  handle.setPointerCapture(e.pointerId); // дальше все движения пальца/мыши придут сюда, даже вне ручки
});

reorderList.addEventListener('pointermove', (e) => {
  if (!dragged) return;
  // Если палец выше середины предыдущей строки — меняемся с ней местами, ниже середины следующей — с той
  let prev = dragged.previousElementSibling;
  while (prev && e.clientY < middleOf(prev)) {
    reorderList.insertBefore(dragged, prev);
    prev = dragged.previousElementSibling;
  }
  let next = dragged.nextElementSibling;
  while (next && e.clientY > middleOf(next)) {
    reorderList.insertBefore(next, dragged);
    next = dragged.nextElementSibling;
  }
  // Длинный список: у края окна прокручиваем его сами
  const box = reorderDialog.getBoundingClientRect();
  if (e.clientY < box.top + 60) reorderDialog.scrollTop -= 12;
  if (e.clientY > box.bottom - 60) reorderDialog.scrollTop += 12;
});

function middleOf(el) {
  const r = el.getBoundingClientRect();
  return r.top + r.height / 2;
}

function stopDrag() {
  if (!dragged) return;
  dragged.classList.remove('dragging');
  dragged = null;
}
reorderList.addEventListener('pointerup', stopDrag);
reorderList.addEventListener('pointercancel', stopDrag);

// С клавиатуры: фокус на ручке, стрелки вверх/вниз двигают строку
reorderList.addEventListener('keydown', (e) => {
  const handle = e.target.closest('.drag-handle');
  if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const li = handle.closest('li');
  if (e.key === 'ArrowUp' && li.previousElementSibling) reorderList.insertBefore(li, li.previousElementSibling);
  if (e.key === 'ArrowDown' && li.nextElementSibling) reorderList.insertBefore(li.nextElementSibling, li);
  handle.focus();
});

// Сохранить: отправляем номера подкатегорий в новом порядке одним запросом
saveReorderButton.addEventListener('click', async () => {
  const ids = [...reorderList.children].map((li) => Number(li.dataset.id));
  saveReorderButton.disabled = true;
  reorderMessage.textContent = 'Сохраняем…';
  const { error } = await db.rpc('reorder_subcategories', { ids });
  saveReorderButton.disabled = false;
  if (error) {
    reorderMessage.textContent = translateError(error);
    return;
  }
  subcategoriesChanged = true;
  reorderDialog.close();
});

document.getElementById('close-reorder-button').addEventListener('click', () => reorderDialog.close());
document.getElementById('cancel-reorder-button').addEventListener('click', () => reorderDialog.close());

// Окно закрылось любым способом (кнопка, Esc) — если что-то меняли, перечитываем список из базы
reorderDialog.addEventListener('close', () => {
  if (subcategoriesChanged) loadEquipment();
});

// Маленькая кнопка с значком
function iconButton(symbol, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.textContent = symbol;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

// Переименовать: название превращается в поле ввода. Enter или уход с поля — сохранить, Esc — отменить.
function startRename(li, sub) {
  const nameSpan = li.querySelector('.reorder-name');
  if (li.querySelector('.rename-input')) return; // уже редактируем
  const input = document.createElement('input');
  input.className = 'rename-input';
  input.value = sub.name;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;
  async function finish(save) {
    if (finished) return;
    finished = true;
    const newName = input.value.trim();
    if (save && newName && newName !== sub.name) {
      input.disabled = true;
      const { data, error } = await db.from('subcategories')
        .update({ name: newName }).eq('id', sub.id).select('name').single();
      if (error) {
        reorderMessage.textContent = translateError(error);
      } else {
        sub.name = data.name; // база могла поправить: убрать пробелы, сделать заглавную букву
        subcategoriesChanged = true;
        reorderMessage.textContent = '';
      }
    }
    nameSpan.textContent = sub.name;
    input.replaceWith(nameSpan);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } // Esc не закрывает окно
  });
  input.addEventListener('blur', () => finish(true));
}

// Удалить подкатегорию. Приборы не удаляются — переходят в «Прочее» своей категории.
async function deleteSubcategory(li, sub, count) {
  const question = count
    ? `Удалить подкатегорию «${sub.name}»? Её приборы (${count} шт.) не удалятся, а перейдут в «Прочее».`
    : `Удалить пустую подкатегорию «${sub.name}»?`;
  if (!confirm(question)) return;

  // Как и с приборами: если правила не разрешили, база ничего не удаляет и не выдаёт ошибку
  const { data, error } = await db.from('subcategories').delete().eq('id', sub.id).select('id');
  if (error || !data.length) {
    reorderMessage.textContent = error
      ? translateError(error)
      : 'Нет прав: удалить подкатегорию может тот, кто её создал, или админ';
    return;
  }
  li.remove();
  allSubcategories = allSubcategories.filter((s) => s.id !== sub.id);
  subcategoriesChanged = true;
  reorderMessage.textContent = `Подкатегория «${sub.name}» удалена.`;
  saveReorderButton.disabled = !reorderList.children.length;
}
