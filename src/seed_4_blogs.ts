import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const blogsToUpsert = [
  {
    slug: "digitalising-revenue",
    title: "Digitalising Revenue Administration: Lessons for Nigeria",
    image: "/ngf-logo.png",
    date: "April 29, 2026",
    author: "NGF Secretariat",
    excerpt: "One of the challenges revenue authorities face is delivering digital transformation quickly and cost-effectively.",
    content: "<p>Digital transformation in revenue administration remains one of the most important reforms for developing economies.</p><p>Nigeria continues to explore ways to modernize tax collection, reduce leakages, and improve transparency across public finance systems.</p><p>The transition toward digital revenue systems improves accountability, expands the tax base, and reduces inefficiencies associated with manual processes.</p><p>However, challenges including infrastructure gaps, limited digital literacy, and institutional resistance continue to slow implementation.</p>"
  },
  {
    slug: "iran-war-oil",
    title: "The Iran War: Impact of Rising Crude Oil Prices on Nigeria’s Mineral Revenue",
    image: "/ngf-logo.png",
    date: "April 9, 2026",
    author: "NGF Secretariat",
    excerpt: "Impact of rising crude oil prices on Nigeria’s mineral revenue since the outbreak of conflict.",
    content: "<p>Rising crude oil prices have significant implications for Nigeria’s mineral revenue and fiscal projections.</p><p>Oil-exporting nations often experience short-term revenue gains during geopolitical crises, but long-term economic stability depends on diversification and prudent fiscal management.</p>"
  }
];

async function main() {
  console.log("Checking and upserting 4 blogs...");
  let connected = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await prisma.$connect();
      connected = true;
      break;
    } catch (e) {
      console.log(`Connection attempt ${attempt} failed, retrying in 2s...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (!connected) {
    console.error("Could not connect to DB.");
    return;
  }

  for (const blog of blogsToUpsert) {
    await prisma.blogPost.upsert({
      where: { slug: blog.slug },
      update: blog,
      create: blog,
    });
  }

  const allBlogs = await prisma.blogPost.findMany();
  console.log(`SUCCESS: Total blogs in database: ${allBlogs.length}`);
  allBlogs.forEach((b, i) => {
    console.log(`[${i + 1}] ${b.title} (${b.slug})`);
  });
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
