import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { Order, OrderPrimitives } from '../../domain/entities/order.entity';
import { OrderRepository } from '../../domain/repositories/order.repository';

export const ORDER_DB_POOL = Symbol('ORDER_DB_POOL');

@Injectable()
export class PostgresOrderRepository extends OrderRepository {
  public constructor(@Inject(ORDER_DB_POOL) private readonly pool: Pool) {
    super();
  }

  public async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY,
        customer_email TEXT NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        status VARCHAR(20) NOT NULL,
        processing_behavior VARCHAR(40) NOT NULL,
        payment_id UUID NULL,
        notification_id UUID NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
    `);
  }

  public async save(order: Order): Promise<void> {
    const data = order.toPrimitives();

    await this.pool.query(
      `
        INSERT INTO orders (
          id,
          customer_email,
          amount,
          currency,
          status,
          processing_behavior,
          payment_id,
          notification_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          customer_email = EXCLUDED.customer_email,
          amount = EXCLUDED.amount,
          currency = EXCLUDED.currency,
          status = EXCLUDED.status,
          processing_behavior = EXCLUDED.processing_behavior,
          payment_id = EXCLUDED.payment_id,
          notification_id = EXCLUDED.notification_id,
          updated_at = EXCLUDED.updated_at;
      `,
      [
        data.id,
        data.customerEmail,
        data.amount,
        data.currency,
        data.status,
        data.processingBehavior,
        data.paymentId,
        data.notificationId,
        data.createdAt,
        data.updatedAt,
      ],
    );
  }

  public async findById(id: string): Promise<Order | null> {
    const result = await this.pool.query<OrderPrimitives>(
      `
        SELECT
          id,
          customer_email AS "customerEmail",
          amount::float8 AS amount,
          currency,
          status,
          processing_behavior AS "processingBehavior",
          payment_id AS "paymentId",
          notification_id AS "notificationId",
          created_at::text AS "createdAt",
          updated_at::text AS "updatedAt"
        FROM orders
        WHERE id = $1;
      `,
      [id],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return Order.fromPrimitives(result.rows[0]);
  }
}

