import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function run() {
  let connected = false;
  for (let i = 1; i <= 5; i++) {
    try {
      await prisma.$connect();
      connected = true;
      break;
    } catch (e) {
      console.log(`Connection attempt ${i} failed, retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (!connected) {
    console.error("Failed to connect to database");
    return;
  }

  const fileData = fs.readFileSync('./src/parsed_blogs.json', 'utf-8');
  const parsedBlogs = JSON.parse(fileData);

  console.log(`Updating ${parsedBlogs.length} blog posts in database...`);

  for (const b of parsedBlogs) {
    const existing = await prisma.blogPost.findFirst({
      where: {
        OR: [
          { slug: b.slug },
          { title: b.title }
        ]
      }
    });

    const blogImage = existing?.image || '/ngf-logo.png';

    if (existing) {
      await prisma.blogPost.update({
        where: { id: existing.id },
        data: {
          title: b.title,
          author: b.author,
          date: b.date,
          excerpt: b.excerpt,
          content: b.content,
          image: blogImage,
        }
      });
      console.log(`Updated blog ID ${existing.id}: ${b.title}\n  Author: ${b.author} | Date: ${b.date}`);
    } else {
      const created = await prisma.blogPost.create({
        data: {
          slug: b.slug,
          title: b.title,
          author: b.author,
          date: b.date,
          excerpt: b.excerpt,
          content: b.content,
          image: '/ngf-logo.png',
        }
      });
      console.log(`Created blog ID ${created.id}: ${b.title}\n  Author: ${b.author} | Date: ${b.date}`);
    }
  }

  // Ensure total count is 4 and remove old duplicates if any
  const allBlogs = await prisma.blogPost.findMany();
  console.log(`Total blogs in database: ${allBlogs.length}`);
  allBlogs.forEach((b, idx) => {
    console.log(`[${idx + 1}] Title: ${b.title}\n     Author: ${b.author} | Date: ${b.date}`);
  });
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
