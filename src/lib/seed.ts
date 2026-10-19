import type { DB, Settings } from './types';
import { uid } from './utils';

export const defaultSettings: Settings = {
  businessName: 'Ana Cosmetics & Depilaciones',
  slogan: 'Depilación · Cuidado de la piel · Cosméticos',
  rnc: '',
  phone: '',
  whatsapp: '',
  address: '',
  email: '',
  instagram: '@anadepilacioness',
  currency: 'RD$',
  taxName: 'ITBIS',
  taxRate: 18,
  pricesIncludeTax: true,
  invoicePrefix: 'FAC',
  nextInvoice: 1,
  nextPurchase: 1,
  receiptFormat: '80mm',
  footer: '¡Gracias por tu visita! Síguenos en Instagram @anadepilacioness',
  countryCode: '1',
  autoPdf: false,
  productCategories: ['Maquillaje', 'Cuidado facial', 'Cuidado corporal', 'Uñas', 'Accesorios', 'Post-depilación'],
  serviceCategories: ['Depilación con cera', 'Depilación con hilo', 'Cuidado facial', 'Cejas y pestañas', 'Otros'],
  logo: '',
  logoRound: true,
  openTime: '09:00',
  closeTime: '19:00',
  slotMinutes: 30,
  msgConfirm:
    'Hola {cliente} 💖, tu cita en {negocio} quedó agendada para el {fecha} a las {hora}.\nServicio: {servicios}\nTotal estimado: {total}\n{direccion}\n¡Te esperamos!',
  msgReminder:
    'Hola {cliente} 💖, te recordamos tu cita en {negocio} el {fecha} a las {hora} ({servicios}).\nPor favor confírmanos tu asistencia. ¡Gracias!',
  msgCancel:
    'Hola {cliente}, tu cita en {negocio} del {fecha} a las {hora} fue cancelada. Escríbenos para reagendar cuando gustes 💖',
  expenseCategories: ['Alquiler', 'Luz', 'Agua', 'Internet / Teléfono', 'Nómina', 'Insumos', 'Publicidad', 'Transporte', 'Mantenimiento', 'Otros'],
};

const now = () => new Date().toISOString();

export function seedDB(): DB {
  const svc = (name: string, category: string, price: number, duration: number) => ({
    id: uid(), name, category, price, duration, active: true,
  });
  const prod = (sku: string, name: string, category: string, cost: number, price: number, stock: number, minStock = 3) => ({
    id: uid(), sku, name, category, cost, price, stock, minStock, active: true, createdAt: now(),
  });
  return {
    version: 1,
    settings: { ...defaultSettings },
    services: [
      svc('Cejas con cera', 'Depilación con cera', 300, 15),
      svc('Bozo con cera', 'Depilación con cera', 200, 10),
      svc('Axilas con cera', 'Depilación con cera', 400, 15),
      svc('Media pierna con cera', 'Depilación con cera', 800, 30),
      svc('Pierna completa con cera', 'Depilación con cera', 1300, 45),
      svc('Bikini brasileño', 'Depilación con cera', 1200, 30),
      svc('Cejas con hilo', 'Depilación con hilo', 350, 15),
      svc('Rostro completo con hilo', 'Depilación con hilo', 800, 30),
      svc('Diseño de cejas', 'Cejas y pestañas', 500, 30),
      svc('Limpieza facial profunda', 'Cuidado facial', 2000, 60),
      svc('Hidratación facial', 'Cuidado facial', 1500, 45),
    ],
    products: [
      prod('PD-001', 'Gel calmante post-depilación', 'Post-depilación', 250, 450, 12),
      prod('CF-001', 'Sérum vitamina C 30ml', 'Cuidado facial', 450, 850, 8),
      prod('CF-002', 'Protector solar FPS 50', 'Cuidado facial', 500, 950, 10),
      prod('CF-003', 'Agua micelar 400ml', 'Cuidado facial', 300, 600, 6),
      prod('MQ-001', 'Labial líquido mate', 'Maquillaje', 180, 400, 15),
      prod('MQ-002', 'Base líquida', 'Maquillaje', 400, 850, 7),
      prod('CC-001', 'Exfoliante corporal', 'Cuidado corporal', 280, 550, 2),
    ],
    clients: [],
    suppliers: [],
    sales: [],
    purchases: [],
    expenses: [],
    cashSessions: [],
    stockMoves: [],
    appointments: [],
  };
}

export function emptyDB(): DB {
  return { ...seedDB(), products: [], services: [] };
}
