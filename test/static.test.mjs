import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const allSource = ['index.html','README.md','TEST_PLAN.md','ARCHITECTURE.md', ...walk(path.join(root,'js')).map(file => path.relative(root,file))].filter(file => fs.existsSync(path.join(root,file))).map(read).join('\n');
function walk(directory) { return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry => entry.isDirectory() ? walk(path.join(directory,entry.name)) : [path.join(directory,entry.name)]); }
test('contains no Google platform dependencies', () => assert.doesNotMatch(allSource, /Google Maps|Google Cloud|google\.maps|Route Optimization API/i));
test('contains no credential-shaped secrets', () => assert.doesNotMatch(allSource, /AIza[0-9A-Za-z_-]{30,}|ghp_[0-9A-Za-z]+|-----BEGIN .*PRIVATE KEY-----|client_secret|private_key/i));
test('uses fixed MapLibre and relative local paths', () => { const html = read('index.html'); assert.match(html, /maplibre-gl@5\.6\.2/); assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/); });
test('supports dark mode and reduced motion', () => { const css = read('css/styles.css'); assert.match(css, /data-theme=dark/); assert.match(css, /prefers-reduced-motion:reduce/); });
test('service worker does not cache routing responses', () => { const sw = read('service-worker.js'); assert.match(sw, /osrm/); assert.doesNotMatch(sw, /router\.project-osrm\.org.*cache\.put/s); });
test('workflow publishes only public artifact after tests', () => { const workflow = read('.github/workflows/pages.yml'); assert.match(workflow, /needs: test/); assert.match(workflow, /path: _site/); assert.doesNotMatch(workflow, /cp -R .*test|cp -R .*server/); });
