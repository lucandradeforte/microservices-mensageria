import { Controller, Get, HttpCode, HttpStatus, NotFoundException, Param } from '@nestjs/common';

import { GetPaymentByOrderIdUseCase } from '../../application/use-cases/get-payment-by-order-id.use-case';

@Controller()
export class PaymentController {
  public constructor(private readonly getPaymentByOrderIdUseCase: GetPaymentByOrderIdUseCase) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  public health(): { status: string } {
    return {
      status: 'ok',
    };
  }

  @Get('payments/order/:orderId')
  public async getByOrderId(@Param('orderId') orderId: string) {
    const payment = await this.getPaymentByOrderIdUseCase.execute(orderId);

    if (!payment) {
      throw new NotFoundException(`Payment for order ${orderId} was not found`);
    }

    return payment;
  }
}

