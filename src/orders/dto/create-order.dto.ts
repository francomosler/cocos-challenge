import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  ValidateIf,
} from 'class-validator';

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export class CreateOrderDto {
  @IsInt()
  userId: number;

  @IsInt()
  instrumentId: number;

  @IsEnum(OrderSide)
  side: OrderSide;

  @IsEnum(OrderType)
  type: OrderType;

  @IsOptional()
  @IsInt()
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ValidateIf((o) => o.type === OrderType.LIMIT)
  @IsNumber()
  @IsPositive()
  price?: number;
}
