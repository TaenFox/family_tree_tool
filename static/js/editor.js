// Форма редактора: режимы, заполнение, список карточек
// Часть family_tree_tool GUI. Общий глобальный скоуп (см. index.html — файлы грузятся по порядку).

function updateModeUi() {
  const editing = isEditing();
  const overviewGraph = editorView === "graph" && !editing;
  const currentName = form.elements.primaryName.value.trim();
  modeTitle.textContent = editing ? currentName || "Без имени" : editorView === "graph" ? "Граф связей" : "Новая запись";
  submitButton.textContent = "Сохранить";
  // В графе кнопок правки нет. В форме: заблокированная карточка показывает
  // «Редактировать», разблокированная (создание/правка) — «Сохранить».
  const formView = editorView === "form";
  submitButton.classList.toggle("is-hidden", !formView || formLocked);
  // Кнопка «Отмена» доступна только в разблокированной форме (создание/правка).
  cancelButton?.classList.toggle("is-hidden", !formView || formLocked);
  editButton?.classList.toggle("is-hidden", !formView || !formLocked);
  editorViewToggle?.classList.toggle("is-hidden", overviewGraph);
  form.elements.cardNumber.readOnly = editing;
}

function applyType(type) {
  form.elements.cardType.value = type;
  const isPerson = type === "person";
  // У человека имя вводится тремя полями (Фамилия/Имя/Отчество), поэтому единое
  // поле «Имя при рождении» скрываем и собираем primaryName из частей.
  primaryNameField?.classList.toggle("is-hidden", isPerson);
  if (form.elements.primaryName) {
    form.elements.primaryName.required = !isPerson;
  }
  if (form.elements.givenName) {
    form.elements.givenName.required = isPerson;
  }
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
  form.elements.surname.value = "";
  form.elements.givenName.value = "";
  form.elements.patronymic.value = "";
  form.elements.maidenName.value = "";
  setMaidenFieldVisible(false);
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
  closeNavigationLookupDialog();
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
  // Новая карточка сразу редактируема.
  setFormLocked(false);
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
  form.elements.surname.value = payload.surname || "";
  form.elements.givenName.value = payload.given_name || "";
  form.elements.patronymic.value = payload.patronymic || "";
  form.elements.maidenName.value = payload.maiden_name || "";
  setMaidenFieldVisible(Boolean((payload.maiden_name || "").trim()));
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

function pathFromCardIdentity(identity) {
  const section =
    identity.cardType === "group" ? "04-groups" : identity.cardType === "place" ? "05-places" : identity.cardType === "source" ? "06-sources" : identity.cardType === "research" ? "07-research" : "03-people";
  return `${section}/${identity.directory}`;
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

