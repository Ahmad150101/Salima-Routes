import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
const roots = ['js'];
const files = [];
function walk(directory) { for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) walk(path); else if (entry.name.endsWith('.js')) files.push(path); } }
roots.forEach(walk); files.push('service-worker.js');
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`JavaScript syntax PASS (${files.length} files)`);
