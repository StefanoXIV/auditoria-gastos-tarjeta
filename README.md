# Auditoría de gastos de tarjeta de crédito

App web gratuita y 100% en el navegador (sin backend, sin login, sin costos) para categorizar los gastos de tu tarjeta de crédito y proyectar cuánto vas a pagar en cuotas los próximos meses.

**Tus datos nunca salen de tu computadora**: el archivo que subes se procesa localmente con JavaScript; no hay ningún servidor que reciba esa información.

## Uso

1. Exporta el resumen de tu tarjeta como CSV o Excel desde el homebanking de tu banco.
2. Abre `index.html` (o la URL publicada) y sube el archivo.
3. Confirma qué columna corresponde a Fecha, Descripción y Monto (la app intenta adivinarlo).
4. Click en "Procesar gastos" para ver:
   - El resumen del mes por categoría.
   - La proyección de cuotas activas para los próximos meses.
5. Los gastos sin categoría automática se pueden asignar manualmente — la próxima vez que subas un resumen con el mismo comercio, se va a categorizar solo.
6. En "Gestionar categorías" puedes agregar, editar o borrar categorías y sus palabras clave.

## Cómo funciona la categorización

Cada categoría tiene una lista de palabras clave (ej. "coto", "netflix"). Si la descripción del gasto contiene alguna palabra clave, se asigna esa categoría. Se puede editar la lista libremente desde la UI. Las categorías y las asignaciones manuales se guardan en el `localStorage` del navegador (quedan solo en tu dispositivo).

## Cómo funciona la detección de cuotas

Se buscan patrones típicos en la descripción del gasto: `CUOTA 03/12`, `C.03/12`, `(3/12)`, o una columna dedicada de cuotas si tu banco la exporta. A partir de la cuota actual y el total, se proyecta el monto restante mes a mes.

## Despliegue (para tener una URL propia, gratis)

Esta es una app estática (`index.html` + `style.css` + `app.js` + `categories.js`), no requiere build ni backend. Se puede publicar gratis en:

- **GitHub Pages**: crear un repo, subir estos archivos, activar Pages en la configuración del repo.
- **Netlify Drop**: arrastrar la carpeta directamente en https://app.netlify.com/drop, sin necesidad de cuenta de GitHub.

Ninguna opción tiene costo para este uso.
