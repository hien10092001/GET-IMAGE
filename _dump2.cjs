const fs = require('fs'), vm = require('vm');
const lib = fs.readFileSync('C:/File Code/get-image/public/xlsx.full.min.js','utf8');
const sandbox = { window: {}, console, global: {} };
sandbox.window.window = sandbox.window; sandbox.window.self = sandbox.window; sandbox.global = sandbox.window; sandbox.window.global = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(lib, sandbox, {filename:'xlsx.js'});
const XLSX = sandbox.window.XLSX;
if (!XLSX || !XLSX.read) { console.log('XLSX missing, keys:', Object.keys(sandbox.window)); return; }
const buf = fs.readFileSync('C:/File Code/get-image/src/file/WHL BAO GIA 21.09 DEPOT.xls');
const wb = XLSX.read(buf, {type:'buffer'});
console.log('SHEETS:', wb.SheetNames.join(' | '));
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:''});
console.log('TOTAL ROWS:', rows.length);
rows.slice(0, Math.min(40, rows.length)).forEach((r,i)=>{
  const nonempty = r.map((c,j)=>[j,c]).filter(([,c])=>String(c).trim()!=='');
  if (nonempty.length) console.log('R'+i+':', nonempty.map(([j,c])=>j+'='+JSON.stringify(String(c).slice(0,40))).join(' , '));
});
