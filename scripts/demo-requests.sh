#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
CORRELATION_ID="${CORRELATION_ID:-demo-$(date +%s)}"

echo "Creating happy-path order..."
curl -sS \
  -X POST "$BASE_URL/orders" \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: ${CORRELATION_ID}" \
  -d '{
    "customerEmail": "alice@example.com",
    "amount": 149.90,
    "currency": "USD",
    "processingBehavior": "normal"
  }'

echo
echo
echo "Creating transient notification failure example..."
curl -sS \
  -X POST "$BASE_URL/orders" \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: ${CORRELATION_ID}-transient" \
  -d '{
    "customerEmail": "bruno@example.com",
    "amount": 89.50,
    "currency": "USD",
    "processingBehavior": "notification-transient"
  }'

echo
echo
echo "Creating permanent payment failure example that ends in the DLQ..."
curl -sS \
  -X POST "$BASE_URL/orders" \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: ${CORRELATION_ID}-dlq" \
  -d '{
    "customerEmail": "carol@example.com",
    "amount": 42.00,
    "currency": "USD",
    "processingBehavior": "payment-permanent"
  }'

echo
echo
echo "Use GET /orders/{id} and GET http://localhost:3001/payments/order/{orderId} to inspect state."

