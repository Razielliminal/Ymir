const fs = require('fs');

const svg192 = '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect width="192" height="192" fill="#080608"/><text x="96" y="110" text-anchor="middle" font-family="Georgia" font-style="italic" font-size="73" fill="#f4a7b9">dm</text></svg>';

const svg512 = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#080608"/><text x="256" y="295" text-anchor="middle" font-family="Georgia" font-style="italic" font-size="195" fill="#f4a7b9">dm</text></svg>';

fs.writeFileSync('icon-192.png', svg192);
fs.writeFileSync('icon-512.png', svg512);
console.log('done');