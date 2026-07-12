// Фотографии: галерея, лайтбокс, буфер обмена
// Часть family_tree_tool GUI. Общий глобальный скоуп (см. index.html — файлы грузятся по порядку).

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

