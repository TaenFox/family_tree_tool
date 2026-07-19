// Поля формы: составное имя, ввод дат (маска + календарь), подсказки мест
// Часть family_tree_tool GUI. Общий глобальный скоуп (см. index.html — файлы грузятся по порядку).

// --- Составное имя (Фамилия / Имя / Отчество) -------------------------------

function syncPersonPrimaryName() {
  if (currentType() !== "person") {
    return;
  }
  const parts = [form.elements.surname, form.elements.givenName, form.elements.patronymic]
    .map((element) => (element ? element.value.trim() : ""))
    .filter(Boolean);
  form.elements.primaryName.value = parts.join(" ");
  updateModeUi();
}

["surname", "givenName", "patronymic"].forEach((name) => {
  const element = form.elements[name];
  if (element) {
    element.addEventListener("input", syncPersonPrimaryName);
  }
});

// Девичья / вторая фамилия — необязательное поле, скрыто за чекбоксом.
function setMaidenFieldVisible(visible) {
  if (maidenToggle) {
    maidenToggle.checked = visible;
  }
  maidenNameField?.classList.toggle("is-hidden", !visible);
}

if (maidenToggle) {
  maidenToggle.addEventListener("change", () => {
    setMaidenFieldVisible(maidenToggle.checked);
    if (!maidenToggle.checked && form.elements.maidenName) {
      form.elements.maidenName.value = "";
    } else if (maidenToggle.checked) {
      form.elements.maidenName?.focus();
    }
  });
}

// --- Дата: авто-подстановка точек при вводе + календарь ----------------------

function maskDateValue(raw) {
  // Свободный текст с буквами («около 1920», «до 1917») не трогаем.
  if (/[^\d.\s]/.test(raw)) {
    return raw;
  }
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  // Короткий ввод (в т.ч. одиночный год до 4 цифр) оставляем как есть.
  if (digits.length <= 4) {
    return raw;
  }
  let out = `${digits.slice(0, 2)}.${digits.slice(2, 4)}`;
  out += `.${digits.slice(4)}`;
  return out;
}

["birthDate", "deathDate"].forEach((name) => {
  const element = form.elements[name];
  if (!element) {
    return;
  }
  element.addEventListener("input", () => {
    const masked = maskDateValue(element.value);
    if (masked !== element.value) {
      element.value = masked;
    }
  });
});

document.querySelectorAll("[data-date-picker]").forEach((button) => {
  button.addEventListener("click", () => {
    const name = button.dataset.datePicker;
    const native = document.querySelector(`[data-date-native="${name}"]`);
    const field = form.elements[name];
    if (!native || !field) {
      return;
    }
    const match = field.value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (match) {
      native.value = `${match[3]}-${match[2]}-${match[1]}`;
    }
    if (typeof native.showPicker === "function") {
      try {
        native.showPicker();
        return;
      } catch (error) {
        // showPicker может бросить вне пользовательского жеста — падаем в focus ниже.
      }
    }
    native.focus();
    native.click();
  });
});

document.querySelectorAll("[data-date-native]").forEach((native) => {
  native.addEventListener("change", () => {
    const name = native.dataset.dateNative;
    const field = form.elements[name];
    if (!field || !native.value) {
      return;
    }
    const [year, month, day] = native.value.split("-");
    field.value = `${day}.${month}.${year}`;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
});

// --- Место рождения / смерти: комбобокс с подсказками из справочника ---------

const PLACE_COMBOBOX_FIELDS = ["birthPlace", "deathPlace"];
const placeSuggestTimers = {};

function placeComboboxEls(field) {
  return {
    search: document.querySelector(`[data-place-search="${field}"]`),
    list: document.querySelector(`[data-place-suggestions="${field}"]`),
    hint: document.querySelector(`[data-place-hint="${field}"]`),
  };
}

function hidePlaceSuggestions(field) {
  const { list } = placeComboboxEls(field);
  if (list) {
    list.classList.add("is-hidden");
    list.innerHTML = "";
    list._suggestions = [];
    list._query = "";
    list._active = -1;
  }
}

function setPlaceHint(field, text, tone = "") {
  const { hint } = placeComboboxEls(field);
  if (!hint) {
    return;
  }
  hint.textContent = text || "";
  hint.className = `place-suggest-hint${tone ? ` is-${tone}` : ""}`;
}

function setPlaceTextValue(field, text) {
  const element = form.elements[field];
  if (!element) {
    return;
  }
  element.value = String(text || "").trim();
  renderPlaceReferences();
}

function renderPlaceSuggestions(field, query, suggestions) {
  const { list } = placeComboboxEls(field);
  if (!list) {
    return;
  }
  const rows = suggestions.map((item, index) => {
    const meta = item.meta ? `<span class="place-suggest-meta">${escapeHtml(item.meta)}</span>` : "";
    const tag = item.kind === "card" ? `<span class="place-suggest-tag">карточка</span>` : "";
    return `
      <li class="place-suggest-item" data-place-index="${index}" role="option">
        <span class="place-suggest-main">${escapeHtml(item.label)}${tag}</span>
        ${meta}
      </li>
    `;
  });
  const trimmed = query.trim();
  if (trimmed) {
    rows.push(`
      <li class="place-suggest-item place-suggest-freetext" data-place-index="free" role="option">
        <span class="place-suggest-main">Оставить как есть: «${escapeHtml(trimmed)}»</span>
      </li>
    `);
  }
  list.innerHTML = rows.join("");
  list.classList.remove("is-hidden");
  list._suggestions = suggestions;
  list._query = trimmed;
  list._active = -1;
}

async function fetchPlaceSuggestions(field, query) {
  if (!query.trim()) {
    hidePlaceSuggestions(field);
    setPlaceHint(field, "");
    return;
  }
  try {
    const response = await fetch(`/api/place-suggest?q=${encodeURIComponent(query)}&limit=8`);
    const data = await response.json().catch(() => ({}));
    renderPlaceSuggestions(field, query, data.suggestions || []);
  } catch (error) {
    hidePlaceSuggestions(field);
  }
}

function choosePlaceSuggestion(field, index) {
  const { list, search } = placeComboboxEls(field);
  if (!list) {
    return;
  }
  const suggestions = list._suggestions || [];
  const query = list._query || "";

  if (index === "free") {
    setPlaceTextValue(field, query);
    setPlaceHint(field, "Свободный ввод — в справочнике не найдено", "warn");
  } else {
    const suggestion = suggestions[Number(index)];
    if (!suggestion) {
      return;
    }
    if (suggestion.kind === "card") {
      applyPlaceCard(field, suggestion.path);
      setPlaceHint(field, "✓ связано с карточкой места", "ok");
    } else {
      setPlaceTextValue(field, suggestion.value);
      setPlaceHint(field, "✓ найдено в справочнике", "ok");
    }
  }

  if (search) {
    search.value = "";
  }
  hidePlaceSuggestions(field);
}

function movePlaceActive(field, delta) {
  const { list } = placeComboboxEls(field);
  if (!list || list.classList.contains("is-hidden")) {
    return;
  }
  const items = Array.from(list.querySelectorAll(".place-suggest-item"));
  if (!items.length) {
    return;
  }
  let active = typeof list._active === "number" ? list._active : -1;
  active = (active + delta + items.length) % items.length;
  list._active = active;
  items.forEach((item, index) => item.classList.toggle("is-active", index === active));
}

PLACE_COMBOBOX_FIELDS.forEach((field) => {
  const { search, list } = placeComboboxEls(field);
  if (!search || !list) {
    return;
  }

  search.addEventListener("input", () => {
    const query = search.value;
    window.clearTimeout(placeSuggestTimers[field]);
    placeSuggestTimers[field] = window.setTimeout(() => {
      fetchPlaceSuggestions(field, query);
    }, 180);
  });

  search.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      movePlaceActive(field, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      movePlaceActive(field, -1);
    } else if (event.key === "Enter") {
      if (!list.classList.contains("is-hidden")) {
        event.preventDefault();
        const active = typeof list._active === "number" ? list._active : -1;
        const items = Array.from(list.querySelectorAll(".place-suggest-item"));
        const target = active >= 0 ? items[active] : items[0];
        if (target) {
          choosePlaceSuggestion(field, target.dataset.placeIndex);
        }
      }
    } else if (event.key === "Escape") {
      hidePlaceSuggestions(field);
    }
  });

  search.addEventListener("focus", () => {
    if (search.value.trim()) {
      fetchPlaceSuggestions(field, search.value);
    }
  });

  search.addEventListener("blur", () => {
    // Небольшая задержка, чтобы клик по подсказке успел сработать.
    window.setTimeout(() => hidePlaceSuggestions(field), 150);
  });

  // mousedown вместо click, чтобы не потерять фокус до выбора.
  list.addEventListener("mousedown", (event) => {
    const item = event.target.closest("[data-place-index]");
    if (!item) {
      return;
    }
    event.preventDefault();
    choosePlaceSuggestion(field, item.dataset.placeIndex);
  });
});
