const XLSX = require('xlsx');

const workbook = XLSX.readFile('PF-Site Landing Page Dataset 2026.xlsx');
console.log("PF-Site Landing Page Dataset 2026.xlsx sheets:", workbook.SheetNames);
