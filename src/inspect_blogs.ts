import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const blogs = await prisma.blogPost.findMany();
  for (const b of blogs) {
    if (!b.author) {
      await prisma.blogPost.update({
        where: { id: b.id },
        data: { author: 'NGF Secretariat' }
      });
      console.log(`Updated blog ${b.id} author to NGF Secretariat`);
    }
  }
}

run().finally(() => prisma.$disconnect());
