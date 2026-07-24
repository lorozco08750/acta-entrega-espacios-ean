import SignaturePad from 'signature_pad';
import { SPACES, CUSTOM_SPACE_VALUE } from './catalog.js';
import {
  clearDraft,
  clearGeneratedPdf,
  loadDraft,
  loadGeneratedPdf,
  saveDraft,
  saveGeneratedPdf,
} from './storage.js';
import { createActaPdf } from './pdf.js';
import './styles.css';

const form = document.querySelector('#acta-form');
const spacesList = document.querySelector('#spaces-list');
const spaceTemplate = document.querySelector('#space-template');
const saveStatus = document.querySelector('#save-status');
const toast = document.querySelector('#toast');
const review = document.querySelector('#review');
const nextButton = document.querySelector('#next-step');
const previousButton = document.querySelector('#previous-step');
const discardButton = document.querySelector('#discard-draft');
const pdfResult = document.querySelector('#pdf-result');
const downloadPdf = document.querySelector('#download-pdf');
const sharePdfButton = document.querySelector('#share-pdf');
const pdfStatus = document.querySelector('#pdf-status');
const pdfHelp = document.querySelector('#pdf-help');
const pdfActions = document.querySelector('#pdf-actions');
const radicadoInput = form.elements.radicado;

let currentStep = 1;
let spaces = [];
let generatedPdf = null;
let generatedFilename = '';
let generatedFingerprint = '';
let pdfPreparationPromise = null;
let saveTimer = null;
const signatureBackups = { cliente: '', responsable: '' };
let currentSession = null;

const signaturePads = {
  cliente: new SignaturePad(document.querySelector('#signature-cliente'), {
    minWidth: 0.8,
    maxWidth: 2.5,
    penColor: '#17211f',
    backgroundColor: 'rgba(255,255,255,0)',
  }),
  responsable: new SignaturePad(document.querySelector('#signature-responsable'), {
    minWidth: 0.8,
    maxWidth: 2.5,
    penColor: '#17211f',
    backgroundColor: 'rgba(255,255,255,0)',
  }),
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add('is-visible');
  window.setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

function setDefaultDate() {
  const input = form.elements.fechaEntrega;
  if (input.value) return;
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  input.value = now.toISOString().slice(0, 16);
}

function resizeSignatureCanvas(canvas, pad, key) {
  const dataUrl = pad.isEmpty() ? signatureBackups[key] : pad.toDataURL('image/png');
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const width = canvas.getBoundingClientRect().width;
  canvas.width = width * ratio;
  canvas.height = 180 * ratio;
  canvas.getContext('2d').scale(ratio, ratio);
  pad.clear();
  if (dataUrl && width > 0) pad.fromDataURL(dataUrl);
}

function resizeSignatures() {
  Object.entries(signaturePads).forEach(([key, pad]) => {
    resizeSignatureCanvas(document.querySelector(`#signature-${key}`), pad, key);
  });
}

function getFormData() {
  const values = Object.fromEntries(new FormData(form).entries());
  return {
    radicado: values.radicado || '',
    fechaEntrega: values.fechaEntrega || '',
    nombreEvento: values.nombreEvento || '',
    cliente: values.cliente || '',
    organizacion: values.organizacion || '',
    responsableEntrega: values.responsableEntrega || '',
    observacionesGenerales: values.observacionesGenerales || '',
    identificacionCliente: values.identificacionCliente || '',
    aceptacion: form.elements.aceptacion.checked,
  };
}

function collectDraft() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    currentStep,
    form: getFormData(),
    spaces: spaces.map((space) => ({
      ...space,
      photos: space.photos.map((photo) => ({ id: photo.id, name: photo.name, blob: photo.blob })),
    })),
    signatures: {
      cliente: signaturePads.cliente.isEmpty() ? signatureBackups.cliente : signaturePads.cliente.toDataURL('image/png'),
      responsable: signaturePads.responsable.isEmpty() ? signatureBackups.responsable : signaturePads.responsable.toDataURL('image/png'),
    },
  };
}

function scheduleSave({ invalidatePdf = true } = {}) {
  if (invalidatePdf) {
    generatedFingerprint = '';
    if (currentStep !== 4) pdfResult.hidden = true;
  }
  window.clearTimeout(saveTimer);
  saveStatus.textContent = 'Guardando…';
  saveStatus.classList.add('is-saving');
  saveTimer = window.setTimeout(async () => {
    try {
      await saveDraft(collectDraft());
      saveStatus.textContent = 'Guardado local';
      saveStatus.classList.remove('is-saving');
    } catch (error) {
      console.error(error);
      saveStatus.textContent = 'No se pudo guardar';
      showToast('No fue posible guardar el borrador local.', 'error');
    }
  }, 500);
}

async function persistDraftNow() {
  window.clearTimeout(saveTimer);
  saveStatus.textContent = 'Guardando…';
  saveStatus.classList.add('is-saving');
  await saveDraft(collectDraft());
  saveStatus.textContent = 'Guardado local';
  saveStatus.classList.remove('is-saving');
}

function makeSpace() {
  return { id: uid(), selected: '', customName: '', description: '', notes: '', photos: [] };
}

function populateSpaceSelect(select, selected) {
  select.innerHTML = [
    '<option value="">Selecciona un espacio</option>',
    ...SPACES.map((space) => `<option value="${space}">${space}</option>`),
    `<option value="${CUSTOM_SPACE_VALUE}">Otro espacio…</option>`,
  ].join('');
  select.value = selected || '';
}

function spaceDisplayName(space) {
  return space.selected === CUSTOM_SPACE_VALUE ? space.customName.trim() : space.selected.trim();
}

function renderPhotos(card, space) {
  const grid = card.querySelector('.photo-grid');
  const empty = card.querySelector('.photo-empty');
  grid.innerHTML = '';
  empty.hidden = space.photos.length > 0;
  space.photos.forEach((photo, index) => {
    const item = document.createElement('figure');
    item.className = 'photo-item';
    const image = document.createElement('img');
    const url = URL.createObjectURL(photo.blob);
    image.src = url;
    image.alt = `Fotografía ${index + 1} de ${spaceDisplayName(space) || 'espacio'}`;
    image.onload = () => URL.revokeObjectURL(url);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'photo-remove';
    remove.setAttribute('aria-label', `Eliminar fotografía ${index + 1}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      space.photos = space.photos.filter((entry) => entry.id !== photo.id);
      renderSpaces();
      scheduleSave();
    });
    const caption = document.createElement('figcaption');
    caption.textContent = `Foto ${index + 1}`;
    item.append(image, remove, caption);
    grid.append(item);
  });
}

async function loadImage(blob) {
  if ('createImageBitmap' in window) return createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = reject;
    image.src = url;
  });
}

async function compressImage(file) {
  const image = await loadImage(file);
  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0, width, height);
  if ('close' in image) image.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.82);
  });
}

function renderSpaces() {
  spacesList.innerHTML = '';
  spaces.forEach((space, index) => {
    const card = spaceTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.spaceId = space.id;
    card.querySelector('.space-number').textContent = String(index + 1).padStart(2, '0');
    card.querySelector('.space-index').textContent = index + 1;
    const select = card.querySelector('.space-select');
    const customField = card.querySelector('.custom-space-field');
    const customInput = card.querySelector('.custom-space');
    const description = card.querySelector('.space-description');
    const notes = card.querySelector('.space-notes');
    populateSpaceSelect(select, space.selected);
    customField.hidden = space.selected !== CUSTOM_SPACE_VALUE;
    customInput.required = space.selected === CUSTOM_SPACE_VALUE;
    customInput.value = space.customName;
    description.value = space.description;
    notes.value = space.notes;

    select.addEventListener('change', () => {
      space.selected = select.value;
      customField.hidden = space.selected !== CUSTOM_SPACE_VALUE;
      customInput.required = space.selected === CUSTOM_SPACE_VALUE;
      scheduleSave();
    });
    customInput.addEventListener('input', () => {
      space.customName = customInput.value;
      scheduleSave();
    });
    description.addEventListener('input', () => {
      space.description = description.value;
      scheduleSave();
    });
    notes.addEventListener('input', () => {
      space.notes = notes.value;
      scheduleSave();
    });
    card.querySelector('.remove-space').addEventListener('click', () => {
      if (spaces.length === 1) {
        showToast('El acta debe contener al menos un espacio.', 'error');
        return;
      }
      spaces = spaces.filter((entry) => entry.id !== space.id);
      renderSpaces();
      scheduleSave();
    });
    card.querySelector('.photo-input').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const cameraLabel = event.target.closest('.button-camera');
      cameraLabel.classList.add('is-loading');
      try {
        const blob = await compressImage(file);
        space.photos.push({ id: uid(), name: `${space.id}-${Date.now()}.jpg`, blob });
        renderSpaces();
        scheduleSave();
        showToast('Fotografía agregada.');
      } catch (error) {
        console.error(error);
        showToast('No fue posible procesar la fotografía.', 'error');
      } finally {
        cameraLabel.classList.remove('is-loading');
      }
    });
    renderPhotos(card, space);
    spacesList.append(card);
  });
  const count = document.querySelector('#evidence-count');
  count.textContent = `${spaces.length} espacio${spaces.length === 1 ? '' : 's'}`;
}

function applyFormData(data = {}) {
  Object.entries(data).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = key === 'radicado' ? String(value || '').replace(/\D/g, '') : value || '';
  });
}

function restoreSignature(key, dataUrl) {
  if (!dataUrl) return;
  signatureBackups[key] = dataUrl;
  if (currentStep !== 3) return;
  const image = new Image();
  image.onload = () => signaturePads[key].fromDataURL(dataUrl);
  image.src = dataUrl;
}

async function restoreDraft() {
  try {
    const draft = await loadDraft();
    if (!draft) return false;
    applyFormData(draft.form);
    spaces = draft.spaces?.length ? draft.spaces : [makeSpace()];
    currentStep = Math.min(Math.max(Number(draft.currentStep) || 1, 1), 4);
    renderSpaces();
    showStep(currentStep, { validate: false, save: false });
    window.setTimeout(() => {
      resizeSignatures();
      restoreSignature('cliente', draft.signatures?.cliente);
      restoreSignature('responsable', draft.signatures?.responsable);
    }, 50);
    showToast('Se recuperó el borrador guardado en este dispositivo.');
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

function validateStep(step) {
  if (step === 1) {
    const fields = [...document.querySelector('[data-step="1"]').querySelectorAll('[required]')];
    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return false;
    }
  }
  if (step === 2) {
    const invalidSpace = spaces.find((space) => !spaceDisplayName(space) || !space.description.trim() || !space.photos.length);
    if (invalidSpace) {
      const card = document.querySelector(`[data-space-id="${invalidSpace.id}"]`);
      card?.classList.add('has-error');
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('Cada espacio necesita nombre, descripción y al menos una fotografía.', 'error');
      return false;
    }
  }
  if (step === 3) {
    if (!form.elements.aceptacion.checked) {
      form.elements.aceptacion.reportValidity();
      showToast('El cliente debe aceptar la declaración de entrega.', 'error');
      return false;
    }
    if (signaturePads.cliente.isEmpty()) {
      showToast('Falta la firma de la persona que recibe.', 'error');
      return false;
    }
  }
  return true;
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderReview() {
  const data = getFormData();
  review.innerHTML = `
    <article class="panel review-card review-event">
      <p class="eyebrow">Acta</p>
      <h3>${escapeHtml(data.nombreEvento)}</h3>
      <dl>
        <div><dt>Radicado</dt><dd>${escapeHtml(data.radicado)}</dd></div>
        <div><dt>Entrega</dt><dd>${escapeHtml(formatDate(data.fechaEntrega))}</dd></div>
        <div><dt>Cliente</dt><dd>${escapeHtml(data.cliente)}</dd></div>
        <div><dt>Responsable</dt><dd>${escapeHtml(data.responsableEntrega)}</dd></div>
      </dl>
    </article>
    <article class="panel review-card">
      <p class="eyebrow">Evidencias</p>
      <h3>${spaces.length} espacio${spaces.length === 1 ? '' : 's'}</h3>
      <ul class="review-spaces">
        ${spaces.map((space) => `<li><span>${escapeHtml(spaceDisplayName(space))}</span><strong>${space.photos.length} foto${space.photos.length === 1 ? '' : 's'}</strong></li>`).join('')}
      </ul>
    </article>
    <article class="panel review-card">
      <p class="eyebrow">Aceptación</p>
      <h3>Firma registrada</h3>
      <p>El acta incluirá la firma de ${escapeHtml(data.cliente)} y la fecha de generación.</p>
    </article>
  `;
}

function showStep(step, options = {}) {
  const { validate = true, save = true } = options;
  if (validate && step > currentStep && !validateStep(currentStep)) return;
  currentStep = step;
  document.querySelectorAll('.form-step').forEach((section) => section.classList.toggle('is-active', Number(section.dataset.step) === currentStep));
  document.querySelectorAll('.step').forEach((button) => {
    const target = Number(button.dataset.stepTarget);
    button.classList.toggle('is-active', target === currentStep);
    button.classList.toggle('is-complete', target < currentStep);
  });
  previousButton.hidden = currentStep === 1;
  nextButton.hidden = currentStep === 4;
  nextButton.textContent = currentStep === 3 ? 'Revisar acta' : 'Continuar';
  if (currentStep === 3) {
    window.setTimeout(() => {
      resizeSignatures();
      Object.entries(signatureBackups).forEach(([key, dataUrl]) => {
        if (dataUrl && signaturePads[key].isEmpty()) signaturePads[key].fromDataURL(dataUrl);
      });
    }, 0);
  }
  if (currentStep === 4) {
    renderReview();
    window.setTimeout(() => preparePdf(), 0);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (save) scheduleSave({ invalidatePdf: false });
}

function pdfData() {
  const data = getFormData();
  return {
    ...data,
    fechaEntregaFormatted: formatDate(data.fechaEntrega),
    spaces: spaces.map((space) => ({
      name: spaceDisplayName(space),
      description: space.description,
      notes: space.notes,
      photos: space.photos,
    })),
    signatureCliente: signaturePads.cliente.isEmpty() ? signatureBackups.cliente : signaturePads.cliente.toDataURL('image/png'),
    signatureResponsable: signaturePads.responsable.isEmpty() ? signatureBackups.responsable : signaturePads.responsable.toDataURL('image/png'),
  };
}

function safeFilename(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pdfFingerprint(data) {
  return JSON.stringify({
    radicado: data.radicado,
    fechaEntrega: data.fechaEntrega,
    nombreEvento: data.nombreEvento,
    cliente: data.cliente,
    organizacion: data.organizacion,
    responsableEntrega: data.responsableEntrega,
    observacionesGenerales: data.observacionesGenerales,
    identificacionCliente: data.identificacionCliente,
    spaces: data.spaces.map((space) => ({
      name: space.name,
      description: space.description,
      notes: space.notes,
      photos: space.photos.map((photo) => ({
        id: photo.id,
        name: photo.name,
        size: photo.blob?.size || 0,
        type: photo.blob?.type || '',
      })),
    })),
    signatureClienteLength: data.signatureCliente?.length || 0,
    signatureResponsableLength: data.signatureResponsable?.length || 0,
  });
}

function canSharePdf(file) {
  if (typeof navigator.share !== 'function') return false;
  try {
    return typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function presentGeneratedPdf(blob, filename, fingerprint, { recovered = false } = {}) {
  generatedFilename = filename;
  generatedFingerprint = fingerprint || '';
  generatedPdf = blob instanceof File
    ? blob
    : new File([blob], filename, { type: 'application/pdf' });
  if (downloadPdf.href) URL.revokeObjectURL(downloadPdf.href);
  downloadPdf.href = URL.createObjectURL(generatedPdf);
  downloadPdf.download = generatedFilename;
  document.querySelector('#pdf-filename').textContent = generatedFilename;
  pdfStatus.textContent = recovered ? 'PDF recuperado en este dispositivo' : 'Informe preparado y protegido';
  pdfHelp.textContent = recovered
    ? 'Puedes volver a guardarlo sin generar nuevamente.'
    : 'Al tocar “Guardar informe” se abrirá el menú del iPad. Elige Guardar en Archivos.';
  pdfActions.hidden = false;
  pdfResult.hidden = false;
  sharePdfButton.hidden = !canSharePdf(generatedPdf);
  const button = document.querySelector('#generate-pdf');
  button.disabled = false;
  button.textContent = 'Guardar informe en el iPad';
}

function explainPdfError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (message.includes('memory') || message.includes('allocation') || error instanceof RangeError) {
    return 'El iPad se quedó sin memoria al procesar las fotografías. Cierra otras pestañas y vuelve a intentarlo.';
  }
  if (message.includes('jpeg') || message.includes('jpg') || message.includes('png') || message.includes('image')) {
    return 'Una fotografía guardada está dañada o no puede leerse. El borrador sigue protegido.';
  }
  if (message.includes('encode') || message.includes('winansi') || message.includes('font')) {
    return 'El informe contiene un símbolo que no puede imprimirse. La aplicación intentará reemplazarlo de forma segura.';
  }
  return 'No fue posible preparar el informe. El borrador y las firmas continúan guardados en este dispositivo.';
}

async function preparePdf({ force = false } = {}) {
  if (pdfPreparationPromise) return pdfPreparationPromise;
  const data = pdfData();
  const fingerprint = pdfFingerprint(data);
  if (!force && generatedPdf && generatedFingerprint === fingerprint) return generatedPdf;
  const button = document.querySelector('#generate-pdf');
  button.disabled = true;
  button.textContent = 'Preparando informe…';
  pdfStatus.textContent = 'Preparando el informe';
  pdfHelp.textContent = 'No cierres esta pantalla. Tus datos ya están guardados localmente.';
  pdfActions.hidden = true;
  pdfResult.hidden = false;

  pdfPreparationPromise = (async () => {
    try {
      await persistDraftNow();
      if (navigator.storage?.persist) {
        navigator.storage.persist().catch(() => {});
      }
      const bytes = await createActaPdf(data);
      const radicado = safeFilename(data.radicado) || 'SIN-RADICADO';
      const evento = safeFilename(data.nombreEvento) || 'SIN-NOMBRE-DE-EVENTO';
      const filename = `${radicado}-${evento}.pdf`;
      const blob = new Blob([bytes], { type: 'application/pdf' });
      await saveGeneratedPdf({
        blob,
        filename,
        fingerprint,
        radicado: data.radicado,
        nombreEvento: data.nombreEvento,
        generatedAt: new Date().toISOString(),
      });
      presentGeneratedPdf(blob, filename, fingerprint);
      showToast('Informe preparado. Toca “Guardar informe” para elegir la carpeta.');
      return generatedPdf;
    } catch (error) {
      console.error(error);
      generatedPdf = null;
      generatedFingerprint = '';
      pdfStatus.textContent = 'No se pudo preparar el informe';
      pdfHelp.textContent = explainPdfError(error);
      pdfActions.hidden = true;
      pdfResult.hidden = false;
      button.disabled = false;
      button.textContent = 'Reintentar generación';
      showToast('El PDF no se generó, pero el borrador permanece guardado.', 'error');
      return null;
    } finally {
      pdfPreparationPromise = null;
    }
  })();

  return pdfPreparationPromise;
}

async function restoreGeneratedPdf() {
  try {
    const record = await loadGeneratedPdf();
    if (!record?.blob || !record.filename) return false;
    const formData = getFormData();
    if (record.radicado !== formData.radicado || record.nombreEvento !== formData.nombreEvento) return false;
    presentGeneratedPdf(record.blob, record.filename, record.fingerprint, { recovered: true });
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function savePreparedPdf() {
  if (!generatedPdf) {
    await preparePdf({ force: true });
    if (generatedPdf) showToast('Informe listo. Toca nuevamente para guardarlo.');
    return;
  }
  if (canSharePdf(generatedPdf)) {
    try {
      await navigator.share({
        files: [generatedPdf],
        title: 'Formato producción de eventos.',
      });
      showToast('Menú de guardado abierto correctamente.');
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error(error);
      showToast('Safari no abrió el menú. Usa “Descargar PDF”.', 'error');
    }
  }
  downloadPdf.click();
}

async function sharePdf() {
  if (!generatedPdf) return;
  try {
    await navigator.share({ files: [generatedPdf], title: 'Formato producción de eventos.' });
  } catch (error) {
    if (error.name !== 'AbortError') showToast('No fue posible abrir el menú de compartir.', 'error');
  }
}

async function logout() {
  document.querySelectorAll('[data-logout]').forEach((button) => { button.disabled = true; });
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    window.location.replace('/login');
  }
}

async function loadSession() {
  if (import.meta.env.DEV) {
    return { email: 'usuario.local@universidadean.edu.co', role: 'user' };
  }
  const response = await fetch('/api/session', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    return null;
  }
  return response.json();
}

function showAuthenticatedView(session) {
  document.body.classList.remove('auth-pending');
  if (session.role === 'admin') {
    document.querySelector('#admin-email').textContent = session.email;
    document.querySelector('#admin-view').hidden = false;
    return false;
  }
  document.querySelector('#current-user').textContent = session.email;
  document.querySelector('#app').hidden = false;
  return true;
}

async function discardDraft() {
  const confirmed = window.confirm('¿Deseas borrar el borrador y comenzar un acta nueva?');
  if (!confirmed) return;
  await Promise.all([clearDraft(), clearGeneratedPdf()]);
  if (downloadPdf.href) URL.revokeObjectURL(downloadPdf.href);
  form.reset();
  signaturePads.cliente.clear();
  signaturePads.responsable.clear();
  signatureBackups.cliente = '';
  signatureBackups.responsable = '';
  spaces = [makeSpace()];
  generatedPdf = null;
  generatedFilename = '';
  generatedFingerprint = '';
  pdfResult.hidden = true;
  setDefaultDate();
  renderSpaces();
  showStep(1, { validate: false });
  showToast('Se eliminó el borrador.');
}

document.querySelector('#add-space').addEventListener('click', () => {
  spaces.push(makeSpace());
  renderSpaces();
  scheduleSave();
  spacesList.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

document.querySelectorAll('[data-step-target]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = Number(button.dataset.stepTarget);
    if (target <= currentStep + 1) showStep(target);
  });
});

document.querySelectorAll('[data-clear-signature]').forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.dataset.clearSignature;
    signaturePads[key].clear();
    signatureBackups[key] = '';
    scheduleSave();
  });
});

Object.entries(signaturePads).forEach(([key, pad]) => pad.addEventListener('endStroke', () => {
  signatureBackups[key] = pad.toDataURL('image/png');
  scheduleSave();
}));
radicadoInput.addEventListener('input', () => {
  radicadoInput.value = radicadoInput.value.replace(/\D/g, '');
});
form.addEventListener('input', scheduleSave);
form.addEventListener('change', scheduleSave);
nextButton.addEventListener('click', () => showStep(Math.min(currentStep + 1, 4)));
previousButton.addEventListener('click', () => showStep(Math.max(currentStep - 1, 1), { validate: false }));
discardButton.addEventListener('click', discardDraft);
document.querySelector('#generate-pdf').addEventListener('click', savePreparedPdf);
sharePdfButton.addEventListener('click', sharePdf);
document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', logout));
window.addEventListener('resize', () => {
  if (currentStep === 3) resizeSignatures();
});

async function initialize() {
  try {
    currentSession = await loadSession();
  } catch (error) {
    console.error(error);
    if (!import.meta.env.DEV) window.location.replace('/login');
    return;
  }
  if (!currentSession || !showAuthenticatedView(currentSession)) return;
  setDefaultDate();
  resizeSignatures();
  const restored = await restoreDraft();
  if (!restored) {
    spaces = [makeSpace()];
    renderSpaces();
  } else {
    await restoreGeneratedPdf();
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => registration.unregister()));
  }
}

initialize();
