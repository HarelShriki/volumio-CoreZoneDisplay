const fs = require('fs');

const b64 = fs.readFileSync('public/fonts/PressStart2P-Regular.woff2').toString('base64');
const fontFace = `@font-face {
  font-family: 'Press Start 2P';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('data:font/woff2;base64,${b64}') format('woff2');
}
`;

fs.writeFileSync('submodule/clocks/assets/fonts/press-start-2p.css', fontFace);
fs.writeFileSync('public/fonts/press-start-2p.css', fontFace);
console.log('Successfully generated offline font CSS');
