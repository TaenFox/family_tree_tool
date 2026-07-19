// Таблицы: факты, переименования, дневник исследования
// Часть family_tree_tool GUI. Общий глобальный скоуп (см. index.html — файлы грузятся по порядку).

function emptyFactRow() {
  return { date: "", fact: "", place: "", source: "", note: "" };
}

function emptyRenameRow() {
  return { date: "", name: "", note: "" };
}

function normalizeFacts(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => ({
      date: String(item.date || "").trim(),
      fact: String(item.fact || "").trim(),
      place: normalizePlaceReferenceValue(String(item.place || "").trim()),
      source: serializeFactSourceEntries(parseFactSourceEntries(item.source || "")),
      note: String(item.note || "").trim(),
    }));
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return normalizeFacts(parsed);
    }
  } catch {}

  return String(value)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((fact) => ({ date: "", fact, place: "", source: "", note: "" }));
}

function parseFactSourceEntries(value) {
  if (!value) {
    return [];
  }

  const items = Array.isArray(value)
    ? value.map((item) => String(item || "").trim())
    : String(value)
        .split(";")
        .map((item) => item.trim());

  const normalized = [];
  const seen = new Set();
  items.forEach((item) => {
    if (!item || seen.has(item)) {
      return;
    }
    seen.add(item);
    normalized.push(item);
  });
  return normalized;
}

function serializeFactSourceEntries(entries) {
  return parseFactSourceEntries(entries).join("; ");
}

function factSourceLabel(value) {
  return parseRelationLabel(value);
}

function factSourcePath(value) {
  return relationTargetPath(value);
}

function renderFactSourceList(value, index) {
  const entries = parseFactSourceEntries(value);
  if (!entries.length) {
    return '<div class="fact-source-empty">Источники не выбраны</div>';
  }

  return `
    <div class="fact-source-list">
      ${entries
        .map(
          (entry, entryIndex) => `
            <div class="fact-source-row">
              <button
                class="fact-source-open"
                type="button"
                data-open-fact-source="${index}"
                data-fact-source-value="${escapeHtml(entry)}"
                ${factSourcePath(entry) ? "" : "disabled"}
              >
                ${escapeHtml(factSourceLabel(entry))}
              </button>
              <button
                class="fact-source-remove"
                type="button"
                data-remove-fact-source="${index}"
                data-fact-source-entry="${entryIndex}"
                aria-label="Удалить источник"
              >
                ×
              </button>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function normalizeRenameHistory(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => ({
      date: String(item.date || "").trim(),
      name: String(item.name || "").trim(),
      note: String(item.note || "").trim(),
    }));
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return normalizeRenameHistory(parsed);
    }
  } catch {}

  return [];
}

function emptyResearchJournalRow() {
  return { date: "", entry: "", links: "" };
}

function normalizeResearchJournal(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => ({
      date: String(item.date || "").trim(),
      entry: String(item.entry || "").trim(),
      links: serializeFactSourceEntries(parseFactSourceEntries(item.links || "")),
    }));
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return normalizeResearchJournal(parsed);
    }
  } catch {}

  return [];
}

function syncFactsField() {
  form.elements.facts.value = JSON.stringify(factRows);
}

function syncRenameHistoryField() {
  if (form.elements.renameHistory) {
    form.elements.renameHistory.value = JSON.stringify(renameRows);
  }
}

function syncResearchJournalField() {
  if (form.elements.researchJournal) {
    form.elements.researchJournal.value = JSON.stringify(researchJournalRows);
  }
}

function renderFactsTable() {
  if (!factRows.length) {
    factsTable.innerHTML = `
      <div class="facts-grid facts-grid-head">
        <div></div>
        <div>Дата</div>
        <div>Факт</div>
        <div>Место</div>
        <div>Источник</div>
        <div>Примечание</div>
        <div></div>
      </div>
      <div class="facts-empty">Исторические факты пока не добавлены.</div>
    `;
    syncFactsField();
    return;
  }

  factsTable.innerHTML = `
    <div class="facts-grid facts-grid-head">
      <div></div>
      <div>Дата</div>
      <div>Факт</div>
      <div>Место</div>
      <div>Источник</div>
      <div>Примечание</div>
      <div></div>
    </div>
    ${factRows
      .map(
        (row, index) => `
          <div class="facts-grid fact-row">
            <div class="fact-order">
              <button class="button button-secondary small icon-button" type="button" data-fact-move="up" data-fact-index="${index}" aria-label="Переместить факт выше">↑</button>
              <button class="button button-secondary small icon-button" type="button" data-fact-move="down" data-fact-index="${index}" aria-label="Переместить факт ниже">↓</button>
            </div>
            <div class="fact-cell">
              <textarea data-fact-field="date" data-fact-index="${index}" rows="2" placeholder="01 января 2001 г">${escapeHtml(row.date)}</textarea>
            </div>
            <div class="fact-cell">
              <textarea data-fact-field="fact" data-fact-index="${index}" rows="2" placeholder="Описание события">${escapeHtml(row.fact)}</textarea>
            </div>
            <div class="fact-cell">
              ${placeReferenceHtml(row.place, { rowIndex: index })}
              <div class="place-field-actions">
                <select class="picker-select is-empty fact-place-picker" data-fact-place-picker="${index}">
                  <option value="">Выбери карточку места</option>
                  ${placeCards()
                    .map((card) => {
                      const label = [card.display_label, card.place_type].filter(Boolean).join(" · ");
                      return `<option value="${escapeHtml(card.path)}">${escapeHtml(label)}</option>`;
                    })
                    .join("")}
                </select>
              </div>
            </div>
            <div class="fact-cell">
              ${renderFactSourceList(row.source, index)}
              <div class="place-field-actions">
                <select class="picker-select is-empty fact-source-picker" data-fact-source-picker="${index}">
                  <option value="">Выбери карточку источника</option>
                  ${pickerCards("source")
                    .map((card) => `<option value="${escapeHtml(card.path)}">${escapeHtml(card.display_label)}</option>`)
                    .join("")}
                </select>
              </div>
            </div>
            <div class="fact-cell">
              <textarea data-fact-field="note" data-fact-index="${index}" rows="2" placeholder="Комментарий">${escapeHtml(row.note)}</textarea>
            </div>
            <div class="fact-delete-cell">
              <button class="button button-secondary small icon-button" type="button" data-fact-delete="${index}" aria-label="Удалить факт">×</button>
            </div>
          </div>
        `,
      )
      .join("")}
  `;

  syncFactsField();
}

function renderRenameTable() {
  if (!renameRows.length) {
    renameTable.innerHTML = `
      <div class="facts-grid rename-grid facts-grid-head">
        <div></div>
        <div>Год / дата</div>
        <div>Название</div>
        <div>Примечание</div>
        <div></div>
      </div>
      <div class="facts-empty">Переименования пока не добавлены.</div>
    `;
    syncRenameHistoryField();
    return;
  }

  renameTable.innerHTML = `
    <div class="facts-grid rename-grid facts-grid-head">
      <div></div>
      <div>Год / дата</div>
      <div>Название</div>
      <div>Примечание</div>
      <div></div>
    </div>
    ${renameRows
      .map(
        (row, index) => `
          <div class="facts-grid rename-grid fact-row">
            <div class="fact-order">
              <button class="button button-secondary small icon-button" type="button" data-rename-move="up" data-rename-index="${index}" aria-label="Переместить выше" ${index === 0 ? "disabled" : ""}>↑</button>
              <button class="button button-secondary small icon-button" type="button" data-rename-move="down" data-rename-index="${index}" aria-label="Переместить ниже" ${index === renameRows.length - 1 ? "disabled" : ""}>↓</button>
            </div>
            <div class="fact-cell">
              <textarea data-rename-field="date" data-rename-index="${index}" rows="2" placeholder="1932">${escapeHtml(row.date)}</textarea>
            </div>
            <div class="fact-cell">
              <textarea data-rename-field="name" data-rename-index="${index}" rows="2" placeholder="Название">${escapeHtml(row.name)}</textarea>
            </div>
            <div class="fact-cell">
              <textarea data-rename-field="note" data-rename-index="${index}" rows="2" placeholder="Примечание">${escapeHtml(row.note)}</textarea>
            </div>
            <div class="fact-delete-cell">
              <button class="button button-secondary small icon-button" type="button" data-rename-delete="${index}" aria-label="Удалить переименование">×</button>
            </div>
          </div>
        `,
      )
      .join("")}
  `;

  syncRenameHistoryField();
}

function renderResearchJournalLinkList(value, index) {
  const entries = parseFactSourceEntries(value);
  if (!entries.length) {
    return '<div class="fact-source-empty">Карточки не выбраны</div>';
  }

  return `
    <div class="fact-source-list">
      ${entries
        .map(
          (entry, entryIndex) => `
            <div class="fact-source-row">
              <button
                class="fact-source-open"
                type="button"
                data-open-research-link="${index}"
                data-research-link-value="${escapeHtml(entry)}"
                ${relationTargetPath(entry) ? "" : "disabled"}
              >
                ${escapeHtml(parseRelationLabel(entry))}
              </button>
              <button
                class="fact-source-remove"
                type="button"
                data-remove-research-link="${index}"
                data-research-link-entry="${entryIndex}"
                aria-label="Удалить связанную карточку"
              >
                ×
              </button>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderResearchJournalTable() {
  if (!researchJournalRows.length) {
    researchJournalTable.innerHTML = `
      <div class="facts-grid research-journal-grid facts-grid-head">
        <div></div>
        <div>Дата</div>
        <div>Запись</div>
        <div>Связанные карточки</div>
        <div></div>
      </div>
      <div class="facts-empty">Записи дневника пока не добавлены.</div>
    `;
    syncResearchJournalField();
    return;
  }

  researchJournalTable.innerHTML = `
    <div class="facts-grid research-journal-grid facts-grid-head">
      <div></div>
      <div>Дата</div>
      <div>Запись</div>
      <div>Связанные карточки</div>
      <div></div>
    </div>
    ${researchJournalRows
      .map(
        (row, index) => `
          <div class="facts-grid research-journal-grid fact-row">
            <div class="fact-order">
              <button class="button button-secondary small icon-button" type="button" data-research-entry-move="up" data-research-entry-index="${index}" aria-label="Переместить запись выше" ${index === 0 ? "disabled" : ""}>↑</button>
              <button class="button button-secondary small icon-button" type="button" data-research-entry-move="down" data-research-entry-index="${index}" aria-label="Переместить запись ниже" ${index === researchJournalRows.length - 1 ? "disabled" : ""}>↓</button>
            </div>
            <div class="fact-cell">
              <textarea data-research-entry-field="date" data-research-entry-index="${index}" rows="2" placeholder="08.07.2026">${escapeHtml(row.date)}</textarea>
            </div>
            <div class="fact-cell">
              <textarea data-research-entry-field="entry" data-research-entry-index="${index}" rows="3" placeholder="Что произошло, что удалось узнать, что ещё непонятно">${escapeHtml(row.entry)}</textarea>
            </div>
            <div class="fact-cell">
              ${renderResearchJournalLinkList(row.links, index)}
              <div class="place-field-actions">
                <select class="picker-select is-empty research-link-picker" data-research-link-picker="${index}">
                  <option value="">Добавь связанную карточку</option>
                  ${pickerCards("all")
                    .map((card) => `<option value="${escapeHtml(card.path)}">${escapeHtml(card.display_label)}</option>`)
                    .join("")}
                </select>
              </div>
            </div>
            <div class="fact-delete-cell">
              <button class="button button-secondary small icon-button" type="button" data-research-entry-delete="${index}" aria-label="Удалить запись дневника">×</button>
            </div>
          </div>
        `,
      )
      .join("")}
  `;

  syncResearchJournalField();
}

