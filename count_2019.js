const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.publicFinanceActual.count({ where: { year: 2019 } });
  console.log('2019 count:', count);
}
main().finally(() => prisma.$disconnect());
