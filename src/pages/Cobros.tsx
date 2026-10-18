import { useMemo, useState } from 'react';
import { useDB } from '../lib/store';
import { dayKey, fmtDate, fmtDateTime, money, normalizePhone, sum, waLink } from '../lib/utils';
import { PAY_LABEL } from '../lib/types';
import { Empty, PageHead, Stat } from '../components/ui';
import InvoiceView, { PaymentModal } from '../components/InvoiceView';

export default function Cobros() {
  const db = useDB();
  const [tab, setTab] = useState<'pendientes' | 'historial'>('pendientes');
  const [q, setQ] = useState('');
  const [pay, setPay] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);

  const pending = useMemo(
    () => db.sales.filter((s) => s.status === 'pendiente' && s.balance > 0 && (!q || s.clientName.toLowerCase().includes(q.toLowerCase()))),
    [db, q],
  );
  const byClient = useMemo(() => {
    const m = new Map<string, { name: string; phone: string; total: number; count: number }>();
    for (const s of pending) {
      const k = s.clientId || s.clientName;
      const c = m.get(k) || { name: s.clientName, phone: s.clientPhone, total: 0, count: 0 };
      c.total += s.balance;
      c.count++;
      m.set(k, c);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [pending]);

  const history = useMemo(
    () =>
      db.sales
        .filter((s) => s.status !== 'anulada')
        .flatMap((s) => s.payments.filter((p) => p.date !== s.date).map((p) => ({ ...p, sale: s })))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [db],
  );
  const today = sum(history.filter((h) => dayKey(h.date) === dayKey()), (h) => h.amount);

  const remind = (name: string, phone: string, total: number) => {
    const msg = `Hola ${name} 💖, te saluda ${db.settings.businessName}. Te recordamos que tienes un balance pendiente de ${money(total)}. ¡Gracias!`;
    window.open(waLink(normalizePhone(phone, db.settings.countryCode), msg), '_blank');
  };

  return (
    <>
      <PageHead title="Gestión de cobros" subtitle="Cuentas por cobrar de clientes, abonos y recordatorios por WhatsApp." />
      <div className="grid g3" style={{ marginBottom: 14 }}>
        <Stat accent label="Total por cobrar" value={money(sum(pending, (s) => s.balance))} hint={`${pending.length} facturas`} />
        <Stat label="Clientes con balance" value={String(byClient.length)} />
        <Stat label="Cobrado hoy (abonos)" value={money(today)} />
      </div>
      <div className="tabs">
        <button className={`tab ${tab === 'pendientes' ? 'active' : ''}`} onClick={() => setTab('pendientes')}>Pendientes</button>
        <button className={`tab ${tab === 'historial' ? 'active' : ''}`} onClick={() => setTab('historial')}>Historial de abonos</button>
      </div>
      {tab === 'pendientes' ? (
        <div className="grid g2">
          <div className="card">
            <h3>Facturas pendientes</h3>
            <div className="toolbar"><input className="input" placeholder="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {pending.length === 0 ? <Empty>¡No hay cuentas por cobrar! 🎉</Empty> : (
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>Factura</th><th>Cliente</th><th className="r">Pendiente</th><th /></tr></thead>
                  <tbody>
                    {pending.map((s) => (
                      <tr key={s.id}>
                        <td><a href="#" onClick={(e) => { e.preventDefault(); setView(s.id); }}>{s.number}</a><div className="small muted">{fmtDate(s.date)}</div></td>
                        <td>{s.clientName}</td>
                        <td className="r b nowrap">{money(s.balance)}</td>
                        <td className="r"><button className="btn sm ok" onClick={() => setPay(s.id)}>Cobrar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card">
            <h3>Por cliente</h3>
            {byClient.length === 0 ? <Empty>—</Empty> : (
              <table className="t"><tbody>
                {byClient.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}<div className="small muted">{c.count} factura(s)</div></td>
                    <td className="r b nowrap">{money(c.total)}</td>
                    <td className="r">{c.phone && <button className="btn sm wa" onClick={() => remind(c.name, c.phone, c.total)}>Recordar</button>}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          {history.length === 0 ? <Empty>Aún no hay abonos registrados.</Empty> : (
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Método</th><th className="r">Monto</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="small nowrap">{fmtDateTime(h.date)}</td>
                      <td>{h.sale.number}</td>
                      <td>{h.sale.clientName}</td>
                      <td>{PAY_LABEL[h.method]}</td>
                      <td className="r b">{money(h.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {pay && <PaymentModal saleId={pay} onClose={() => setPay(null)} />}
      {view && <InvoiceView saleId={view} onClose={() => setView(null)} />}
    </>
  );
}
