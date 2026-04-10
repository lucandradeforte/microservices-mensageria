import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { Payment, PaymentPrimitives } from '../../domain/entities/payment.entity';
import { PaymentRepository } from '../../domain/repositories/payment.repository';

export const PAYMENT_DB_POOL = Symbol('PAYMENT_DB_POOL');

@Injectable()
export class PostgresPaymentRepository extends PaymentRepository {
  public constructor(@Inject(PAYMENT_DB_POOL) private readonly pool: Pool) {
    super();
  }

  public async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY,
        order_id UUID NOT NULL UNIQUE,
        customer_email TEXT NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        status VARCHAR(20) NOT NULL,
        processing_behavior VARCHAR(40) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
    `);
  }

  public async save(payment: Payment): Promise<void> {
    const data = payment.toPrimitives();

    await this.pool.query(
      `
        INSERT INTO payments (
          id,
          order_id,
          customer_email,
          amount,
          currency,
          status,
          processing_behavior,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (order_id) DO UPDATE SET
          customer_email = EXCLUDED.customer_email,
          amount = EXCLUDED.amount,
          currency = EXCLUDED.currency,
          status = EXCLUDED.status,
          processing_behavior = EXCLUDED.processing_behavior,
          updated_at = EXCLUDED.updated_at;
      `,
      [
        data.id,
        data.orderId,
        data.customerEmail,
        data.amount,
        data.currency,
        data.status,
        data.processingBehavior,
        data.createdAt,
        data.updatedAt,
      ],
    );
  }

  public async findByOrderId(orderId: string): Promise<Payment | null> {
    const result = await this.pool.query<PaymentPrimitives>(
      `
        SELECT
          id,
          order_id AS "orderId",
          customer_email AS "customerEmail",
          amount::float8 AS amount,
          currency,
          status,
          processing_behavior AS "processingBehavior",
          created_at::text AS "createdAt",
          updated_at::text AS "updatedAt"
        FROM payments
        WHERE order_id = $1;
      `,
      [orderId],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return Payment.fromPrimitives(result.rows[0]);
  }
}

