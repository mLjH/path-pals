#!/usr/bin/env node
// Builds two outputs from src/:
//   dist/                 the standalone site (host it anywhere over HTTPS, add to the iPad home screen, works offline)
//   build/artifact.html   the same game as a single page body, for previewing as a Claude artifact
// Usage: node tools/build.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, 'src', p), 'utf8');

const levels = JSON.parse(read('levels.json')).map(({ target, arrows, ...l }) => l);   // drop generator-only fields
const css = read('base.css') + '\n' + read('ui.css');
const body = read('body.html');
const js = [
  read('engine.js'),
  'const LEVELS = ' + JSON.stringify(levels) + ';',
  read('art.js'),
  read('sound.js'),
  read('game.js')
].join('\n');
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@600;800&display=swap">';

// Artifact page: the host adds doctype, head, viewport and safe-area padding.
const artifact = `<title>Path Pals</title>
<meta name="claude:viewport-fit-sides" content="cover">
${FONTS}
<style>
${css}
</style>
${body}
<script>
${js}
</script>
`;
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'artifact.html'), artifact);

// Standalone site.
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>Path Pals</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Path Pals">
<meta name="theme-color" content="#D8F0F6">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="icon" type="image/png" href="icons/icon-192.png">
${FONTS}
<style>
:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{font-size:14px}
${css}
</style>
</head>
<body>
${body}
<script>
${js}
</script>
<script>
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
</script>
</body>
</html>
`;
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'icons'), { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), page);
const version = crypto.createHash('sha1').update(page).digest('hex').slice(0, 10);
fs.writeFileSync(path.join(dist, 'sw.js'), read('sw.js').replace('__VERSION__', version));
fs.copyFileSync(path.join(root, 'src', 'manifest.webmanifest'), path.join(dist, 'manifest.webmanifest'));
for (const f of fs.readdirSync(path.join(root, 'src', 'icons'))) fs.copyFileSync(path.join(root, 'src', 'icons', f), path.join(dist, 'icons', f));

console.log(`Built ${levels.length} levels. dist/index.html ${(page.length / 1024).toFixed(1)} KB, version ${version}. build/artifact.html ${(artifact.length / 1024).toFixed(1)} KB`);
