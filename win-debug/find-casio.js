const fs = require('fs');

['public/app.js', 'index.js', 'UIConfig.json', 'submodule/clocks/MainClockSelector.html'].forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/casio/i.test(l)) {
      console.log(f + ':' + (i + 1) + ': ' + l.trim());
    }
  });
});
