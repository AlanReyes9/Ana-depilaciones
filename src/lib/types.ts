export type PayMethod = 'efectivo' | 'tarjeta' | 'transferencia';
export const PAY_METHODS: PayMethod[] = ['efectivo', 'tarjeta', 'transferencia'];
export const PAY_LABEL: Record<PayMethod, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
};

export interface Settings {
  businessName: string;
  slogan: string;
  rnc: string;
  phone: string;
  whatsapp: string;
  address: string;
  email: string;
  instagram: string;
  currency: string;
  taxName: string;
  taxRate: number;
  pricesIncludeTax: boolean;
  invoicePrefix: string;
  nextInvoice: number;
  nextPurchase: number;
  receiptFormat: '80mm' | 'carta';
  footer: string;
  countryCode: string;
  autoPdf: boolean;
  productCategories: string[];
  serviceCategories: string[];
  expenseCategories: string[];
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  msgConfirm: string;
  msgReminder: string;
  msgCancel: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
  active: boolean;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  price: number;
  duration: number;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  rnc: string;
  notes: string;
}

export interface Payment {
  id: string;
  date: string;
  amount: number;
  method: PayMethod;
  cashSessionId?: string;
  note?: string;
}

export interface SaleItem {
  type: 'product' | 'service';
  refId: string;
  name: string;
  qty: number;
  price: number;
  cost: number;
}

export interface Sale {
  id: string;
  number: string;
  date: string;
  clientId?: string;
  clientName: string;
  clientPhone: string;
  items: SaleItem[];
  gross: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  change: number;
  status: 'pagada' | 'pendiente' | 'anulada';
  payments: Payment[];
  cashSessionId?: string;
  notes: string;
}

export interface PurchaseItem {
  productId: string;
  name: string;
  qty: number;
  cost: number;
}

export interface Purchase {
  id: string;
  number: string;
  date: string;
  supplierId?: string;
  supplierName: string;
  invoiceRef: string;
  items: PurchaseItem[];
  total: number;
  paid: number;
  status: 'pagada' | 'pendiente' | 'anulada';
  payments: Payment[];
  notes: string;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  method: PayMethod;
  cashSessionId?: string;
}

export interface CashMovement {
  id: string;
  date: string;
  type: 'entrada' | 'salida';
  amount: number;
  reason: string;
}

export interface CashSession {
  id: string;
  openedAt: string;
  openingAmount: number;
  closedAt?: string;
  status: 'abierta' | 'cerrada';
  movements: CashMovement[];
  counted?: Record<PayMethod, number>;
  expected?: Record<PayMethod, number>;
  notes: string;
}

export interface StockMove {
  id: string;
  date: string;
  productId: string;
  productName: string;
  qty: number;
  type: 'venta' | 'compra' | 'ajuste' | 'anulación';
  ref: string;
}

export type AppointmentStatus = 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no asistió';
export const APPT_STATUS: AppointmentStatus[] = ['pendiente', 'confirmada', 'completada', 'cancelada', 'no asistió'];

export type NoticeType = 'confirmación' | 'recordatorio' | 'cancelación' | 'mensaje';

export interface Appointment {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  duration: number;
  clientId?: string;
  clientName: string;
  clientPhone: string;
  services: { id: string; name: string; price: number; duration: number }[];
  total: number;
  status: AppointmentStatus;
  notes: string;
  notices: { type: NoticeType; at: string }[];
  saleId?: string;
  createdAt: string;
}

export interface DB {
  version: number;
  settings: Settings;
  products: Product[];
  services: Service[];
  clients: Client[];
  suppliers: Supplier[];
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  cashSessions: CashSession[];
  stockMoves: StockMove[];
  appointments: Appointment[];
}
