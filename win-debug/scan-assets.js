const fs = require('fs');
const path = require('path');

function searchExternal(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist'].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) searchExternal(p);
    else if (/\.(html|css|js)$/i.test(f.name)) {
      const content = fs.readFileSync(p, 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (/https?:\/\//i.test(line)) {
          if (/font|icon|cdn|gstatic|googleapis|awesome|feather/i.test(line)) {
            console.log(`${p}:${idx + 1}: ${line.trim()}`);
          }
        }
      });
    }
  }
}

searchExternal('.');
