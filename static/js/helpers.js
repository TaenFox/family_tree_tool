// Общие помощники: escapeHtml, ссылки на места, статус, режимы
// Часть family_tree_tool GUI. Общий глобальный скоуп (см. index.html — файлы грузятся по порядку).

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function currentType() {
  return form.elements.cardType.value;
}

function currentEditorIdentity() {
  if (!editingState) {
    return null;
  }
  return {
    cardType: currentType(),
    directory: editingState.directory,
  };
}

function buildFormPayload() {
  const payload = Object.fromEntries(new FormData(form).entries());
  if (currentType() === "person") {
    payload.birthPlace = rawPlaceFieldValue("birthPlace");
    payload.deathPlace = rawPlaceFieldValue("deathPlace");
  }
  return payload;
}

function sectionForCardType(type) {
  return type === "person" ? "03-people" : type === "group" ? "04-groups" : type === "place" ? "05-places" : type === "source" ? "06-sources" : "07-research";
}

function buildRelativeCardPath(sourceType, targetCard) {
  const sourceBase = `${sectionForCardType(sourceType)}/current/card.adoc`.split("/");
  const targetBase = `${sectionForCardType(targetCard.card_type)}/${targetCard.directory}/card.adoc`.split("/");
  sourceBase.pop();

  while (sourceBase.length && targetBase.length && sourceBase[0] === targetBase[0]) {
    sourceBase.shift();
    targetBase.shift();
  }

  const prefix = sourceBase.map(() => "..");
  return [...prefix, ...targetBase].join("/");
}

function placeCardByValue(value) {
  const targetPath = placeFieldTargetPath(value);
  if (!targetPath) {
    return null;
  }
  return placeCardByPath(targetPath);
}

function normalizePlaceReferenceValue(value) {
  const targetCard = placeCardByValue(value);
  if (!targetCard) {
    return String(value || "").trim();
  }
  return placeXref(targetCard);
}

function placeFieldDisplayValue(value) {
  const targetCard = placeCardByValue(value);
  if (targetCard) {
    return targetCard.title;
  }
  return parseXrefLabel(value).trim();
}

function placeFieldTargetPath(value) {
  const relativePath = parseXrefPath(value);
  if (!relativePath) {
    return "";
  }
  const baseDir = `${sectionForCardType(currentType())}/current`;
  const segments = `${baseDir}/${relativePath}`.split("/");
  const normalized = [];

  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }

  return normalized.join("/");
}

function placeReferenceHtml(value, { fieldName = "", rowIndex = null } = {}) {
  const targetCard = placeCardByValue(value);
  const empty = !String(value || "").trim();
  const openAttr = fieldName
    ? `data-open-place-field="${escapeHtml(fieldName)}"`
    : `data-fact-place-open="${escapeHtml(String(rowIndex))}"`;
  const clearAttr = fieldName
    ? `data-clear-place-field="${escapeHtml(fieldName)}"`
    : `data-fact-place-clear="${escapeHtml(String(rowIndex))}"`;

  if (empty) {
    // Пусто — карточку-ссылку не показываем, остаётся только строка ввода
    // (чтобы не было двух полей с одним смыслом). Для фактов сохраняем плейсхолдер.
    if (fieldName) {
      return "";
    }
    return `
      <div class="place-reference-card is-empty">
        <div class="place-reference-copy">
          <span class="place-reference-placeholder">Место не выбрано</span>
        </div>
      </div>
    `;
  }

  const title = targetCard ? targetCard.title : placeFieldDisplayValue(value);
  const number = targetCard?.number || "";
  const type = targetCard?.place_type || "";
  const meta = [number, type].filter(Boolean).join(" · ");

  return `
    <div class="place-reference-card">
      <button class="place-reference-open" type="button" ${openAttr}>
        <span class="place-reference-copy">
          ${meta ? `<span class="place-reference-meta">${escapeHtml(meta)}</span>` : ""}
          <span class="place-reference-title">${escapeHtml(title)}</span>
        </span>
      </button>
      <button class="place-reference-clear" type="button" ${clearAttr} aria-label="Очистить выбранное место">×</button>
    </div>
  `;
}

function renderPlaceReferences() {
  placeReferenceSlots.forEach((slot) => {
    const fieldName = slot.dataset.placeReference;
    const field = form.elements[fieldName];
    if (!field) {
      return;
    }
    const hasValue = Boolean(String(field.value || "").trim());
    slot.innerHTML = placeReferenceHtml(field.value, { fieldName });
    // Строку ввода прячем, когда место уже выбрано (одно поле вместо двух).
    const combobox = document.querySelector(`[data-place-combobox="${fieldName}"]`);
    combobox?.classList.toggle("is-hidden", hasValue);
    if (!hasValue) {
      const hint = document.querySelector(`[data-place-hint="${fieldName}"]`);
      if (hint) {
        hint.textContent = "";
        hint.className = "place-suggest-hint";
      }
    }
  });
}

function nextCardNumber(type) {
  const prefix = type === "person" ? "К" : type === "group" ? "Г" : type === "place" ? "М" : type === "source" ? "И" : "В";
  const maxValue = allCards
    .filter((card) => card.card_type === type)
    .reduce((currentMax, card) => Math.max(currentMax, parseInt(card.number.split("-")[1], 10)), 0);
  return `${prefix}-${String(maxValue + 1).padStart(3, "0")}`;
}

function isEditing() {
  return Boolean(editingState);
}

function setStatus(message, tone = "") {
  statusNode.textContent = message;
  statusNode.className = "status";
  if (tone) {
    statusNode.classList.add(`is-${tone}`);
  }
}

function imageUrl(cardType, directory, filename) {
  return `/api/image?type=${encodeURIComponent(cardType)}&directory=${encodeURIComponent(directory)}&name=${encodeURIComponent(filename)}`;
}

function sanitizeImageName(filename) {
  return String(filename).trim().replace(/[^0-9A-Za-zА-Яа-яЁё._-]+/g, "-");
}

function clearPhotoPreview() {
  photoPreview.classList.add("is-empty");
  photoPreviewImage.removeAttribute("src");
}

function setPhotoPreview(src) {
  photoPreview.classList.remove("is-empty");
  photoPreviewImage.src = src;
}

function hasDeathData() {
  return Boolean(form.elements.deathDate.value.trim() || form.elements.deathPlace.value.trim());
}

function setDeathFieldsVisible(visible) {
  deathFieldsVisible = visible;
  deathDateField.classList.toggle("is-hidden", !visible);
  deathPlaceField.classList.toggle("is-hidden", !visible);
  if (deathToggle) {
    deathToggle.checked = visible;
  }
}

function applyNotesMode(mode) {
  notesMode = mode === "editor" ? "editor" : "preview";
  notesToolbar.classList.toggle("is-hidden", notesMode !== "editor");
  notesEditorPanel.classList.toggle("is-hidden", notesMode !== "editor");
  notesPreview.classList.toggle("is-hidden", notesMode !== "preview");
  notesModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.notesMode === notesMode);
  });
}

function setFormLocked(locked) {
  formLocked = locked;
  formPanel.classList.toggle("is-locked", locked);
  // Блокируем все интерактивные элементы формы. Значения читаются и в
  // disabled-состоянии, поэтому это безопасно для сохранения после разблокировки.
  formPanel.querySelectorAll("input, select, textarea, button").forEach((element) => {
    element.disabled = locked;
  });
  updateModeUi();
}

function applyEditorView(mode) {
  editorView = mode === "graph" ? "graph" : "form";
  formPanel.classList.toggle("is-hidden", editorView !== "form");
  graphPanel.classList.toggle("is-hidden", editorView !== "graph");
  editorViewButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.editorView === editorView);
  });
  updateModeUi();
  if (editorView === "graph") {
    renderGraph();
  }
}

