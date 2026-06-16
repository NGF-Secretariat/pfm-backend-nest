const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Reading workbook...");
  const workbook = XLSX.readFile('PF-Site Landing Page Dataset 2026.xlsx');
  
  const sheet = workbook.Sheets['Total_Expen_Original_and_Actual'];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  console.log(`Found ${rows.length} rows.`);

  const promises = [];
  for (const row of rows) {
    const year = row['__EMPTY'];
    // skip the header row or any row without a valid year number
    if (typeof year !== 'number' || isNaN(year)) continue;

    promises.push(prisma.nationalAggregate.upsert({
      where: { year: parseInt(year, 10) },
      update: {
        originalRevenue: row['Original'] ?? null,
        originalExpenditure: row['__EMPTY_1'] ?? null,
        actualRevenue: row['Actual '] ?? null,
        actualExpenditure: row['__EMPTY_3'] ?? null,
      },
      create: {
        year: parseInt(year, 10),
        originalRevenue: row['Original'] ?? null,
        originalExpenditure: row['__EMPTY_1'] ?? null,
        actualRevenue: row['Actual '] ?? null,
        actualExpenditure: row['__EMPTY_3'] ?? null,
      },
    }));
  }
  
  await prisma.$transaction(promises);
  console.log("Successfully seeded NationalAggregate table.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
