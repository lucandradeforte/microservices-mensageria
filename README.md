# Event-Driven Microservices Demo

This repository contains a working microservices example built with:

- `Order Service` in NestJS
- `Payment Service` in NestJS
- `Notification Service` in .NET 8 Worker Service
- RabbitMQ for asynchronous communication
- PostgreSQL with one database per service

The flow is event-driven:

1. `Order Service` receives `POST /orders` and persists the order.
2. It publishes `order.created`.
3. `Payment Service` consumes `order.created`, persists a payment, and publishes `payment.processed`.
4. `Notification Service` consumes `payment.processed`, persists a notification, and publishes `notification.sent`.
5. `Order Service` consumes `payment.processed` and `notification.sent` to update the order lifecycle.

## Architecture

Each service keeps a simple Clean Architecture shape:

- `domain`: entities and repository contracts
- `application`: DTOs and use cases
- `infrastructure`: PostgreSQL repositories and RabbitMQ consumers/publishers
- `presentation`: HTTP endpoints for the NestJS services

Cross-cutting concerns are shared in [`libs/node-common`](./libs/node-common):

- event contracts
- RabbitMQ topology and retry logic
- JSON logging
- correlation ID context propagation

## Services

### Order Service

- `POST /orders`
- `GET /orders/:id`
- `GET /health`

Sample payload:

```json
{
  "customerEmail": "alice@example.com",
  "amount": 149.90,
  "currency": "USD",
  "processingBehavior": "normal"
}
```

### Payment Service

- `GET /payments/order/:orderId`
- `GET /health`

### Notification Service

- Background worker only
- Persists notifications in its own PostgreSQL database
- Publishes `notification.sent`

## Retry And DLQ

RabbitMQ uses three exchanges:

- `domain.events`
- `domain.retry`
- `domain.dlx`

Each consumer has:

- a main queue
- a retry queue with TTL
- a dead-letter queue

Failures are retried by republishing to `domain.retry`. After the configured retry threshold, the message is republished to `domain.dlx`.

You can simulate behavior from the request payload using `processingBehavior`:

- `normal`
- `payment-transient`
- `payment-permanent`
- `notification-transient`
- `notification-permanent`

Examples:

- `payment-transient`: the payment service fails twice, then succeeds on retry
- `payment-permanent`: the event is routed to the payment DLQ after max retries
- `notification-transient`: the notification worker fails twice, then succeeds
- `notification-permanent`: the notification event is routed to the notification DLQ

## Observability

All services use structured logging and propagate `x-correlation-id`:

- HTTP requests receive or generate a correlation ID
- published events carry the same correlation ID
- consumers restore the correlation ID into their execution context before processing

## Run With Docker Compose

```bash
docker compose up --build
```

RabbitMQ management UI:

- `http://localhost:15672`
- user: `guest`
- password: `guest`

## Demo Requests

After the stack is up:

```bash
bash scripts/demo-requests.sh
```

Or manually:

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: demo-123" \
  -d '{
    "customerEmail": "alice@example.com",
    "amount": 149.90,
    "currency": "USD",
    "processingBehavior": "normal"
  }'
```

Then inspect:

```bash
curl http://localhost:3000/orders/<order-id>
curl http://localhost:3001/payments/order/<order-id>
```

## Local Build Verification

The codebase builds locally with:

```bash
npm run build
dotnet build services/notification-service/NotificationService/NotificationService.csproj
```

## Repository Structure

```text
.
├── docker-compose.yml
├── libs
│   └── node-common
├── services
│   ├── order-service
│   ├── payment-service
│   └── notification-service
└── scripts
```
