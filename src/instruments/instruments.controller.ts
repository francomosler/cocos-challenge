import { Controller, Get, Query } from '@nestjs/common';
import { InstrumentsService } from './instruments.service';

@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instrumentsService: InstrumentsService) {}

  @Get('search')
  search(@Query('q') query: string) {
    if (!query || query.trim() === '') {
      return [];
    }
    return this.instrumentsService.search(query.trim());
  }
}
