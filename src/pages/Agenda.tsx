import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { update, useDB } from '../lib/store';
import { dayKey, money, num, uid } from '../lib/utils';
import { APPT_STATUS, type Appointment, type AppointmentStatus, type NoticeType } from '../lib/types';
import {
  addDays, cap, fillTemplate, fmtLongDate, fmtTime, fromMin, isActive, lastNotice, overlaps, saveAppointment, sendNotice,
  setAppointmentStatus, templateFor, toMin,
} from '../lib/appointments';
import { Empty, Field, Modal, PageHead } from '../components/ui';

type View = 'mes' | 'semana' | 'dia' | 'lista';

const STATUS_CLS: Record<AppointmentStatus, string> = {
  pendiente: 'warn', confirmada: 'pink', completada: 'ok', cancelada: 'bad', 'no asistió': 'bad',
};
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const SLOT_PX = 44;

/** Monday of the week containing the given day. */
const weekStart = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00`);
  return addDays(ymd, -((d.getDay() + 6) % 7));
};

export default function Agenda() {
  const db = useDB();
  const s = db.settings;
  const today = dayKey();
  const [view, setView] = useState<View>('mes');
  const [day, setDay] = useState(today);
  const [edit, setEdit] = useState<Partial<Appointment> | null>(null);
  const [open, setOpen] = useState<{ id: string; notice?: NoticeType } | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of db.appointments) {
      const list = m.get(a.date) || [];
      list.push(a);
      m.set(a.date, list);
    }
    for (const l of m.values()) l.sort((a, b) => a.time.localeCompare(b.time));
    return m;
  }, [db.appointments]);

  const move = (dir: number) => {
    if (view === 'mes') {
      const d = new Date(`${day}T12:00:00`);
      d.setDate(1);
      d.setMonth(d.getMonth() + dir);
      setDay(d.toLocaleDateString('en-CA'));
    } else setDay(addDays(day, view === 'semana' ? 7 * dir : dir));
  };

  const title =
    view === 'mes'
      ? new Date(`${day}T12:00:00`).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' })
      : view === 'semana'
        ? `Semana del ${fmtLongDate(weekStart(day))}`
        : view === 'dia' ? fmtLongDate(day) : 'Próximas citas';

  const tomorrow = addDays(today, 1);
  const pendingReminders = [...(byDay.get(today) || []), ...(byDay.get(tomorrow) || [])].filter(
    (a) => (a.status === 'pendiente' || a.status === 'confirmada') && !lastNotice(a, 'recordatorio') && a.clientPhone,
  );
  const todayActive = (byDay.get(today) || []).filter(isActive);

  const newAt = (date: string, time?: string) => setEdit({ date, time: time || s.openTime });

  return (
    <>
      <PageHead title="Agenda de citas" subtitle={`Hoy: ${todayActive.length} cita(s) · ${money(todayActive.reduce((a, x) => a + x.total, 0))} estimado`}>
        <button className="btn primary" onClick={() => newAt(day < today ? today : day)}>+ Nueva cita</button>
      </PageHead>

      {pendingReminders.length > 0 && (
        <div className="alert" style={{ marginBottom: 14 }}>
          <div className="b" style={{ marginBottom: 6 }}>🔔 Recordatorios por enviar (hoy y mañana)</div>
          <div className="grid" style={{ gap: 6 }}>
            {pendingReminders.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="small" style={{ flex: 1, minWidth: 180 }}>
                  <b>{a.date === today ? 'Hoy' : 'Mañana'} {fmtTime(a.time)}</b> · {a.clientName} · {a.services.map((x) => x.name).join(', ')}
                </span>
                <button className="btn sm wa" onClick={() => setOpen({ id: a.id, notice: 'recordatorio' })}>Enviar recordatorio</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div className="btns" style={{ alignItems: 'center' }}>
            <button className="btn sm" onClick={() => move(-1)} aria-label="Anterior">◀</button>
            <button className="btn sm" onClick={() => setDay(today)}>Hoy</button>
            <button className="btn sm" onClick={() => move(1)} aria-label="Siguiente">▶</button>
            <b style={{ marginLeft: 6 }}>{cap(title)}</b>
          </div>
          <div className="tabs" style={{ margin: 0 }}>
            {(['mes', 'semana', 'dia', 'lista'] as View[]).map((v) => (
              <button key={v} className={`tab ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
                {{ mes: 'Mes', semana: 'Semana', dia: 'Día', lista: 'Lista' }[v]}
              </button>
            ))}
          </div>
        </div>

        {view === 'mes' && (
          <MonthView day={day} today={today} byDay={byDay}
            onPick={(d) => { setDay(d); setView('dia'); }}
            onOpen={(id) => setOpen({ id })} />
        )}
        {view === 'semana' && (
          <WeekView day={day} today={today} byDay={byDay}
            onPick={(d) => { setDay(d); setView('dia'); }}
            onOpen={(id) => setOpen({ id })} onNew={newAt} />
        )}
        {view === 'dia' && <DayView day={day} list={byDay.get(day) || []} onOpen={(id) => setOpen({ id })} onNew={(t) => newAt(day, t)} />}
        {view === 'lista' && <ListView from={today} onOpen={(id) => setOpen({ id })} />}
      </div>

      {edit && (
        <AppointmentForm
          value={edit}
          onClose={() => setEdit(null)}
          onSaved={(id, isNew) => {
            setEdit(null);
            setOpen({ id, notice: isNew ? 'confirmación' : undefined });
          }}
        />
      )}
      {open && (
        <AppointmentDetail
          id={open.id}
          initialNotice={open.notice}
          onClose={() => setOpen(null)}
          onEdit={(a) => { setOpen(null); setEdit(a); }}
        />
      )}
    </>
  );
}

// ---------------- Views ----------------

function Chip({ a, onOpen }: { a: Appointment; onOpen: (id: string) => void }) {
  return (
    <button className={`appt-chip st-${STATUS_CLS[a.status]}`} onClick={(e) => { e.stopPropagation(); onOpen(a.id); }} title={`${fmtTime(a.time)} ${a.clientName}`}>
      <b>{fmtTime(a.time)}</b> {a.clientName}
    </button>
  );
}

function MonthView(props: {
  day: string; today: string; byDay: Map<string, Appointment[]>;
  onPick: (d: string) => void; onOpen: (id: string) => void;
}) {
  const d = new Date(`${props.day}T12:00:00`);
  const first = new Date(d.getFullYear(), d.getMonth(), 1, 12).toLocaleDateString('en-CA');
  const start = weekStart(first);
  const month = d.getMonth();
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const rows = new Date(`${cells[35]}T12:00:00`).getMonth() === month ? 6 : 5;
  return (
    <div className="cal">
      {WEEKDAYS.map((w) => <div key={w} className="cal-head">{w}</div>)}
      {cells.slice(0, rows * 7).map((c) => {
        const list = props.byDay.get(c) || [];
        const active = list.filter(isActive);
        const out = new Date(`${c}T12:00:00`).getMonth() !== month;
        return (
          <div key={c} className={`cal-cell ${out ? 'out' : ''} ${c === props.today ? 'today' : ''} ${c === props.day ? 'sel' : ''}`}
            onClick={() => props.onPick(c)}>
            <div className="cal-num">
              <span>{Number(c.slice(8))}</span>
              {active.length > 0 && <span className="cal-count">{active.length}</span>}
            </div>
            <div className="cal-chips">
              {list.slice(0, 3).map((a) => <Chip key={a.id} a={a} onOpen={props.onOpen} />)}
              {list.length > 3 && <span className="small muted">+{list.length - 3} más</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekView(props: {
  day: string; today: string; byDay: Map<string, Appointment[]>;
  onPick: (d: string) => void; onOpen: (id: string) => void; onNew: (d: string) => void;
}) {
  const start = weekStart(props.day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="week">
      {days.map((d, i) => {
        const list = props.byDay.get(d) || [];
        return (
          <div key={d} className={`week-col ${d === props.today ? 'today' : ''}`}>
            <button className="week-head" onClick={() => props.onPick(d)}>
              {WEEKDAYS[i]} <b>{Number(d.slice(8))}</b>
            </button>
            {list.map((a) => <Chip key={a.id} a={a} onOpen={props.onOpen} />)}
            <button className="btn sm" style={{ marginTop: 'auto' }} onClick={() => props.onNew(d)}>+ Cita</button>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ day, list, onOpen, onNew }: { day: string; list: Appointment[]; onOpen: (id: string) => void; onNew: (t: string) => void }) {
  const s = useDB().settings;
  const slot = Math.max(5, s.slotMinutes || 30);
  let start = toMin(s.openTime);
  let end = toMin(s.closeTime);
  for (const a of list) {
    start = Math.min(start, toMin(a.time));
    end = Math.max(end, toMin(a.time) + a.duration);
  }
  start = Math.floor(start / slot) * slot;
  end = Math.ceil(end / slot) * slot;
  const slots = Array.from({ length: Math.max(1, (end - start) / slot) }, (_, i) => start + i * slot);
  const px = SLOT_PX / slot;

  // Side-by-side columns for overlapping appointments.
  const shown = list.filter((a) => a.status !== 'cancelada');
  const lanes: Appointment[][] = [];
  const laneOf = new Map<string, number>();
  for (const a of shown) {
    let i = lanes.findIndex((l) => toMin(l[l.length - 1].time) + l[l.length - 1].duration <= toMin(a.time));
    if (i < 0) i = lanes.push([]) - 1;
    lanes[i].push(a);
    laneOf.set(a.id, i);
  }
  const n = Math.max(1, lanes.length);
  const cancelled = list.filter((a) => a.status === 'cancelada');

  return (
    <>
      <div className="day" style={{ height: slots.length * SLOT_PX }}>
        {slots.map((m, i) => (
          <div key={m} className="day-slot" style={{ top: i * SLOT_PX, height: SLOT_PX }} onClick={() => onNew(fromMin(m))}>
            <span className="day-time">{m % 60 === 0 || slot >= 60 ? fmtTime(fromMin(m)) : ''}</span>
          </div>
        ))}
        {day === dayKey() && (() => {
          const now = new Date();
          const nm = now.getHours() * 60 + now.getMinutes();
          return nm >= start && nm <= end ? <div className="day-now" style={{ top: (nm - start) * px }} /> : null;
        })()}
        {shown.map((a) => (
          <button key={a.id} className={`day-appt st-${STATUS_CLS[a.status]}`}
            style={{
              top: (toMin(a.time) - start) * px,
              height: Math.max(SLOT_PX - 4, a.duration * px - 4),
              left: `calc(70px + (100% - 76px) * ${laneOf.get(a.id)! / n})`,
              width: `calc((100% - 76px) / ${n} - 4px)`,
            }}
            onClick={(e) => { e.stopPropagation(); onOpen(a.id); }}>
            <b>{fmtTime(a.time)} · {a.clientName}</b>
            <span>{a.services.map((x) => x.name).join(', ')}</span>
            <span>{a.duration} min · {money(a.total)} · {a.status}</span>
          </button>
        ))}
      </div>
      {list.length === 0 && <div className="small muted c" style={{ marginTop: 8 }}>Sin citas. Toca una hora para agendar.</div>}
      {cancelled.length > 0 && (
        <div className="small muted" style={{ marginTop: 8 }}>
          Canceladas: {cancelled.map((a) => <a key={a.id} href="#" onClick={(e) => { e.preventDefault(); onOpen(a.id); }} style={{ marginRight: 8 }}>{fmtTime(a.time)} {a.clientName}</a>)}
        </div>
      )}
    </>
  );
}

function ListView({ from, onOpen }: { from: string; onOpen: (id: string) => void }) {
  const db = useDB();
  const [status, setStatus] = useState('activas');
  const list = db.appointments
    .filter((a) => a.date >= from && (status === 'todas' || (status === 'activas' ? isActive(a) && a.status !== 'completada' : a.status === status)))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return (
    <>
      <div className="toolbar">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="activas">Por atender</option>
          <option value="todas">Todas</option>
          {APPT_STATUS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
      {list.length === 0 ? <Empty>No hay citas próximas.</Empty> : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Servicios</th><th className="r">Total</th><th>Estado</th><th>Aviso</th></tr></thead>
            <tbody>
              {list.map((a) => {
                const n = lastNotice(a);
                return (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(a.id)}>
                    <td className="nowrap small">{cap(fmtLongDate(a.date))}</td>
                    <td className="nowrap b">{fmtTime(a.time)}</td>
                    <td>{a.clientName}</td>
                    <td className="small">{a.services.map((x) => x.name).join(', ')}</td>
                    <td className="r nowrap">{money(a.total)}</td>
                    <td><span className={`badge ${STATUS_CLS[a.status]}`}>{a.status}</span></td>
                    <td className="small muted">{n ? `✓ ${n.type}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------- Form ----------------

function AppointmentForm({ value, onClose, onSaved }: {
  value: Partial<Appointment>; onClose: () => void; onSaved: (id: string, isNew: boolean) => void;
}) {
  const db = useDB();
  const s = db.settings;
  const isNew = !value.id;
  const [client, setClient] = useState({ id: value.clientId || '', name: value.clientName || '', phone: value.clientPhone || '' });
  const [date, setDate] = useState(value.date || dayKey());
  const [time, setTime] = useState(value.time || s.openTime);
  const [selected, setSelected] = useState<Appointment['services']>(value.services || []);
  const [duration, setDuration] = useState(String(value.duration ?? ''));
  const [total, setTotal] = useState(String(value.total ?? ''));
  const [notes, setNotes] = useState(value.notes || '');
  const [status, setStatus] = useState<AppointmentStatus>(value.status || 'pendiente');
  const [q, setQ] = useState('');
  const [saveClient, setSaveClient] = useState(true);

  const autoDuration = selected.reduce((a, x) => a + x.duration, 0);
  const autoTotal = selected.reduce((a, x) => a + x.price, 0);
  const dur = duration === '' ? autoDuration || s.slotMinutes : num(duration);
  const tot = total === '' ? autoTotal : num(total);
  const clash = overlaps(db, { id: value.id || '', date, time, duration: dur });

  const toggle = (id: string) => {
    const sv = db.services.find((x) => x.id === id)!;
    setSelected((cur) => cur.some((x) => x.id === id) ? cur.filter((x) => x.id !== id) : [...cur, { id, name: sv.name, price: sv.price, duration: sv.duration }]);
  };
  const pickClient = (name: string) => {
    const c = db.clients.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    setClient(c ? { id: c.id, name: c.name, phone: c.phone } : { id: '', name, phone: client.phone });
  };
  const services = db.services.filter((x) => x.active && (!q || x.name.toLowerCase().includes(q.toLowerCase())));

  const save = () => {
    if (!client.name.trim()) return alert('Indica el nombre de la clienta');
    if (!selected.length) return alert('Selecciona al menos un servicio');
    if (clash.length && !confirm(`Ya hay ${clash.length} cita(s) a esa hora (${clash.map((c) => c.clientName).join(', ')}). ¿Agendar de todos modos?`)) return;
    let clientId = client.id || undefined;
    if (!clientId && saveClient) {
      const c = db.clients.find((x) => x.name.toLowerCase() === client.name.trim().toLowerCase());
      clientId = c?.id;
      if (!c) {
        const nc = { id: uid(), name: client.name.trim(), phone: client.phone, email: '', notes: '', createdAt: new Date().toISOString() };
        clientId = nc.id;
        update((d) => void d.clients.push(nc));
      }
    } else if (clientId && client.phone) {
      update((d) => {
        const c = d.clients.find((x) => x.id === clientId);
        if (c && !c.phone) c.phone = client.phone;
      });
    }
    const id = saveAppointment({
      id: value.id, date, time, duration: dur, clientId, clientName: client.name.trim(), clientPhone: client.phone,
      services: selected, total: tot, status, notes, saleId: value.saleId,
    });
    onSaved(id, isNew);
  };

  return (
    <Modal title={isNew ? 'Nueva cita' : 'Editar cita'} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar cita</button></>}>
      <div className="grid g3">
        <Field label="Clienta">
          <input className="input" list="appt-clients" value={client.name} onChange={(e) => pickClient(e.target.value)} autoFocus={isNew} />
          <datalist id="appt-clients">{db.clients.map((c) => <option key={c.id} value={c.name}>{c.phone}</option>)}</datalist>
        </Field>
        <Field label="WhatsApp">
          <input className="input" inputMode="tel" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} placeholder="809 000 0000" />
        </Field>
        <Field label="Estado">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus)}>
            {APPT_STATUS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Fecha"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Hora"><input className="input" type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label={`Duración (min)${duration === '' ? ' · automática' : ''}`}>
          <input className="input" type="number" placeholder={String(autoDuration || s.slotMinutes)} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>
      </div>
      {clash.length > 0 && (
        <div className="alert warn small">⚠️ Se cruza con: {clash.map((c) => `${fmtTime(c.time)} ${c.clientName}`).join(', ')}</div>
      )}
      <Field label="Servicios">
        <input className="input" placeholder="Buscar servicio…" value={q} onChange={(e) => setQ(e.target.value)} />
      </Field>
      <div className="svc-pick">
        {services.map((x) => {
          const on = selected.some((y) => y.id === x.id);
          return (
            <button key={x.id} className={`svc-opt ${on ? 'on' : ''}`} onClick={() => toggle(x.id)}>
              <span>{on ? '✓ ' : ''}{x.name}</span>
              <span className="small muted">{x.duration} min · {money(x.price)}</span>
            </button>
          );
        })}
      </div>
      <div className="grid g2">
        <Field label={`Total estimado${total === '' ? ' · automático' : ''}`}>
          <input className="input" type="number" placeholder={String(autoTotal)} value={total} onChange={(e) => setTotal(e.target.value)} />
        </Field>
        <Field label="Notas"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. piel sensible, primera vez…" /></Field>
      </div>
      {!client.id && client.name.trim() && (
        <label className="check"><input type="checkbox" checked={saveClient} onChange={(e) => setSaveClient(e.target.checked)} /> Guardar como clienta nueva</label>
      )}
    </Modal>
  );
}

// ---------------- Detail & WhatsApp ----------------

function AppointmentDetail({ id, initialNotice, onClose, onEdit }: {
  id: string; initialNotice?: NoticeType; onClose: () => void; onEdit: (a: Appointment) => void;
}) {
  const db = useDB();
  const s = db.settings;
  const nav = useNavigate();
  const a = db.appointments.find((x) => x.id === id);
  const [type, setType] = useState<NoticeType | null>(initialNotice ?? null);
  const [text, setText] = useState(a && initialNotice ? fillTemplate(templateFor(initialNotice, s), a, s) : '');
  if (!a) return null;

  const pick = (t: NoticeType) => {
    setType(t);
    setText(fillTemplate(templateFor(t, s), a, s));
  };
  const send = () => {
    if (!a.clientPhone) return alert('Esta cita no tiene número de WhatsApp. Edítala para agregarlo.');
    sendNotice(a, s, type || 'mensaje', text);
    if (type === 'cancelación' && a.status !== 'cancelada') setAppointmentStatus(a.id, 'cancelada');
    setType(null);
  };
  const remove = () => {
    if (!confirm('¿Eliminar esta cita definitivamente?')) return;
    update((d) => void (d.appointments = d.appointments.filter((x) => x.id !== a.id)));
    onClose();
  };
  const sale = a.saleId ? db.sales.find((x) => x.id === a.saleId) : undefined;

  return (
    <Modal title={`Cita · ${a.clientName}`} onClose={onClose} wide
      footer={<>
        <button className="btn danger" onClick={remove}>Eliminar</button>
        <button className="btn" onClick={() => onEdit(a)}>Editar / reagendar</button>
        {!sale && a.status !== 'cancelada' && (
          <button className="btn primary" onClick={() => nav('/pos', { state: { appointmentId: a.id } })}>💳 Cobrar en punto de venta</button>
        )}
      </>}>
      <div className="grid g3">
        <div><div className="muted small">Fecha y hora</div><b>{cap(fmtLongDate(a.date))} · {fmtTime(a.time)}</b></div>
        <div><div className="muted small">Duración / total</div><b>{a.duration} min · {money(a.total)}</b></div>
        <div><div className="muted small">WhatsApp</div><b>{a.clientPhone || '—'}</b></div>
      </div>
      <div className="small"><span className="muted">Servicios:</span> {a.services.map((x) => x.name).join(', ')}</div>
      {a.notes && <div className="alert small">{a.notes}</div>}
      {sale && <div className="badge ok">Cobrada en factura {sale.number}</div>}

      <div>
        <div className="muted small b" style={{ marginBottom: 6 }}>ESTADO</div>
        <div className="btns">
          {APPT_STATUS.map((st) => (
            <button key={st} className={`btn sm ${a.status === st ? 'primary' : ''}`} onClick={() => setAppointmentStatus(a.id, st)}>{st}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ boxShadow: 'none', background: '#fbfffc', borderColor: '#cdeedb' }}>
        <h3>💬 Avisar por WhatsApp</h3>
        <div className="btns" style={{ marginBottom: 8 }}>
          {(['confirmación', 'recordatorio', 'cancelación', 'mensaje'] as NoticeType[]).map((t) => (
            <button key={t} className={`btn sm ${type === t ? 'primary' : ''}`} onClick={() => pick(t)}>
              {{ 'confirmación': '✅ Confirmación', recordatorio: '⏰ Recordatorio', 'cancelación': '❌ Cancelación', mensaje: '✏️ Mensaje libre' }[t]}
            </button>
          ))}
        </div>
        {type && (
          <>
            <textarea className="input" style={{ minHeight: 130 }} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="btns" style={{ marginTop: 8, alignItems: 'center' }}>
              <button className="btn wa" onClick={send} disabled={!text.trim()}>Abrir WhatsApp y enviar</button>
              <span className="small muted">Puedes editar el texto antes de enviarlo.</span>
            </div>
          </>
        )}
        {a.notices.length > 0 && (
          <div className="small muted" style={{ marginTop: 8 }}>
            Enviados: {a.notices.map((n, i) => (
              <span key={i} style={{ marginRight: 10 }}>✓ {n.type} ({new Date(n.at).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })})</span>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
