const https = require('https');
const fs = require('fs');
const path = require('path');

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function main() {
  console.log('Downloading Google Sans Latin...');
  const latinBuf = await download('https://fonts.gstatic.com/s/googlesans/v76/4UasrENHsxJlGDuGo1OIlJfC6l_24rlCK1Yo_Iqcsih3SAyH6cAwhX9RPjIUvQ.woff2');
  console.log('Latin size:', latinBuf.length);

  console.log('Downloading Google Sans Hebrew...');
  const hebrewBuf = await download('https://fonts.gstatic.com/s/googlesans/v76/4UasrENHsxJlGDuGo1OIlJfC6l_24rlCK1Yo_Iqcsih3SAyH6cAwhX9RPjAUvaYr.woff2');
  console.log('Hebrew size:', hebrewBuf.length);

  const targets = [
    'public/fonts',
    'submodule/clocks/assets/fonts',
    'C:/github_harelsh/ClockWeb/assets/fonts'
  ];

  const latinB64 = latinBuf.toString('base64');
  const hebrewB64 = hebrewBuf.toString('base64');

  const cssContent = [
    '/* Google Sans Standalone Offline Font (Latin & Hebrew) */',
    '@font-face {',
    '  font-family: "Google Sans";',
    '  font-style: normal;',
    '  font-weight: 100 900;',
    '  font-display: swap;',
    '  src: url("GoogleSans-Hebrew.woff2") format("woff2"),',
    '       url("data:font/woff2;base64,' + hebrewB64 + '") format("woff2");',
    '  unicode-range: U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F;',
    '}',
    '',
    '@font-face {',
    '  font-family: "Google Sans";',
    '  font-style: normal;',
    '  font-weight: 100 900;',
    '  font-display: swap;',
    '  src: url("GoogleSans-Latin.woff2") format("woff2"),',
    '       url("data:font/woff2;base64,' + latinB64 + '") format("woff2");',
    '  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;',
    '}'
  ].join('\n');

  for (const dir of targets) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'GoogleSans-Latin.woff2'), latinBuf);
    fs.writeFileSync(path.join(dir, 'GoogleSans-Hebrew.woff2'), hebrewBuf);
    fs.writeFileSync(path.join(dir, 'google-sans.css'), cssContent);
    console.log('Saved to ' + dir);
  }
}

main().catch(console.error);
