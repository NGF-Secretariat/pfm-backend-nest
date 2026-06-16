const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const workbook = XLSX.readFile('PF-Site Landing Page Dataset 2026.xlsx');
  const sheet = workbook.Sheets['Geo_Pol_Original_Exp'];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });

  const zonesData = {}; // zoneName -> { stateName: amount }
  
  let currentLeftZone = 'South-West';
  let currentRightZone = 'North-East';

  for (const row of rows) {
    // Check if it's a zone header row
    if (typeof row['South-West'] === 'string' && row['South-West'] !== 'S/No' && row['South-West'] !== currentLeftZone) {
      if (row['South-West'] && isNaN(parseInt(row['South-West'], 10))) currentLeftZone = row['South-West'];
      if (row['North-East'] && isNaN(parseInt(row['North-East'], 10))) currentRightZone = row['North-East'];
    }

    // Process Left
    if (typeof row['South-West'] === 'number' && row['__EMPTY']) {
      const stateName = row['__EMPTY'].trim();
      const amount = row['__EMPTY_1'] || 0;
      if (!zonesData[currentLeftZone]) zonesData[currentLeftZone] = {};
      zonesData[currentLeftZone][stateName] = amount;
    }

    // Process Right
    if (typeof row['North-East'] === 'number' && row['__EMPTY_3']) {
      const stateName = row['__EMPTY_3'].trim();
      const amount = row['__EMPTY_4'] || 0;
      if (!zonesData[currentRightZone]) zonesData[currentRightZone] = {};
      zonesData[currentRightZone][stateName] = amount;
    }
  }

  console.log("Parsed Zones:", Object.keys(zonesData));

  // Now, insert/update DB
  for (const [zoneName, states] of Object.entries(zonesData)) {
    if (!zoneName) continue;
    
    // 1. Create Zone
    const zone = await prisma.geoPoliticalZone.upsert({
      where: { name: zoneName },
      update: {},
      create: { name: zoneName }
    });

    for (const [stateName, originalBudget] of Object.entries(states)) {
      // 2. Link State to Zone
      let state = await prisma.state.findUnique({ where: { name: stateName } });
      if (!state) {
        state = await prisma.state.create({ data: { name: stateName, zoneId: zone.id } });
      } else {
        await prisma.state.update({ where: { id: state.id }, data: { zoneId: zone.id } });
      }

      // 3. Save ZoneOriginalBudget
      await prisma.zoneOriginalBudget.upsert({
        where: { zoneId_stateName_year: { zoneId: zone.id, stateName: stateName, year: 2026 } },
        update: { originalBudget },
        create: { zoneId: zone.id, stateName: stateName, originalBudget, year: 2026 }
      });
    }
  }

  console.log("Successfully seeded Zones and ZoneOriginalBudgets.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
