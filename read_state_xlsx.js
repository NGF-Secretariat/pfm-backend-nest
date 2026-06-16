const XLSX = require('xlsx');
try {
  const workbook = XLSX.readFile('state.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log(JSON.stringify(json.slice(0, 5), null, 2));
} catch (e) {
  console.error("Error reading file:", e.message);
}
