import { useState, type ChangeEvent } from 'react';
import { getDB, replaceDB, update, useDB } from '../lib/store';
import { dayKey, download, num } from '../lib/utils';
import type { Settings } from '../lib/types';
import { Field, PageHead } from '../components/ui';
import { emptyDB, seedDB } from '../lib/seed';
import { cloudEnabled } from '../lib/cloud';
import Cuenta from '../components/Cuenta';

type ListKey = 'productCategories' | 'serviceCategories' | 'expenseCategories';

export default function Configuracion() {
  const db = useDB();
  const [f, setF] = useState<Settings>(db.settings);
  const [lists, setLists] = useState<Record<ListKey, string>>({
    productCategories: db.settings.productCategories.join('\n'),
    serviceCategories: db.settings.serviceCategories.join('\n'),
    expenseCategories: db.settings.expenseCategories.join('\n'),
  });
  const [saved, setSaved] = useState(false);

  const text = (k: keyof Settings) => ({
    value: String(f[k] ?? ''),
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value }),
  });

  const save = () => {
    const toList = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
    update((d) => {
      d.settings = {
        ...f,
        taxRate: num(f.taxRate),
        nextInvoice: Math.max(1, Math.floor(num(f.nextInvoice))),
        productCategories: toList(lists.productCategories),
        serviceCategories: toList(lists.serviceCategories),
        expenseCategories: toList(lists.expenseCategories),
      };
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const backup = () => {
    download(new Blob([JSON.stringify(getDB(), null, 1)], { type: 'application/json' }), `respaldo-ana-erp-${dayKey()}.json`);
  };
  const restore = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((t) => {
      try {
        const data = JSON.parse(t);
        if (!data.settings || !Array.isArray(data.sales)) throw new Error();
        if (!confirm('Esto reemplazará TODOS los datos actuales con el respaldo. ¿Continuar?')) return;
        replaceDB(data);
        location.reload();
      } catch {
        alert('El archivo no es un respaldo válido.');
      }
    });
    e.target.value = '';
  };
  const reset = (example: boolean) => {
    if (!confirm('Se borrarán TODAS las ventas, compras, gastos, clientes e inventario. Descarga un respaldo antes. ¿Continuar?')) return;
    if (prompt('Escribe BORRAR para confirmar') !== 'BORRAR') return;
    const fresh = example ? seedDB() : emptyDB();
    replaceDB({ ...fresh, settings: { ...db.settings, nextInvoice: 1, nextPurchase: 1 } });
    location.reload();
  };

  return (
    <>
      <PageHead title="Configuración" subtitle="Datos del negocio, facturación, categorías y respaldos.">
        {saved && <span className="badge ok">Guardado ✓</span>}
        <button className="btn primary" onClick={save}>Guardar cambios</button>
      </PageHead>
      <div className="grid g2">
        <div className="card grid">
          <h3>Datos del negocio</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <img src="/brand-art.jpg" alt="Línea gráfica" style={{ width: 110, borderRadius: 12, border: '1px solid var(--line)' }} />
            <div className="small muted">Logo y línea gráfica de Ana Depilaciones. Se usan en facturas, recibos y cierres.</div>
          </div>
          <Field label="Nombre comercial"><input className="input" {...text('businessName')} /></Field>
          <Field label="Eslogan / descripción"><input className="input" {...text('slogan')} /></Field>
          <div className="grid g2">
            <Field label="RNC / Cédula"><input className="input" {...text('rnc')} /></Field>
            <Field label="Teléfono"><input className="input" {...text('phone')} /></Field>
            <Field label="WhatsApp del negocio"><input className="input" {...text('whatsapp')} /></Field>
            <Field label="Instagram"><input className="input" {...text('instagram')} /></Field>
            <Field label="Correo"><input className="input" {...text('email')} /></Field>
            <Field label="Código de país (WhatsApp)"><input className="input" {...text('countryCode')} /></Field>
          </div>
          <Field label="Dirección"><input className="input" {...text('address')} /></Field>
        </div>

        <div className="card grid">
          <h3>Facturación</h3>
          <div className="grid g2">
            <Field label="Moneda"><input className="input" {...text('currency')} /></Field>
            <Field label="Nombre del impuesto"><input className="input" {...text('taxName')} /></Field>
            <Field label="Tasa de impuesto (%)"><input className="input" type="number" {...text('taxRate')} /></Field>
            <Field label="Formato de impresión">
              <select className="input" {...text('receiptFormat')}>
                <option value="80mm">Ticket térmico 80mm</option>
                <option value="carta">Hoja carta</option>
              </select>
            </Field>
            <Field label="Prefijo de factura"><input className="input" {...text('invoicePrefix')} /></Field>
            <Field label="Próximo número"><input className="input" type="number" {...text('nextInvoice')} /></Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={f.pricesIncludeTax} onChange={(e) => setF({ ...f, pricesIncludeTax: e.target.checked })} />
            Los precios ya incluyen el impuesto
          </label>
          <label className="check">
            <input type="checkbox" checked={f.autoPdf} onChange={(e) => setF({ ...f, autoPdf: e.target.checked })} />
            Descargar el PDF automáticamente al cobrar cada venta
          </label>
          <Field label="Mensaje al pie de la factura"><textarea className="input" {...text('footer')} /></Field>
        </div>

        <div className="card grid">
          <h3>Categorías</h3>
          <p className="muted small" style={{ margin: 0 }}>Una por línea.</p>
          <div className="grid g3">
            {([
              ['productCategories', 'Productos'],
              ['serviceCategories', 'Servicios'],
              ['expenseCategories', 'Gastos'],
            ] as [ListKey, string][]).map(([k, l]) => (
              <Field key={k} label={l}>
                <textarea className="input" style={{ minHeight: 170 }} value={lists[k]} onChange={(e) => setLists({ ...lists, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        </div>

        {cloudEnabled && <Cuenta />}

        <div className="card grid">
          <h3>Datos y respaldos</h3>
          <p className="small muted" style={{ margin: 0 }}>
            {cloudEnabled
              ? 'Los datos se sincronizan en la nube y están disponibles en todos los dispositivos con sesión iniciada.'
              : 'Los datos se guardan en este navegador/dispositivo. Descarga un respaldo con frecuencia (por ejemplo, después de cada cierre) y guárdalo en Google Drive o WhatsApp.'}
          </p>
          <div className="btns">
            <button className="btn primary" onClick={backup}>⬇️ Descargar respaldo</button>
            <label className="btn">
              ⬆️ Restaurar respaldo
              <input type="file" accept="application/json,.json" onChange={restore} hidden />
            </label>
          </div>
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
          <div className="small muted">Zona de peligro</div>
          <div className="btns">
            <button className="btn danger" onClick={() => reset(true)}>Reiniciar con catálogo de ejemplo</button>
            <button className="btn danger" onClick={() => reset(false)}>Borrar todo</button>
          </div>
        </div>
      </div>
    </>
  );
}
