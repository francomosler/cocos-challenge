# Cocos Challenge Backend

API REST para gestión de portfolio, búsqueda de activos y envío de órdenes al mercado.

## Stack

- **Node.js** + **TypeScript**
- **NestJS** — framework con inyección de dependencias y arquitectura modular
- **Prisma 7** — ORM con driver adapter para PostgreSQL (`@prisma/adapter-pg`)
- **class-validator** — validación de DTOs con decoradores
- **Jest** — tests funcionales unitarios
- **PostgreSQL** — base de datos (Neon)

## Requisitos

- Node.js >= 20.x
- PostgreSQL (la DB ya está provista en Neon)

## Instalación y ejecución

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con la URL de la base de datos

# 3. Generar el cliente Prisma
npx prisma generate

# 4. Iniciar la aplicación
npm run start:dev

# La API estará disponible en http://localhost:3000
```

## Endpoints

### GET /portfolio/:userId

Devuelve el portfolio completo del usuario: valor total de la cuenta, pesos disponibles y listado de posiciones.

**Respuesta:**

```json
{
  "totalAccountValue": 904784,
  "availableCash": 753000,
  "positions": [
    {
      "instrumentId": 47,
      "ticker": "PAMP",
      "name": "Pampa Holding S.A.",
      "quantity": 40,
      "lastPrice": 925.85,
      "marketValue": 37034,
      "dailyReturn": 0.44
    }
  ]
}
```

### GET /instruments/search?q=term

Busca instrumentos por ticker o nombre (case insensitive, búsqueda parcial).

**Respuesta:**

```json
[
  {
    "id": 47,
    "ticker": "PAMP",
    "name": "Pampa Holding S.A.",
    "type": "ACCIONES",
    "lastPrice": 925.85,
    "dailyReturn": 0.44
  }
]
```

### POST /orders

Envía una orden de compra o venta al mercado.

**Request body:**

| Campo        | Tipo   | Requerido  | Descripción                                          |
| ------------ | ------ | ---------- | ---------------------------------------------------- |
| userId       | number | Sí         | ID del usuario                                       |
| instrumentId | number | Sí         | ID del instrumento                                   |
| side         | string | Sí         | `BUY` o `SELL`                                       |
| type         | string | Sí         | `MARKET` o `LIMIT`                                   |
| quantity     | number | Condicional| Cantidad exacta de acciones (o usar `amount`)        |
| amount       | number | Condicional| Monto en pesos (calcula cantidad máxima de acciones) |
| price        | number | LIMIT only | Precio límite (requerido para órdenes LIMIT)         |

**Reglas:**
- Se debe enviar `quantity` **o** `amount`, no ambos.
- Si se envía `amount`, se calcula `quantity = floor(amount / price)`. No se admiten fracciones.
- Órdenes MARKET usan el último precio de cierre y se ejecutan como FILLED.
- Órdenes LIMIT requieren `price` y se guardan como NEW.
- Si los fondos (compra) o acciones (venta) son insuficientes, la orden se guarda como REJECTED.

### PATCH /orders/:id/cancel

Cancela una orden. Solo funciona con órdenes en estado NEW.

## Tests

```bash
# Ejecutar tests
npm test

# Tests con cobertura
npm run test:cov
```

Se incluyen 14 tests funcionales sobre `OrdersService`:
- Orden MARKET BUY se ejecuta como FILLED
- Orden MARKET SELL se ejecuta como FILLED
- Orden LIMIT BUY se guarda como NEW
- BUY sin fondos suficientes queda REJECTED
- SELL sin acciones suficientes queda REJECTED
- Cálculo de cantidad desde monto (sin fracciones)
- Validación: requiere quantity o amount
- Validación: no admite quantity y amount simultáneamente
- Validación: usuario inexistente
- Validación: instrumento inexistente
- Validación: no permite operar instrumentos tipo MONEDA
- Cancelación exitosa de orden NEW
- Cancelación rechazada para orden inexistente
- Cancelación rechazada para orden no-NEW

## Colección de requests

El archivo `cocos-challenge.postman_collection.json` contiene ejemplos para todos los endpoints, organizados por categoría (Portfolio, Search Instruments, Orders, Cancel Order, Validation Errors). Se puede importar directamente en [Postman](https://www.postman.com/) o en cualquier cliente compatible.

## Decisiones de diseño

### Arquitectura modular

La aplicación sigue el patrón de NestJS con módulos independientes (`PortfolioModule`, `InstrumentsModule`, `OrdersModule`) y un `PrismaModule` global compartido. Cada módulo tiene su controller y service separados.

### Concurrencia: Advisory Locks por usuario

Para prevenir race conditions al procesar órdenes concurrentes del mismo usuario (ej: dos BUY que pasan validación de fondos al mismo tiempo), se utiliza `pg_advisory_xact_lock(userId)` dentro de una transacción de PostgreSQL.

Esto serializa las operaciones por usuario sin bloquear a otros usuarios, y el lock se libera automáticamente al finalizar la transacción.

```
BEGIN TRANSACTION
  → pg_advisory_xact_lock(userId)    -- serializa por usuario
  → calcular balance desde orders    -- nadie más puede entrar para este userId
  → validar fondos/acciones
  → INSERT orden
COMMIT                               -- lock se libera
```

### Cálculo de balance desde órdenes (fuente de verdad)

El saldo de pesos y las posiciones se calculan siempre desde las órdenes en estado FILLED. No se mantiene un saldo en caché ni una tabla separada de balances. Las órdenes en estado CANCELLED y REJECTED no afectan el cálculo.

Fórmula de cash disponible:
- `+size * price` para CASH_IN
- `-size * price` para CASH_OUT
- `-size * price` para BUY
- `+size * price` para SELL

### Rendimiento diario

Se calcula como `((close - previousClose) / previousClose) * 100` usando los datos más recientes de `marketdata`.

### No se modificó el schema de la base de datos

Se respetó la estructura original de tablas provista en el challenge. No se agregaron tablas ni columnas adicionales.

### Prisma 7 con Driver Adapter

Se utiliza `@prisma/adapter-pg` para la conexión directa a PostgreSQL, siguiendo las convenciones de Prisma 7 donde la URL de la base de datos se maneja en el código (no en el schema).
