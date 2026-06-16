const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const XLSX = require('xlsx');

async function main() {
  const workbook = XLSX.readFile('PF-Site Landing Page Dataset 2026.xlsx');
  const sheet = workbook.Sheets['Expenditure_by_Function'];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });

  let currentYear = null;
  const mapDescriptionToEnum = (desc) => {
    const formatted = desc.trim().toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z_]/g, '_').replace(/_+/g, '_');
    if (formatted.includes('HOUSING_AND_COMMUNITY_AMMENITIES')) return 'HOUSING_AND_COMMUNITY_AMENITIES';
    if (formatted.includes('PUBLIC_ORDER_AND_SAFETY')) return 'PUBLIC_ORDER_AND_SAFETY';
    return formatted;
  };

  for (const row of rows) {
    const col0 = row['__EMPTY'];
    const desc = row['__EMPTY_1'];
    const rec = row['__EMPTY_2'];
    const cap = row['__EMPTY_3'];
    const tot = row['__EMPTY_4'];

    if (typeof col0 === 'string' && col0.toUpperCase().includes('BUDGET')) {
      const match = col0.match(/\d{4}/);
      if (match) currentYear = parseInt(match[0], 10);
      continue;
    }

    if (!currentYear || !desc || desc === 'Description' || desc === 'Total') continue;

    const functionEnum = mapDescriptionToEnum(desc);
    if (!functionEnum) continue;

    try {
      await prisma.expenditureByFunction.upsert({
        where: { year_function: { year: currentYear, function: functionEnum } },
        update: { recurrent: rec || 0, capital: cap || 0, total: tot || 0 },
        create: { year: currentYear, function: functionEnum, recurrent: rec || 0, capital: cap || 0, total: tot || 0 }
      });
    } catch (e) {
      console.warn(`Could not insert function: ${functionEnum}`, e);
    }
  }
  console.log("Seeding complete");
}

main().catch(console.error).finally(() => prisma.$disconnect());
