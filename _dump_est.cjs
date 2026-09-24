const fs = require('fs')
const vm = require('vm')
const XLSX = require('C:/File Code/get-image/public/xlsx.full.min.js')

const buf = fs.readFileSync('C:/File Code/get-image/src/file/WHL BAO GIA 21.09 DEPOT.xls')
const wb = XLSX.read(buf, { type: 'buffer' })
console.log('SHEETS:', wb.SheetNames.join(' | '))
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
console.log('TOTAL ROWS:', rows.length)

const compact = rows
  .map((r, i) => [i, r])
  .filter(([i, r]) => r.some(c => String(c).trim() !== ''))
  .slice(0, 300)
compact.forEach(([i, r]) => {
  const nonempty = r.map(c => String(c).trim()).filter(c => c !== '')
  console.log('R' + i + ': [' + nonempty.join('] | [') + ']')
})
