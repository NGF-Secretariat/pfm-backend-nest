import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.publicFinanceItem.findMany({
    orderBy: { id: 'asc' },
  });
  fs.writeFileSync('items-dump.json', JSON.stringify(items, null, 2));
  console.log(`Dumped ${items.length} items to items-dump.json`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
