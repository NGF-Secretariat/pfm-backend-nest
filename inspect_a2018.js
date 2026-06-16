const XLSX = require('xlsx');

const workbook = XLSX.readFile('Public Finance Database (2018-2026) + Indicators.xlsx');
const sheet = workbook.Sheets['A2018'];
if (!sheet) {
    console.log("Sheet A2018 not found");
    process.exit(1);
}

const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
// Let's print the first 50 rows, but only the first 5 columns to understand the structure
console.log("Total rows:", data.length);
for (let i = 0; i < Math.min(50, data.length); i++) {
    const row = data[i];
    console.log(`Row ${i+1}:`, row.slice(0, 5));
}
