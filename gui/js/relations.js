// Родственные связи и пикеры карточек
// Часть family_tree_tool GUI. Общий глобальный скоуп (см. index.html — файлы грузятся по порядку).

function parseRelationLabel(value) {
  const match = value.match(/^xref:[^\[]+\[(.+?)\]/);
  if (!match) {
    return value;
  }
  return relationIsNative(value) ? `${match[1]} · род` : match[1];
}

function parseRelationPath(value) {
  const match = value.match(/^xref:([^\[]+)\[(.+?)\]/);
  return match ? match[1] : "";
}

function relationIsNative(value) {
  return /\{род\}\s*$/.test(String(value).trim());
}

function relationPrefix(fieldName) {
  return {
    siblings: "С",
    children: "Р",
    partners: "П",
    groups: "Г",
    participants: "У",
  }[fieldName] || "";
}

function parseRelationEntries(fieldName) {
  const rawValue = String(form.elements[fieldName]?.value || "").trim();
  if (!rawValue) {
    return [];
  }

  try {
    const payload = JSON.parse(rawValue);
    if (Array.isArray(payload)) {
      return payload
        .filter((item) => item && typeof item === "object" && item.value)
        .map((item, index) => ({
          index: /^\d{2}$/.test(String(item.index || "")) ? String(item.index) : String(index + 1).padStart(2, "0"),
          value: String(item.value).trim(),
          native: fieldName === "parents" ? Boolean(item.native) : false,
        }))
        .sort((left, right) => Number(left.index) - Number(right.index));
    }
  } catch {}

  return rawValue
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, index) => ({
      index: String(index + 1).padStart(2, "0"),
      value: String(item).replace(/\s*\{род\}\s*$/, "").trim(),
      native: fieldName === "parents" && relationIsNative(item),
    }));
}

function serializeRelationEntries(fieldName, entries) {
  return JSON.stringify(
    entries.map((entry, index) => ({
      index: /^\d{2}$/.test(String(entry.index || "")) ? String(entry.index) : String(index + 1).padStart(2, "0"),
      value: String(entry.value || "").trim(),
      native: fieldName === "parents" ? Boolean(entry.native) : false,
    })),
  );
}

function displayRelationIndex(fieldName, entry) {
  const prefix = relationPrefix(fieldName);
  return prefix ? `${prefix}${entry.index}` : entry.index;
}

function nextRelationIndex(entries) {
  const maxIndex = entries.reduce((currentMax, entry) => Math.max(currentMax, Number(entry.index || "0")), 0);
  return String(maxIndex + 1).padStart(2, "0");
}

function renumberRelationEntries(entries) {
  return entries.map((entry, index) => ({
    ...entry,
    index: String(index + 1).padStart(2, "0"),
  }));
}

function relationTargetPath(value) {
  const relativePath = parseRelationPath(value);
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

function relationValues(fieldName) {
  return parseRelationEntries(fieldName);
}

function updateRelationField(fieldName, values) {
  form.elements[fieldName].value = serializeRelationEntries(fieldName, values);
}

function renderRelationLists() {
  relationLists.forEach((container) => {
    const fieldName = container.dataset.relationList;
    const values = relationValues(fieldName);
    if (!values.length) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = values
      .map(
        (value, index) => `
          <div class="relation-row">
            <span class="relation-row-index">${escapeHtml(displayRelationIndex(fieldName, value))}</span>
            <button
              class="relation-link"
              type="button"
              data-open-relation="${escapeHtml(relationTargetPath(value.value))}"
            >
              <span class="relation-row-text">${escapeHtml(value.native ? `${parseRelationLabel(value.value)} · род` : parseRelationLabel(value.value))}</span>
            </button>
            <div class="relation-row-controls">
              ${fieldName === "parents" ? `
                <button
                  class="relation-meta-toggle ${value.native ? "is-active" : ""}"
                  type="button"
                  data-toggle-parent-native="${index}"
                >
                  род
                </button>
              ` : ""}
              <button
                class="relation-order"
                type="button"
                data-move-relation="${escapeHtml(fieldName)}"
                data-move-index="${index}"
                data-move-direction="up"
                ${index === 0 ? "disabled" : ""}
              >
                ↑
              </button>
              <button
                class="relation-order"
                type="button"
                data-move-relation="${escapeHtml(fieldName)}"
                data-move-index="${index}"
                data-move-direction="down"
                ${index === values.length - 1 ? "disabled" : ""}
              >
                ↓
              </button>
              <button
                class="relation-remove"
                type="button"
                data-remove-relation="${escapeHtml(fieldName)}"
                data-remove-index="${index}"
              >
                Удалить
              </button>
            </div>
          </div>
        `,
      )
      .join("");
  });
}

function appendRelationValue(fieldName, value, options = {}) {
  const field = form.elements[fieldName];
  if (!field) {
    return;
  }
  const entries = relationValues(fieldName);
  const nextPath = relationTargetPath(String(value || "").trim());
  if (entries.some((entry) => relationTargetPath(entry.value) === nextPath)) {
    return;
  }
  entries.push({
    index: nextRelationIndex(entries),
    value: String(value || "").trim(),
    native: fieldName === "parents" ? options.native !== false : false,
  });
  updateRelationField(fieldName, renumberRelationEntries(entries));
  renderRelationLists();
}

function pickerCards(type) {
  if (type === "person") {
    return allCards.filter((card) => card.card_type === "person");
  }
  if (type === "group") {
    return allCards.filter((card) => card.card_type === "group");
  }
  if (type === "place") {
    return allCards.filter((card) => card.card_type === "place");
  }
  if (type === "source") {
    return allCards.filter((card) => card.card_type === "source");
  }
  if (type === "research") {
    return allCards.filter((card) => card.card_type === "research");
  }
  return allCards;
}

function renderRelationPickers() {
  relationPickers.forEach((picker) => {
    const target = picker.dataset.pickerTarget;
    const type = picker.dataset.pickerType;
    const options = pickerCards(type)
      .map(
        (card) =>
          `<option value="${escapeHtml(card.path)}">${escapeHtml(card.display_label)}</option>`,
      )
      .join("");

    picker.innerHTML = `
      <div class="picker-row">
        <select class="picker-select is-empty" data-picker-select="${escapeHtml(target)}">
          <option value="">Выбери существующую карточку</option>
          ${options}
        </select>
      </div>
    `;
  });
}

function renderPlacePickers() {
  const options = [
    '<option value="">Выбери карточку места</option>',
    ...placeCards().map((card) => {
      const label = [card.display_label, card.place_type].filter(Boolean).join(" · ");
      return `<option value="${escapeHtml(card.path)}">${escapeHtml(label)}</option>`;
    }),
  ].join("");

  [birthPlacePicker, deathPlacePicker].forEach((select) => {
    if (!select) {
      return;
    }
    select.innerHTML = options;
    updatePickerPlaceholderState(select);
  });
}

function applyPlaceCard(fieldName, cardPath) {
  const targetCard = allCards.find((card) => card.path === cardPath && card.card_type === "place");
  if (!targetCard || !form.elements[fieldName]) {
    return;
  }
  form.elements[fieldName].value = placeXref(targetCard);
  renderPlaceReferences();
}

function rawPlaceFieldValue(fieldName) {
  const field = form.elements[fieldName];
  if (!field) {
    return "";
  }
  return field.value || "";
}

function clearPlaceField(fieldName) {
  const field = form.elements[fieldName];
  if (!field) {
    return;
  }
  field.value = "";
  renderPlaceReferences();
}

function openPlaceField(fieldName) {
  const targetPath = placeFieldTargetPath(rawPlaceFieldValue(fieldName));
  if (!targetPath) {
    return;
  }
  startEditing(targetPath).catch((error) => setStatus(error.message, "error"));
}

function updatePickerPlaceholderState(select) {
  if (!select) {
    return;
  }
  select.classList.toggle("is-empty", !select.value);
}

function cardXref(targetCard) {
  return `xref:${buildRelativeCardPath(currentType(), targetCard)}[${targetCard.display_label}]`;
}

function placeXref(targetCard) {
  return `xref:${buildRelativeCardPath(currentType(), targetCard)}[${targetCard.title}]`;
}

