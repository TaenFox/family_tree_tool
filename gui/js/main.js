// Инициализация: обработчики событий и старт приложения
// Часть family_tree_tool GUI. Общий глобальный скоуп (см. index.html — файлы грузятся по порядку).

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

if (editButton) {
  editButton.addEventListener("click", () => {
    setFormLocked(false);
    setStatus("Режим редактирования включён.");
  });
}

if (cancelButton) {
  cancelButton.addEventListener("click", () => {
    if (isEditing()) {
      // Карточка уже существовала: откатываем несохранённые изменения,
      // перезагружая её с сервера, и возвращаемся в режим просмотра.
      startEditing(pathFromCardIdentity(editingState))
        .then(() => setStatus("Изменения отменены."))
        .catch((error) => setStatus(error.message, "error"));
      return;
    }
    // Новая карточка: сбрасываем введённые значения и выходим из создания.
    resetFormToCreateMode();
    applyEditorView("graph");
    setStatus("Создание карточки отменено.");
  });
}

function closeCardContextMenu() {
  contextMenuTarget = null;
  cardContextMenu?.classList.add("is-hidden");
}

function openCardContextMenu(clientX, clientY, cardPath, cardTitle) {
  if (!cardContextMenu) {
    return;
  }
  contextMenuTarget = { path: cardPath, title: cardTitle };
  cardContextMenu.classList.remove("is-hidden");
  // Прижимаем меню к границам окна, чтобы не выходило за экран.
  const menuRect = cardContextMenu.getBoundingClientRect();
  const left = Math.min(clientX, window.innerWidth - menuRect.width - 8);
  const top = Math.min(clientY, window.innerHeight - menuRect.height - 8);
  cardContextMenu.style.left = `${Math.max(8, left)}px`;
  cardContextMenu.style.top = `${Math.max(8, top)}px`;
}

// ПКМ по карточке в списке — контекстное меню с действиями «Удалить»/«Отмена».
cardList.addEventListener("contextmenu", (event) => {
  const target = event.target.closest("[data-edit-card]");
  if (!target) {
    return;
  }
  event.preventDefault();
  const title = target.querySelector(".nav-item-title")?.textContent?.trim() || "";
  openCardContextMenu(event.clientX, event.clientY, target.dataset.editCard, title);
});

if (cardContextMenu) {
  cardContextMenu.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-context-action]");
    if (!actionButton) {
      return;
    }
    const action = actionButton.dataset.contextAction;
    const target = contextMenuTarget;
    closeCardContextMenu();
    if (action === "delete" && target) {
      pendingDeleteTarget = target;
      deleteCardName.textContent = target.title || target.path;
      if (typeof deleteCardDialog.showModal === "function") {
        deleteCardDialog.showModal();
      } else if (window.confirm(`Удалить карточку «${target.title || target.path}»?`)) {
        deleteCard(target.path).catch((error) => setStatus(error.message, "error"));
        pendingDeleteTarget = null;
      }
    }
  });
}

if (deleteCardDialog) {
  deleteCardDialog.addEventListener("close", () => {
    const target = pendingDeleteTarget;
    pendingDeleteTarget = null;
    if (deleteCardDialog.returnValue === "delete" && target) {
      deleteCard(target.path).catch((error) => setStatus(error.message, "error"));
    }
  });
}

// Любой клик мимо меню, прокрутка или Escape закрывают контекстное меню.
document.addEventListener("click", (event) => {
  if (contextMenuTarget && !event.target.closest("#card-context-menu")) {
    closeCardContextMenu();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCardContextMenu();
  }
});
window.addEventListener("scroll", closeCardContextMenu, true);

if (navLookupOpenButton) {
  navLookupOpenButton.addEventListener("click", () => {
    openNavigationLookupDialog();
  });
}

if (navLookupCloseButton) {
  navLookupCloseButton.addEventListener("click", () => {
    closeNavigationLookupDialog();
  });
}

if (navLookupDialog) {
  navLookupDialog.addEventListener("click", (event) => {
    if (event.target === navLookupDialog) {
      closeNavigationLookupDialog();
    }
  });
}

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

deathToggle.addEventListener("change", () => {
  setDeathFieldsVisible(deathToggle.checked);
  if (!deathToggle.checked) {
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
    // Остаёмся в графе — просто загружаем связи выбранного человека.
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
    closeNavigationLookupDialog();
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
  // Удалённая карточка снова доступна для выбора в списке.
  renderRelationPickers();
  setStatus(`Связь удалена из поля: ${fieldName}.`);
});

// Кастомный выпадающий список пикеров связей (фикс. высота + прокрутка,
// исключение уже выбранных карточек).
document.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-picker-toggle]");
  if (toggle) {
    // Клик по строке открывает список для выбора.
    openRelationPickerMenu(toggle);
    return;
  }

  const option = event.target.closest("[data-picker-option]");
  if (option) {
    const fieldName = option.dataset.pickerOption;
    const targetCard = allCards.find((card) => card.path === option.dataset.pickerValue);
    closeRelationPickerMenus(null);
    if (!targetCard) {
      setStatus("Не удалось найти выбранную карточку.", "error");
      return;
    }
    appendRelationValue(fieldName, cardXref(targetCard), { native: fieldName === "parents" });
    renderRelationPickers();
    setStatus(`Добавлена ссылка в поле: ${fieldName}.`);
    return;
  }

  if (!event.target.closest("[data-picker-dropdown]")) {
    closeRelationPickerMenus(null);
  }
});

// Ввод в строке пикера фильтрует выпадающий список по совпадению.
document.addEventListener("input", (event) => {
  const toggle = event.target.closest("[data-picker-toggle]");
  if (!toggle) {
    return;
  }
  const menu = toggle.closest("[data-picker-dropdown]")?.querySelector("[data-picker-menu]");
  if (!menu) {
    return;
  }
  menu.innerHTML = pickerMenuItemsHtml(toggle.dataset.pickerToggle, toggle.dataset.pickerType, toggle.value);
  menu.classList.remove("is-hidden");
  toggle.setAttribute("aria-expanded", "true");
});

// Escape закрывает открытые списки пикеров.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && event.target.closest("[data-picker-toggle]")) {
    closeRelationPickerMenus(null);
    event.target.blur();
  }
});

form.addEventListener("submit", (event) => {
  submitForm(event).catch((error) => setStatus(error.message, "error"));
});

applyNotesMode("preview");
applyType("person");
applyEditorView("graph");
loadState().catch((error) => setStatus(error.message, "error"));
