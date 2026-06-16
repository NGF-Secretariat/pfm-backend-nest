const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const data = await prisma.expenditureByFunction.findMany();
  console.log(data);
}
main().catch(console.error).finally(() => prisma.$disconnect());
