import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface PositionRow {
  instrument_id: number;
  ticker: string;
  name: string;
  quantity: number;
  last_price: number | null;
  previous_close: number | null;
}

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  async getPortfolio(userId: number) {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    const [availableCash, positions] = await Promise.all([
      this.calculateAvailableCash(userId),
      this.calculatePositions(userId),
    ]);

    const mappedPositions = positions.map((p) => {
      const quantity = Number(p.quantity);
      const lastPrice = p.last_price != null ? Number(p.last_price) : 0;
      const previousClose = p.previous_close != null ? Number(p.previous_close) : 0;
      const marketValue = quantity * lastPrice;
      const dailyReturn =
        previousClose > 0
          ? ((lastPrice - previousClose) / previousClose) * 100
          : 0;

      return {
        instrumentId: Number(p.instrument_id),
        ticker: p.ticker,
        name: p.name,
        quantity,
        lastPrice,
        marketValue: Math.round(marketValue * 100) / 100,
        dailyReturn: Math.round(dailyReturn * 100) / 100,
      };
    });

    const totalPositionsValue = mappedPositions.reduce(
      (sum, p) => sum + p.marketValue,
      0,
    );

    const totalAccountValue =
      Math.round((availableCash + totalPositionsValue) * 100) / 100;

    return {
      totalAccountValue,
      availableCash: Math.round(availableCash * 100) / 100,
      positions: mappedPositions,
    };
  }

  async calculateAvailableCash(userId: number): Promise<number> {
    const result = await this.prisma.$queryRaw<{ available_cash: number }[]>`
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
      WHERE userid = ${userId} AND status = 'FILLED'
    `;
    return result[0]?.available_cash ?? 0;
  }

  private async calculatePositions(userId: number): Promise<PositionRow[]> {
    return this.prisma.$queryRaw<PositionRow[]>`
      SELECT
        i.id AS instrument_id,
        i.ticker,
        i.name,
        SUM(CASE
          WHEN o.side = 'BUY' THEN o.size
          WHEN o.side = 'SELL' THEN -o.size
          ELSE 0
        END)::int AS quantity,
        md.close::float AS last_price,
        md.previousclose::float AS previous_close
      FROM orders o
      JOIN instruments i ON o.instrumentid = i.id
      LEFT JOIN LATERAL (
        SELECT close, previousclose
        FROM marketdata
        WHERE instrumentid = i.id
        ORDER BY date DESC
        LIMIT 1
      ) md ON true
      WHERE o.userid = ${userId}
        AND o.status = 'FILLED'
        AND i.type != 'MONEDA'
      GROUP BY i.id, i.ticker, i.name, md.close, md.previousclose
      HAVING SUM(CASE
        WHEN o.side = 'BUY' THEN o.size
        WHEN o.side = 'SELL' THEN -o.size
        ELSE 0
      END) > 0
    `;
  }
}
