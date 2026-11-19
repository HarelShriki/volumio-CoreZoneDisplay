// Offline font audit for CoreZoneDisplay.
// Checks: every @font-face file exists, every font-family used is bundled or a
// generic/system fallback, pages load the local font CSS, nothing is loaded remotely.
// Usage (from repo root): node win-debug/check-fonts.js
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const dirs = ['public', 'submodule/clocks'];

const files = [];
dirs.forEach((d) => {
  (function walk(dd) {
    for (const e of fs.readdirSync(dd, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(dd, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(html|css|js)$/i.test(e.name)) files.push(p);
    }
  })(path.join(root, d));
});

let problems = 0;
const bad = (m) => { problems++; console.log('FAIL ' + m); };
const rel = (p) => path.relative(root, p).replace(/\\/g, '/');

// 1. @font-face declarations and their files
const defined = new Set();
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8');
  const faceRe = /@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = faceRe.exec(txt))) {
    const fam = /font-family\s*:\s*['"]?([^;'"]+)['"]?/i.exec(m[1]);
    if (fam) defined.add(fam[1].trim().toLowerCase());
    const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
    let u;
    while ((u = urlRe.exec(m[1]))) {
      if (/^(https?:)?\/\//.test(u[1])) { bad(rel(f) + ': remote font URL ' + u[1]); continue; }
      if (u[1].startsWith('data:')) continue;
      const target = path.resolve(path.dirname(f), u[1].split(/[?#]/)[0]);
      if (!fs.existsSync(target)) bad(rel(f) + ': missing font file ' + u[1]);
      else console.log('ok   ' + rel(f) + ' -> ' + rel(target) + ' (' + fs.statSync(target).size + ' bytes)');
    }
  }
}
console.log('\nLocally defined families: ' + [...defined].join(', '));

// 2. font-family names used
const generic = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'inherit', 'initial', 'unset', 'emoji', 'math', '-apple-system', 'blinkmacsystemfont']);
const system = new Set(['segoe ui', 'roboto', 'helvetica neue', 'helvetica', 'arial', 'noto sans', 'noto sans hebrew', 'courier new', 'consolas', 'menlo', 'monaco', 'liberation sans', 'dejavu sans', 'ubuntu', 'apple color emoji', 'segoe ui emoji', 'segoe ui symbol', 'noto color emoji', 'calibri', 'sf mono', 'cascadia code', 'georgia', 'times new roman', 'verdana', 'tahoma', 'arial hebrew', 'david', 'courier', 'sf pro display', 'sf pro text', 'liberation mono', 'dejavu sans mono', 'lucida console', 'trebuchet ms', 'impact', 'cantarell', 'oxygen', 'fira sans', 'open sans', 'inter']);
const usage = {};
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8');
  const re = /font-family\s*:\s*([^;}{"`]+(?:"[^"]*"[^;}{`]*)*)[;}]?/gi;
  let m;
  while ((m = re.exec(txt))) {
    if (/@font-face/.test(txt.slice(Math.max(0, m.index - 200), m.index)) && /\{[^}]*$/.test(txt.slice(Math.max(0, m.index - 200), m.index))) continue;
    m[1].split(',').map((s) => s.replace(/['"]/g, '').replace(/!important/, '').trim().toLowerCase()).filter(Boolean).forEach((fam) => {
      if (/\$\{|var\(|^\w+\s*\+|^[a-z]+\.[a-z]/.test(fam)) return; // dynamic value
      (usage[fam] = usage[fam] || new Set()).add(rel(f));
    });
  }
}
console.log('\nFont families used:');
for (const [fam, where] of Object.entries(usage).sort()) {
  const kind = defined.has(fam) ? 'LOCAL ' : generic.has(fam) ? 'generic' : system.has(fam) ? 'system ' : 'UNKNOWN';
  console.log('  ' + kind + '  ' + fam + '   <- ' + [...where].join(', '));
}

// 3. Pages using a local family must load its CSS
const needs = { 'google sans': /google-sans\.css/, 'press start 2p': /press-start-2p\.css/ };
for (const f of files.filter((x) => x.endsWith('.html'))) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const [fam, cssRe] of Object.entries(needs)) {
    if (new RegExp(fam, 'i').test(txt) && !cssRe.test(txt)) {
      // maybe via a linked local stylesheet
      const links = [...txt.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/g)].map((x) => path.resolve(path.dirname(f), x[1]));
      const viaCss = links.some((l) => fs.existsSync(l) && (cssRe.test(fs.readFileSync(l, 'utf8')) || /@font-face[^}]*/i.test(fs.readFileSync(l, 'utf8')) && new RegExp(fam, 'i').test(fs.readFileSync(l, 'utf8'))));
      if (!viaCss) bad(rel(f) + ': uses "' + fam + '" but does not load its local CSS');
      else console.log('ok   ' + rel(f) + ' loads ' + fam + ' via linked stylesheet');
    }
  }
  // remote stylesheets / scripts
  for (const x of txt.matchAll(/<(?:link|script)[^>]+(?:href|src)=["']((?:https?:)?\/\/[^"']+)["']/g)) bad(rel(f) + ': remote resource ' + x[1]);
}
for (const f of files.filter((x) => x.endsWith('.css'))) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const x of txt.matchAll(/@import\s+(?:url\()?['"]?([^'")]+)/g)) {
    if (/^(https?:)?\/\//.test(x[1])) bad(rel(f) + ': remote @import ' + x[1]);
  }
}
console.log('\n' + (problems ? problems + ' PROBLEM(S)' : 'ALL FONTS STANDALONE'));
process.exitCode = problems ? 1 : 0;
