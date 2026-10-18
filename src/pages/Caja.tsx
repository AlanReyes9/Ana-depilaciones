import { useState } from 'react';
import { addCashMovement, closeCash, openSession, sessionSummary, useDB } from '../lib/store';
import { fmtDateTime, money, num, round2 } from '../lib/utils';
import { PAY_LABEL, PAY_METHODS, type CashSession, type PayMethod } from '../lib/types';
import { Empty, Field, Modal, PageHead, Stat, StatusBadge, tryRun } from '../components/ui';
import { OpenCashCard } from './POS';
import { downloadClosePdf, printClose } from '../lib/documents';

export default function Caja() {
  const db = useDB();
  const session = openSession(db);
  const [mov, setMov] = useState<'entrada' | 'salida' | null>(null);
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState<CashSession | null>(null);
  const history = [...db.cashSessions].filter((s) => s.status === 'cerrada').reverse();

  return (
    <>
      <PageHead title="Caja y cierre diario" subtitle="Apertura, entradas/salidas de efectivo y cuadre al final del día.">
        {session && (
          <>
            <button className="btn" onClick={() => setMov('entrada')}>➕ Entrada</button>
            <button className="btn" onClick={() => setMov('salida')}>➖ Salida</button>
            <button className="btn" onClick={() => printClose(db, session)}>🖨️ Corte parcial</button>
            <button className="btn primary" onClick={() => setClosing(true)}>Cerrar caja</button>
          </>
        )}
      </PageHead>

      {session ? <SessionDetail session={session} /> : <OpenCashCard />}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Historial de cierres</h3>
        {history.length === 0 ? (
          <Empty>Aún no hay cierres.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr><th>Apertura</th><th>Cierre</th><th className="r">Efectivo esperado</th><th className="r">Contado</th><th className="r">Diferencia</th><th>Estado</th><th /></tr>
              </thead>
              <tbody>
                {history.map((s) => {
                  const diff = round2((s.counted?.efectivo ?? 0) - (s.expected?.efectivo ?? 0));
                  return (
                    <tr key={s.id}>
                      <td className="nowrap">{fmtDateTime(s.openedAt)}</td>
                      <td className="nowrap">{s.closedAt && fmtDateTime(s.closedAt)}</td>
                      <td className="r">{money(s.expected?.efectivo ?? 0)}</td>
                      <td className="r">{money(s.counted?.efectivo ?? 0)}</td>
                      <td className={`r b ${diff < 0 ? 'pink' : ''}`}>{money(diff)}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td className="r nowrap">
                        <button className="btn sm" onClick={() => setView(s)}>Ver</button>{' '}
                        <button className="btn sm" onClick={() => printClose(db, s)}>🖨️</button>{' '}
                        <button className="btn sm" onClick={() => downloadClosePdf(db, s)}>PDF</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mov && <MovementModal type={mov} onClose={() => setMov(null)} />}
      {closing && session && <CloseModal session={session} onClose={() => setClosing(false)} />}
      {view && (
        <Modal title={`Cierre ${fmtDateTime(view.closedAt || view.openedAt)}`} onClose={() => setView(null)} wide
          footer={<><button className="btn" onClick={() => printClose(db, view)}>🖨️ Imprimir</button><button className="btn" onClick={() => downloadClosePdf(db, view)}>📄 PDF</button></>}>
          <SessionDetail session={view} />
        </Modal>
      )}
    </>
  );
}

function SessionDetail({ session }: { session: CashSession }) {
  const db = useDB();
  const sm = sessionSummary(db, session);
  const expected = session.expected ?? sm.expected;
  return (
    <div className="grid">
      <div className="grid g4">
        <Stat accent label="Efectivo esperado en caja" value={money(expected.efectivo)} hint={`Fondo inicial ${money(session.openingAmount)}`} />
        <Stat label="Facturado" value={money(sm.salesTotal)} hint={`${sm.salesCount} facturas`} />
        <Stat label="Cobrado (todos los métodos)" value={money(sm.totalIn)} hint={`Incluye cobros anteriores ${money(sm.collections)}`} />
        <Stat label="Pendiente por cobrar" value={money(sm.pendingTotal)} hint="Ventas a crédito de esta caja" />
      </div>
      <div className="grid g2">
        <div className="card">
          <h3>Resumen</h3>
          <table className="t"><tbody>
            <tr><td>Abierta</td><td className="r">{fmtDateTime(session.openedAt)}</td></tr>
            {PAY_METHODS.map((m) => <tr key={m}><td>Ingresos {PAY_LABEL[m].toLowerCase()}</td><td className="r">{money(sm.inflow[m])}</td></tr>)}
            <tr><td>Servicios vendidos</td><td className="r">{money(sm.services)}</td></tr>
            <tr><td>Productos vendidos</td><td className="r">{money(sm.products)}</td></tr>
            <tr><td>Descuentos</td><td className="r">{money(sm.discounts)}</td></tr>
            <tr><td>Entradas de efectivo</td><td className="r">{money(sm.entradas)}</td></tr>
            <tr><td>Salidas de efectivo</td><td className="r">-{money(sm.salidas)}</td></tr>
            <tr><td>Gastos pagados de caja</td><td className="r">-{money(sm.expensesCash)}</td></tr>
            <tr><td>Compras pagadas de caja</td><td className="r">-{money(sm.purchasesCash)}</td></tr>
          </tbody></table>
        </div>
        <div className="card">
          <h3>Movimientos de efectivo</h3>
          {session.movements.length === 0 ? <Empty>Sin movimientos.</Empty> : (
            <table className="t"><tbody>
              {session.movements.map((m) => (
                <tr key={m.id}>
                  <td className="small nowrap">{fmtDateTime(m.date)}</td>
                  <td>{m.reason}</td>
                  <td className={`r b ${m.type === 'salida' ? 'pink' : ''}`}>{m.type === 'salida' ? '-' : '+'}{money(m.amount)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
          {session.counted && (
            <>
              <h3 style={{ marginTop: 16 }}>Cuadre</h3>
              <table className="t">
                <thead><tr><th>Método</th><th className="r">Esperado</th><th className="r">Contado</th><th className="r">Dif.</th></tr></thead>
                <tbody>
                  {PAY_METHODS.map((m) => (
                    <tr key={m}>
                      <td>{PAY_LABEL[m]}</td>
                      <td className="r">{money(expected[m])}</td>
                      <td className="r">{money(session.counted![m])}</td>
                      <td className="r b">{money(round2(session.counted![m] - expected[m]))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {session.notes && <p className="small">Notas: {session.notes}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MovementModal({ type, onClose }: { type: 'entrada' | 'salida'; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const save = () => {
    if (num(amount) <= 0) return alert('Indica un monto');
    if (tryRun(() => (addCashMovement(type, num(amount), reason || (type === 'entrada' ? 'Entrada' : 'Salida')), true))) onClose();
  };
  return (
    <Modal title={type === 'entrada' ? 'Entrada de efectivo' : 'Salida de efectivo'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar</button></>}>
      <Field label="Monto"><input className="input" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
      <Field label="Motivo"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === 'salida' ? 'Ej. retiro para depósito' : 'Ej. cambio adicional'} /></Field>
      <p className="muted small">Para gastos del negocio usa el módulo Gastos (marcando “pagado de caja”) para que aparezcan en los reportes.</p>
    </Modal>
  );
}

function CloseModal({ session, onClose }: { session: CashSession; onClose: () => void }) {
  const db = useDB();
  const sm = sessionSummary(db, session);
  const [counted, setCounted] = useState<Record<PayMethod, string>>({
    efectivo: '', tarjeta: String(sm.expected.tarjeta), transferencia: String(sm.expected.transferencia),
  });
  const [notes, setNotes] = useState('');
  const vals = Object.fromEntries(PAY_METHODS.map((m) => [m, num(counted[m])])) as Record<PayMethod, number>;
  const save = (print: boolean) => {
    if (counted.efectivo === '') return alert('Indica el efectivo contado');
    const closed = tryRun(() => closeCash(vals, notes));
    if (!closed) return;
    if (print) printClose(db, closed);
    onClose();
  };
  return (
    <Modal title="Cierre de caja" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn" onClick={() => save(false)}>Cerrar</button>
        <button className="btn primary" onClick={() => save(true)}>Cerrar e imprimir</button>
      </>}>
      <p className="muted small">Cuenta el dinero y compáralo con lo que el sistema espera.</p>
      <table className="t">
        <thead><tr><th>Método</th><th className="r">Esperado</th><th>Contado</th><th className="r">Dif.</th></tr></thead>
        <tbody>
          {PAY_METHODS.map((m) => (
            <tr key={m}>
              <td>{PAY_LABEL[m]}</td>
              <td className="r">{money(sm.expected[m])}</td>
              <td><input className="input" type="number" inputMode="decimal" value={counted[m]} onChange={(e) => setCounted({ ...counted, [m]: e.target.value })} /></td>
              <td className={`r b ${counted[m] !== '' && vals[m] - sm.expected[m] < 0 ? 'pink' : ''}`}>
                {counted[m] === '' ? '—' : money(round2(vals[m] - sm.expected[m]))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Field label="Notas del cierre"><textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </Modal>
  );
}
