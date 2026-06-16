import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { BudgetService } from './src/budget/budget.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const budgetService = app.get(BudgetService);

  const yearSheet = process.argv[2];
  if (!yearSheet) {
    console.error('Please provide a sheet name (e.g. A2019)');
    process.exit(1);
  }

  const file = 'Public Finance Database (2018-2026) + Indicators.xlsx';
  
  console.log(`Starting processing for ${yearSheet}...`);
  try {
    const result = await budgetService.uploadLocalSheet(file, yearSheet);
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error);
  }

  await app.close();
}

bootstrap();
