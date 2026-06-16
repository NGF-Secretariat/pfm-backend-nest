const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find all lowercase/mixed-case states (created by mistake)
  const allStates = await prisma.state.findMany();
  const badStates = allStates.filter(s => s.name !== s.name.toUpperCase());
  
  const badStateIds = badStates.map(s => s.id);
  
  if (badStateIds.length > 0) {
    // 1. Delete associated ZoneOriginalBudget records
    await prisma.zoneOriginalBudget.deleteMany({
      where: { stateName: { in: badStates.map(s => s.name) } }
    });

    // 2. Delete the bad states
    await prisma.state.deleteMany({
      where: { id: { in: badStateIds } }
    });
    console.log(`Deleted ${badStateIds.length} duplicate states.`);
  }

  // 3. Re-run the zoning with uppercase
  const XLSX = require('xlsx');
  const workbook = XLSX.readFile('PF-Site Landing Page Dataset 2026.xlsx');
  const sheet = workbook.Sheets['Geo_Pol_Original_Exp'];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });

  const zonesData = {};
  let currentLeftZone = 'South-West';
  let currentRightZone = 'North-East';

  for (const row of rows) {
    if (typeof row['South-West'] === 'string' && row['South-West'] !== 'S/No' && row['South-West'] !== currentLeftZone) {
      if (row['South-West'] && isNaN(parseInt(row['South-West'], 10))) currentLeftZone = row['South-West'];
      if (row['North-East'] && isNaN(parseInt(row['North-East'], 10))) currentRightZone = row['North-East'];
    }

    if (typeof row['South-West'] === 'number' && row['__EMPTY']) {
      const stateName = row['__EMPTY'].trim().toUpperCase(); // FIXED
      const amount = row['__EMPTY_1'] || 0;
      if (!zonesData[currentLeftZone]) zonesData[currentLeftZone] = {};
      zonesData[currentLeftZone][stateName] = amount;
    }

    if (typeof row['North-East'] === 'number' && row['__EMPTY_3']) {
      const stateName = row['__EMPTY_3'].trim().toUpperCase(); // FIXED
      const amount = row['__EMPTY_4'] || 0;
      if (!zonesData[currentRightZone]) zonesData[currentRightZone] = {};
      zonesData[currentRightZone][stateName] = amount;
    }
  }

  for (const [zoneName, states] of Object.entries(zonesData)) {
    if (!zoneName) continue;
    
    const zone = await prisma.geoPoliticalZone.findUnique({ where: { name: zoneName }});

    for (const [stateName, originalBudget] of Object.entries(states)) {
      // update existing uppercase state
      await prisma.state.update({
        where: { name: stateName },
        data: { zoneId: zone.id }
      });

      // insert ZoneOriginalBudget with uppercase
      await prisma.zoneOriginalBudget.upsert({
        where: { zoneId_stateName_year: { zoneId: zone.id, stateName: stateName, year: 2026 } },
        update: { originalBudget },
        create: { zoneId: zone.id, stateName: stateName, originalBudget, year: 2026 }
      });
    }
  }

  console.log("Fixed states and zones successfully!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
