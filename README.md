# CUARENTA

CRM/POS para asesores comerciales: ventas por catálogo de productos, gestión de clientes (con importación desde la agenda del teléfono), fiados y reportes. Construido con Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma + PostgreSQL/SQLite, Zustand con persistencia offline en IndexedDB y soporte PWA.

## Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + componentes estilo shadcn/ui (Radix UI + class-variance-authority).
- **Backend**: Next.js Server Actions.
- **Base de datos**: PostgreSQL vía Prisma ORM.
- **Estado y offline-first**: Zustand con persistencia en IndexedDB (`src/store`), cola de ventas pendientes que se sincroniza automáticamente al recuperar conexión.
- **PWA**: manifest + service worker (`public/sw.js`) con estrategia network-first para navegación y cache-first para estáticos.
- **Lectura de documentos (OCR)**: Google Cloud Vision (`documentTextDetection`) más un parser propio por heurísticas/regex (`src/lib/vision`).

## Lectura automática de facturas y notas de venta

En `/documentos` (enlace desde Caja) el usuario elige el tipo de documento, toma o sube una foto, y el sistema extrae los datos con OCR para que los valide antes de guardar.

Flujo:

1. **Captura** — el tipo de documento es obligatorio antes de procesar. La imagen se reescala en el navegador a 2576 px de borde largo (suficiente para el OCR y por debajo del límite de 8 MB por petición) y se recodifica a JPEG, lo que también normaliza formatos como HEIC de iPhone.
2. **Extracción** — `extractScan` envía la imagen a Cloud Vision, que devuelve el texto reconocido. `parseInvoiceText` (en `src/lib/vision/parseInvoice.ts`, puro y testeable sin credenciales) lo convierte a `ParsedInvoice`. La respuesta se guarda como `DocumentScan` en estado `DRAFT`.
3. **Validación humana** — todos los campos y las líneas de detalle son editables. Se muestra una cobertura de lectura (`parseCoverage` cuenta cuántos campos clave se reconocieron, no es una confianza del modelo) y se advierte si la suma del detalle no cuadra con el total impreso.
4. **Confirmación** — `confirmScan` escribe en las tablas canónicas: una `Transaction` (`INCOME` para nota de venta, `EXPENSE` para factura de proveedor), el `Contact` de la contraparte (reutilizado si ya existe) y una `Debt` si el pago es a crédito.

### Vinculación con inventario

Cada línea del borrador tiene un buscador para vincularla, opcionalmente, con un producto del catálogo:

- **Vinculada** → al confirmar, el stock del producto se ajusta: suma en una factura de proveedor, resta en una nota de venta. La vista previa muestra el cambio (`Stock 50 → 60`) antes de guardar y advierte si dejaría el stock en negativo.
- **Sin vincular** → la línea queda solo como registro contable, sin tocar inventario.
- **`+ Crear nuevo producto`** → abre un diálogo prellenado con la descripción, el costo y la cantidad leídos; solo hay que escribir el precio de venta. El producto se crea con ese stock inicial y la línea queda marcada `stockPreapplied`, para que al confirmar **no** se sumen las mismas unidades otra vez.

Los vínculos se guardan en el momento de elegirlos, no al confirmar. Esto no es solo comodidad: el flag `stockPreapplied` es lo único que evita el doble conteo, y si viviera únicamente en el estado del componente, salir de la página y volver a vincular a mano duplicaría el stock.

### Detalles de diseño relevantes

- **No hay tablas `ventas` / `compras_proveedores` separadas.** Los documentos confirmados entran a `Transaction`, que es lo que ya alimentan Caja, Reportes y Fiados; una tabla paralela dejaría los escaneos fuera de esos cálculos. Para distinguirlos se consulta `Transaction.type` junto a `DocumentScan.docType`.
- **Las líneas no crean `SaleItem`.** Se guardan en `DocumentScanItem`, que admite descripciones libres y un `productId` opcional. Crear `SaleItem` haría que un documento con solo algunas líneas vinculadas distorsionara los márgenes de Reportes.
- **Los borradores se pueden retomar.** Si se sale de la página a medio revisar, el borrador aparece en la lista como «Borrador · continuar» y se recarga —con sus vínculos— sin volver a pagar la extracción.
- **La imagen se borra al resolver el borrador.** Se archiva en `.data/scans/` (fuera de `public/`) mientras el borrador está pendiente y se elimina al confirmar o descartar, así que el disco no crece. Contrapartida: después de confirmar ya no se puede re-verificar una línea contra la foto original; quedan el JSON extraído y las líneas.
- Mientras el borrador existe, la imagen se sirve solo por `/api/scans/[id]/image`, que valida sesión y pertenencia al negocio.

### Configuración del OCR

| Variable | Descripción |
| --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Ruta al JSON de la cuenta de servicio de Google Cloud. Sin ella, en producción `/documentos` muestra un aviso y desactiva el procesado; en desarrollo entra en modo de prueba (abajo). |
| `VISION_MOCK` | `"off"` (también `"false"`, `"0"`, `"no"`) desactiva el modo de prueba en desarrollo, para ver el error real de credenciales. |

> La ruta se valida con `existsSync()` desde la raíz del proyecto. Si apunta a un archivo que no existe, la app **no** avisa con un error: cae en modo de prueba. Si ves el banner azul teniendo credenciales, lo primero que hay que revisar es el nombre del archivo (en Windows es fácil terminar con `.json.json`).

La capa gratuita de Cloud Vision cubre 1000 páginas al mes.

### Modo de prueba (sin cuenta de Google)

En desarrollo, si `GOOGLE_APPLICATION_CREDENTIALS` está vacía, `extractInvoiceFields` no llama a la API: registra `[DEV] Credenciales de Google no encontradas...`, espera 2 s para emular la latencia y devuelve una factura simulada de un proveedor de insumos de panadería (harina al 0%, levadura y manteca al 15%, con los subtotales, el IVA y el total cuadrados). Así se puede probar el borrador, la vinculación con inventario, el alta rápida de productos y el registro en Caja sin credenciales. `/documentos` lo anuncia con un banner azul.

`getVisionMode()` nunca devuelve `mock` cuando `NODE_ENV === "production"`: un despliegue al que se le olvide la credencial debe fallar visiblemente, no contabilizar una factura falsa. Ojo: la lectura es simulada, pero **lo que se confirma se guarda de verdad** (Transaction, contacto y stock).

**Límites del parseo por regex.** Los encabezados y totales son robustos porque el documento los etiqueta ("RUC", "IVA", "VALOR TOTAL"). El detalle de ítems es el punto débil: el OCR entrega texto plano sin estructura de tabla, así que el parser asume el orden `cantidad | descripción | precio unitario | total` y descarta una fila si su aritmética no cuadra (±2%), lo que evita confundir direcciones o el bloque de totales con productos. Una factura con otro orden de columnas devolverá `items: []` y el resto de campos sí llenos.

Dos campos quedan vacíos por naturaleza del OCR: el **receptor** (el texto plano no permite distinguir con fiabilidad las dos partes, así que en una nota de venta hay que escribir el cliente a mano) y el **número de autorización**.

## Requisitos previos

- Node.js 18.18+ (recomendado 20+)
- Una base de datos PostgreSQL (local, [Supabase](https://supabase.com) o [Neon](https://neon.tech))

## Configuración

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia el archivo de variables de entorno y ajusta `DATABASE_URL`:

   ```bash
   cp .env.example .env
   ```

3. Para habilitar la lectura de documentos por foto, crea una cuenta de servicio en Google Cloud con la API de Cloud Vision activada y el rol *Cloud Vision AI Service Agent*, descarga su clave JSON a la raíz del proyecto y apunta `.env` a ella:

   ```
   GOOGLE_APPLICATION_CREDENTIALS="./google-credentials.json"
   ```

   El archivo está en `.gitignore` (`google-credentials*.json`), no lo subas al repositorio. Sin esta credencial el resto de la app funciona con normalidad; solo `/documentos` mostrará un aviso pidiendo configurarla.

4. Aplica el esquema y genera el cliente de Prisma:

   ```bash
   npm run db:migrate
   ```

5. (Opcional) Carga datos de ejemplo — crea el usuario `demo@treinta.local` / contraseña `demo1234`:

   ```bash
   npm run db:seed
   ```

6. Levanta el servidor de desarrollo:

   ```bash
   npm run dev
   ```

   Abre [http://localhost:3000](http://localhost:3000). Si no ejecutaste el seed, regístrate desde `/register` para crear tu propio negocio.

## Scripts disponibles

| Script              | Descripción                                      |
| ------------------- | ------------------------------------------------- |
| `npm run dev`        | Servidor de desarrollo Next.js                    |
| `npm run build`      | Build de producción                               |
| `npm run start`      | Sirve el build de producción                      |
| `npm run lint`       | Linter                                            |
| `npm run db:migrate` | Aplica migraciones de Prisma (`migrate dev`)      |
| `npm run db:push`    | Sincroniza el esquema sin generar migración       |
| `npm run db:seed`    | Carga datos de ejemplo                            |
| `npm run db:studio`  | Abre Prisma Studio                                 |

## Estructura del proyecto

```
prisma/schema.prisma        Modelos: User, Business, CashRegister, Category, Product,
                             ProductVariant, Recipe, Transaction, SaleItem, Contact,
                             Debt, DebtPayment
src/lib/actions/            Server Actions (caja, inventario, contactos, deudas, reportes, auth)
src/lib/session.ts          Sesión (cookie) y negocio activo del usuario autenticado
src/store/useStore.ts       Estado global Zustand + persistencia IndexedDB + cola offline
src/app/(app)/              Rutas protegidas: / (caja), /inventario, /deudas, /contactos, /reportes
src/app/login, /register    Autenticación
src/components/             Componentes UI por módulo (caja, inventario, deudas, contactos, reportes, ui)
public/manifest.json, sw.js Configuración PWA
```

## Notas de la arquitectura offline-first

- Las ventas/movimientos se registran vía `queueSale` en el store: si hay conexión se sincronizan de inmediato contra el servidor; si no, quedan en `pendingSales` (persistido en IndexedDB) y se reintentan automáticamente cuando el navegador vuelve a estar en línea (`OnlineSyncProvider`).
- El resto de catálogos (productos, categorías, contactos) se hidratan desde el servidor en cada carga y se cachean en IndexedDB para lectura sin conexión.
- La impresión térmica usa Web Bluetooth (ESC/POS) — disponible en Chrome/Android; la compatibilidad depende del modelo de impresora.
- El escáner de código de barras usa la `BarcodeDetector` API del navegador (Chrome/Android); si no está disponible, se puede ingresar el código manualmente.

## Despliegue

Cualquier proveedor compatible con Next.js (Vercel, etc.) funciona. Asegúrate de configurar `DATABASE_URL` y `SESSION_SECRET` como variables de entorno y de ejecutar `npx prisma migrate deploy` durante el build/despliegue.
