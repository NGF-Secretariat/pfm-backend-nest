import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('db-status')
  async getDbStatus() {
    try {
      const stateCount = await this.prisma.state.count();
      return {
        connected: true,
        message: 'Database is connected successfully! 🚀',
        stateCount,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        connected: false,
        message: 'Database connection failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
