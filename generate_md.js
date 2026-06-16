const fs = require('fs');

const data = JSON.parse(fs.readFileSync('total_expenditure.json', 'utf8'));

const years = Object.keys(data).sort();
let allStates = new Set();
years.forEach(y => {
    Object.keys(data[y]).forEach(s => {
        if (s !== '36' && s !== '') {
            allStates.add(s.toUpperCase());
        }
    });
});

allStates = Array.from(allStates).sort();

let md = '# State Total Expenditures (2018-2024)\n\n';
md += '| State | ' + years.join(' | ') + ' |\n';
md += '|-------|' + years.map(() => '---').join('|') + '|\n';

allStates.forEach(state => {
    let row = `| ${state} | `;
    let vals = years.map(year => {
        // Find state in this year (case insensitive)
        const stateKey = Object.keys(data[year]).find(k => k.toUpperCase() === state);
        const val = stateKey ? data[year][stateKey] : '-';
        if (val === '-') return '-';
        return Number(val).toLocaleString('en-US', { style: 'currency', currency: 'NGN' });
    });
    row += vals.join(' | ') + ' |';
    md += row + '\n';
});

fs.writeFileSync('Total_Expenditure_Report.md', md);
console.log("Markdown generated.");
