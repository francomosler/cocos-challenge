import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto, OrderType, OrderSide } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(dto: CreateOrderDto) {
    if (!dto.quantity && !dto.amount) {
      throw new BadRequestException(
        'Either quantity or amount must be provided',
      );
    }
    if (dto.quantity && dto.amount) {
      throw new BadRequestException(
        'Provide either quantity or amount, not both',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${dto.userId})::text`;

        const user = await tx.users.findUnique({
          where: { id: dto.userId },
        });
        if (!user) {
          throw new NotFoundException(
            `User with id ${dto.userId} not found`,
          );
        }

        const instrument = await tx.instruments.findUnique({
          where: { id: dto.instrumentId },
        });
        if (!instrument) {
          throw new NotFoundException(
            `Instrument with id ${dto.instrumentId} not found`,
          );
        }
        if (instrument.type === 'MONEDA') {
          throw new BadRequestException(
            'Cannot trade currency instruments directly',
          );
        }

        let price: number;
        if (dto.type === OrderType.MARKET) {
          const marketData = await tx.$queryRaw<{ close: number }[]>`
            SELECT close::float AS close
            FROM marketdata
            WHERE instrumentid = ${dto.instrumentId}
            ORDER BY date DESC
            LIMIT 1
          `;
          if (!marketData.length || marketData[0].close == null) {
            throw new BadRequestException(
              'No market data available for this instrument',
            );
          }
          price = marketData[0].close;
        } else {
          if (!dto.price) {
            throw new BadRequestException(
              'Price is required for LIMIT orders',
            );
          }
          price = dto.price;
        }

        let quantity: number;
        if (dto.amount) {
          quantity = Math.floor(dto.amount / price);
          if (quantity <= 0) {
            throw new BadRequestException(
              'Amount is too low to buy/sell any shares',
            );
          }
        } else {
          quantity = dto.quantity!;
        }

        const totalCost = quantity * price;
        let status: string;

        if (dto.side === OrderSide.BUY) {
          const cashResult = await tx.$queryRaw<
            { available_cash: number }[]
          >`
            SELECT COALESCE(SUM(
              CASE
                WHEN side = 'CASH_IN' THEN size * price
                WHEN side = 'CASH_OUT' THEN -size * price
                WHEN side = 'BUY' THEN -size * price
                WHEN side = 'SELL' THEN size * price
                ELSE 0
              END
            ), 0)::float AS available_cash
            FROM orders
            WHERE userid = ${dto.userId} AND status = 'FILLED'
          `;
          const availableCash = cashResult[0]?.available_cash ?? 0;

          if (totalCost > availableCash) {
            status = 'REJECTED';
          } else {
            status = dto.type === OrderType.MARKET ? 'FILLED' : 'NEW';
          }
        } else {
          const sharesResult = await tx.$queryRaw<
            { shares_owned: number }[]
          >`
            SELECT COALESCE(SUM(
              CASE
                WHEN side = 'BUY' THEN size
                WHEN side = 'SELL' THEN -size
                ELSE 0
              END
            ), 0)::int AS shares_owned
            FROM orders
            WHERE userid = ${dto.userId}
              AND instrumentid = ${dto.instrumentId}
              AND status = 'FILLED'
          `;
          const sharesOwned = Number(sharesResult[0]?.shares_owned ?? 0);

          if (quantity > sharesOwned) {
            status = 'REJECTED';
          } else {
            status = dto.type === OrderType.MARKET ? 'FILLED' : 'NEW';
          }
        }

        const order = await tx.orders.create({
          data: {
            instrumentid: dto.instrumentId,
            userid: dto.userId,
            size: quantity,
            price,
            type: dto.type,
            side: dto.side,
            status,
            datetime: new Date(),
          },
        });

        return {
          id: order.id,
          instrumentId: order.instrumentid,
          userId: order.userid,
          side: order.side,
          type: order.type,
          size: order.size,
          price: Number(order.price),
          status: order.status,
          datetime: order.datetime,
        };
      },
      {
        maxWait: 10000,
        timeout: 30000,
      },
    );
  }

  async cancelOrder(orderId: number) {
    const order = await this.prisma.orders.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException(`Order with id ${orderId} not found`);
    }

    const result = await this.prisma.orders.updateMany({
      where: { id: orderId, status: 'NEW' },
      data: { status: 'CANCELLED' },
    });

    if (result.count === 0) {
      throw new BadRequestException(
        `Only orders with status NEW can be cancelled. Current status: ${order.status}`,
      );
    }

    return {
      id: orderId,
      status: 'CANCELLED',
    };
  }
}
