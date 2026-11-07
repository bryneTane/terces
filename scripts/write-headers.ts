import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderHeadersFile } from '../config/headers.ts';

const target = fileURLToPath(new URL('../public/_headers', import.meta.url));
writeFileSync(target, renderHeadersFile());
console.log(`wrote ${target}`);
