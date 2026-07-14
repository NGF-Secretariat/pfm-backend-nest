import { Module } from '@nestjs/common';
import { LandingPageService } from './landing-page.service';
import { LandingPageController } from './landing-page.controller';

@Module({
  controllers: [LandingPageController],
  providers: [LandingPageService],
})
export class LandingPageModule {}
