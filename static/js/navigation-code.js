// Навигационный шифр: разбор, отрисовка, вычисление сегментов
// Часть family_tree_tool GUI. Общий глобальный скоуп (см. index.html — файлы грузятся по порядку).


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

