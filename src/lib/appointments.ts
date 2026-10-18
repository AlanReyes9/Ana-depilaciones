import type { Appointment, DB, NoticeType, Settings } from './types';
import { update } from './store';
import { money, normalizePhone, uid, waLink } from './utils';

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
export const fromMin = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** 12-hour time for messages and display, e.g. "3:30 p. m.". */
export const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' });
};

export const fmtLongDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });

export const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
};

export const isActive = (a: Appointment) => a.status !== 'cancelada' && a.status !== 'no asistió';

/** Other active appointments on the same day whose time range overlaps this one. */
export function overlaps(db: DB, a: Pick<Appointment, 'id' | 'date' | 'time' | 'duration'>) {
  const s = toMin(a.time);
  const e = s + Math.max(a.duration, 1);
  return db.appointments.filter(
    (x) => x.id !== a.id && x.date === a.date && isActive(x) && toMin(x.time) < e && toMin(x.time) + Math.max(x.duration, 1) > s,
  );
}

export function fillTemplate(tpl: string, a: Appointment, s: Settings) {
  const vars: Record<string, string> = {
    cliente: a.clientName.split(' ')[0] || a.clientName,
    nombre: a.clientName,
    negocio: s.businessName,
    fecha: fmtLongDate(a.date),
    hora: fmtTime(a.time),
    servicios: a.services.map((x) => x.name).join(', ') || 'servicio',
    total: money(a.total),
    duracion: `${a.duration} min`,
    direccion: s.address ? `📍 ${s.address}` : '',
    telefono: s.whatsapp || s.phone,
  };
  return tpl
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m))
    // "a. m." followed by the template's own period.
    .replace(/([ap]\.\s?m\.)\./g, '$1')
    .split('\n')
    .filter((l, i, arr) => l.trim() !== '' || (i > 0 && arr[i - 1].trim() !== ''))
    .join('\n')
    .trim();
}

export function templateFor(type: NoticeType, s: Settings) {
  if (type === 'confirmación') return s.msgConfirm;
  if (type === 'recordatorio') return s.msgReminder;
  if (type === 'cancelación') return s.msgCancel;
  return 'Hola {cliente} 💖, ';
}

/** Opens WhatsApp with the message ready to send and logs the notice on the appointment. */
export function sendNotice(a: Appointment, s: Settings, type: NoticeType, text: string) {
  const phone = normalizePhone(a.clientPhone, s.countryCode);
  window.open(waLink(phone, text), '_blank');
  update((d) => {
    const x = d.appointments.find((y) => y.id === a.id);
    if (x) x.notices.push({ type, at: new Date().toISOString() });
  });
}

export const lastNotice = (a: Appointment, type?: NoticeType) =>
  [...a.notices].reverse().find((n) => !type || n.type === type);

export function saveAppointment(a: Omit<Appointment, 'id' | 'createdAt' | 'notices'> & { id?: string }) {
  let id = a.id;
  update((d) => {
    if (id) {
      const x = d.appointments.find((y) => y.id === id);
      if (x) Object.assign(x, a);
    } else {
      id = uid();
      d.appointments.push({ ...a, id, notices: [], createdAt: new Date().toISOString() });
    }
  });
  return id!;
}

export function setAppointmentStatus(id: string, status: Appointment['status'], saleId?: string) {
  update((d) => {
    const x = d.appointments.find((y) => y.id === id);
    if (!x) return;
    x.status = status;
    if (saleId) x.saleId = saleId;
  });
}
