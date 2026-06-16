const XLSX = require('xlsx');

const workbook = XLSX.readFile('Public Finance Database (2018-2026) + Indicators.xlsx');
const sheet = workbook.Sheets['A2020'];
const json = XLSX.utils.sheet_to_json(sheet, { defval: null });

console.log(JSON.stringify(json.slice(0, 5), null, 2));
