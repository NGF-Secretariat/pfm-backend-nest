import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { TrafficService } from './traffic.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('traffic')
export class TrafficController {
  constructor(private readonly trafficService: TrafficService) {}

  @Post('log')
  logVisit(@Body() body: { visitorId: string; section: string; page: string }) {
    return this.trafficService.logVisit(body);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  getStats() {
    return this.trafficService.getStats();
  }
}
