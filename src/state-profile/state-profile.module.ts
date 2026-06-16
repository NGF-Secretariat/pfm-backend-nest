import { Module } from '@nestjs/common';
import { StateProfileService } from './state-profile.service';
import { StateProfileController } from './state-profile.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [StateProfileService],
  controllers: [StateProfileController]
})
export class StateProfileModule {}
