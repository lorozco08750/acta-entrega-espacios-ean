import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE = [595.28, 841.89];
const MARGIN = 48;
const BRAND = rgb(0.086, 0.184, 0.169);
const ACCENT = rgb(0.776, 0.478, 0.137);
const INK = rgb(0.12, 0.15, 0.14);
const MUTED = rgb(0.4, 0.44, 0.42);
const LINE = rgb(0.86, 0.88, 0.87);

function clean(value) {
  return String(value || '').trim();
}

function wrapText(text, font, size, maxWidth) {
  const paragraphs = clean(text).split(/\n/);
  const lines = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = '';
    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    if (paragraphIndex < paragraphs.length - 1) lines.push('');
  });
  return lines.length ? lines : [''];
}

function drawWrapped(page, text, options) {
  const { x, y, font, size = 10, color = INK, maxWidth, lineHeight = size * 1.35 } = options;
  const lines = wrapText(text, font, size, maxWidth);
  lines.forEach((line, index) => {
    page.drawText(line, { x, y: y - index * lineHeight, font, size, color });
  });
  return y - lines.length * lineHeight;
}

function drawHeader(page, fonts, logo, title = 'ACTA DE ENTREGA DE ESPACIOS') {
  page.drawRectangle({ x: 0, y: PAGE[1] - 92, width: PAGE[0], height: 92, color: BRAND });
  page.drawText(title, { x: MARGIN, y: PAGE[1] - 45, font: fonts.bold, size: 14, color: rgb(1, 1, 1) });
  page.drawText('Dirección de eventos y proyectos culturales', { x: MARGIN, y: PAGE[1] - 64, font: fonts.regular, size: 8, color: rgb(0.8, 0.88, 0.86) });
  if (logo) {
    const dimensions = fitImage(logo, 112, 48);
    page.drawImage(logo, {
      x: PAGE[0] - MARGIN - dimensions.width,
      y: PAGE[1] - 70,
      width: dimensions.width,
      height: dimensions.height,
    });
  } else {
    page.drawRectangle({ x: PAGE[0] - MARGIN - 42, y: PAGE[1] - 69, width: 42, height: 42, color: ACCENT });
    page.drawText('E', { x: PAGE[0] - MARGIN - 29, y: PAGE[1] - 59, font: fonts.bold, size: 25, color: rgb(1, 1, 1) });
  }
}

function drawFooter(page, fonts, pageNumber) {
  page.drawLine({ start: { x: MARGIN, y: 35 }, end: { x: PAGE[0] - MARGIN, y: 35 }, thickness: 0.6, color: LINE });
  page.drawText(`Acta de entrega · Página ${pageNumber}`, { x: MARGIN, y: 20, font: fonts.regular, size: 8, color: MUTED });
}

function drawField(page, fonts, label, value, x, y, width) {
  page.drawText(label.toUpperCase(), { x, y, font: fonts.bold, size: 7.5, color: MUTED });
  const nextY = drawWrapped(page, clean(value) || '—', { x, y: y - 16, font: fonts.regular, size: 11, maxWidth: width });
  page.drawLine({ start: { x, y: nextY - 5 }, end: { x: x + width, y: nextY - 5 }, thickness: 0.6, color: LINE });
  return nextY - 22;
}

async function embedImage(pdf, blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (blob.type.includes('png')) return pdf.embedPng(bytes);
  return pdf.embedJpg(bytes);
}

function fitImage(image, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

async function loadHeaderLogo(pdf, suppliedBytes) {
  try {
    let bytes = suppliedBytes;
    if (!bytes && typeof window !== 'undefined') {
      const response = await fetch('/logo-ean-blanco.png');
      if (!response.ok) return null;
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    return bytes ? pdf.embedPng(bytes) : null;
  } catch {
    return null;
  }
}

export async function createActaPdf(data, options = {}) {
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  pdf.setTitle(`Acta de entrega ${clean(data.radicado)}`);
  pdf.setSubject('Acta de entrega de espacios');
  pdf.setCreator('Aplicación Acta de Entrega de Espacios');
  pdf.setCreationDate(new Date());
  const headerLogo = await loadHeaderLogo(pdf, options.logoBytes);

  let pageNumber = 1;
  let page = pdf.addPage(PAGE);
  drawHeader(page, fonts, headerLogo);
  let y = PAGE[1] - 132;
  page.drawText('INFORMACIÓN DE LA ENTREGA', { x: MARGIN, y, font: fonts.bold, size: 12, color: BRAND });
  y -= 30;
  y = drawField(page, fonts, 'Número de radicado', data.radicado, MARGIN, y, 220);
  drawField(page, fonts, 'Fecha y hora', data.fechaEntregaFormatted, 320, PAGE[1] - 162, 227);
  y = drawField(page, fonts, 'Evento', data.nombreEvento, MARGIN, y, PAGE[0] - MARGIN * 2);
  y = drawField(page, fonts, 'Cliente o responsable que recibe', data.cliente, MARGIN, y, 240);
  drawField(page, fonts, 'Empresa u organización', data.organizacion, 320, y + 22, 227);
  y = drawField(page, fonts, 'Responsable que entrega', data.responsableEntrega, MARGIN, y, PAGE[0] - MARGIN * 2);
  y -= 10;
  page.drawRectangle({ x: MARGIN, y: y - 74, width: PAGE[0] - MARGIN * 2, height: 74, color: rgb(0.95, 0.965, 0.96) });
  page.drawText('RESUMEN', { x: MARGIN + 16, y: y - 23, font: fonts.bold, size: 8, color: MUTED });
  page.drawText(`${data.spaces.length} espacio${data.spaces.length === 1 ? '' : 's'} registrado${data.spaces.length === 1 ? '' : 's'}`, { x: MARGIN + 16, y: y - 47, font: fonts.bold, size: 16, color: BRAND });
  page.drawText(`${data.spaces.reduce((total, space) => total + space.photos.length, 0)} fotografías`, { x: 330, y: y - 47, font: fonts.bold, size: 16, color: ACCENT });
  drawFooter(page, fonts, pageNumber);

  for (let spaceIndex = 0; spaceIndex < data.spaces.length; spaceIndex += 1) {
    const space = data.spaces[spaceIndex];
    for (let photoIndex = 0; photoIndex < space.photos.length; photoIndex += 1) {
      pageNumber += 1;
      page = pdf.addPage(PAGE);
      drawHeader(page, fonts, headerLogo, `EVIDENCIA · ESPACIO ${spaceIndex + 1}`);
      let currentY = PAGE[1] - 128;
      page.drawText(clean(space.name).toUpperCase(), { x: MARGIN, y: currentY, font: fonts.bold, size: 18, color: BRAND });
      page.drawText(`Fotografía ${photoIndex + 1} de ${space.photos.length}`, { x: PAGE[0] - MARGIN - 95, y: currentY + 2, font: fonts.regular, size: 9, color: MUTED });
      currentY -= 28;

      const image = await embedImage(pdf, space.photos[photoIndex].blob);
      const dimensions = fitImage(image, PAGE[0] - MARGIN * 2, 440);
      const imageX = (PAGE[0] - dimensions.width) / 2;
      const imageY = currentY - dimensions.height;
      page.drawRectangle({ x: imageX - 4, y: imageY - 4, width: dimensions.width + 8, height: dimensions.height + 8, color: rgb(0.94, 0.94, 0.93) });
      page.drawImage(image, { x: imageX, y: imageY, width: dimensions.width, height: dimensions.height });
      currentY = imageY - 28;
      page.drawText('DESCRIPCIÓN DEL ESTADO', { x: MARGIN, y: currentY, font: fonts.bold, size: 8, color: MUTED });
      currentY = drawWrapped(page, space.description, { x: MARGIN, y: currentY - 17, font: fonts.regular, size: 10, maxWidth: PAGE[0] - MARGIN * 2 });
      if (clean(space.notes)) {
        currentY -= 13;
        page.drawText('NOVEDADES O COMPROMISOS', { x: MARGIN, y: currentY, font: fonts.bold, size: 8, color: MUTED });
        drawWrapped(page, space.notes, { x: MARGIN, y: currentY - 17, font: fonts.regular, size: 10, maxWidth: PAGE[0] - MARGIN * 2 });
      }
      drawFooter(page, fonts, pageNumber);
    }
  }

  pageNumber += 1;
  page = pdf.addPage(PAGE);
  drawHeader(page, fonts, headerLogo, 'ACEPTACIÓN Y FIRMAS');
  y = PAGE[1] - 132;
  page.drawText('OBSERVACIONES GENERALES', { x: MARGIN, y, font: fonts.bold, size: 8, color: MUTED });
  y = drawWrapped(page, data.observacionesGenerales || 'Sin observaciones adicionales.', { x: MARGIN, y: y - 18, font: fonts.regular, size: 10, maxWidth: PAGE[0] - MARGIN * 2 });
  y -= 28;
  page.drawRectangle({ x: MARGIN, y: y - 78, width: PAGE[0] - MARGIN * 2, height: 78, color: rgb(0.95, 0.965, 0.96) });
  drawWrapped(page, 'Declaro que recibo los espacios descritos en esta acta, en las condiciones registradas mediante las fotografías y observaciones adjuntas.', { x: MARGIN + 16, y: y - 24, font: fonts.regular, size: 10, maxWidth: PAGE[0] - MARGIN * 2 - 32 });
  y -= 118;

  const signatureWidth = 215;
  const signatureHeight = 105;
  const signatureY = y - signatureHeight;
  const drawSignature = async (dataUrl, x, label, name, detail) => {
    if (dataUrl) {
      const signature = await pdf.embedPng(dataUrl);
      const dimensions = fitImage(signature, signatureWidth - 20, signatureHeight - 18);
      page.drawImage(signature, { x: x + (signatureWidth - dimensions.width) / 2, y: signatureY + 9, width: dimensions.width, height: dimensions.height });
    }
    page.drawLine({ start: { x, y: signatureY }, end: { x: x + signatureWidth, y: signatureY }, thickness: 0.8, color: INK });
    page.drawText(label, { x, y: signatureY - 18, font: fonts.bold, size: 8, color: MUTED });
    page.drawText(clean(name) || '—', { x, y: signatureY - 36, font: fonts.regular, size: 10, color: INK });
    if (clean(detail)) page.drawText(clean(detail), { x, y: signatureY - 52, font: fonts.regular, size: 8, color: MUTED });
  };
  await drawSignature(data.signatureCliente, MARGIN, 'RECIBE', data.cliente, data.identificacionCliente);
  await drawSignature(data.signatureResponsable, 332, 'ENTREGA', data.responsableEntrega, '');
  drawFooter(page, fonts, pageNumber);

  return pdf.save();
}
