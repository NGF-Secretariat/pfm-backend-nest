const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.publicFinanceItem.findMany({
    where: {
      description: {
        in: ['Total Expenditure', 'TOTAL EXPENDITURE']
      }
    }
  });

  if (items.length === 0) {
    console.log("Total Expenditure item not found in DB.");
    return;
  }

  const itemIds = items.map(i => i.id);

  const actuals = await prisma.publicFinanceActual.findMany({
    where: {
      itemId: { in: itemIds }
    },
    include: {
      state: true
    }
  });

  const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024];
  const data = {};

  for (const year of years) {
    data[year] = {};
  }

  const allStates = new Set();

  for (const act of actuals) {
    if (years.includes(act.year)) {
      const s = act.state.name.toUpperCase();
      allStates.add(s);
      data[act.year][s] = act.amount;
    }
  }

  const sortedStates = Array.from(allStates).sort();

  let md = '# State Total Expenditures from DB (2018-2024)\n\n';
  md += '| State | ' + years.join(' | ') + ' |\n';
  md += '|-------|' + years.map(() => '---').join('|') + '|\n';

  for (const state of sortedStates) {
    let row = `| ${state} | `;
    let vals = years.map(year => {
      const val = data[year][state];
      if (val === undefined) return '-';
      return Number(val).toLocaleString('en-US', { style: 'currency', currency: 'NGN' });
    });
    row += vals.join(' | ') + ' |';
    md += row + '\n';
  }

  fs.writeFileSync('extracted_exp_db.md', md);
  console.log("Created extracted_exp_db.md from Database");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
