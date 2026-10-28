const fs = require('node:fs');
const path = require('node:path');

const ignoredDirectories = new Set(['.git', 'node_modules', 'coverage', 'uploads', 'backups']);
const patterns = [
  { name: 'private key', expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'AWS access key', expression: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'suspicious password assignment', expression: /(?:password|secret|token)\s*[:=]\s*["'][^"']{12,}["']/i },
  { name: 'seed password literal in source', expression: /ADMIN_SEED_PASSWORD\s*=\s*[A-Za-z0-9!@#$%^&*()_+={}\[\]:;,.?~-]{8,}/i }
];
let failures = 0;

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) scan(path.join(directory, entry.name));
      continue;
    }
    if (!entry.isFile() || entry.name === '.env' || entry.name === '.env.example' || entry.name === 'package-lock.json') continue;
    const filePath = path.join(directory, entry.name);
    const content = fs.readFileSync(filePath, 'utf8');
    for (const pattern of patterns) {
      if (pattern.expression.test(content)) {
        process.stderr.write(`${pattern.name} pattern found in ${filePath}\n`);
        failures += 1;
      }
    }
  }
}

scan(process.cwd());
if (failures) process.exitCode = 1;
else process.stdout.write('Secret scan passed.\n');
