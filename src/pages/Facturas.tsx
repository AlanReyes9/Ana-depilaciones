import { useMemo, useState } from 'react';
import { useDB } from '../lib/store';
import { dayKey, download, fmtDateTime, money, sum } from '../lib/utils';
import { Empty, PageHead, StatusBadge } from '../components/ui';
import InvoiceView from '../components/InvoiceView';
import { PAY_LABEL } from '../lib/types';

export default function Facturas() {
  const db = useDB();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(dayKey(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(dayKey());
  const [status, setStatus] = useState('');
  const [view, setView] = useState<string | null>(null);

  const list = useMemo(() => {
    const qq = q.toLowerCase();
    return db.sales
      .filter((s) => {
        const d = dayKey(s.date);
        return d >= from && d <= to && (!status || s.status === status) &&
          (!qq || s.number.toLowerCase().includes(qq) || s.clientName.toLowerCase().includes(qq) || s.clientPhone.includes(qq));
      })
      .reverse();
  }, [db, q, from, to, status]);
  const valid = list.filter((s) => s.status !== 'anulada');

  const exportCsv = () => {
    const rows = [
      ['Factura', 'Fecha', 'Cliente', 'Teléfono', 'Subtotal', db.settings.taxName, 'Descuento', 'Total', 'Pagado', 'Pendiente', 'Estado', 'Métodos'],
      ...list.map((s) => [
        s.number, fmtDateTime(s.date), s.clientName, s.clientPhone, s.subtotal, s.tax, s.discount, s.total, s.paid, s.balance, s.status,
        [...new Set(s.payments.map((p) => PAY_LABEL[p.method]))].join(' / '),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    download(new Blob(['﻿' + csv], { type: 'text/csv' }), `facturas_${from}_${to}.csv`);
  };

  return (
    <>
      <PageHead title="Facturas" subtitle="Consulta, reimprime, guarda en PDF o envía por WhatsApp.">
        <button className="btn" onClick={exportCsv}>⬇️ Exportar Excel (CSV)</button>
      </PageHead>
      <div className="card">
        <div className="toolbar">
          <input className="input" placeholder="Buscar número, cliente o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 160 }} />
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 160 }} />
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 160 }}>
            <option value="">Todos los estados</option>
            <option value="pagada">Pagadas</option>
            <option value="pendiente">Pendientes</option>
            <option value="anulada">Anuladas</option>
          </select>
        </div>
        <div className="toolbar small">
          <span className="badge pink">{valid.length} facturas</span>
          <span>Total: <b>{money(sum(valid, (s) => s.total))}</b></span>
          <span>Pagado: <b>{money(sum(valid, (s) => s.paid))}</b></span>
          <span>Pendiente: <b>{money(sum(valid, (s) => s.balance))}</b></span>
        </div>
        {list.length === 0 ? <Empty>No hay facturas en este rango.</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th className="r">Total</th><th className="r">Pendiente</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setView(s.id)}>
                    <td className="b nowrap">{s.number}</td>
                    <td className="nowrap small">{fmtDateTime(s.date)}</td>
                    <td>{s.clientName}</td>
                    <td className="r nowrap">{money(s.total)}</td>
                    <td className="r nowrap">{s.balance > 0 ? money(s.balance) : '—'}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td className="r"><button className="btn sm">Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {view && <InvoiceView saleId={view} onClose={() => setView(null)} />}
    </>
  );
}
