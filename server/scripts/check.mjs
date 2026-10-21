import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directories = [
  fileURLToPath(new URL('../src', import.meta.url)),
  fileURLToPath(new URL('../../frontend/assets/js', import.meta.url)),
  fileURLToPath(new URL('../../frontend/admin/assets/js', import.meta.url)),
].filter((directory) => existsSync(directory));

function collect(directory) {
  const files = [];

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collect(fullPath));
    } else if (entry.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

const files = directories.flatMap(collect);
let failed = 0;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });

  if (result.status !== 0) {
    failed += 1;
    console.error(`Error de sintaxis en ${file}`);
    console.error(result.stderr);
  }
}

if (failed > 0) {
  console.error(`${failed} archivo(s) con errores.`);
  process.exit(1);
}

console.log(`${files.length} archivos verificados correctamente.`);
