import { useState } from 'react';
import { Modal, StatusBadge, Field, tryRun } from './ui';
import { addSalePayment, useDB, voidSale } from '../lib/store';
import { downloadInvoicePdf, printInvoice, printPaymentReceipt, sendInvoiceWhatsApp } from '../lib/documents';
import { fmtDateTime, money, num } from '../lib/utils';
import { PAY_LABEL, PAY_METHODS, type PayMethod } from '../lib/types';

export default function InvoiceView({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const db = useDB();
  const sale = db.sales.find((s) => s.id === saleId);
  const [phone, setPhone] = useState(sale?.clientPhone || '');
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!sale) return null;
  const s = db.settings;

  const wa = async () => {
    setBusy(true);
    try {
      await sendInvoiceWhatsApp(sale, s, phone);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Factura ${sale.number}`}
      onClose={onClose}
      wide
      footer={
        <>
          {sale.status !== 'anulada' && (
            <button
              className="btn danger"
              onClick={() => confirm('¿Anular esta factura? Los productos regresarán al inventario.') && voidSale(sale.id)}
            >
              Anular
            </button>
          )}
          {sale.balance > 0 && sale.status !== 'anulada' && (
            <button className="btn ok" onClick={() => setPayOpen(true)}>Registrar cobro</button>
          )}
          <button className="btn" onClick={() => printInvoice(sale, s)}>🖨️ Imprimir</button>
          <button className="btn" onClick={() => downloadInvoicePdf(sale, s)}>📄 Guardar PDF</button>
          <button className="btn wa" onClick={wa} disabled={busy}>WhatsApp</button>
        </>
      }
    >
      <div className="grid g3">
        <div><div className="muted small">Fecha</div><b>{fmtDateTime(sale.date)}</b></div>
        <div><div className="muted small">Cliente</div><b>{sale.clientName}</b></div>
        <div><div className="muted small">Estado</div><StatusBadge status={sale.status} /></div>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Descripción</th><th className="c">Cant.</th><th className="r">Precio</th><th className="r">Importe</th></tr></thead>
          <tbody>
            {sale.items.map((i, k) => (
              <tr key={k}>
                <td>{i.name} <span className="badge pink">{i.type === 'service' ? 'servicio' : 'producto'}</span></td>
                <td className="c">{i.qty}</td>
                <td className="r">{money(i.price)}</td>
                <td className="r">{money(i.qty * i.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="totals" style={{ maxWidth: 320, marginLeft: 'auto', width: '100%' }}>
        {sale.discount > 0 && <div className="row"><span>Descuento</span><span>-{money(sale.discount)}</span></div>}
        <div className="row"><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>
        <div className="row"><span>{s.taxName} ({s.taxRate}%)</span><span>{money(sale.tax)}</span></div>
        <div className="row grand"><span>Total</span><span>{money(sale.total)}</span></div>
        <div className="row"><span>Pagado</span><span>{money(sale.paid)}</span></div>
        {sale.change > 0 && <div className="row"><span>Cambio</span><span>{money(sale.change)}</span></div>}
        {sale.balance > 0 && <div className="row b pink"><span>Pendiente</span><span>{money(sale.balance)}</span></div>}
      </div>
      {sale.payments.length > 0 && (
        <div>
          <div className="muted small b" style={{ marginBottom: 4 }}>PAGOS</div>
          {sale.payments.map((p) => (
            <div key={p.id} className="small">
              {fmtDateTime(p.date)} · {PAY_LABEL[p.method]} · <b>{money(p.amount)}</b> {p.note && `· ${p.note}`}
            </div>
          ))}
        </div>
      )}
      {sale.notes && <div className="alert small">Nota: {sale.notes}</div>}
      <Field label="WhatsApp del cliente (para enviar la factura)">
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="809 000 0000" />
      </Field>
      <div className="muted small">
        En el celular se abre el menú para compartir el PDF directo a WhatsApp. En computadora se descarga el PDF y se abre
        WhatsApp con el resumen para adjuntarlo.
      </div>
      {payOpen && <PaymentModal saleId={sale.id} onClose={() => setPayOpen(false)} />}
    </Modal>
  );
}

export function PaymentModal({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const db = useDB();
  const sale = db.sales.find((s) => s.id === saleId)!;
  const [amount, setAmount] = useState(String(sale.balance));
  const [method, setMethod] = useState<PayMethod>('efectivo');
  const [note, setNote] = useState('');
  const [print, setPrint] = useState(true);
  const save = () => {
    const amt = num(amount);
    const ok = tryRun(() => {
      addSalePayment(saleId, amt, method, note);
      return true;
    });
    if (!ok) return;
    if (print) {
      const updated = db.sales.find((s) => s.id === saleId)!;
      const applied = Math.min(amt, updated.balance);
      printPaymentReceipt({ ...updated, balance: Math.max(0, updated.balance - applied) }, db.settings, applied, PAY_LABEL[method]);
    }
    onClose();
  };
  return (
    <Modal
      title={`Cobro · ${sale.number}`}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar cobro</button></>}
    >
      <div className="alert">
        {sale.clientName} · Total {money(sale.total)} · Pendiente <b>{money(sale.balance)}</b>
      </div>
      <div className="grid g2">
        <Field label="Monto">
          <input className="input" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Método">
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
            {PAY_METHODS.map((m) => <option key={m} value={m}>{PAY_LABEL[m]}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Nota">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <label className="check"><input type="checkbox" checked={print} onChange={(e) => setPrint(e.target.checked)} /> Imprimir recibo</label>
    </Modal>
  );
}
