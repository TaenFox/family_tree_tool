// Модальное окно поиска связи между карточками
// Часть family_tree_tool GUI. Общий глобальный скоуп (см. index.html — файлы грузятся по порядку).

function renderNavigationCodeOptions() {
  const options = ['<option value="">Выбери человека</option>']
    .concat(
      personCards().map(
        (card) => `<option value="${escapeHtml(card.directory)}">${escapeHtml(card.display_label)}</option>`,
      ),
    )
    .join("");

  const previousFrom = navCodeFromSelect.value;
  const previousTo = navCodeToSelect.value;
  navCodeFromSelect.innerHTML = options;
  navCodeToSelect.innerHTML = options;

  const personDirectories = new Set(personCards().map((card) => card.directory));
  navCodeFromSelect.value = personDirectories.has(previousFrom) ? previousFrom : "";
  navCodeToSelect.value = personDirectories.has(previousTo) ? previousTo : "";

  if (!navCodeToSelect.value && editingState && currentType() === "person" && personDirectories.has(editingState.directory)) {
    navCodeToSelect.value = editingState.directory;
  }

  renderNavigationCodeAnchorOptions();
}

function closeNavigationLookupDialog() {
  if (navLookupDialog?.open) {
    navLookupDialog.close();
  }
}

function openNavigationLookupDialog() {
  if (!navLookupDialog || typeof navLookupDialog.showModal !== "function") {
    setStatus("Этот браузер не поддерживает модальное окно поиска связи.", "error");
    return;
  }
  renderNavigationCodeOptions();
  resetNavigationCodeResult();
  if (navLookupDialog.open) {
    return;
  }
  navLookupDialog.showModal();
  navCodeFromSelect.focus();
}

function resetNavigationCodeResult(message = "Маршрут строится по текущим связям людей и не записывается в карточку.") {
  navCodeResults.innerHTML = `<p class="graph-tool-hint">${escapeHtml(message)}</p>`;
}

function renderNavigationRoute(cards) {
  if (!Array.isArray(cards) || !cards.length) {
    return "";
  }

  return `
    <div class="graph-route-list">
      ${cards
        .map(
          (card, index) => `
            ${index ? '<div class="graph-route-arrow">↓</div>' : ""}
            <button class="graph-route-card is-button" type="button" data-open-nav-card="${escapeHtml(card.path)}">
              <span class="graph-route-number">${escapeHtml(card.number || `Шаг ${index + 1}`)}</span>
              <span class="graph-route-title">${escapeHtml(card.title || card.display_label || "...")}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderNavigationCodeResult(payload) {
  if (payload.status !== "resolved" || !payload.variants?.length) {
    navCodeResults.innerHTML = `<p class="graph-tool-empty">${escapeHtml(payload.message || "Маршрут не найден.")}</p>`;
    return;
  }

  navCodeResults.innerHTML = `
    <p class="graph-tool-hint">${escapeHtml(payload.message || "Найденные маршруты.")}</p>
    <div class="graph-code-list">
      ${payload.variants
        .map(
          (item) => `
            <div class="graph-code-item">
              <div class="graph-code-main">
                <div>
                  <p class="graph-code-value">${escapeHtml(item.code)}</p>
                  <p class="graph-code-meta">${item.steps === 0 ? "Та же карточка" : `Переходов: ${item.steps}`}</p>
                </div>
                ${renderNavigationRoute(item.cards)}
              </div>
              <button class="button button-secondary small" type="button" data-copy-nav-code="${escapeHtml(item.code)}">Копировать</button>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

async function buildNavigationCode() {
  if (!navCodeFromSelect.value || !navCodeToSelect.value) {
    resetNavigationCodeResult("Сначала выбери опорную и целевую карточки.");
    return;
  }

  navCodeResults.innerHTML = '<p class="graph-tool-hint">Ищу маршрут между выбранными карточками...</p>';
  const response = await fetch(
    `/api/navigation-code?from=${encodeURIComponent(navCodeFromSelect.value)}&to=${encodeURIComponent(navCodeToSelect.value)}`,
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Не удалось построить маршрут между карточками.");
  }
  renderNavigationCodeResult(payload);
}

