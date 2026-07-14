// Загрузка/сохранение карточек, отправка формы, фото
// Часть family_tree_tool GUI. Общий глобальный скоуп (см. index.html — файлы грузятся по порядку).

async function startEditing(cardPath) {
  const requestVersion = editorLoadVersion + 1;
  editorLoadVersion = requestVersion;
  // Вид (форма/граф) не переключаем — сохраняем текущее состояние при
  // переходе между людьми (в т.ч. по узлам графа).
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
  // Сохранённая карточка открывается заблокированной (режим просмотра).
  setFormLocked(true);
  setStatus(`Карточка ${payload.number} открыта. Нажми «Редактировать», чтобы изменить.`);
}

async function deleteCard(cardPath) {
  const identity = cardIdentityFromPath(cardPath);
  const response = await fetch(
    `/api/card?type=${encodeURIComponent(identity.cardType)}&directory=${encodeURIComponent(identity.directory)}`,
    { method: "DELETE" },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "Не удалось удалить карточку.");
  }
  // Если удаляли открытую карточку — возвращаемся к чистому обзору.
  if (editingState && editingState.directory === identity.directory && editingState.cardType === identity.cardType) {
    resetFormToCreateMode();
    applyEditorView("graph");
  }
  await loadState();
  setStatus("Карточка удалена.", "success");
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
  const savedPath = result.path;
  const savedType = payload.cardType || "person";

  // Логичный выход: после сохранения (и создания, и правки) выходим из
  // режима редактирования в чистую форму «Новая запись».
  await loadState();
  resetFormToCreateMode(savedType);
  applyEditorView("form");
  setStatus(
    `${editing ? "Карточка обновлена" : "Карточка создана"}: ${savedPath}${updateCount ? `. Обновлено шифров: ${updateCount}` : ""}. Форма очищена для новой записи.`,
    "success",
  );
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

