import { Module } from '@nestjs/common';
import { TrafficService } from './traffic.service';
import { TrafficController } from './traffic.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TrafficController],
  providers: [TrafficService],
  exports: [TrafficService],
})
export class TrafficModule {}
