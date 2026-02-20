import { readFileSync, writeFileSync } from 'node:fs';

const inputPath = 'packages/api/openapi/openapi.yaml';
const outputPath = 'packages/api/src/openapi-spec.ts';

const yaml = readFileSync(inputPath, 'utf8');
const content = `// Auto-generated from ${inputPath}. Do not edit manually.\nexport const FULL_OPENAPI_SPEC = ${JSON.stringify(yaml)};\n`;

writeFileSync(outputPath, content, 'utf8');
console.log(`Generated ${outputPath} from ${inputPath}`);
