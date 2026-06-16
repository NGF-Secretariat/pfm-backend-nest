const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.publicFinanceActual.count({ where: { year: 2018 } });
  console.log('2018 count:', count);
}
main().finally(() => prisma.$disconnect());
