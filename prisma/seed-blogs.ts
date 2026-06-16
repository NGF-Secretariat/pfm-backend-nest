import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const blogs = [
  {
      slug: "digitalising-revenue",
      title: "Digitalising Revenue Administration: Lessons for Nigeria.",
      image: "/blogs/blog-1.jpg",
      date: "April 29, 2026",
      excerpt: "One of the challenges revenue authorities face is delivering digital transformation quickly and cost-effectively.",
      content: "Digital transformation in revenue administration remains one of the most important reforms for developing economies.\n\nNigeria continues to explore ways to modernize tax collection, reduce leakages, and improve transparency across public finance systems.\n\nThe transition toward digital revenue systems improves accountability, expands the tax base, and reduces inefficiencies associated with manual processes.\n\nHowever, challenges including infrastructure gaps, limited digital literacy, and institutional resistance continue to slow implementation."
  },
  {
      slug: "iran-war-oil",
      title: "The Iran War: Impact of Rising Crude Oil Prices on Nigeria’s Mineral Revenue",
      image: "/blogs/blog-2.jpg",
      date: "April 9, 2026",
      excerpt: "Impact of rising crude oil prices on Nigeria’s mineral revenue since the outbreak of conflict.",
      content: "Rising crude oil prices have significant implications for Nigeria’s mineral revenue and fiscal projections.\n\nOil-exporting nations often experience short-term revenue gains during geopolitical crises, but long-term economic stability depends on diversification and prudent fiscal management."
  },
  {
      slug: "digital-tax",
      title: "How digital tax reforms can transform Nigeria’s revenue challenges into fiscal successes",
      image: "/blogs/blog-3.jpg",
      date: "March 18, 2026",
      excerpt: "Digital tax reforms can help Nigeria improve revenue generation and fiscal sustainability.",
      content: "Digital taxation has become increasingly relevant as governments seek sustainable revenue sources in the digital economy.\n\nNigeria’s fiscal authorities are exploring reforms that can improve compliance while supporting innovation and economic growth."
  },
  {
      slug: "pfm-africa",
      title: "Digital PFM in Action: Building Resilient and Inclusive Fiscal Systems for African Governments",
      image: "/blogs/blog-4.jpg",
      date: "March 18, 2026",
      excerpt: "Conversations on Public Financial Management across the African continent are changing rapidly.",
      content: "Across Africa, governments are adopting digital public financial management systems to improve transparency, resilience, and service delivery.\n\nThese reforms support evidence-based budgeting, fiscal sustainability, and citizen engagement."
  }
];

async function main() {
  console.log("Seeding blog posts...");
  for (const blog of blogs) {
      await prisma.blogPost.upsert({
          where: { slug: blog.slug },
          update: blog,
          create: blog,
      });
  }
  console.log("Blog posts seeded successfully.");
}

main()
  .catch(e => {
      console.error(e);
      process.exit(1);
  })
  .finally(async () => {
      await prisma.$disconnect();
  });
