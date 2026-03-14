const fs = require('fs');

function makeIcon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#080608"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
    font-family="Georgia, serif" font-style="italic" font-weight="300"
    font-size="${Math.round(size * 0.38)}" fill="#f4a7b9">dm</text>
</svg>`;
}

if (!fs.existsSync('assets/icons')) fs.mkdirSync('assets/icons', { recursive: true });
fs.writeFileSync('assets/icons/icon-192.png', makeIcon(192));
fs.writeFileSync('assets/icons/icon-512.png', makeIcon(512));
console.log('done — icons written to assets/icons/');