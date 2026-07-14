const { PrismaClient } = require('@prisma/client');
const xlsx = require('xlsx');
const path = require('path');

const prisma = new PrismaClient();
const excelPath = path.join(__dirname, 'states.xlsx');

async function main() {
  console.log('Reading excel file...');
  const workbook = xlsx.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet);

  console.log(`Read ${data.length} states from Excel.`);

  // Fetch existing states to map names to IDs
  const existingStates = await prisma.state.findMany();
  const stateMap = new Map();
  existingStates.forEach(s => {
    stateMap.set(s.name.toLowerCase().trim(), s.id);
  });

  let updatedCount = 0;

  for (const row of data) {
    if (!row['State']) continue;

    const rawStateName = row['State'].trim();
    const stateNameLower = rawStateName.toLowerCase();

    let stateId = stateMap.get(stateNameLower);

    // If state doesn't exist, create it in states table
    if (!stateId) {
      console.log(`State "${rawStateName}" not found in database. Creating it...`);
      const newState = await prisma.state.create({
        data: { name: rawStateName }
      });
      stateId = newState.id;
      stateMap.set(stateNameLower, stateId);
    }

    const slug = stateNameLower.replace(/\s+/g, '-');
    const population = row['Population'] ? parseFloat(row['Population']) : null;
    const area = row['Area'] || null;
    const coordinates = row['Co-ordinates'] || null;
    const about = row['About'] || '';

    await prisma.stateProfile.upsert({
      where: { stateId },
      create: {
        stateId,
        slug,
        about,
        population,
        area,
        coordinates,
      },
      update: {
        slug,
        about,
        population,
        area,
        coordinates,
      }
    });

    updatedCount++;
  }

  console.log(`Successfully synchronized ${updatedCount} state profiles in the database.`);
}

main()
  .catch(err => {
    console.error('Error syncing profiles to database:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
