const fs = require('fs');
const { createCanvas } = require('canvas');

function makeIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // light blue-grey sky background
  ctx.fillStyle = '#e8f4fd';
  ctx.fillRect(0, 0, size, size);

  // cloud — white puffy shape
  const cx = size * 0.5;
  const cy = size * 0.52;
  const r = size * 0.18;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.arc(cx - r * 0.9, cy + r * 0.3, r * 0.75, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.9, cy + r * 0.3, r * 0.75, 0, Math.PI * 2);
  ctx.arc(cx, cy + r * 0.55, r * 0.85, 0, Math.PI * 2);
  ctx.fill();

  // sun peeking top right
  ctx.fillStyle = '#f5c842';
  ctx.beginPath();
  ctx.arc(size * 0.68, size * 0.28, size * 0.13, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toBuffer('image/png');
}

fs.writeFileSync('assets/icons/icon-192.png', makeIcon(192));
fs.writeFileSync('assets/icons/icon-512.png', makeIcon(512));
console.log('done');
