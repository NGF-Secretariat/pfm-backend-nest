import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { LandingPageModule } from './landing-page/landing-page.module';
import { BudgetModule } from './budget/budget.module';
import { ContactModule } from './contact/contact.module';
import { StateProfileModule } from './state-profile/state-profile.module';
import { BlogModule } from './blog/blog.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [PrismaModule, LandingPageModule, BudgetModule, ContactModule, StateProfileModule, BlogModule, AuthModule, UserModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
