const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Reading workbook...");
  const workbook = XLSX.readFile('PF-Site Landing Page Dataset 2026.xlsx');
  
  console.log("Reading sheet...");
  const sheet = workbook.Sheets['Total_Expen_Original_and_Actual'];
  if (!sheet) {
    console.error("Sheet 'Total_Expen_Original_and_Actual' not found!");
    return;
  }
  
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  console.log(`Found ${rows.length} rows.`);

  const promises = [];
  for (const row of rows) {
    const year = row['Year'];
    if (!year) continue;

    promises.push(prisma.nationalAggregate.upsert({
      where: { year: parseInt(year, 10) },
      update: {
        originalRevenue: row['Revenue (not including opening balance)'] ?? null,
        originalExpenditure: row['Expenditure '] ?? null,
        actualRevenue: row['Revenue (not including opening balance)_1'] ?? null,
        actualExpenditure: row['Expenditure _1'] ?? null,
      },
      create: {
        year: parseInt(year, 10),
        originalRevenue: row['Revenue (not including opening balance)'] ?? null,
        originalExpenditure: row['Expenditure '] ?? null,
        actualRevenue: row['Revenue (not including opening balance)_1'] ?? null,
        actualExpenditure: row['Expenditure _1'] ?? null,
      },
    }));
  }
  
  await prisma.$transaction(promises);
  console.log("Successfully seeded NationalAggregate table.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
