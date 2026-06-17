const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const state = await prisma.state.findFirst({
    where: { name: { equals: 'abia', mode: 'insensitive' } }
  });
  console.log('State:', state);
  
  const items = await prisma.publicFinanceItem.findMany({
    where: { description: 'Total Expenditure' }
  });
  console.log('Items:', items);
  
  const actuals = await prisma.publicFinanceActual.findMany({
    where: { stateId: state.id, itemId: items[0].id }
  });
  console.log('Actuals for Abia (Total Expenditure):', actuals);
}
main().finally(() => prisma.$disconnect());
