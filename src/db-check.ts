import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const actualYears = await prisma.publicFinanceActual.groupBy({
    by: ['year'],
    _count: true,
  });
  const budgetYears = await prisma.publicFinanceBudget.groupBy({
    by: ['year'],
    _count: true,
  });

  const actualStatesCount = await prisma.state.count();
  const actualItemsCount = await prisma.publicFinanceItem.count();
  const actualActualsCount = await prisma.publicFinanceActual.count();
  const actualBudgetsCount = await prisma.publicFinanceBudget.count();

  console.log({
    actualYears,
    budgetYears,
    statesCount: actualStatesCount,
    itemsCount: actualItemsCount,
    actualsCount: actualActualsCount,
    budgetsCount: actualBudgetsCount,
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
