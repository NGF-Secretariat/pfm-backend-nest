import * as XLSX from 'xlsx';

function main() {
  const workbook = XLSX.readFile('/Users/devclassik/Documents/NGF/pfm-backend-nestjs/Public Finance Database (2018-2026) + Indicators.xlsx');
  console.log('Sheet Names:', workbook.SheetNames);
}

main();
