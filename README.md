# CUARENTA

CRM/POS para asesores comerciales: ventas por catálogo de productos, gestión de clientes (con importación desde la agenda del teléfono), fiados y reportes. Construido con Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma + PostgreSQL/SQLite, Zustand con persistencia offline en IndexedDB y soporte PWA.

## Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + componentes estilo shadcn/ui (Radix UI + class-variance-authority).
- **Backend**: Next.js Server Actions.
- **Base de datos**: PostgreSQL vía Prisma ORM.
- **Estado y offline-first**: Zustand con persistencia en IndexedDB (`src/store`), cola de ventas pendientes que se sincroniza automáticamente al recuperar conexión.
- **PWA**: manifest + service worker (`public/sw.js`) con estrategia network-first para navegación y cache-first para estáticos.
- **Lectura de documentos**: API de Gemini vía el SDK oficial `@google/genai`, con salida estructurada obligatoria (`src/lib/vision`).

## Lectura automática de facturas y notas de venta

En `/documentos` (enlace desde Caja) el usuario elige el tipo de documento, toma o sube una foto, y el sistema extrae los datos con OCR para que los valide antes de guardar.

Flujo:

1. **Captura** — el tipo de documento es obligatorio antes de procesar. La imagen se reescala en el navegador a 2576 px de borde largo (suficiente para el OCR y por debajo del límite de 8 MB por petición) y se recodifica a JPEG, lo que también normaliza formatos como HEIC de iPhone.
2. **Extracción** — `extractScan` envía la imagen a Gemini con un `responseSchema`, que obliga al modelo a devolver exactamente la forma de `ParsedInvoice`: la API no le deja contestar con prosa ni envolver el JSON en un bloque de código. La respuesta se valida con Zod y se guarda como `DocumentScan` en estado `DRAFT`.
3. **Validación humana** — todos los campos y las líneas de detalle son editables. Se muestra una cobertura de lectura (`parseCoverage` cuenta cuántos campos clave llegaron llenos, no es una confianza del modelo) y se advierte si la suma del detalle no cuadra con el total impreso.
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
- **El comprobante se guarda comprimido, dentro de la fila.** El navegador genera dos copias de la foto: una grande, que va al modelo y se descarta, y un respaldo de ~150 KB que se archiva como data URI en `DocumentScan.receiptDataUrl`. Va en la base y no en disco porque en Vercel el sistema de archivos es efímero: un archivo escrito ahí se pierde en el siguiente despliegue. El respaldo sobrevive a la confirmación, así que una línea siempre se puede re-verificar contra la foto.
- La imagen se sirve solo por `/api/scans/[id]/image`, que valida sesión y pertenencia al negocio. Nunca viaja junto a la lista de movimientos: son ~200 KB de Base64 por fila y Caja carga hasta 200.
- Si el respaldo pasa de 400 KB, el servidor prefiere no guardarlo antes que engordar la tabla, y el escáner lo avisa.

### Configuración de la lectura

| Variable | Descripción |
| --- | --- |
| `GEMINI_API_KEY` | Clave de la API de Gemini, gratuita y sin tarjeta desde [Google AI Studio](https://aistudio.google.com/apikey). Sin ella, en producción `/documentos` muestra un aviso y desactiva el procesado; en desarrollo entra en modo de prueba (abajo). |
| `GEMINI_MODEL` | Modelo a usar. Opcional: por defecto `gemini-flash-latest`. |
| `VISION_MOCK` | `"off"` (también `"false"`, `"0"`, `"no"`) desactiva el modo de prueba en desarrollo, para ver el error real de credenciales. |

> El valor por defecto es un alias a propósito. Aquí ya se quemaron dos modelos clavados a mano: primero `gemini-1.5-flash`, cuando la serie 1.5 quedó fuera de alcance para los proyectos nuevos, y después `gemini-2.5-flash`, que una clave recién creada ya no alcanza. Cada retiro dejó la lectura muerta con un 404 hasta tocar el código; `gemini-flash-latest` sigue al flash vigente y sobrevive al siguiente.

**Cuánto tarda.** Entre 20 y 30 segundos por factura, y más si Google devuelve 503 por saturación, cosa que pasa con frecuencia en la ruta de visión. La lectura reintenta sola dos veces antes de rendirse. Por eso `/documentos` declara `maxDuration = 300`: con el límite por defecto de Vercel (10 s) el proceso se cortaría siempre. En el plan Hobby Vercel recorta ese techo a 60 s, así que una lectura con reintentos puede quedarse corta; en Pro hay margen de sobra.

A diferencia de Cloud Vision, la API de Gemini tiene capa gratuita real: no hace falta habilitar facturación ni registrar una tarjeta.

### Modo de prueba (sin clave)

En desarrollo, si `GEMINI_API_KEY` está vacía, `extractInvoiceFields` no llama a la API: registra `[DEV] Falta GEMINI_API_KEY...`, espera 2 s para emular la latencia y devuelve una factura simulada de un proveedor de insumos de panadería (harina al 0%, levadura y manteca al 15%, con los subtotales, el IVA y el total cuadrados). Así se puede probar el borrador, la vinculación con inventario, el alta rápida de productos y el registro en Caja sin darse de alta en ningún lado. `/documentos` lo anuncia con un banner azul.

`getVisionMode()` nunca devuelve `mock` cuando `NODE_ENV === "production"`: un despliegue al que se le olvide la clave debe fallar visiblemente, no contabilizar una factura falsa. Ojo: la lectura es simulada, pero **lo que se confirma se guarda de verdad** (Transaction, contacto y stock).

**Qué esperar del modelo.** Al leer la imagen directamente, y no un volcado de texto plano, el detalle de ítems ya no depende de adivinar el orden de las columnas: Gemini reconoce la tabla. A cambio, un modelo puede equivocarse de formas que un parser por regex no: leer mal un dígito o rellenar un campo que no está impreso. Por eso el prompt insiste en devolver `null` antes que inventar, la temperatura es 0, y la pantalla de validación humana sigue siendo obligatoria.

Dos campos quedan vacíos a propósito: el **receptor** (una foto no permite distinguir con fiabilidad las dos partes, así que en una nota de venta hay que escribir el cliente a mano) y el **número de autorización**.

## Interfaz

Pensada para un teléfono en la mano y, muchas veces, de noche.

- **Tema claro, oscuro o automático**, con el selector en la barra superior. La preferencia se guarda en el navegador y un script en línea la aplica antes del primer pintado, así que no hay fogonazo blanco al cargar en oscuro. «Automático» sigue al sistema y reacciona si cambia mientras la app está abierta.
- **Esqueletos de carga por ruta** en vez de un spinner: conservan la silueta de la pantalla, así que nada salta de sitio cuando llegan los datos.
- **Respuesta al toque** en filas, tarjetas y navegación, con una vibración corta donde el navegador la permite, y pastilla que marca la sección activa en la barra inferior.
- **Saldos animados** en Caja: al registrar una venta el número sube a la vista en lugar de cambiar de golpe.
- **Estados vacíos con salida**, que distinguen «todavía no hay nada» de «los filtros no encontraron nada» y ofrecen la acción correspondiente.
- Todo lo anterior respeta `prefers-reduced-motion`: si el sistema pide menos movimiento, las animaciones se desactivan.

Los colores viven como tokens en `globals.css` (`--primary`, `--warning-surface`, `--chart-income`…), nunca escritos a mano en los componentes: así el par claro/oscuro se decide en un solo sitio y nada se queda en blanco al cambiar de tema.

Las fechas se formatean siempre con `formatDateTime` (`src/lib/datetime.ts`), fijado a la zona del negocio. No es cosmético: estos textos se pintan en componentes de cliente que Next también renderiza en el servidor, y en un host que corre en UTC un `toLocaleString` sin zona produce dos valores distintos para el mismo dato, lo que rompe la hidratación y muestra la hora corrida cinco horas.

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

3. Para habilitar la lectura de documentos por foto, crea una clave gratuita en [Google AI Studio](https://aistudio.google.com/apikey) —no pide tarjeta ni habilitar facturación— y pégala en `.env`:

   ```
   GEMINI_API_KEY="AIza..."
   ```

   `.env` está en `.gitignore`, no lo subas al repositorio. Sin esta clave el resto de la app funciona con normalidad; solo `/documentos` mostrará un aviso pidiendo configurarla.

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
src/app/(app)/              Rutas protegidas: / (caja), /inventario, /cuentas-por-cobrar,
                             /cuentas-por-pagar, /contactos, /reportes
src/app/login, /register    Autenticación
src/components/             Componentes UI por módulo (caja, inventario, cuentas, contactos, reportes, ui)
public/manifest.json, sw.js Configuración PWA
```

## Notas de la arquitectura offline-first

- Las ventas/movimientos se registran vía `queueSale` en el store: si hay conexión se sincronizan de inmediato contra el servidor; si no, quedan en `pendingSales` (persistido en IndexedDB) y se reintentan automáticamente cuando el navegador vuelve a estar en línea (`OnlineSyncProvider`).
- El resto de catálogos (productos, categorías, contactos) se hidratan desde el servidor en cada carga y se cachean en IndexedDB para lectura sin conexión.
- La impresión térmica usa Web Bluetooth (ESC/POS) — disponible en Chrome/Android; la compatibilidad depende del modelo de impresora.
- El escáner de código de barras usa la `BarcodeDetector` API del navegador (Chrome/Android); si no está disponible, se puede ingresar el código manualmente.

## Despliegue

Cualquier proveedor compatible con Next.js (Vercel, etc.) funciona. Asegúrate de configurar `DATABASE_URL` y `SESSION_SECRET` como variables de entorno y de ejecutar `npx prisma migrate deploy` durante el build/despliegue.
