const XLSX = require('xlsx');

const workbook = XLSX.readFile('Public Finance Database (2018-2026) + Indicators.xlsx');

const years = ['A2018', 'A2019', 'A2020', 'A2021', 'A2022', 'A2023', 'A2024'];
const output = {};

for (const year of years) {
    const sheet = workbook.Sheets[year];
    if (!sheet) continue;
    
    // Find row for Total Expenditure
    let totalExpRow = -1;
    for (let r = 1; r <= 500; r++) {
        const cell = sheet['B' + r];
        if (cell && cell.v && cell.v.toString().trim().toLowerCase() === 'total expenditure') {
            totalExpRow = r;
            break;
        }
    }
    
    if (totalExpRow === -1) {
        console.log(`Could not find Total Expenditure in ${year}`);
        continue;
    }
    
    output[year] = {};
    
    // Columns C to AP (approx 40 columns)
    const cols = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => 'A' + c)
    );
    
    for (const col of cols) {
        const stateCell = sheet[col + '1'];
        if (!stateCell || !stateCell.v) continue;
        const stateName = stateCell.v.toString().trim();
        if (stateName.toLowerCase() === 'total' || stateName === '') continue;
        
        const valCell = sheet[col + totalExpRow];
        const val = valCell ? valCell.v : 0;
        
        output[year][stateName] = val;
    }
}

console.log(JSON.stringify(output, null, 2));
const fs = require('fs');
fs.writeFileSync('total_expenditure.json', JSON.stringify(output, null, 2));
