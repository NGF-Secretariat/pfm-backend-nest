const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const mappingsPath = path.join(__dirname, 'src', 'field-mappings.json');
const mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));

async function inspectCodes() {
  const dbItems = await prisma.publicFinanceItem.findMany();
  const dbMap = new Map();
  dbItems.forEach(i => {
    dbMap.set(i.description.trim(), i);
  });

  const categories = {};
  for (const [desc, info] of Object.entries(mappings)) {
    const cat = info.category || 'unknown';
    if (!categories[cat]) categories[cat] = { total: 0, withCode: 0, withoutCode: 0, missingInDb: 0, samplesWithoutCode: [] };
    
    categories[cat].total++;
    const item = dbMap.get(desc.trim());
    if (!item) {
      categories[cat].missingInDb++;
      categories[cat].samplesWithoutCode.push({ desc, reason: 'Not in DB' });
    } else if (!item.code) {
      categories[cat].withoutCode++;
      categories[cat].samplesWithoutCode.push({ desc, reason: 'DB code is null' });
    } else {
      categories[cat].withCode++;
    }
  }

  console.log('=== Breakdown by Category in field-mappings.json ===');
  for (const [cat, stats] of Object.entries(categories)) {
    console.log(`\nCategory: ${cat}`);
    console.log(`  Total: ${stats.total}, With Code: ${stats.withCode}, Without Code: ${stats.withoutCode}, Missing in DB: ${stats.missingInDb}`);
    if (stats.samplesWithoutCode.length > 0) {
      console.log('  Samples without code:');
      stats.samplesWithoutCode.slice(0, 10).forEach(s => console.log(`    - "${s.desc}" (${s.reason})`));
    }
  }
}

inspectCodes().finally(() => prisma.$disconnect());
