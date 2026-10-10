# Pendientes

Lo que falta en la base de datos, con el porqué. Van en el repo a propósito: la
versión anterior de estas notas vivía suelta en la carpeta y se perdió con ella.

## 1. Aplicar los índices compuestos a la base

Ya están en `prisma/schema.prisma`, pero **todavía no están en Neon**. Crear un
índice toca la base de producción, así que la decisión es tuya:

```bash
npx prisma db push
```

Qué cambia: `Transaction` gana `@@index([businessId, createdAt])` y
`@@index([businessId, type, createdAt])`. Caja y Reportes filtran por negocio
**y** por rango de fechas en la misma consulta; con los índices sueltos que
había, Postgres solo podía aprovechar uno. Es aditivo y reversible —ningún dato
se toca—, y con 13 movimientos no se va a notar, pero sí cuando sean miles.

Después vale la pena medirlo de verdad, no suponerlo:

```sql
EXPLAIN ANALYZE
SELECT * FROM transactions
WHERE "businessId" = '...' AND "createdAt" >= now() - interval '30 days';
```

## 2. Pasar de `db push` a migraciones versionadas

No existe `prisma/migrations/`: el esquema siempre se ha sincronizado con
`db push`, que aplica cambios sin dejar historial. Sobre una base con datos
reales eso significa que no hay forma de saber qué cambió ni de revertirlo, y
que un `push` puede proponer borrar una columna sin dejar rastro.

Para adoptar migraciones sin reaplicar nada de lo que ya existe:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > migracion-inicial.sql
```

Guardarla como `prisma/migrations/0_init/migration.sql`, marcarla como ya
aplicada con `prisma migrate resolve --applied 0_init`, y de ahí en adelante
usar `migrate dev` en local y `migrate deploy` en el despliegue.

## 3. Una base de desarrollo aparte de la de producción

`DATABASE_URL` apunta a la misma base que usa el negocio. Eso impide probar
cualquier cosa sin escribir datos falsos en los libros reales, y es lo que ha
impedido verificar varias pantallas de punta a punta.

Neon permite crear una *branch* de la base: copia instantánea, sin costo extra.
Esa va en el `.env` local; la principal queda solo para producción. Con
`prisma/seed.ts` adaptado para poblarla —productos, clientes y transacciones
repartidas en varios meses— los gráficos de Reportes por fin se pueden revisar
con datos.

## 4. Sobras de la etapa SQLite

`prisma/dev.db` quedó de cuando el proyecto no usaba Postgres. Ya no lo lee
nadie; se puede borrar.
