const XLSX = require('xlsx');
const workbook = XLSX.readFile('states.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const json = XLSX.utils.sheet_to_json(sheet, { defval: null });
console.log(JSON.stringify(json.slice(0, 5), null, 2));
