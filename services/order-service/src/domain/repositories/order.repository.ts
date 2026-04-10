import { Order } from '../entities/order.entity';

export abstract class OrderRepository {
  public abstract ensureSchema(): Promise<void>;
  public abstract save(order: Order): Promise<void>;
  public abstract findById(id: string): Promise<Order | null>;
}

