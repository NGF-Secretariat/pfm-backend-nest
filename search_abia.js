const XLSX = require('xlsx');
const workbook = XLSX.readFile('Public Finance Database (2018-2026) + Indicators.xlsx');
for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    // Just scan first 10 rows and 10 cols
    const cols = 'ABCDEFGHIJ'.split('');
    for (let r = 1; r <= 10; r++) {
        for (const c of cols) {
            const cell = sheet[c + r];
            if (cell && cell.v && cell.v.toString().toLowerCase().includes('abia')) {
                console.log(`Found Abia in ${name} at ${c}${r}: ${cell.v}`);
            }
        }
    }
}
