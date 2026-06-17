const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.publicFinanceItem.findMany({
    where: { description: { contains: 'Expenditure', mode: 'insensitive' } }
  });
  console.log('Items:', items);
  const actuals = await prisma.publicFinanceActual.findMany({
    where: { stateId: 1, year: { in: [2018, 2019] } }
  });
  console.log('Actuals for Abia 2018/2019:', actuals.map(a => `${a.year}: ${items.find(i => i.id === a.itemId)?.description} - ${a.amount}`));
}
main().finally(() => prisma.$disconnect());
