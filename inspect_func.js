const XLSX = require('xlsx');
const workbook = XLSX.readFile('PF-Site Landing Page Dataset 2026.xlsx');
const sheet = workbook.Sheets['Expenditure_by_Function'];
const json = XLSX.utils.sheet_to_json(sheet, { defval: null });
console.log(JSON.stringify(json, null, 2));
