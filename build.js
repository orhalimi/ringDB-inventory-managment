const fs = require('fs');
const path = require('path');

const OUT = 'build';

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else copy(from, to);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });

copy('manifest.json', `${OUT}/manifest.json`);
copyDir('src', `${OUT}/src`);
copyDir('lib', `${OUT}/lib`);
copyDir('icons', `${OUT}/icons`);

console.log('Built to /build — ready to zip.');
