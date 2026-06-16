const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const data = await prisma.state.findMany();
  console.log("Total states:", data.length);
  console.log(data.map(s => s.name).slice(30));
}
main().catch(console.error).finally(() => prisma.$disconnect());
