import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface InstrumentSearchRow {
  id: number;
  ticker: string;
  name: string;
  type: string;
  last_price: number | null;
  previous_close: number | null;
}

@Injectable()
export class InstrumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: string) {
    const searchTerm = `%${query}%`;

    const results = await this.prisma.$queryRaw<InstrumentSearchRow[]>`
      SELECT
        i.id,
        i.ticker,
        i.name,
        i.type,
        md.close::float AS last_price,
        md.previousclose::float AS previous_close
      FROM instruments i
      LEFT JOIN LATERAL (
        SELECT close, previousclose
        FROM marketdata
        WHERE instrumentid = i.id
        ORDER BY date DESC
        LIMIT 1
      ) md ON true
      WHERE i.ticker ILIKE ${searchTerm} OR i.name ILIKE ${searchTerm}
      ORDER BY i.ticker
    `;

    return results.map((r) => {
      const lastPrice = r.last_price != null ? Number(r.last_price) : null;
      const previousClose =
        r.previous_close != null ? Number(r.previous_close) : null;
      const dailyReturn =
        lastPrice != null && previousClose != null && previousClose > 0
          ? Math.round(
              ((lastPrice - previousClose) / previousClose) * 100 * 100,
            ) / 100
          : null;

      return {
        id: Number(r.id),
        ticker: r.ticker,
        name: r.name,
        type: r.type,
        lastPrice,
        dailyReturn,
      };
    });
  }
}
