const XLSX = require('xlsx');

const workbook = XLSX.readFile('Public Finance Database (2018-2026) + Indicators.xlsx');

const summary = {};

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  if (json.length > 0) {
    summary[sheetName] = {
      rowCount: json.length,
      headers: json[0]
    };
  } else {
    summary[sheetName] = { rowCount: 0, headers: [] };
  }
}

console.log(JSON.stringify(summary, null, 2));
