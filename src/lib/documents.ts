import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CashSession, DB, Sale, Settings } from './types';
import { PAY_LABEL, PAY_METHODS } from './types';
import { download, fmtDateTime, money, normalizePhone, round2, waLink } from './utils';
import { sessionSummary } from './store';

const PINK: [number, number, number] = [216, 27, 122];

let logoCache: string | null = null;
async function logo(): Promise<string | null> {
  if (logoCache) return logoCache;
  try {
    const blob = await (await fetch('/logo.png')).blob();
    logoCache = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    return logoCache;
  } catch {
    return null;
  }
}

const esc = (s: string) =>
  (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ---------------- PDF ----------------

async function receiptPdf(sale: Sale, s: Settings) {
  const img = await logo();
  // Draw once on a long roll to measure the content, then again at the exact length.
  const probe = drawReceipt(sale, s, img, 600);
  return drawReceipt(sale, s, img, probe.y + 6).doc;
}

function drawReceipt(sale: Sale, s: Settings, img: string | null, H: number) {
  const W = 80;
  const M = 4;
  const lineH = 4;
  const doc = new jsPDF({ unit: 'mm', format: [W, H] });
  let y = 4;
  const center = (t: string, size = 8, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size);
    for (const l of doc.splitTextToSize(t, W - 2 * M)) {
      doc.text(l, W / 2, y, { align: 'center' });
      y += size * 0.45;
    }
  };
  const row = (l: string, r: string, bold = false, size = 8) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size);
    doc.text(l, M, y);
    doc.text(r, W - M, y, { align: 'right' });
    y += lineH;
  };
  const hr = () => {
    doc.setDrawColor(180).setLineDashPattern([0.8, 0.8], 0).line(M, y - 2, W - M, y - 2);
    y += 1.5;
  };
  if (img) {
    doc.addImage(img, 'PNG', W / 2 - 10, y, 20, 20);
    y += 23;
  }
  doc.setTextColor(...PINK);
  center(s.businessName, 11, true);
  doc.setTextColor(60);
  if (s.slogan) center(s.slogan, 7);
  if (s.rnc) center(`RNC: ${s.rnc}`, 7);
  if (s.address) center(s.address, 7);
  if (s.phone || s.whatsapp) center(`Tel: ${[s.phone, s.whatsapp].filter(Boolean).join(' / ')}`, 7);
  if (s.instagram) center(`IG: ${s.instagram}`, 7);
  y += 2;
  doc.setTextColor(0);
  hr();
  row('FACTURA', sale.number, true, 9);
  row('Fecha', fmtDateTime(sale.date), false, 7);
  row('Cliente', sale.clientName.slice(0, 30), false, 7);
  if (sale.clientPhone) row('Teléfono', sale.clientPhone, false, 7);
  if (sale.status === 'anulada') row('ESTADO', 'ANULADA', true, 9);
  hr();
  for (const i of sale.items) {
    doc.setFont('helvetica', 'normal').setFontSize(7.5);
    for (const l of doc.splitTextToSize(i.name, W - 2 * M)) {
      doc.text(l, M, y);
      y += 3.4;
    }
    row(`  ${i.qty} x ${money(i.price)}`, money(i.qty * i.price), false, 7.5);
  }
  hr();
  if (sale.discount) row('Descuento', `-${money(sale.discount)}`);
  row('Subtotal', money(sale.subtotal));
  row(`${s.taxName} (${s.taxRate}%)`, money(sale.tax));
  row('TOTAL', money(sale.total), true, 10);
  y += 1;
  for (const p of sale.payments) row(`Pago ${PAY_LABEL[p.method].toLowerCase()}`, money(p.amount), false, 7.5);
  if (sale.change) row('Cambio', money(sale.change), false, 7.5);
  if (sale.balance > 0) {
    doc.setTextColor(...PINK);
    row('PENDIENTE', money(sale.balance), true, 9);
    doc.setTextColor(0);
  }
  if (sale.notes) {
    y += 1;
    center(`Nota: ${sale.notes}`, 7);
  }
  y += 3;
  doc.setTextColor(...PINK);
  if (s.footer) center(s.footer, 7.5, true);
  return { doc, y };
}

async function letterPdf(sale: Sale, s: Settings) {
  const img = await logo();
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(253, 238, 245).rect(0, 0, W, 42, 'F');
  if (img) doc.addImage(img, 'PNG', 14, 6, 30, 30);
  doc.setTextColor(...PINK).setFont('helvetica', 'bold').setFontSize(18).text(s.businessName, 50, 16);
  doc.setTextColor(90).setFont('helvetica', 'normal').setFontSize(9);
  const info = [s.slogan, s.rnc && `RNC: ${s.rnc}`, s.address, [s.phone, s.whatsapp].filter(Boolean).join(' / '), s.instagram]
    .filter(Boolean) as string[];
  info.forEach((t, i) => doc.text(t, 50, 22 + i * 4.2));
  doc.setTextColor(...PINK).setFont('helvetica', 'bold').setFontSize(14).text('FACTURA', W - 14, 16, { align: 'right' });
  doc.setTextColor(40).setFontSize(10).text(sale.number, W - 14, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9).text(fmtDateTime(sale.date), W - 14, 27, { align: 'right' });
  if (sale.status === 'anulada') doc.setTextColor(200, 0, 0).setFont('helvetica', 'bold').text('ANULADA', W - 14, 33, { align: 'right' });
  doc.setTextColor(40).setFont('helvetica', 'bold').setFontSize(10).text('Cliente:', 14, 52);
  doc.setFont('helvetica', 'normal').text(`${sale.clientName}${sale.clientPhone ? ' · ' + sale.clientPhone : ''}`, 32, 52);
  autoTable(doc, {
    startY: 58,
    head: [['Descripción', 'Tipo', 'Cant.', 'Precio', 'Importe']],
    body: sale.items.map((i) => [
      i.name, i.type === 'service' ? 'Servicio' : 'Producto', String(i.qty), money(i.price), money(i.qty * i.price),
    ]),
    headStyles: { fillColor: PINK },
    alternateRowStyles: { fillColor: [253, 244, 249] },
    columnStyles: { 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    styles: { fontSize: 9 },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = (doc as any).lastAutoTable.finalY + 8;
  const row = (l: string, r: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 12 : 10);
    doc.text(l, W - 70, y);
    doc.text(r, W - 14, y, { align: 'right' });
    y += bold ? 7 : 5.5;
  };
  if (sale.discount) row('Descuento', `-${money(sale.discount)}`);
  row('Subtotal', money(sale.subtotal));
  row(`${s.taxName} (${s.taxRate}%)`, money(sale.tax));
  doc.setTextColor(...PINK);
  row('TOTAL', money(sale.total), true);
  doc.setTextColor(40);
  for (const p of sale.payments) row(`Pago ${PAY_LABEL[p.method].toLowerCase()}`, money(p.amount));
  if (sale.change) row('Cambio', money(sale.change));
  if (sale.balance > 0) row('Pendiente', money(sale.balance), true);
  if (sale.notes) doc.setFontSize(9).text(`Nota: ${sale.notes}`, 14, y + 4);
  doc.setTextColor(...PINK).setFont('helvetica', 'bold').setFontSize(10);
  doc.text(s.footer || '', W / 2, doc.internal.pageSize.getHeight() - 14, { align: 'center', maxWidth: W - 28 });
  return doc;
}

export async function invoicePdfBlob(sale: Sale, s: Settings) {
  const doc = s.receiptFormat === 'carta' ? await letterPdf(sale, s) : await receiptPdf(sale, s);
  return doc.output('blob');
}

export const invoiceFileName = (sale: Sale) => `Factura-${sale.number}.pdf`;

export async function downloadInvoicePdf(sale: Sale, s: Settings) {
  download(await invoicePdfBlob(sale, s), invoiceFileName(sale));
}

// ---------------- WhatsApp ----------------

export function invoiceMessage(sale: Sale, s: Settings) {
  const lines = [
    `*${s.businessName}*`,
    `Factura *${sale.number}* · ${fmtDateTime(sale.date)}`,
    `Cliente: ${sale.clientName}`,
    '',
    ...sale.items.map((i) => `• ${i.qty} x ${i.name} — ${money(i.qty * i.price)}`),
    '',
    sale.discount ? `Descuento: -${money(sale.discount)}` : '',
    `*Total: ${money(sale.total)}*`,
    `Pagado: ${money(sale.paid)}`,
    sale.balance > 0 ? `*Pendiente: ${money(sale.balance)}*` : '',
    '',
    s.footer,
  ];
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

/**
 * Sends the invoice through WhatsApp. On phones that support the Web Share API with files
 * the PDF itself is shared (pick WhatsApp in the share sheet); otherwise the PDF is
 * downloaded and WhatsApp opens with the summary so the file can be attached.
 */
export async function sendInvoiceWhatsApp(sale: Sale, s: Settings, phone?: string) {
  const blob = await invoicePdfBlob(sale, s);
  const file = new File([blob], invoiceFileName(sale), { type: 'application/pdf' });
  const text = invoiceMessage(sale, s);
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, title: `Factura ${sale.number}` });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  download(blob, invoiceFileName(sale));
  const p = normalizePhone(phone ?? sale.clientPhone, s.countryCode);
  const url = waLink(p, text);
  window.open(url, '_blank');
  return 'link';
}

// ---------------- Impresión ----------------

function printHtml(body: string, format: '80mm' | 'carta') {
  const css = `
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:0}
    .page{${format === '80mm' ? 'width:72mm;padding:2mm;font-size:11px' : 'width:100%;padding:10mm;font-size:13px'}}
    .c{text-align:center} .r{text-align:right} .b{font-weight:bold} .pink{color:#d81b7a}
    .brand{font-size:${format === '80mm' ? '15px' : '22px'};font-weight:bold;color:#d81b7a;margin:4px 0}
    .muted{color:#666;font-size:.9em} hr{border:0;border-top:1px dashed #999;margin:6px 0}
    table{width:100%;border-collapse:collapse} td,th{padding:2px 0;vertical-align:top}
    ${format === 'carta' ? 'th{background:#d81b7a;color:#fff;padding:6px} td{padding:6px;border-bottom:1px solid #f3d0e2}' : ''}
    .tot td{font-size:1.15em;font-weight:bold;color:#d81b7a}
    img.logo{width:${format === '80mm' ? '22mm' : '30mm'};height:auto;border-radius:50%}
    @page{size:${format === '80mm' ? '80mm auto' : 'letter'};margin:${format === '80mm' ? '0' : '10mm'}}
  `;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Imprimir</title><style>${css}</style></head>
  <body><div class="page">${body}</div></body></html>`;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    setTimeout(() => iframe.remove(), 60000);
  };
  const img = doc.querySelector('img');
  if (img && !img.complete) {
    img.onload = go;
    img.onerror = go;
  } else setTimeout(go, 50);
}

function headerHtml(s: Settings) {
  return `<div class="c">
    <img class="logo" src="${location.origin}/logo.png" />
    <div class="brand">${esc(s.businessName)}</div>
    ${s.slogan ? `<div class="muted">${esc(s.slogan)}</div>` : ''}
    ${s.rnc ? `<div class="muted">RNC: ${esc(s.rnc)}</div>` : ''}
    ${s.address ? `<div class="muted">${esc(s.address)}</div>` : ''}
    ${s.phone || s.whatsapp ? `<div class="muted">Tel: ${esc([s.phone, s.whatsapp].filter(Boolean).join(' / '))}</div>` : ''}
    ${s.instagram ? `<div class="muted">IG: ${esc(s.instagram)}</div>` : ''}
  </div><hr/>`;
}

export function printInvoice(sale: Sale, s: Settings) {
  const items = sale.items
    .map((i) =>
      s.receiptFormat === 'carta'
        ? `<tr><td>${esc(i.name)}</td><td class="c">${i.qty}</td><td class="r">${money(i.price)}</td><td class="r">${money(i.qty * i.price)}</td></tr>`
        : `<tr><td colspan="2">${esc(i.name)}</td></tr><tr><td class="muted">&nbsp;${i.qty} x ${money(i.price)}</td><td class="r">${money(i.qty * i.price)}</td></tr>`,
    )
    .join('');
  const head = s.receiptFormat === 'carta' ? '<tr><th align="left">Descripción</th><th>Cant.</th><th align="right">Precio</th><th align="right">Importe</th></tr>' : '';
  const tr = (l: string, r: string, cls = '') => `<tr class="${cls}"><td>${l}</td><td class="r">${r}</td></tr>`;
  const body = `${headerHtml(s)}
    <table>
      ${tr('<b>FACTURA</b>', `<b>${sale.number}</b>`)}
      ${tr('Fecha', fmtDateTime(sale.date))}
      ${tr('Cliente', esc(sale.clientName))}
      ${sale.clientPhone ? tr('Teléfono', esc(sale.clientPhone)) : ''}
      ${sale.status === 'anulada' ? tr('<b>ESTADO</b>', '<b>ANULADA</b>') : ''}
    </table><hr/>
    <table>${head}${items}</table><hr/>
    <table>
      ${sale.discount ? tr('Descuento', '-' + money(sale.discount)) : ''}
      ${tr('Subtotal', money(sale.subtotal))}
      ${tr(`${esc(s.taxName)} (${s.taxRate}%)`, money(sale.tax))}
      ${tr('TOTAL', money(sale.total), 'tot')}
      ${sale.payments.map((p) => tr(`Pago ${PAY_LABEL[p.method].toLowerCase()}`, money(p.amount))).join('')}
      ${sale.change ? tr('Cambio', money(sale.change)) : ''}
      ${sale.balance > 0 ? tr('<b>PENDIENTE</b>', `<b>${money(sale.balance)}</b>`) : ''}
    </table>
    ${sale.notes ? `<p class="muted">Nota: ${esc(sale.notes)}</p>` : ''}
    <hr/><p class="c b pink">${esc(s.footer)}</p>`;
  printHtml(body, s.receiptFormat);
}

// ---------------- Cierre de caja ----------------

function closeRows(db: DB, cs: CashSession) {
  const sm = sessionSummary(db, cs);
  const expected = cs.expected ?? sm.expected;
  const rows: [string, string][] = [
    ['Apertura', fmtDateTime(cs.openedAt)],
    ['Cierre', cs.closedAt ? fmtDateTime(cs.closedAt) : 'Abierta'],
    ['Fondo inicial', money(cs.openingAmount)],
    ['Facturas emitidas', String(sm.salesCount)],
    ['Total facturado', money(sm.salesTotal)],
    ['  Productos', money(sm.products)],
    ['  Servicios', money(sm.services)],
    ['Descuentos', money(sm.discounts)],
    [db.settings.taxName, money(sm.tax)],
    ['Quedó pendiente (crédito)', money(sm.pendingTotal)],
    ['Cobros de facturas anteriores', money(sm.collections)],
    ...PAY_METHODS.map((m) => [`Ingresos ${PAY_LABEL[m].toLowerCase()}`, money(sm.inflow[m])] as [string, string]),
    ['Entradas de efectivo', money(sm.entradas)],
    ['Salidas de efectivo', money(-sm.salidas)],
    ['Gastos pagados de caja', money(-sm.expensesCash)],
    ['Compras pagadas de caja', money(-sm.purchasesCash)],
  ];
  const recon: [string, string, string, string][] = PAY_METHODS.map((m) => {
    const c = cs.counted?.[m];
    return [
      PAY_LABEL[m], money(expected[m]), c === undefined ? '—' : money(c), c === undefined ? '—' : money(round2(c - expected[m])),
    ];
  });
  return { rows, recon };
}

export function printClose(db: DB, cs: CashSession) {
  const s = db.settings;
  const { rows, recon } = closeRows(db, cs);
  const body = `${headerHtml(s)}
    <div class="c b">CIERRE DE CAJA</div><hr/>
    <table>${rows.map(([l, r]) => `<tr><td>${l}</td><td class="r">${r}</td></tr>`).join('')}</table><hr/>
    <table><tr><th align="left">Método</th><th align="right">Esperado</th><th align="right">Contado</th><th align="right">Dif.</th></tr>
    ${recon.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'r' : ''}">${c}</td>`).join('')}</tr>`).join('')}</table>
    ${cs.notes ? `<hr/><p>Notas: ${esc(cs.notes)}</p>` : ''}
    <br/><br/><p class="c">______________________<br/>Firma</p>`;
  printHtml(body, s.receiptFormat);
}

export async function downloadClosePdf(db: DB, cs: CashSession) {
  const s = db.settings;
  const img = await logo();
  const { rows, recon } = closeRows(db, cs);
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  if (img) doc.addImage(img, 'PNG', 14, 10, 22, 22);
  doc.setTextColor(...PINK).setFont('helvetica', 'bold').setFontSize(16).text(s.businessName, 42, 18);
  doc.setTextColor(60).setFontSize(12).text('Cierre de caja', 42, 25);
  doc.setFont('helvetica', 'normal').setFontSize(9).text(fmtDateTime(cs.closedAt || cs.openedAt), W - 14, 18, { align: 'right' });
  autoTable(doc, {
    startY: 38, body: rows, theme: 'striped', styles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' } }, alternateRowStyles: { fillColor: [253, 244, 249] },
  });
  autoTable(doc, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [['Método', 'Esperado', 'Contado', 'Diferencia']], body: recon,
    headStyles: { fillColor: PINK }, styles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  });
  download(doc.output('blob'), `Cierre-${(cs.closedAt || cs.openedAt).slice(0, 10)}.pdf`);
}

// ---------------- Recibo de cobro ----------------

export function printPaymentReceipt(sale: Sale, s: Settings, amount: number, method: string) {
  const body = `${headerHtml(s)}
    <div class="c b">RECIBO DE PAGO</div><hr/>
    <table>
      <tr><td>Fecha</td><td class="r">${fmtDateTime(new Date())}</td></tr>
      <tr><td>Factura</td><td class="r">${sale.number}</td></tr>
      <tr><td>Cliente</td><td class="r">${esc(sale.clientName)}</td></tr>
      <tr><td>Método</td><td class="r">${esc(method)}</td></tr>
      <tr class="tot"><td>Abono</td><td class="r">${money(amount)}</td></tr>
      <tr><td>Total factura</td><td class="r">${money(sale.total)}</td></tr>
      <tr><td><b>Balance pendiente</b></td><td class="r"><b>${money(sale.balance)}</b></td></tr>
    </table><hr/><p class="c b pink">${esc(s.footer)}</p>`;
  printHtml(body, s.receiptFormat);
}
