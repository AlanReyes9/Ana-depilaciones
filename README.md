# Ana Cosmetics & Depilaciones · ERP

Sistema de gestión para la tienda de cosméticos y el salón de depilación / cuidado de la piel de Ana.

## Módulos

- **Dashboard** – ventas, ingresos cobrados, gastos, utilidad estimada, dinero invertido en productos, valor de venta del inventario, cuentas por cobrar/pagar, gráfico de 14 días, más vendidos y stock bajo.
- **Punto de venta** – servicios y productos, cliente, descuentos, pagos mixtos (efectivo/tarjeta/transferencia), cambio y ventas a crédito.
- **Caja y cierre diario** – apertura con fondo, entradas/salidas, cuadre por método de pago, reporte de cierre impreso o en PDF e historial.
- **Facturas** – búsqueda por fechas/estado, reimpresión, PDF, envío por WhatsApp, anulación (devuelve inventario) y exportación a Excel (CSV).
- **Cobros** – cuentas por cobrar por factura y por cliente, abonos con recibo, recordatorios por WhatsApp e historial.
- **Inventario** – productos (costo, precio, margen, mínimo), servicios, ajustes y kardex de movimientos.
- **Clientes** – historial de visitas, consumo, balance y notas (tipo de piel, alergias…).
- **Compras** – entrada de mercancía, actualización de costos, proveedores y pagos pendientes.
- **Gastos** – por categoría y mes; pueden descontarse del efectivo de la caja.
- **Configuración** – datos del negocio, impuesto (ITBIS), numeración, formato de impresión (ticket 80mm o carta), categorías y respaldos.

## Facturas: imprimir, PDF y WhatsApp

- **Imprimir**: ticket térmico 80mm u hoja carta (configurable).
- **Guardar PDF**: descarga la factura con el logo; opción para descargarla automáticamente en cada venta.
- **WhatsApp**: en el celular comparte el PDF directamente a WhatsApp; en computadora descarga el PDF y abre WhatsApp con el resumen para adjuntarlo.

## Datos

Por defecto los datos se guardan en el navegador del dispositivo. Descarga un respaldo desde **Configuración** con frecuencia.

Para sincronizar varios dispositivos en la nube: ejecuta `supabase/schema.sql` en un proyecto de Supabase, crea un usuario y define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Vercel. El sistema pedirá iniciar sesión.

## Desarrollo

```bash
npm install
npm run dev
npm run build
```
