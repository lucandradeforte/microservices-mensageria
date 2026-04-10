import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post } from '@nestjs/common';

import { CreateOrderDto } from '../../application/dto/create-order.dto';
import { CreateOrderUseCase } from '../../application/use-cases/create-order.use-case';
import { GetOrderUseCase } from '../../application/use-cases/get-order.use-case';

@Controller()
export class OrderController {
  public constructor(
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly getOrderUseCase: GetOrderUseCase,
  ) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  public health(): { status: string } {
    return {
      status: 'ok',
    };
  }

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  public async createOrder(@Body() body: CreateOrderDto) {
    return this.createOrderUseCase.execute(body);
  }

  @Get('orders/:id')
  public async getOrder(@Param('id') orderId: string) {
    const order = await this.getOrderUseCase.execute(orderId);

    if (!order) {
      throw new NotFoundException(`Order ${orderId} was not found`);
    }

    return order;
  }
}

