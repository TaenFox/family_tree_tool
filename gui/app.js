const form = document.querySelector("#card-form");
const statusNode = document.querySelector("#status");
const refreshButton = document.querySelector("#refresh-button");
const homeButton = document.querySelector("#home-button");
const newCardButton = document.querySelector("#new-card-button");
const cardList = document.querySelector("#card-list");
const cardCount = document.querySelector("#card-count");
const cardFilterSelect = document.querySelector("#card-filter-select");
const searchInput = document.querySelector("#search-input");
const primaryNameLabel = document.querySelector("#primary-name-label");
const modeTitle = document.querySelector("#mode-title");
const submitButton = document.querySelector("#submit-button");
const editorViewToggle = document.querySelector('[aria-label="Режим просмотра карточки"]');
const newCardTypeDialog = document.querySelector("#new-card-type-dialog");
const formPanel = document.querySelector("#form-panel");
const graphPanel = document.querySelector("#graph-panel");
const graphCanvas = document.querySelector("#graph-canvas");
const graphEmpty = document.querySelector("#graph-empty");
const navigationCodeRead = document.querySelector("#navigation-code-read");
const navigationCodeCompose = document.querySelector("#navigation-code-compose");
const navigationCodeAnchorSelect = document.querySelector("#navigation-code-anchor");
const navigationCodeInput = document.querySelector("#navigation-code-input");
const navigationCodeEditor = document.querySelector("#navigation-code-editor");
const navCodeAddSegmentButton = document.querySelector("#nav-code-add-segment");
const navCodeClearButton = document.querySelector("#nav-code-clear");
const navCodeFromSelect = document.querySelector("#nav-code-from");
const navCodeToSelect = document.querySelector("#nav-code-to");
const navCodeBuildButton = document.querySelector("#nav-code-build");
const navCodeResults = document.querySelector("#nav-code-results");
const mainPhotoInput = form.elements.mainPhoto;
const photoFileInput = document.querySelector("#photo-file-input");
const photoDropzone = document.querySelector("#photo-dropzone");
const photoDropzoneText = document.querySelector("#photo-dropzone-text");
const photoPasteButton = document.querySelector("#photo-paste-button");
const photoPreview = document.querySelector("#photo-preview");
const photoPreviewImage = document.querySelector("#photo-preview-image");
const photoGallery = document.querySelector("#photo-gallery");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightbox-image");
const lightboxCaption = document.querySelector("#lightbox-caption");
const lightboxClose = document.querySelector("#lightbox-close");
const lightboxPrev = document.querySelector("#lightbox-prev");
const lightboxNext = document.querySelector("#lightbox-next");
const addFactButton = document.querySelector("#add-fact-button");
const factsTable = document.querySelector("#facts-table");
const addRenameButton = document.querySelector("#add-rename-button");
const renameTable = document.querySelector("#rename-table");
const addResearchEntryButton = document.querySelector("#add-research-entry-button");
const researchJournalTable = document.querySelector("#research-journal-table");
const birthPlacePicker = document.querySelector("#birth-place-picker");
const deathPlacePicker = document.querySelector("#death-place-picker");
const placeReferenceSlots = Array.from(document.querySelectorAll("[data-place-reference]"));
const notesInput = document.querySelector("#notes-input");
const notesPreview = document.querySelector("#notes-preview");
const notesToolbar = document.querySelector("#notes-toolbar");
const notesEditorPanel = document.querySelector("#notes-editor-panel");
const notesBoldButton = document.querySelector("#notes-bold");
const notesItalicButton = document.querySelector("#notes-italic");
const notesListButton = document.querySelector("#notes-list");
const notesLinkButton = document.querySelector("#notes-link");
const notesPhotoSelect = document.querySelector("#notes-photo-select");
const notesPhotoInsertButton = document.querySelector("#notes-photo-insert");
const notesModeButtons = Array.from(document.querySelectorAll("[data-notes-mode]"));
const deathToggle = document.querySelector("#death-toggle");
const deathDateField = document.querySelector("#death-date-field");
const deathPlaceField = document.querySelector("#death-place-field");
const editorViewButtons = Array.from(document.querySelectorAll("[data-editor-view]"));
const navModeButtons = Array.from(document.querySelectorAll("[data-nav-mode]"));
const typeSections = Array.from(document.querySelectorAll("[data-type-section]"));
const relationPickers = Array.from(document.querySelectorAll("[data-picker-target]"));
const relationLists = Array.from(document.querySelectorAll("[data-relation-list]"));

let editingState = null;
let navFilter = "person";
let allCards = [];
let pendingPhotoFiles = [];
let storedImages = [];
let lightboxIndex = -1;
let deathFieldsVisible = false;
let factRows = [];
let renameRows = [];
let researchJournalRows = [];
let notesPreviewTimer = null;
let notesMode = "preview";
let editorView = "form";
let graphState = null;
let clipboardCapturePromise = null;
let preferredMainPhoto = "";
let editorLoadVersion = 0;
let navigationCodeState = { base: "", segments: [], valid: true };
let navigationCodeResolution = null;
let navigationResolveVersion = 0;
let navigationCodeMode = "read";

function personCards() {
  return allCards.filter((card) => card.card_type === "person");
}

function placeCards() {
  return allCards.filter((card) => card.card_type === "place");
}

function placeCardByPath(path) {
  return placeCards().find((card) => card.path === path) || null;
}

function parseXrefLabel(value) {
  const match = String(value || "").match(/^xref:[^\[]+\[(.+?)\]$/);
  return match ? match[1] : String(value || "");
}

function parseXrefPath(value) {
  const match = String(value || "").match(/^xref:([^\[]+)\[(.+?)\]$/);
  return match ? match[1] : "";
}

function personCardByDirectory(directory) {
  return personCards().find((card) => card.directory === directory) || null;
}

function personCardByNumber(number) {
  return personCards().find((card) => card.number === number) || null;
}

function emptyNavigationSegment() {
  return { kind: "С", index: "01" };
}

function normalizeNavigationSegment(segment) {
  const kind = ["М", "О", "С", "Р", "П"].includes(segment.kind) ? segment.kind : "С";
  if (!["С", "Р", "П"].includes(kind)) {
    return { kind, index: "" };
  }
  const digits = String(segment.index || "").replace(/\D+/g, "").slice(0, 2);
  return { kind, index: String(Number(digits || "1")).padStart(2, "0") };
}

function parseNavigationCode(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return { base: "", segments: [], valid: true };
  }

  const match = rawValue.match(/^([^-]+-\d{3})(?:-(.+))?$/u);
  if (!match) {
    return { base: rawValue, segments: [], valid: false };
  }

  const base = match[1].trim();
  const rawSegments = match[2] ? match[2].split("-").filter(Boolean) : [];
  const segments = [];

  for (const token of rawSegments) {
    if (token === "М" || token === "О") {
      segments.push({ kind: token, index: "" });
      continue;
    }
    const indexedMatch = token.match(/^([СРП])(\d{2})$/u);
    if (indexedMatch) {
      segments.push({ kind: indexedMatch[1], index: indexedMatch[2] });
      continue;
    }
    return { base, segments: [], valid: false };
  }

  return { base, segments, valid: true };
}

function serializeNavigationCode(state) {
  const base = String(state.base || "").trim();
  if (!base) {
    return "";
  }
  const tokens = (state.segments || [])
    .map((segment) => normalizeNavigationSegment(segment))
    .map((segment) => (["С", "Р", "П"].includes(segment.kind) ? `${segment.kind}${segment.index}` : segment.kind));
  return [base, ...tokens].join("-");
}

function syncNavigationCodeInput() {
  const value = serializeNavigationCode(navigationCodeState);
  navigationCodeInput.value = value;
  form.elements.navigationCode.value = value;
}

function syncNavigationAnchorSelect() {
  const anchorCard = personCardByNumber(navigationCodeState.base);
  navigationCodeAnchorSelect.value = anchorCard ? anchorCard.directory : "";
}

function renderNavigationCodeAnchorOptions() {
  const previousValue = navigationCodeAnchorSelect.value;
  navigationCodeAnchorSelect.innerHTML = [
    '<option value="">Выбери человека</option>',
    ...personCards().map(
      (card) => `<option value="${escapeHtml(card.directory)}">${escapeHtml(card.display_label)}</option>`,
    ),
  ].join("");

  const available = new Set(personCards().map((card) => card.directory));
  navigationCodeAnchorSelect.value = available.has(previousValue) ? previousValue : "";
  syncNavigationAnchorSelect();
}

function navigationResolutionByIndex(index) {
  return navigationCodeResolution?.steps?.[index] || null;
}

function renderNavigationResolution(step) {
  if (!step) {
    return `
      <div class="nav-code-result">
        <p class="nav-code-result-title">Нет данных</p>
        <p class="nav-code-result-meta">Выбери опорную карточку.</p>
      </div>
    `;
  }

  if (step.status === "resolved") {
    return `
      <div class="nav-code-result">
        <p class="nav-code-result-title">${escapeHtml(step.primary.display_label)}</p>
        <p class="nav-code-result-meta">Определено однозначно.</p>
      </div>
    `;
  }

  if (step.status === "ambiguous") {
    return `
      <div class="nav-code-result">
        <p class="nav-code-result-title">Несколько вариантов</p>
        <p class="nav-code-result-meta">${escapeHtml(step.message || "Нужны дополнительные сведения.")}</p>
        <p class="nav-code-result-list">${escapeHtml(step.candidates.map((item) => item.display_label).join("; "))}</p>
      </div>
    `;
  }

  return `
    <div class="nav-code-result">
      <p class="nav-code-result-title">Переход не найден</p>
      <p class="nav-code-result-meta">${escapeHtml(step.message || "По текущим связям карточка не определяется.")}</p>
    </div>
  `;
}

function navigationResolutionStatus() {
  if (!navigationCodeInput.value.trim()) {
    return { label: "Не задан", tone: "" };
  }
  if (!navigationCodeState.valid || !navigationCodeState.base) {
    return { label: "Черновик", tone: "draft" };
  }
  if (!navigationCodeState.segments.length) {
    return { label: "Готов", tone: "ready" };
  }
  const steps = navigationCodeResolution?.steps || [];
  const allResolved = steps.length === navigationCodeState.segments.length && steps.every((step) => step.status === "resolved");
  return allResolved ? { label: "Готов", tone: "ready" } : { label: "Черновик", tone: "draft" };
}

function navigationSegmentLabel(segment) {
  if (segment === "М") {
    return "Мать";
  }
  if (segment === "О") {
    return "Отец";
  }
  if (segment.startsWith("С")) {
    return `Сиблинг ${Number(segment.slice(1) || "0")}`;
  }
  if (segment.startsWith("Р")) {
    return `Ребёнок ${Number(segment.slice(1) || "0")}`;
  }
  if (segment.startsWith("П")) {
    return `Партнёр ${Number(segment.slice(1) || "0")}`;
  }
  return segment;
}

function renderNavigationReadStep(step, index) {
  const target =
    step.status === "resolved" && step.primary?.path
      ? `<button class="button button-secondary small" type="button" data-open-nav-card="${escapeHtml(step.primary.path)}">Открыть</button>`
      : "";

  let meta = step.message || "";
  let value = "Не определён";

  if (step.status === "resolved") {
    value = step.primary.display_label;
    meta = "";
  } else if (step.status === "ambiguous") {
    value = step.candidates.map((item) => item.display_label).join("; ");
  }

  return `
    <div class="nav-code-read-step">
      <div class="nav-code-read-step-head">
        <span class="nav-code-read-step-segment">${escapeHtml(navigationSegmentLabel(step.segment))}</span>
      </div>
      <div class="nav-code-read-step-body">
        <p class="nav-code-read-step-value">${escapeHtml(value)}</p>
        ${meta ? `<p class="nav-code-read-step-meta">${escapeHtml(meta)}</p>` : ""}
      </div>
      ${target}
    </div>
  `;
}

function renderNavigationAnchorStep(anchorCard) {
  if (!anchorCard) {
    return "";
  }
  return `
    <div class="nav-code-read-step">
      <div class="nav-code-read-step-head">
        <span class="nav-code-read-step-segment">Опора</span>
      </div>
      <div class="nav-code-read-step-body">
        <p class="nav-code-read-step-value">${escapeHtml(anchorCard.display_label)}</p>
      </div>
      <button class="button button-secondary small" type="button" data-open-nav-card="${escapeHtml(anchorCard.path)}">Открыть</button>
    </div>
  `;
}

function renderNavigationCodeRead() {
  if (currentType() !== "person") {
    navigationCodeRead.innerHTML = "";
    navigationCodeRead.className = "nav-code-read";
    return;
  }

  if (navigationCodeMode !== "read") {
    navigationCodeRead.innerHTML = "";
    navigationCodeRead.className = "nav-code-read is-hidden";
    return;
  }

  const currentValue = navigationCodeInput.value.trim();
  if (!currentValue) {
    navigationCodeRead.className = "nav-code-read is-empty";
    navigationCodeRead.textContent = "Шифр не задан.";
    return;
  }

  const anchorCard = personCardByNumber(navigationCodeState.base);
  const status = navigationResolutionStatus();
  const steps = navigationCodeResolution?.steps || [];
  navigationCodeRead.className = "nav-code-read";
  navigationCodeRead.innerHTML = `
    <div class="nav-code-summary">
      <div class="nav-code-summary-head">
        <p class="nav-code-summary-value">${escapeHtml(currentValue)}</p>
        <span class="nav-code-status ${status.tone ? `is-${status.tone}` : ""}">${escapeHtml(status.label)}</span>
      </div>
    </div>
    ${
      anchorCard || steps.length
        ? `<div class="nav-code-read-steps">${renderNavigationAnchorStep(anchorCard)}${steps.map((step, index) => renderNavigationReadStep(step, index)).join("")}</div>`
        : ""
    }
  `;
}

function applyNavigationCodeMode(mode) {
  navigationCodeMode = mode === "edit" ? "edit" : "read";
  navigationCodeRead.classList.toggle("is-hidden", navigationCodeMode !== "read");
  navigationCodeCompose.classList.toggle("is-hidden", navigationCodeMode !== "edit");
  navModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.navMode === navigationCodeMode);
  });
  renderNavigationCodeRead();
}

function renderNavigationCodeEditor() {
  if (currentType() !== "person") {
    navigationCodeEditor.innerHTML = "";
    navigationCodeEditor.className = "nav-code-editor";
    renderNavigationCodeRead();
    return;
  }

  const currentValue = navigationCodeInput.value.trim();
  if (!currentValue) {
    navigationCodeEditor.className = "nav-code-editor is-empty";
    navigationCodeEditor.textContent = "Добавь сегменты.";
    renderNavigationCodeRead();
    return;
  }

  if (!navigationCodeState.valid || !navigationCodeState.base) {
    navigationCodeEditor.className = "nav-code-editor is-empty";
    navigationCodeEditor.textContent = "Строка не разобрана.";
    renderNavigationCodeRead();
    return;
  }

  navigationCodeEditor.className = "nav-code-editor";
  navigationCodeEditor.innerHTML = `
    <div class="nav-code-segment-list">
      ${navigationCodeState.segments
        .map((segment, index) => {
          const step = navigationResolutionByIndex(index);
          return `
            <div class="nav-code-segment-row">
              <div class="nav-code-segment">
                <label>Сегмент ${index + 1}</label>
                <select data-nav-segment-kind="${index}">
                  <option value="М" ${segment.kind === "М" ? "selected" : ""}>Мать (М)</option>
                  <option value="О" ${segment.kind === "О" ? "selected" : ""}>Отец (О)</option>
                  <option value="С" ${segment.kind === "С" ? "selected" : ""}>Сиблинг (С)</option>
                  <option value="Р" ${segment.kind === "Р" ? "selected" : ""}>Ребёнок (Р)</option>
                  <option value="П" ${segment.kind === "П" ? "selected" : ""}>Партнёр (П)</option>
                </select>
              </div>
              <div class="nav-code-segment">
                <label>Индекс</label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  inputmode="numeric"
                  data-nav-segment-index="${index}"
                  value="${escapeHtml(String(Number(segment.index || "1")))}"
                  placeholder="${["С", "Р", "П"].includes(segment.kind) ? "1" : "—"}"
                  ${["С", "Р", "П"].includes(segment.kind) ? "" : "disabled"}
                />
              </div>
              ${renderNavigationResolution(step)}
              <button class="button button-secondary small icon-button" type="button" data-nav-segment-remove="${index}" aria-label="Удалить сегмент">×</button>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
  renderNavigationCodeRead();
}

function clearNavigationResolution() {
  navigationCodeResolution = null;
}

async function resolveNavigationCode() {
  if (currentType() !== "person" || !navigationCodeState.valid || !navigationCodeState.base || !navigationCodeState.segments.length) {
    clearNavigationResolution();
    renderNavigationCodeEditor();
    return;
  }

  const anchorDirectory = navigationCodeAnchorSelect.value;
  if (!anchorDirectory) {
    clearNavigationResolution();
    renderNavigationCodeEditor();
    return;
  }

  const requestVersion = ++navigationResolveVersion;
  const response = await fetch(
    `/api/navigation-resolve?anchor=${encodeURIComponent(anchorDirectory)}&code=${encodeURIComponent(navigationCodeInput.value.trim())}`,
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Не удалось вычислить сегменты навигационного шифра.");
  }
  if (requestVersion !== navigationResolveVersion) {
    return;
  }
  navigationCodeResolution = payload;
  renderNavigationCodeEditor();
}

function queueNavigationResolution() {
  resolveNavigationCode().catch((error) => {
    clearNavigationResolution();
    renderNavigationCodeEditor();
    setStatus(error.message, "error");
  });
}

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
    slot.innerHTML = placeReferenceHtml(field.value, { fieldName });
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
  deathToggle.textContent = visible ? "Скрыть сведения о смерти" : "Добавить сведения о смерти";
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

function resetNavigationCodeResult(message = "Шифр строится по текущим связям людей и не записывается в карточку.") {
  navCodeResults.innerHTML = `<p class="graph-tool-hint">${escapeHtml(message)}</p>`;
}

function renderNavigationCodeResult(payload) {
  if (payload.status !== "resolved" || !payload.variants?.length) {
    navCodeResults.innerHTML = `<p class="graph-tool-empty">${escapeHtml(payload.message || "Варианты не найдены.")}</p>`;
    return;
  }

  navCodeResults.innerHTML = `
    <p class="graph-tool-hint">${escapeHtml(payload.message || "Найденные варианты шифра.")}</p>
    <div class="graph-code-list">
      ${payload.variants
        .map(
          (item) => `
            <div class="graph-code-item">
              <div>
                <p class="graph-code-value">${escapeHtml(item.code)}</p>
                <p class="graph-code-meta">${item.steps === 0 ? "Без переходов" : `Переходов: ${item.steps}`}</p>
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

  navCodeResults.innerHTML = '<p class="graph-tool-hint">Строю варианты шифра...</p>';
  const response = await fetch(
    `/api/navigation-code?from=${encodeURIComponent(navCodeFromSelect.value)}&to=${encodeURIComponent(navCodeToSelect.value)}`,
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Не удалось построить адресный шифр.");
  }
  renderNavigationCodeResult(payload);
}

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

function graphNodeMeta(node) {
  if (node.card_type === "person") {
    return node.birth_date || "Человек";
  }
  return "Группа";
}

function centeredRowPositions(ids, y, width, nodeWidth, gap, padding) {
  if (!ids.length) {
    return [];
  }
  const rowWidth = ids.length * nodeWidth + Math.max(0, ids.length - 1) * gap;
  let startX = Math.round((width - rowWidth) / 2);
  if (startX < padding) {
    startX = padding;
  }
  return ids.map((id, index) => ({
    id,
    x: startX + index * (nodeWidth + gap),
    y,
  }));
}

function stackedColumnPositions(ids, x, startY, nodeHeight, gap) {
  return ids.map((id, index) => ({
    id,
    x,
    y: startY + index * (nodeHeight + gap),
  }));
}

function graphNodeMarkup(node, style) {
  const photo = node.main_photo
    ? `<img class="graph-node-photo" src="${imageUrl(node.card_type, node.directory, node.main_photo)}" alt="${escapeHtml(node.title)}" />`
    : '<div class="graph-node-photo graph-node-photo-placeholder"></div>';
  return `
    <button
      class="graph-node ${node.is_center ? "is-center" : ""} ${node.card_type === "group" ? "is-group" : ""}"
      type="button"
      style="left:${style.x}px;top:${style.y}px;width:${style.width}px;min-height:${style.height}px"
      data-graph-open="${escapeHtml(node.path)}"
    >
      <div class="graph-node-layout">
        ${photo}
        <div class="graph-node-copy">
          <span class="graph-node-number">${escapeHtml(node.number)}</span>
          <span class="graph-node-title">${escapeHtml(node.title)}</span>
          <span class="graph-node-meta">${escapeHtml(graphNodeMeta(node))}</span>
        </div>
      </div>
    </button>
  `;
}

function graphEdgePath(fromRect, toRect) {
  const startX = fromRect.x + fromRect.width / 2;
  const startY = fromRect.y + fromRect.height / 2;
  const endX = toRect.x + toRect.width / 2;
  const endY = toRect.y + toRect.height / 2;
  const deltaX = Math.abs(endX - startX);
  const controlOffset = Math.max(24, Math.min(96, deltaX / 2));
  return `M ${startX} ${startY} C ${startX} ${startY + controlOffset}, ${endX} ${endY - controlOffset}, ${endX} ${endY}`;
}

function average(values) {
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countEdgeCrossings(rowA, rowB, outgoingMap) {
  const posA = new Map(rowA.map((id, index) => [id, index]));
  const posB = new Map(rowB.map((id, index) => [id, index]));
  const edges = [];

  rowA.forEach((sourceId) => {
    (outgoingMap.get(sourceId) || []).forEach((targetId) => {
      if (!posB.has(targetId)) {
        return;
      }
      edges.push([posA.get(sourceId), posB.get(targetId)]);
    });
  });

  let crossings = 0;
  for (let left = 0; left < edges.length; left += 1) {
    for (let right = left + 1; right < edges.length; right += 1) {
      const [a1, b1] = edges[left];
      const [a2, b2] = edges[right];
      if ((a1 < a2 && b1 > b2) || (a1 > a2 && b1 < b2)) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

function optimizeOverviewRows(rows, incomingMap, outgoingMap, nodeOrder) {
  const normalizedRows = rows.map((rowIds) => [...rowIds]);

  const sortRowByTargets = (rowIndex, targetMap, rowSourceIndex) => {
    const referenceRow = normalizedRows[rowSourceIndex];
    const referencePositions = new Map(referenceRow.map((id, index) => [id, index]));
    normalizedRows[rowIndex].sort((left, right) => {
      const leftTargets = (targetMap.get(left) || []).map((id) => referencePositions.get(id)).filter((value) => value !== undefined);
      const rightTargets = (targetMap.get(right) || []).map((id) => referencePositions.get(id)).filter((value) => value !== undefined);
      const leftScore = average(leftTargets);
      const rightScore = average(rightTargets);
      if (leftScore === null && rightScore === null) {
        return (nodeOrder.get(left) || 0) - (nodeOrder.get(right) || 0);
      }
      if (leftScore === null) {
        return 1;
      }
      if (rightScore === null) {
        return -1;
      }
      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }
      return (nodeOrder.get(left) || 0) - (nodeOrder.get(right) || 0);
    });
  };

  const improveByAdjacentSwaps = (rowIndex) => {
    if (rowIndex < 0 || rowIndex >= normalizedRows.length) {
      return;
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = 0; index < normalizedRows[rowIndex].length - 1; index += 1) {
        const currentRow = normalizedRows[rowIndex];
        const currentScore =
          (rowIndex > 0 ? countEdgeCrossings(normalizedRows[rowIndex - 1], currentRow, outgoingMap) : 0) +
          (rowIndex < normalizedRows.length - 1 ? countEdgeCrossings(currentRow, normalizedRows[rowIndex + 1], outgoingMap) : 0);

        const swappedRow = [...currentRow];
        [swappedRow[index], swappedRow[index + 1]] = [swappedRow[index + 1], swappedRow[index]];
        normalizedRows[rowIndex] = swappedRow;
        const swappedScore =
          (rowIndex > 0 ? countEdgeCrossings(normalizedRows[rowIndex - 1], swappedRow, outgoingMap) : 0) +
          (rowIndex < normalizedRows.length - 1 ? countEdgeCrossings(swappedRow, normalizedRows[rowIndex + 1], outgoingMap) : 0);

        if (swappedScore < currentScore) {
          changed = true;
        } else {
          normalizedRows[rowIndex] = currentRow;
        }
      }
    }
  };

  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (let rowIndex = 1; rowIndex < normalizedRows.length; rowIndex += 1) {
      sortRowByTargets(rowIndex, incomingMap, rowIndex - 1);
      improveByAdjacentSwaps(rowIndex);
    }
    for (let rowIndex = normalizedRows.length - 2; rowIndex >= 0; rowIndex -= 1) {
      sortRowByTargets(rowIndex, outgoingMap, rowIndex + 1);
      improveByAdjacentSwaps(rowIndex);
    }
  }

  return normalizedRows;
}

function buildOverviewRows(graphNodes, graphEdges) {
  const nodeOrder = new Map(graphNodes.map((node, index) => [node.id, index]));
  const childMap = new Map(graphNodes.map((node) => [node.id, []]));
  const parentMap = new Map(graphNodes.map((node) => [node.id, []]));
  const levelMap = new Map();

  graphEdges.forEach((edge) => {
    if (!childMap.has(edge.from) || !parentMap.has(edge.to)) {
      return;
    }
    childMap.get(edge.from).push(edge.to);
    parentMap.get(edge.to).push(edge.from);
  });

  const anchorNode = graphNodes.find((node) => node.number === "К-001") || graphNodes[0] || null;
  if (!anchorNode) {
    return {
      rows: [],
      minLevel: 0,
      parentMap,
      childMap,
      nodeOrder,
    };
  }

  const queue = [anchorNode.id];
  levelMap.set(anchorNode.id, 0);

  while (queue.length) {
    const currentId = queue.shift();
    const currentLevel = levelMap.get(currentId) || 0;

    (parentMap.get(currentId) || []).forEach((parentId) => {
      if (levelMap.has(parentId)) {
        return;
      }
      levelMap.set(parentId, currentLevel - 1);
      queue.push(parentId);
    });

    (childMap.get(currentId) || []).forEach((childId) => {
      if (levelMap.has(childId)) {
        return;
      }
      levelMap.set(childId, currentLevel + 1);
      queue.push(childId);
    });
  }

  const assignedLevels = Array.from(levelMap.values());
  let maxAssignedLevel = assignedLevels.length ? Math.max(...assignedLevels) : 0;

  graphNodes
    .filter((node) => !levelMap.has(node.id))
    .sort((left, right) => (nodeOrder.get(left.id) || 0) - (nodeOrder.get(right.id) || 0))
    .forEach((node, index) => {
      levelMap.set(node.id, maxAssignedLevel + index + 2);
    });

  const levels = Array.from(levelMap.values());
  const minLevel = levels.length ? Math.min(...levels) : 0;
  const maxLevel = levels.length ? Math.max(...levels) : 0;
  const rows = Array.from({ length: maxLevel - minLevel + 1 }, () => []);

  graphNodes.forEach((node) => {
    const level = levelMap.get(node.id) || 0;
    rows[level - minLevel].push(node.id);
  });

  rows.forEach((rowIds) => {
    rowIds.sort((left, right) => (nodeOrder.get(left) || 0) - (nodeOrder.get(right) || 0));
  });

  return {
    rows: optimizeOverviewRows(rows, parentMap, childMap, nodeOrder),
    minLevel,
    parentMap,
    childMap,
    nodeOrder,
  };
}

function renderGraph() {
  if (!editingState) {
    if (!graphState || graphState.graph_type !== "overview") {
      graphCanvas.classList.add("is-hidden");
      graphEmpty.classList.remove("is-hidden");
      graphEmpty.textContent = "Загружаю общий граф людей...";
      return;
    }
  }

  if (!graphState) {
    graphCanvas.classList.add("is-hidden");
    graphEmpty.classList.remove("is-hidden");
    graphEmpty.textContent = "Загружаю граф связей...";
    return;
  }

  const nodeMap = new Map(graphState.nodes.map((node) => [node.id, node]));
  const nodeWidth = 220;
  const nodeHeight = 78;
  const gap = 28;
  const laneGap = 72;
  const padding = 48;
  const sideGap = 74;
  const centerId = graphState.center;
  const positions = new Map();
  const laneLabels = [];

  if (graphState.graph_type === "overview") {
    const { rows: optimizedRows, minLevel } = buildOverviewRows(graphState.nodes, graphState.edges);

    const widestRow = Math.max(...optimizedRows.map((rowIds) => rowIds.length), 1);
    const width = Math.max(960, padding * 2 + widestRow * nodeWidth + Math.max(0, widestRow - 1) * gap);

    let currentY = padding;
    optimizedRows.forEach((rowIds, levelIndex) => {
      const relativeLevel = minLevel + levelIndex;
      const label = relativeLevel === 0 ? "Поколение К-001" : `Поколение ${relativeLevel > 0 ? `+${relativeLevel}` : relativeLevel}`;
      laneLabels.push({ text: label, x: padding, y: currentY - 22 });
      centeredRowPositions(rowIds, currentY, width, nodeWidth, gap, padding).forEach((item) => positions.set(item.id, item));
      currentY += nodeHeight + laneGap;
    });

    const height = Math.max(currentY + padding - laneGap, 560);
    const rects = new Map();
    const nodesHtml = [];

    for (const [id, point] of positions.entries()) {
      const node = nodeMap.get(id);
      if (!node) {
        continue;
      }
      const rect = { x: point.x, y: point.y, width: nodeWidth, height: nodeHeight };
      rects.set(id, rect);
      nodesHtml.push(graphNodeMarkup(node, rect));
    }

    const edgesHtml = graphState.edges
      .map((edge) => {
        const fromRect = rects.get(edge.from);
        const toRect = rects.get(edge.to);
        if (!fromRect || !toRect) {
          return "";
        }
        return `<path class="graph-edge" d="${graphEdgePath(fromRect, toRect)}"></path>`;
      })
      .join("");

    graphCanvas.style.width = `${width}px`;
    graphCanvas.style.height = `${height}px`;
    graphCanvas.innerHTML = `
      <svg class="graph-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
        ${edgesHtml}
      </svg>
      ${laneLabels
        .map(
          (label) => `
            <div class="graph-lane-label" style="left:${label.x}px;top:${label.y}px">${escapeHtml(label.text)}</div>
          `,
        )
        .join("")}
      ${nodesHtml.join("")}
    `;
    graphEmpty.classList.add("is-hidden");
    graphCanvas.classList.remove("is-hidden");
    return;
  }

  const measureRow = (count) => count * nodeWidth + Math.max(0, count - 1) * gap;
  const sideWidth = graphState.card_type === "person" ? nodeWidth : 0;
  const mainWidth = graphState.card_type === "person" ? sideWidth * 2 + nodeWidth + sideGap * 2 : Math.max(nodeWidth, measureRow(Math.max(
    graphState.lanes.participants_top?.length || 0,
    graphState.lanes.participants_bottom?.length || 0,
  )));
  const width = Math.max(
    920,
    padding * 2 + mainWidth,
    padding * 2 + measureRow(graphState.lanes.siblings?.length || 0),
    padding * 2 + measureRow(graphState.lanes.partners?.length || 0),
    padding * 2 + measureRow(graphState.lanes.groups?.length || 0),
    padding * 2 + measureRow(graphState.lanes.participants_top?.length || 0),
    padding * 2 + measureRow(graphState.lanes.participants_bottom?.length || 0),
  );

  let currentY = padding;

  if (graphState.card_type === "person") {
    const siblings = graphState.lanes.siblings || [];
    const parents = graphState.lanes.parents || [];
    const children = graphState.lanes.children || [];
    const partners = graphState.lanes.partners || [];
    const groups = graphState.lanes.groups || [];

    if (siblings.length) {
      laneLabels.push({ text: "Братья и сёстры", x: padding, y: currentY - 22 });
      centeredRowPositions(siblings, currentY, width, nodeWidth, gap, padding).forEach((item) => positions.set(item.id, item));
      currentY += nodeHeight + laneGap;
    }

    const parentHeight = parents.length ? parents.length * nodeHeight + Math.max(0, parents.length - 1) * gap : nodeHeight;
    const childHeight = children.length ? children.length * nodeHeight + Math.max(0, children.length - 1) * gap : nodeHeight;
    const mainHeight = Math.max(parentHeight, childHeight, nodeHeight);
    const centerX = Math.round((width - nodeWidth) / 2);
    const centerY = currentY + Math.round((mainHeight - nodeHeight) / 2);
    const parentX = centerX - sideGap - nodeWidth;
    const childX = centerX + nodeWidth + sideGap;

    laneLabels.push({ text: "Родители", x: parentX, y: currentY - 22 });
    laneLabels.push({ text: "Карточка", x: centerX, y: currentY - 22 });
    laneLabels.push({ text: "Дети", x: childX, y: currentY - 22 });

    stackedColumnPositions(parents, parentX, currentY, nodeHeight, gap).forEach((item) => positions.set(item.id, item));
    positions.set(centerId, { id: centerId, x: centerX, y: centerY });
    stackedColumnPositions(children, childX, currentY, nodeHeight, gap).forEach((item) => positions.set(item.id, item));

    currentY += mainHeight + laneGap;

    if (partners.length) {
      laneLabels.push({ text: "Партнёры", x: padding, y: currentY - 22 });
      centeredRowPositions(partners, currentY, width, nodeWidth, gap, padding).forEach((item) => positions.set(item.id, item));
      currentY += nodeHeight + laneGap;
    }

    if (groups.length) {
      laneLabels.push({ text: "Группы", x: padding, y: currentY - 22 });
      centeredRowPositions(groups, currentY, width, nodeWidth, gap, padding).forEach((item) => positions.set(item.id, item));
      currentY += nodeHeight + laneGap;
    }
  } else {
    const topParticipants = graphState.lanes.participants_top || [];
    const bottomParticipants = graphState.lanes.participants_bottom || [];

    if (topParticipants.length) {
      laneLabels.push({ text: "Участники", x: padding, y: currentY - 22 });
      centeredRowPositions(topParticipants, currentY, width, nodeWidth, gap, padding).forEach((item) => positions.set(item.id, item));
      currentY += nodeHeight + laneGap;
    }

    positions.set(centerId, {
      id: centerId,
      x: Math.round((width - nodeWidth) / 2),
      y: currentY,
    });
    laneLabels.push({ text: "Группа", x: Math.round((width - nodeWidth) / 2), y: currentY - 22 });
    currentY += nodeHeight + laneGap;

    if (bottomParticipants.length) {
      centeredRowPositions(bottomParticipants, currentY, width, nodeWidth, gap, padding).forEach((item) => positions.set(item.id, item));
      currentY += nodeHeight + laneGap;
    }
  }

  const height = Math.max(currentY + padding - gap, 560);
  const rects = new Map();
  const nodesHtml = [];

  for (const [id, point] of positions.entries()) {
    const node = nodeMap.get(id);
    if (!node) {
      continue;
    }
    const rect = { x: point.x, y: point.y, width: nodeWidth, height: nodeHeight };
    rects.set(id, rect);
    nodesHtml.push(graphNodeMarkup(node, rect));
  }

  const edgesHtml = graphState.edges
    .map((edge) => {
      const fromRect = rects.get(edge.from);
      const toRect = rects.get(edge.to);
      if (!fromRect || !toRect) {
        return "";
      }
      return `<path class="graph-edge" d="${graphEdgePath(fromRect, toRect)}"></path>`;
    })
    .join("");

  const labelsHtml = laneLabels
    .map(
      (label) => `
        <div class="graph-lane-label" style="left:${label.x}px;top:${label.y}px">${escapeHtml(label.text)}</div>
      `,
    )
    .join("");

  graphCanvas.style.width = `${width}px`;
  graphCanvas.style.height = `${height}px`;
  graphCanvas.innerHTML = `
    <svg class="graph-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${edgesHtml}
    </svg>
    ${labelsHtml}
    ${nodesHtml.join("")}
  `;
  graphEmpty.classList.add("is-hidden");
  graphCanvas.classList.remove("is-hidden");
}

async function loadGraphForCurrentCard(requestVersion = editorLoadVersion, identity = currentEditorIdentity()) {
  if (!identity) {
    await loadOverviewGraph(requestVersion);
    return;
  }

  if (identity.cardType === "place") {
    graphState = null;
    graphCanvas.classList.add("is-hidden");
    graphEmpty.classList.remove("is-hidden");
    graphEmpty.textContent = "Для карточек мест граф не строится.";
    return;
  }

  if (identity.cardType === "source") {
    graphState = null;
    graphCanvas.classList.add("is-hidden");
    graphEmpty.classList.remove("is-hidden");
    graphEmpty.textContent = "Для карточек источников граф не строится.";
    return;
  }

  if (identity.cardType === "research") {
    graphState = null;
    graphCanvas.classList.add("is-hidden");
    graphEmpty.classList.remove("is-hidden");
    graphEmpty.textContent = "Для карточек исследований граф не строится.";
    return;
  }

  const response = await fetch(
    `/api/graph?type=${encodeURIComponent(identity.cardType)}&directory=${encodeURIComponent(identity.directory)}`,
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Не удалось загрузить граф связей.");
  }
  if (requestVersion !== editorLoadVersion) {
    return;
  }
  graphState = payload;
  renderGraph();
}

async function loadOverviewGraph(requestVersion = editorLoadVersion) {
  const response = await fetch("/api/graph-overview");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Не удалось загрузить общий граф.");
  }
  if (requestVersion !== editorLoadVersion) {
    return;
  }
  graphState = payload;
  if (!editingState) {
    renderGraph();
  }
}

function currentImageNames() {
  return Array.from(new Set([
    ...storedImages.map((item) => item.name),
    ...pendingPhotoFiles.map((item) => item.name),
  ]));
}

function galleryItems() {
  return [
    ...storedImages.map((item) => ({
      name: item.name,
      src: editingState ? imageUrl(currentType(), editingState.directory, item.name) : "",
      persisted: true,
    })),
    ...pendingPhotoFiles.map((item) => ({
      name: item.name,
      src: item.previewUrl,
      persisted: false,
    })),
  ];
}

function syncMainPhotoOptions() {
  const selected = preferredMainPhoto || mainPhotoInput.value;
  mainPhotoInput.value = currentImageNames().includes(selected) ? selected : "";
  preferredMainPhoto = mainPhotoInput.value;
}

function syncNotesPhotoOptions() {
  const selected = notesPhotoSelect.value;
  const options = ['<option value="">Фото из каталога</option>'];
  currentImageNames().forEach((name) => {
    options.push(`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`);
  });
  notesPhotoSelect.innerHTML = options.join("");
  notesPhotoSelect.value = currentImageNames().includes(selected) ? selected : "";
  notesPhotoSelect.classList.toggle("is-empty", !notesPhotoSelect.value);
}

function photoSourceByName(filename) {
  const pending = pendingPhotoFiles.find((item) => item.name === filename);
  if (pending) {
    return pending.previewUrl;
  }
  const stored = storedImages.find((item) => item.name === filename);
  if (editingState && stored) {
    return imageUrl(currentType(), editingState.directory, stored.name);
  }
  return "";
}

function refreshPhotoPreview() {
  const filename = mainPhotoInput.value.trim();
  const src = photoSourceByName(filename);
  if (!src) {
    clearPhotoPreview();
    return;
  }
  setPhotoPreview(src);
}

async function applyMainPhotoSelection(filename, persist = true) {
  preferredMainPhoto = filename || "";
  mainPhotoInput.value = preferredMainPhoto;
  refreshPhotoPreview();
  renderPhotoGallery();
  if (persist && isEditing()) {
    try {
      await saveCurrentCard();
      setStatus(preferredMainPhoto ? "Главная фотография обновлена." : "Главная фотография снята.");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }
}

function renderPhotoGallery() {
  const items = galleryItems();
  const placeholders = Array.from({ length: Math.max(0, 3 - items.length) }, (_, index) => ({ placeholder: true, key: index }));
  photoGallery.innerHTML = items
    .map(
      (item, index) => `
        <div class="photo-tile">
          <div class="photo-thumb">
            <button class="photo-open" type="button" data-open-photo="${index}" aria-label="Открыть фото ${escapeHtml(item.name)}"></button>
            <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.name)}" />
            <button class="photo-delete" type="button" data-delete-photo="${escapeHtml(item.name)}" aria-label="Удалить фото ${escapeHtml(item.name)}">×</button>
            <button
              class="photo-main-toggle ${mainPhotoInput.value === item.name ? "is-active" : ""}"
              type="button"
              data-main-photo="${escapeHtml(item.name)}"
              aria-label="${mainPhotoInput.value === item.name ? "Главное фото" : "Сделать главным фото"}"
            >
              ${mainPhotoInput.value === item.name ? "★" : "☆"}
            </button>
          </div>
          <p class="photo-name">${escapeHtml(item.name)}</p>
        </div>
      `,
    )
    .concat(
      placeholders.map(
        () => `
          <div class="photo-tile">
            <div class="photo-thumb">
              <div class="photo-thumb-placeholder">◫</div>
            </div>
            <p class="photo-name">...</p>
          </div>
        `,
      ),
    )
    .join("");
}

async function loadImagesForCurrentCard(requestVersion = editorLoadVersion, identity = currentEditorIdentity()) {
  if (!identity) {
    storedImages = [];
    syncMainPhotoOptions();
    syncNotesPhotoOptions();
    renderPhotoGallery();
    refreshPhotoPreview();
    return;
  }

  const response = await fetch(
    `/api/images?type=${encodeURIComponent(identity.cardType)}&directory=${encodeURIComponent(identity.directory)}`,
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "Не удалось загрузить список фотографий.");
  }
  if (requestVersion !== editorLoadVersion) {
    return;
  }
  storedImages = result.images || [];
  syncMainPhotoOptions();
  syncNotesPhotoOptions();
  renderPhotoGallery();
  refreshPhotoPreview();
}

async function refreshNotesPreview() {
  const response = await fetch("/api/notes-preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: notesInput.value,
      cardType: currentType(),
      directory: editingState?.directory || "",
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    notesPreview.innerHTML = '<p class="notes-preview-empty">Не удалось построить предпросмотр.</p>';
    return;
  }
  notesPreview.innerHTML = result.html || '<p class="notes-preview-empty">Предпросмотр появится здесь.</p>';
}

function queueNotesPreview() {
  clearTimeout(notesPreviewTimer);
  notesPreviewTimer = setTimeout(() => {
    refreshNotesPreview().catch(() => {
      notesPreview.innerHTML = '<p class="notes-preview-empty">Не удалось построить предпросмотр.</p>';
    });
  }, 150);
}

function replaceSelection(textarea, replacement, fallback = "") {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const selected = textarea.value.slice(start, end) || fallback;
  const next = replacement(selected);
  textarea.setRangeText(next, start, end, "end");
  textarea.focus();
  queueNotesPreview();
}

function clipboardImageFiles(clipboardData) {
  if (!clipboardData) {
    return [];
  }

  const files = [];
  for (const item of Array.from(clipboardData.items || [])) {
    if (!item.type.startsWith("image/")) {
      continue;
    }
    const blob = item.getAsFile();
    if (!blob) {
      continue;
    }
    const extension = item.type.split("/")[1] || "png";
    const name = blob.name || `clipboard-image.${extension}`;
    files.push(new File([blob], name, { type: item.type }));
  }
  return files;
}

function ensureClipboardCaptureTarget() {
  let target = document.querySelector("#clipboard-capture-target");
  if (target) {
    return target;
  }

  target = document.createElement("textarea");
  target.id = "clipboard-capture-target";
  target.setAttribute("aria-hidden", "true");
  target.tabIndex = -1;
  Object.assign(target.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(target);
  return target;
}

function captureClipboardImageFilesFromPaste(timeoutMs = 15000) {
  if (clipboardCapturePromise) {
    return clipboardCapturePromise;
  }

  clipboardCapturePromise = new Promise((resolve, reject) => {
    const target = ensureClipboardCaptureTarget();
    const previousActive = document.activeElement;
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("keydown", onKeydown, true);
      target.value = "";
      if (previousActive instanceof HTMLElement) {
        previousActive.focus({ preventScroll: true });
      } else {
        photoDropzone.focus();
      }
      clipboardCapturePromise = null;
    };

    const finish = (handler, value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      handler(value);
    };

    const onPaste = (event) => {
      const files = clipboardImageFiles(event.clipboardData);
      if (!files.length) {
        return;
      }
      event.preventDefault();
      finish(resolve, files);
    };

    const onKeydown = (event) => {
      if (event.key === "Escape") {
        finish(reject, new Error("Ожидание вставки из буфера отменено."));
      }
    };

    const timeoutId = window.setTimeout(() => {
      finish(reject, new Error("Не дождался вставки из буфера."));
    }, timeoutMs);

    document.addEventListener("paste", onPaste, true);
    document.addEventListener("keydown", onKeydown, true);
    target.focus({ preventScroll: true });
    target.select();
  });

  return clipboardCapturePromise;
}

async function readClipboardImageFiles() {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    throw new Error("Браузер не поддерживает прямое чтение изображений из буфера. Нажми Cmd/Ctrl+V в зоне загрузки.");
  }

  const items = await navigator.clipboard.read();
  const files = [];
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith("image/"));
    if (!imageType) {
      continue;
    }
    const blob = await item.getType(imageType);
    const extension = imageType.split("/")[1] || "png";
    files.push(new File([blob], `clipboard-image.${extension}`, { type: imageType }));
  }

  if (!files.length) {
    throw new Error("В буфере нет изображения.");
  }

  return files;
}

function openLightbox(index) {
  const items = galleryItems();
  if (!items.length || index < 0 || index >= items.length) {
    return;
  }
  lightboxIndex = index;
  const item = items[index];
  lightboxImage.src = item.src;
  lightboxCaption.textContent = item.name;
  lightbox.classList.remove("is-hidden");
}

function closeLightbox() {
  lightbox.classList.add("is-hidden");
  lightboxImage.removeAttribute("src");
  lightboxCaption.textContent = "";
  lightboxIndex = -1;
}

function moveLightbox(step) {
  const items = galleryItems();
  if (!items.length || lightboxIndex === -1) {
    return;
  }
  lightboxIndex = (lightboxIndex + step + items.length) % items.length;
  const item = items[lightboxIndex];
  lightboxImage.src = item.src;
  lightboxCaption.textContent = item.name;
}

function updateModeUi() {
  const editing = isEditing();
  const overviewGraph = editorView === "graph" && !editing;
  const currentName = form.elements.primaryName.value.trim();
  modeTitle.textContent = editing ? currentName || "Без имени" : editorView === "graph" ? "Граф связей" : "Новая запись";
  submitButton.textContent = "Сохранить";
  submitButton.classList.toggle("is-hidden", editorView === "graph");
  editorViewToggle?.classList.toggle("is-hidden", overviewGraph);
  form.elements.cardNumber.readOnly = editing;
}

function applyType(type) {
  form.elements.cardType.value = type;
  primaryNameLabel.textContent = type === "person" ? "Имя при рождении" : type === "group" ? "Название / обозначение группы" : type === "place" ? "Актуальное название" : type === "source" ? "Краткое название" : "Название карточки";
  form.elements.cardNumber.placeholder = type === "person" ? "К-002" : type === "group" ? "Г-002" : type === "place" ? "М-002" : type === "source" ? "И-002" : "В-002";
  form.elements.primaryName.placeholder =
    type === "person" ? "Имя Фамилия" : type === "group" ? "Семья Ивановых" : type === "place" ? "Нижний Новгород" : type === "source" ? "Метрическая запись о рождении" : "Вопрос о происхождении семьи";
  if (!isEditing()) {
    form.elements.cardNumber.value = nextCardNumber(type);
  }
  typeSections.forEach((section) => {
    const sectionTypes = (section.dataset.typeSection || "").split(",").map((item) => item.trim()).filter(Boolean);
    section.classList.toggle("is-hidden", sectionTypes.length ? !sectionTypes.includes(type) : false);
  });
  editorViewButtons.forEach((button) => {
    if (button.dataset.editorView === "graph") {
      button.disabled = type === "place" || type === "source" || type === "research";
    }
  });
  if ((type === "place" || type === "source" || type === "research") && editorView === "graph") {
    applyEditorView("form");
  }
  renderFactsTable();
  renderRenameTable();
  renderResearchJournalTable();
  renderPlaceReferences();
  updateModeUi();
  renderNavigationCodeEditor();
  queueNavigationResolution();
}

function clearCardFields() {
  form.elements.editDirectory.value = "";
  form.elements.mainPhoto.value = "";
  form.elements.primaryName.value = "";
  form.elements.birthDate.value = "";
  form.elements.sex.value = "";
  form.elements.birthPlace.value = "";
  form.elements.deathDate.value = "";
  form.elements.deathPlace.value = "";
  form.elements.parents.value = "";
  form.elements.siblings.value = "";
  form.elements.children.value = "";
  form.elements.partners.value = "";
  form.elements.groups.value = "";
  form.elements.navigationCode.value = "";
  form.elements.groupDescription.value = "";
  form.elements.participants.value = "";
  form.elements.sourceType.value = "";
  form.elements.sourceDate.value = "";
  form.elements.sourceOrigin.value = "";
  form.elements.sourceStorage.value = "";
  form.elements.sourcePeople.value = "";
  form.elements.sourceGroups.value = "";
  form.elements.sourcePlaces.value = "";
  form.elements.sourceSummary.value = "";
  form.elements.sourceExtracts.value = "";
  form.elements.researchQuestion.value = "";
  form.elements.researchSolution.value = "";
  form.elements.researchJournal.value = "[]";
  if (form.elements.placeType) {
    form.elements.placeType.value = "";
  }
  if (form.elements.renameHistory) {
    form.elements.renameHistory.value = "[]";
  }
  form.elements.facts.value = "[]";
  form.elements.notes.value = "";
  renderPlaceReferences();
}

function resetFormToCreateMode(type = "person") {
  editorLoadVersion += 1;
  editingState = null;
  graphState = null;
  preferredMainPhoto = "";
  form.reset();
  clearCardFields();
  setStatus("");
  applyType(type);
  storedImages = [];
  pendingPhotoFiles = [];
  navigationCodeState = { base: "", segments: [], valid: true };
  clearNavigationResolution();
  factRows = [];
  renameRows = [];
  researchJournalRows = [];
  setDeathFieldsVisible(false);
  syncMainPhotoOptions();
  renderPhotoGallery();
  clearPhotoPreview();
  photoDropzoneText.textContent = "Перетащи фото сюда или нажми";
  renderRelationLists();
  renderFactsTable();
  renderRenameTable();
  renderResearchJournalTable();
  renderPlaceReferences();
  renderCardList();
  syncNotesPhotoOptions();
  navigationCodeInput.value = "";
  renderNavigationCodeEditor();
  renderNavigationCodeOptions();
  applyNavigationCodeMode("read");
  applyNotesMode("preview");
  queueNotesPreview();
  renderGraph();
  loadOverviewGraph(editorLoadVersion).catch((error) => setStatus(error.message, "error"));
  resetNavigationCodeResult();
}

function openNewCardTypeDialog() {
  if (!newCardTypeDialog || typeof newCardTypeDialog.showModal !== "function") {
    resetFormToCreateMode();
    return;
  }
  newCardTypeDialog.showModal();
}

function populateForm(payload) {
  form.elements.cardType.value = payload.card_type;
  form.elements.editDirectory.value = payload.directory;
  form.elements.cardNumber.value = payload.number;
  form.elements.primaryName.value = payload.primary_name;
  preferredMainPhoto = payload.main_photo || "";
  form.elements.mainPhoto.value = preferredMainPhoto;
  form.elements.birthDate.value = payload.birth_date || "";
  form.elements.sex.value = payload.sex || "";
  form.elements.birthPlace.value = normalizePlaceReferenceValue(payload.birth_place || "");
  form.elements.deathDate.value = payload.death_date || "";
  form.elements.deathPlace.value = normalizePlaceReferenceValue(payload.death_place || "");
  form.elements.parents.value = payload.parents || "";
  form.elements.siblings.value = payload.siblings || "";
  form.elements.children.value = payload.children || "";
  form.elements.partners.value = payload.partners || "";
  form.elements.groups.value = payload.groups || "";
  form.elements.navigationCode.value = payload.navigationCode || payload.navigation_code || "";
  form.elements.groupDescription.value = payload.group_description || "";
  form.elements.participants.value = payload.participants || "";
  form.elements.sourceType.value = payload.source_type || "";
  form.elements.sourceDate.value = payload.source_date || "";
  form.elements.sourceOrigin.value = payload.source_origin || "";
  form.elements.sourceStorage.value = payload.source_storage || "";
  form.elements.sourcePeople.value = payload.source_people || "";
  form.elements.sourceGroups.value = payload.source_groups || "";
  form.elements.sourcePlaces.value = payload.source_places || "";
  form.elements.sourceSummary.value = payload.source_summary || "";
  form.elements.sourceExtracts.value = payload.source_extracts || "";
  form.elements.researchQuestion.value = payload.research_question || payload.researchQuestion || "";
  form.elements.researchSolution.value = payload.research_solution || payload.researchSolution || "";
  form.elements.researchJournal.value = payload.research_journal || payload.researchJournal || "[]";
  if (form.elements.placeType) {
    form.elements.placeType.value = payload.place_type || "";
  }
  if (form.elements.renameHistory) {
    form.elements.renameHistory.value = payload.rename_history || "[]";
  }
  factRows = normalizeFacts(payload.facts || "[]");
  renameRows = normalizeRenameHistory(payload.rename_history || "[]");
  researchJournalRows = normalizeResearchJournal(payload.research_journal || payload.researchJournal || "[]");
  form.elements.facts.value = payload.facts || "[]";
  form.elements.notes.value = payload.notes || "";
  setDeathFieldsVisible(hasDeathData());
  applyType(payload.card_type);
  mainPhotoInput.value = preferredMainPhoto;
  navigationCodeInput.value = form.elements.navigationCode.value;
  navigationCodeState = parseNavigationCode(navigationCodeInput.value);
  syncNavigationAnchorSelect();
  clearNavigationResolution();
  pendingPhotoFiles = [];
  photoDropzoneText.textContent = "Перетащи фото сюда или нажми";
  renderFactsTable();
  renderRenameTable();
  renderResearchJournalTable();
  renderPlaceReferences();
  syncNotesPhotoOptions();
  renderNavigationCodeEditor();
  renderNavigationCodeOptions();
  applyNavigationCodeMode("read");
  applyNotesMode("preview");
  queueNotesPreview();
  queueNavigationResolution();
}

function cardIdentityFromPath(path) {
  const [section, directory] = path.split("/");
  return {
    directory,
    cardType: section === "03-people" ? "person" : section === "04-groups" ? "group" : section === "05-places" ? "place" : section === "06-sources" ? "source" : "research",
  };
}

function filterCards() {
  const query = searchInput.value.trim().toLowerCase();
  return allCards.filter((card) => {
    if (navFilter !== "all" && card.card_type !== navFilter) {
      return false;
    }
    if (!query) {
      return true;
    }
    return [card.number, card.title, card.path].some((value) => value.toLowerCase().includes(query));
  });
}

function cardTypeIcon(cardType) {
  return {
    person: "◉",
    group: "◎",
    place: "⌂",
    source: "✦",
    research: "✎",
  }[cardType] || "•";
}

function cardTypeLabel(cardType) {
  return {
    person: "Человек",
    group: "Группа",
    place: "Место",
    source: "Источник",
    research: "Исследование",
  }[cardType] || "Карточка";
}

function renderCardList() {
  const cards = filterCards();
  cardCount.textContent = `${cards.length} карточ${cards.length === 1 ? "ка" : cards.length < 5 ? "ки" : "ек"}`;

  if (!cards.length) {
    cardList.innerHTML = `<li class="nav-item"><span>Ничего не найдено.</span></li>`;
    return;
  }

  cardList.innerHTML = cards
    .map((card) => {
      const isActive = editingState && editingState.directory === card.path.split("/")[1];
      return `
        <li class="nav-item ${isActive ? "is-active" : ""}">
          <button class="nav-open" type="button" data-edit-card="${escapeHtml(card.path)}">
            <div class="nav-item-head">
              <span class="nav-item-icon" aria-hidden="true">${escapeHtml(cardTypeIcon(card.card_type))}</span>
              <p class="nav-item-title">${escapeHtml(card.title)}</p>
              <span class="nav-item-badge sr-only">${escapeHtml(cardTypeLabel(card.card_type))}</span>
            </div>
          </button>
        </li>
      `;
    })
    .join("");
}

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

async function startEditing(cardPath) {
  const requestVersion = editorLoadVersion + 1;
  editorLoadVersion = requestVersion;
  applyEditorView("form");
  const identity = cardIdentityFromPath(cardPath);
  const response = await fetch(
    `/api/card?type=${encodeURIComponent(identity.cardType)}&directory=${encodeURIComponent(identity.directory)}`,
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Не удалось загрузить карточку.");
  }
  if (requestVersion !== editorLoadVersion) {
    return;
  }

  editingState = identity;
  populateForm(payload);
  await loadImagesForCurrentCard(requestVersion, identity);
  await loadGraphForCurrentCard(requestVersion, identity);
  if (requestVersion !== editorLoadVersion) {
    return;
  }
  renderRelationLists();
  renderCardList();
  setStatus(`Загружена карточка ${payload.number} для редактирования.`);
}

async function loadState() {
  const response = await fetch("/api/cards");
  if (!response.ok) {
    throw new Error("Не удалось получить состояние каталога");
  }
  const payload = await response.json();
  allCards = [...payload.people, ...payload.groups, ...(payload.places || []), ...(payload.sources || []), ...(payload.researches || [])].sort((left, right) => {
    const leftNumber = parseInt(left.number.split("-")[1], 10);
    const rightNumber = parseInt(right.number.split("-")[1], 10);
    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }
    return left.number.localeCompare(right.number, "ru");
  });
  renderRelationPickers();
  renderPlacePickers();
  renderPlaceReferences();
  renderCardList();
  renderNavigationCodeOptions();
  if (!isEditing()) {
    form.elements.cardNumber.value = nextCardNumber(currentType());
    loadOverviewGraph().catch((error) => setStatus(error.message, "error"));
  }
  renderRelationLists();
}

function navigationPreviewMessage(preview) {
  const updates = preview.navigation_updates || [];
  if (!updates.length) {
    return "";
  }
  const lines = updates.slice(0, 6).map((item) => `${item.number}: ${item.old_code} -> ${item.new_code}`);
  const tail = updates.length > 6 ? `\n... и ещё ${updates.length - 6}` : "";
  return `Будут обновлены навигационные шифры:\n${lines.join("\n")}${tail}\n\nПродолжить сохранение?`;
}

async function submitForm(event) {
  event.preventDefault();
  setStatus("Сохраняю карточку...");

  const payload = buildFormPayload();
  const editing = isEditing();
  const previewResponse = await fetch("/api/cards/preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const preview = await previewResponse.json().catch(() => ({}));
  if (!previewResponse.ok) {
    setStatus(preview.error || "Не удалось проверить последствия сохранения.", "error");
    return;
  }
  if ((preview.navigation_conflicts || []).length) {
    const conflict = preview.navigation_conflicts[0];
    setStatus(conflict.reason || "Есть конфликт зависимых навигационных шифров.", "error");
    return;
  }
  const previewMessage = navigationPreviewMessage(preview);
  if (previewMessage && !window.confirm(previewMessage)) {
    setStatus("Сохранение отменено.");
    return;
  }
  const response = await fetch("/api/cards", {
    method: editing ? "PUT" : "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const conflict = (result.navigation_conflicts || [])[0];
    setStatus(conflict?.reason || result.error || "Не удалось сохранить карточку.", "error");
    return;
  }

  if (pendingPhotoFiles.length) {
    try {
      const { cardType, directory } = cardIdentityFromPath(result.path);
      const selectedBeforeUpload = mainPhotoInput.value;
      const uploaded = [];
      for (const item of pendingPhotoFiles) {
        const filename = await uploadPhotoFile(cardType, directory, item.file);
        uploaded.push({ original: item.name, uploaded: filename });
      }

      pendingPhotoFiles = [];
      await loadImagesForCurrentCard().catch(() => {});

      const selectedUploaded = uploaded.find((item) => item.original === selectedBeforeUpload);
      if (selectedUploaded) {
        mainPhotoInput.value = selectedUploaded.uploaded;
      }

      await saveCardPayload({
        ...buildFormPayload(),
        cardType,
        editDirectory: directory,
      });
    } catch (error) {
      setStatus(`Карточка сохранена, но загрузка фото не удалась: ${error.message}`, "error");
      return;
    }
  }

  const updateCount = (result.navigation_updates || []).length;
  setStatus(
    `${editing ? "Карточка обновлена" : "Карточка создана"}: ${result.path}${updateCount ? `. Обновлено шифров: ${updateCount}` : ""}`,
    "success",
  );

  if (editing) {
    await loadState();
    await startEditing(result.path);
  } else {
    await loadState();
    applyEditorView("form");
    await startEditing(result.path);
    setStatus(`Карточка создана: ${result.path}`, "success");
  }
}

async function uploadPhotoFile(cardType, directory, file) {
  const body = new FormData();
  body.append("cardType", cardType);
  body.append("directory", directory);
  body.append("file", file, file.name);

  const response = await fetch("/api/upload-image", {
    method: "POST",
    body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "Не удалось загрузить изображение.");
  }
  return result.filename;
}

async function deleteStoredPhoto(filename) {
  const response = await fetch(
    imageUrl(currentType(), editingState.directory, filename),
    { method: "DELETE" },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "Не удалось удалить изображение.");
  }
}

async function saveCardPayload(payload) {
  const response = await fetch("/api/cards", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "Не удалось обновить карточку после загрузки фото.");
  }
  return result;
}

async function saveCurrentCard() {
  return saveCardPayload(buildFormPayload());
}

async function handlePhotoSelection(fileList) {
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
  if (!files.length) {
    setStatus("Нужен хотя бы один файл изображения.", "error");
    return;
  }

  if (!isEditing()) {
    files.forEach((file) => {
      const safeName = sanitizeImageName(file.name);
      pendingPhotoFiles = pendingPhotoFiles.filter((item) => item.name !== safeName);
      pendingPhotoFiles.push({
        file,
        name: safeName,
        previewUrl: URL.createObjectURL(file),
      });
    });
    syncMainPhotoOptions();
    syncNotesPhotoOptions();
    if (!mainPhotoInput.value && pendingPhotoFiles.length) {
      preferredMainPhoto = pendingPhotoFiles[pendingPhotoFiles.length - 1].name;
      mainPhotoInput.value = preferredMainPhoto;
    }
    renderPhotoGallery();
    refreshPhotoPreview();
    photoDropzoneText.textContent = "Фотографии будут загружены после создания карточки";
    return;
  }

  try {
    const uploadedNames = [];
    for (const file of files) {
      uploadedNames.push(await uploadPhotoFile(currentType(), editingState.directory, file));
    }
    await loadImagesForCurrentCard();
    if (!mainPhotoInput.value && uploadedNames.length) {
      preferredMainPhoto = uploadedNames[0];
      mainPhotoInput.value = preferredMainPhoto;
      await saveCurrentCard();
    }
  photoDropzoneText.textContent = "Перетащи фото сюда или нажми";
    setStatus(`Загружено файлов: ${uploadedNames.length}.`);
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function removePhoto(filename) {
  const pending = pendingPhotoFiles.find((item) => item.name === filename);
  if (pending) {
    pendingPhotoFiles = pendingPhotoFiles.filter((item) => item.name !== filename);
    if (mainPhotoInput.value === filename) {
      preferredMainPhoto = "";
      mainPhotoInput.value = "";
    }
    syncMainPhotoOptions();
    renderPhotoGallery();
    refreshPhotoPreview();
    setStatus("Фотография удалена из очереди.");
    return;
  }

  if (!isEditing()) {
    return;
  }

  await deleteStoredPhoto(filename);
  await loadImagesForCurrentCard();
  if (mainPhotoInput.value === filename) {
    preferredMainPhoto = "";
    mainPhotoInput.value = "";
    await saveCurrentCard();
  }
  syncNotesPhotoOptions();
  renderPhotoGallery();
  refreshPhotoPreview();
  setStatus("Фотография удалена.");
}

refreshButton.addEventListener("click", async () => {
  try {
    await loadState();
    setStatus("Список карточек обновлён.");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

homeButton.addEventListener("click", () => {
  resetFormToCreateMode();
  applyEditorView("graph");
  setStatus("");
});

newCardButton.addEventListener("click", () => {
  openNewCardTypeDialog();
});

if (newCardTypeDialog) {
  newCardTypeDialog.addEventListener("close", () => {
    const type = newCardTypeDialog.returnValue;
    if (!type || type === "cancel") {
      return;
    }
    resetFormToCreateMode(type);
    applyEditorView("form");
    renderRelationLists();
    setStatus("Режим создания новой карточки.");
  });
}

deathToggle.addEventListener("click", () => {
  setDeathFieldsVisible(!deathFieldsVisible);
  if (!deathFieldsVisible) {
    form.elements.deathDate.value = "";
    form.elements.deathPlace.value = "";
    renderPlaceReferences();
  }
});

addFactButton.addEventListener("click", () => {
  factRows.push(emptyFactRow());
  renderFactsTable();
});

if (addRenameButton) {
  addRenameButton.addEventListener("click", () => {
    renameRows.push(emptyRenameRow());
    renderRenameTable();
  });
}

if (addResearchEntryButton) {
  addResearchEntryButton.addEventListener("click", () => {
    researchJournalRows.push(emptyResearchJournalRow());
    renderResearchJournalTable();
  });
}

[birthPlacePicker, deathPlacePicker].forEach((select) => {
  if (!select) {
    return;
  }
  select.addEventListener("change", () => {
    updatePickerPlaceholderState(select);
    if (!select.value) {
      return;
    }
    const targetField = select.id === "birth-place-picker" ? "birthPlace" : "deathPlace";
    applyPlaceCard(targetField, select.value);
    select.value = "";
    updatePickerPlaceholderState(select);
  });
});

notesBoldButton.addEventListener("click", () => {
  replaceSelection(notesInput, (selected) => `*${selected}*`, "текст");
});

notesItalicButton.addEventListener("click", () => {
  replaceSelection(notesInput, (selected) => `_${selected}_`, "текст");
});

notesListButton.addEventListener("click", () => {
  replaceSelection(
    notesInput,
    (selected) =>
      selected
        .split("\n")
        .map((line) => `* ${line || "пункт"}`)
        .join("\n"),
    "пункт",
  );
});

notesLinkButton.addEventListener("click", () => {
  replaceSelection(notesInput, () => "link:https://example.com[ссылка]");
});

notesPhotoInsertButton.addEventListener("click", () => {
  if (!notesPhotoSelect.value) {
    return;
  }
  replaceSelection(
    notesInput,
    () => `image::images/${notesPhotoSelect.value}[${notesPhotoSelect.value}]`,
  );
});

notesModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyNotesMode(button.dataset.notesMode);
    if (button.dataset.notesMode === "preview") {
      queueNotesPreview();
    } else {
      notesInput.focus();
    }
  });
});

navCodeBuildButton.addEventListener("click", () => {
  buildNavigationCode().catch((error) => setStatus(error.message, "error"));
});

navCodeFromSelect.addEventListener("change", () => {
  resetNavigationCodeResult();
});

navCodeToSelect.addEventListener("change", () => {
  resetNavigationCodeResult();
});

editorViewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyEditorView(button.dataset.editorView);
  });
});

cardFilterSelect.addEventListener("change", () => {
  navFilter = cardFilterSelect.value;
  renderCardList();
});

searchInput.addEventListener("input", renderCardList);
form.elements.primaryName.addEventListener("input", updateModeUi);
notesInput.addEventListener("input", queueNotesPreview);
navigationCodeInput.addEventListener("input", () => {
  navigationCodeState = parseNavigationCode(navigationCodeInput.value);
  form.elements.navigationCode.value = navigationCodeInput.value.trim();
  syncNavigationAnchorSelect();
  renderNavigationCodeEditor();
  queueNavigationResolution();
});

navCodeAddSegmentButton.addEventListener("click", () => {
  if (!navigationCodeInput.value.trim()) {
    navigationCodeState = parseNavigationCode(form.elements.cardNumber.value.trim());
  }
  if (!navigationCodeState.valid) {
    return;
  }
  if (!navigationCodeState.base) {
    navigationCodeState.base = form.elements.cardNumber.value.trim();
  }
  navigationCodeState.segments.push(emptyNavigationSegment());
  syncNavigationCodeInput();
  renderNavigationCodeEditor();
  queueNavigationResolution();
});

navCodeClearButton.addEventListener("click", () => {
  navigationCodeState = { base: "", segments: [], valid: true };
  clearNavigationResolution();
  syncNavigationCodeInput();
  renderNavigationCodeEditor();
  applyNavigationCodeMode("edit");
  queueNavigationResolution();
});

navigationCodeAnchorSelect.addEventListener("change", () => {
  const card = personCardByDirectory(navigationCodeAnchorSelect.value);
  navigationCodeState.base = card ? card.number : "";
  syncNavigationCodeInput();
  renderNavigationCodeEditor();
  queueNavigationResolution();
});

navModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyNavigationCodeMode(button.dataset.navMode);
  });
});

photoDropzone.addEventListener("click", () => {
  photoFileInput.click();
});

photoPasteButton.addEventListener("click", async () => {
  try {
    const files = await readClipboardImageFiles();
    await handlePhotoSelection(files);
  } catch (error) {
    try {
      setStatus("Нажми Cmd/Ctrl+V, чтобы вставить фото из буфера.");
      const files = await captureClipboardImageFilesFromPaste();
      await handlePhotoSelection(files);
    } catch (fallbackError) {
      setStatus(fallbackError.message, "error");
      photoDropzone.focus();
    }
  }
});

photoFileInput.addEventListener("change", () => {
  handlePhotoSelection(photoFileInput.files).catch((error) => setStatus(error.message, "error"));
  photoFileInput.value = "";
});

notesPhotoSelect.addEventListener("change", () => {
  notesPhotoSelect.classList.toggle("is-empty", !notesPhotoSelect.value);
});

document.addEventListener("change", (event) => {
  const navKindField = event.target.closest("[data-nav-segment-kind]");
  if (navKindField) {
    const index = Number(navKindField.dataset.navSegmentKind);
    if (!navigationCodeState.segments[index]) {
      return;
    }
    navigationCodeState.segments[index] = normalizeNavigationSegment({
      ...navigationCodeState.segments[index],
      kind: navKindField.value,
    });
    syncNavigationCodeInput();
    renderNavigationCodeEditor();
    queueNavigationResolution();
    return;
  }

  const picker = event.target.closest("[data-picker-select]");
  if (!picker) {
    const factPlacePicker = event.target.closest("[data-fact-place-picker]");
    if (factPlacePicker) {
      updatePickerPlaceholderState(factPlacePicker);
      if (!factPlacePicker.value) {
        return;
      }
      const index = Number(factPlacePicker.dataset.factPlacePicker);
      const targetCard = allCards.find((card) => card.path === factPlacePicker.value && card.card_type === "place");
      if (!targetCard || !factRows[index]) {
        return;
      }
      factRows[index].place = placeXref(targetCard);
      factPlacePicker.value = "";
      updatePickerPlaceholderState(factPlacePicker);
      renderFactsTable();
      return;
    }

    const factSourcePicker = event.target.closest("[data-fact-source-picker]");
    if (factSourcePicker) {
      updatePickerPlaceholderState(factSourcePicker);
      if (!factSourcePicker.value) {
        return;
      }
      const index = Number(factSourcePicker.dataset.factSourcePicker);
      const targetCard = allCards.find((card) => card.path === factSourcePicker.value && card.card_type === "source");
      if (!targetCard || !factRows[index]) {
        return;
      }
      const entries = parseFactSourceEntries(factRows[index].source);
      entries.push(cardXref(targetCard));
      factRows[index].source = serializeFactSourceEntries(entries);
      factSourcePicker.value = "";
      updatePickerPlaceholderState(factSourcePicker);
      renderFactsTable();
      return;
    }

    const researchLinkPicker = event.target.closest("[data-research-link-picker]");
    if (!researchLinkPicker) {
      return;
    }
    updatePickerPlaceholderState(researchLinkPicker);
    if (!researchLinkPicker.value) {
      return;
    }
    const index = Number(researchLinkPicker.dataset.researchLinkPicker);
    const targetCard = allCards.find((card) => card.path === researchLinkPicker.value);
    if (!targetCard || !researchJournalRows[index]) {
      return;
    }
    const entries = parseFactSourceEntries(researchJournalRows[index].links);
    entries.push(cardXref(targetCard));
    researchJournalRows[index].links = serializeFactSourceEntries(entries);
    researchLinkPicker.value = "";
    updatePickerPlaceholderState(researchLinkPicker);
    renderResearchJournalTable();
    return;
  }

  updatePickerPlaceholderState(picker);
  if (!picker.value) {
    return;
  }

  const fieldName = picker.dataset.pickerSelect;
  const targetCard = allCards.find((card) => card.path === picker.value);
  if (!targetCard) {
    setStatus("Не удалось найти выбранную карточку.", "error");
    return;
  }

  appendRelationValue(fieldName, cardXref(targetCard), { native: fieldName === "parents" });
  picker.value = "";
  updatePickerPlaceholderState(picker);
  setStatus(`Добавлена ссылка в поле: ${fieldName}.`);
});

document.addEventListener("input", (event) => {
  const navIndexField = event.target.closest("[data-nav-segment-index]");
  if (navIndexField) {
    const index = Number(navIndexField.dataset.navSegmentIndex);
    if (!navigationCodeState.segments[index]) {
      return;
    }
    navigationCodeState.segments[index] = normalizeNavigationSegment({
      ...navigationCodeState.segments[index],
      index: navIndexField.value,
    });
    syncNavigationCodeInput();
    renderNavigationCodeEditor();
    queueNavigationResolution();
    return;
  }

  const field = event.target.closest("[data-fact-field]");
  if (field) {
    const index = Number(field.dataset.factIndex);
    const key = field.dataset.factField;
    if (!factRows[index] || !key) {
      return;
    }

    factRows[index][key] = field.value;
    syncFactsField();
    return;
  }

  const renameField = event.target.closest("[data-rename-field]");
  if (renameField) {
    const index = Number(renameField.dataset.renameIndex);
    const key = renameField.dataset.renameField;
    if (!renameRows[index] || !key) {
      return;
    }
    renameRows[index][key] = renameField.value;
    syncRenameHistoryField();
    return;
  }

  const researchEntryField = event.target.closest("[data-research-entry-field]");
  if (!researchEntryField) {
    return;
  }
  const index = Number(researchEntryField.dataset.researchEntryIndex);
  const key = researchEntryField.dataset.researchEntryField;
  if (!researchJournalRows[index] || !key) {
    return;
  }
  researchJournalRows[index][key] = researchEntryField.value;
  syncResearchJournalField();
});

photoPreviewImage.addEventListener("error", () => {
  if (!pendingPhotoFiles.length) {
    photoPreview.classList.add("is-empty");
    photoPreviewImage.removeAttribute("src");
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  photoDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    photoDropzone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  photoDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    photoDropzone.classList.remove("is-dragover");
  });
});

photoDropzone.addEventListener("drop", (event) => {
  handlePhotoSelection(event.dataTransfer.files).catch((error) => setStatus(error.message, "error"));
});

photoDropzone.addEventListener("paste", (event) => {
  const files = clipboardImageFiles(event.clipboardData);
  if (!files.length) {
    return;
  }
  event.preventDefault();
  handlePhotoSelection(files).catch((error) => setStatus(error.message, "error"));
});

lightboxClose.addEventListener("click", closeLightbox);
lightboxPrev.addEventListener("click", () => moveLightbox(-1));
lightboxNext.addEventListener("click", () => moveLightbox(1));
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) {
    closeLightbox();
  }
});

document.addEventListener("keydown", (event) => {
  if (lightbox.classList.contains("is-hidden")) {
    return;
  }
  if (event.key === "Escape") {
    closeLightbox();
  } else if (event.key === "ArrowLeft") {
    moveLightbox(-1);
  } else if (event.key === "ArrowRight") {
    moveLightbox(1);
  }
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-edit-card]");
  if (target) {
    startEditing(target.dataset.editCard).catch((error) => setStatus(error.message, "error"));
    return;
  }

  const placeFieldOpenButton = event.target.closest("[data-open-place-field]");
  if (placeFieldOpenButton) {
    openPlaceField(placeFieldOpenButton.dataset.openPlaceField);
    return;
  }

  const placeFieldClearButton = event.target.closest("[data-clear-place-field]");
  if (placeFieldClearButton) {
    clearPlaceField(placeFieldClearButton.dataset.clearPlaceField);
    return;
  }

  const copyCodeButton = event.target.closest("[data-copy-nav-code]");
  if (copyCodeButton) {
    navigator.clipboard.writeText(copyCodeButton.dataset.copyNavCode).then(
      () => setStatus("Шифр скопирован."),
      () => setStatus("Не удалось скопировать шифр.", "error"),
    );
    return;
  }

  const graphTarget = event.target.closest("[data-graph-open]");
  if (graphTarget) {
    applyEditorView("form");
    startEditing(graphTarget.dataset.graphOpen).catch((error) => setStatus(error.message, "error"));
    return;
  }

  const removeNavSegmentButton = event.target.closest("[data-nav-segment-remove]");
  if (removeNavSegmentButton) {
    const index = Number(removeNavSegmentButton.dataset.navSegmentRemove);
    navigationCodeState.segments.splice(index, 1);
    syncNavigationCodeInput();
    renderNavigationCodeEditor();
    queueNavigationResolution();
    return;
  }

  const toggleParentNativeButton = event.target.closest("[data-toggle-parent-native]");
  if (toggleParentNativeButton) {
    const index = Number(toggleParentNativeButton.dataset.toggleParentNative);
    const values = relationValues("parents");
    if (!values[index]) {
      return;
    }
    values[index].native = !values[index].native;
    updateRelationField("parents", values);
    renderRelationLists();
    setStatus("Характеристика родительской связи обновлена.");
    return;
  }

  const openPhotoButton = event.target.closest("[data-open-photo]");
  if (openPhotoButton) {
    openLightbox(Number(openPhotoButton.dataset.openPhoto));
    return;
  }

  const deletePhotoButton = event.target.closest("[data-delete-photo]");
  if (deletePhotoButton) {
    removePhoto(deletePhotoButton.dataset.deletePhoto).catch((error) => setStatus(error.message, "error"));
    return;
  }

  const mainPhotoButton = event.target.closest("[data-main-photo]");
  if (mainPhotoButton) {
    const nextName = mainPhotoButton.dataset.mainPhoto === mainPhotoInput.value ? "" : mainPhotoButton.dataset.mainPhoto;
    applyMainPhotoSelection(nextName).catch((error) => setStatus(error.message, "error"));
    return;
  }

  const factDeleteButton = event.target.closest("[data-fact-delete]");
  if (factDeleteButton) {
    factRows.splice(Number(factDeleteButton.dataset.factDelete), 1);
    renderFactsTable();
    return;
  }

  const factMoveButton = event.target.closest("[data-fact-move]");
  if (factMoveButton) {
    const index = Number(factMoveButton.dataset.factIndex);
    const direction = factMoveButton.dataset.factMove;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= factRows.length) {
      return;
    }
    const [row] = factRows.splice(index, 1);
    factRows.splice(targetIndex, 0, row);
    renderFactsTable();
    return;
  }

  const factPlaceOpenButton = event.target.closest("[data-fact-place-open]");
  if (factPlaceOpenButton) {
    const index = Number(factPlaceOpenButton.dataset.factPlaceOpen);
    const targetPath = placeFieldTargetPath(factRows[index]?.place || "");
    if (targetPath) {
      startEditing(targetPath).catch((error) => setStatus(error.message, "error"));
    }
    return;
  }

  const factPlaceClearButton = event.target.closest("[data-fact-place-clear]");
  if (factPlaceClearButton) {
    const index = Number(factPlaceClearButton.dataset.factPlaceClear);
    if (!factRows[index]) {
      return;
    }
    factRows[index].place = "";
    renderFactsTable();
    return;
  }

  const factSourceOpenButton = event.target.closest("[data-open-fact-source]");
  if (factSourceOpenButton) {
    const targetPath = factSourcePath(factSourceOpenButton.dataset.factSourceValue || "");
    if (targetPath) {
      startEditing(targetPath).catch((error) => setStatus(error.message, "error"));
    }
    return;
  }

  const factSourceRemoveButton = event.target.closest("[data-remove-fact-source]");
  if (factSourceRemoveButton) {
    const rowIndex = Number(factSourceRemoveButton.dataset.removeFactSource);
    const entryIndex = Number(factSourceRemoveButton.dataset.factSourceEntry);
    if (!factRows[rowIndex]) {
      return;
    }
    const entries = parseFactSourceEntries(factRows[rowIndex].source);
    entries.splice(entryIndex, 1);
    factRows[rowIndex].source = serializeFactSourceEntries(entries);
    renderFactsTable();
    return;
  }

  const researchLinkOpenButton = event.target.closest("[data-open-research-link]");
  if (researchLinkOpenButton) {
    const targetPath = relationTargetPath(researchLinkOpenButton.dataset.researchLinkValue || "");
    if (targetPath) {
      startEditing(targetPath).catch((error) => setStatus(error.message, "error"));
    }
    return;
  }

  const researchLinkRemoveButton = event.target.closest("[data-remove-research-link]");
  if (researchLinkRemoveButton) {
    const rowIndex = Number(researchLinkRemoveButton.dataset.removeResearchLink);
    const entryIndex = Number(researchLinkRemoveButton.dataset.researchLinkEntry);
    if (!researchJournalRows[rowIndex]) {
      return;
    }
    const entries = parseFactSourceEntries(researchJournalRows[rowIndex].links);
    entries.splice(entryIndex, 1);
    researchJournalRows[rowIndex].links = serializeFactSourceEntries(entries);
    renderResearchJournalTable();
    return;
  }

  const renameDeleteButton = event.target.closest("[data-rename-delete]");
  if (renameDeleteButton) {
    renameRows.splice(Number(renameDeleteButton.dataset.renameDelete), 1);
    renderRenameTable();
    return;
  }

  const renameMoveButton = event.target.closest("[data-rename-move]");
  if (renameMoveButton) {
    const index = Number(renameMoveButton.dataset.renameIndex);
    const direction = renameMoveButton.dataset.renameMove;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= renameRows.length) {
      return;
    }
    const [row] = renameRows.splice(index, 1);
    renameRows.splice(targetIndex, 0, row);
    renderRenameTable();
    return;
  }

  const researchEntryDeleteButton = event.target.closest("[data-research-entry-delete]");
  if (researchEntryDeleteButton) {
    researchJournalRows.splice(Number(researchEntryDeleteButton.dataset.researchEntryDelete), 1);
    renderResearchJournalTable();
    return;
  }

  const researchEntryMoveButton = event.target.closest("[data-research-entry-move]");
  if (researchEntryMoveButton) {
    const index = Number(researchEntryMoveButton.dataset.researchEntryIndex);
    const direction = researchEntryMoveButton.dataset.researchEntryMove;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= researchJournalRows.length) {
      return;
    }
    const [row] = researchJournalRows.splice(index, 1);
    researchJournalRows.splice(targetIndex, 0, row);
    renderResearchJournalTable();
    return;
  }

  const relationTarget = event.target.closest("[data-open-relation]");
  if (relationTarget) {
    startEditing(relationTarget.dataset.openRelation).catch((error) => setStatus(error.message, "error"));
    return;
  }

  const navigationTarget = event.target.closest("[data-open-nav-card]");
  if (navigationTarget) {
    startEditing(navigationTarget.dataset.openNavCard).catch((error) => setStatus(error.message, "error"));
    return;
  }

  const moveRelationButton = event.target.closest("[data-move-relation]");
  if (moveRelationButton) {
    const fieldName = moveRelationButton.dataset.moveRelation;
    const index = Number(moveRelationButton.dataset.moveIndex);
    const direction = moveRelationButton.dataset.moveDirection;
    const values = relationValues(fieldName);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= values.length) {
      return;
    }
    const [entry] = values.splice(index, 1);
    values.splice(targetIndex, 0, entry);
    updateRelationField(fieldName, renumberRelationEntries(values));
    renderRelationLists();
    setStatus("Порядок связей обновлён.");
    return;
  }

  return;
});

document.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-relation]");
  if (!removeButton) {
    return;
  }

  const fieldName = removeButton.dataset.removeRelation;
  const index = Number(removeButton.dataset.removeIndex);
  const values = relationValues(fieldName);
  values.splice(index, 1);
  updateRelationField(fieldName, renumberRelationEntries(values));
  renderRelationLists();
  setStatus(`Связь удалена из поля: ${fieldName}.`);
});

form.addEventListener("submit", (event) => {
  submitForm(event).catch((error) => setStatus(error.message, "error"));
});

applyNotesMode("preview");
applyType("person");
applyEditorView("graph");
loadState().catch((error) => setStatus(error.message, "error"));
