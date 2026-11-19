const fs = require('fs');
const vm = require('vm');

try {
  JSON.parse(fs.readFileSync('UIConfig.json', 'utf8'));
  JSON.parse(fs.readFileSync('i18n/strings_en.json', 'utf8'));
  console.log('✓ UIConfig.json and strings_en.json valid JSON');

  ['index.js', 'public/app.js', 'submodule/clocks/CASIO/app.js'].forEach(f => {
    new vm.Script(fs.readFileSync(f, 'utf8'), { filename: f });
    console.log('✓ JS syntax OK:', f);
  });

  ['submodule/clocks/MainClockSelector.html', 'submodule/clocks/digital/settings.html', 'submodule/clocks/digital/index.html'].forEach(f => {
    const html = fs.readFileSync(f, 'utf8');
    const regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let match;
    let idx = 0;
    while ((match = regex.exec(html)) !== null) {
      const attrs = match[1];
      const code = match[2];
      if (/src=/i.test(attrs) || /type=["']text\/plain["']/i.test(attrs)) continue;
      if (code.trim()) {
        new vm.Script(code, { filename: `${f} <script> #${idx++}` });
      }
    }
    console.log('✓ Inline scripts OK:', f);
  });

  console.log('ALL FILES SYNTAX VALID!');
} catch (e) {
  console.error('Validation error:', e);
  process.exit(1);
}
