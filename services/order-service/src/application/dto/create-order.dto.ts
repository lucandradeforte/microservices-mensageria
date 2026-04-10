import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNumber, IsOptional, IsPositive, IsString, Length } from 'class-validator';

import { ProcessingBehavior } from '@microservices/node-common';

export class CreateOrderDto {
  @IsEmail()
  public customerEmail!: string;

  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @IsPositive()
  public amount!: number;

  @IsString()
  @Length(3, 3)
  @Transform(({ value }) => String(value).toUpperCase())
  public currency!: string;

  @IsOptional()
  @IsEnum(ProcessingBehavior)
  public processingBehavior?: ProcessingBehavior;
}

