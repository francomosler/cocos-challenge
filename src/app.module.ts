import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { InstrumentsModule } from './instruments/instruments.module';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [PrismaModule, PortfolioModule, InstrumentsModule, OrdersModule],
})
export class AppModule {}
