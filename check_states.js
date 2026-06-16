const XLSX = require('xlsx');

const workbook = XLSX.readFile('states.xlsx');
console.log("states.xlsx sheets:", workbook.SheetNames);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
for (let r = 1; r <= 5; r++) {
    const a = sheet['A' + r] ? sheet['A' + r].v : '';
    const b = sheet['B' + r] ? sheet['B' + r].v : '';
    const c = sheet['C' + r] ? sheet['C' + r].v : '';
    console.log(`Row ${r}: A=${a}, B=${b}, C=${c}`);
}
