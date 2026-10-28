const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createReadStream, createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const env = require('../config/env');

const backupDirectory = path.resolve(process.cwd(), 'backups');
const header = Buffer.from('CHB1');

function runTool(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString().slice(0, 1000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Database tool failed (${code}): ${stderr.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[REDACTED]')}`)));
  });
}

async function encryptFile(source, destination) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(env.BACKUP_ENCRYPTION_KEY, 'hex'), iv);
  await fs.writeFile(destination, Buffer.concat([header, iv]), { mode: 0o600, flag: 'wx' });
  await pipeline(createReadStream(source), cipher, createWriteStream(destination, { flags: 'a', mode: 0o600 }));
  await fs.appendFile(destination, cipher.getAuthTag());
}

function configYaml(uri) {
  return `uri: ${JSON.stringify(uri)}\n`;
}

async function main() {
  await fs.mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const tempDirectory = path.join(os.tmpdir(), `classroom-backup-${crypto.randomUUID()}`);
  await fs.mkdir(tempDirectory, { recursive: false, mode: 0o700 });
  const tempArchive = path.join(tempDirectory, 'database.archive.gz');
  const configPath = path.join(tempDirectory, 'database.yaml');
  const target = path.join(backupDirectory, `classroom-${new Date().toISOString().replace(/[:.]/g, '-')}.archive.enc`);
  let encrypted = false;
  try {
    await fs.writeFile(configPath, configYaml(env.MONGODB_URI), { mode: 0o600, flag: 'wx' });
    await runTool(env.MONGODUMP_PATH, ['--config', configPath, `--archive=${tempArchive}`, '--gzip']);
    await encryptFile(tempArchive, target);
    encrypted = true;
    const cutoff = Date.now() - 14 * 86400000;
    for (const entry of await fs.readdir(backupDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.archive.enc')) continue;
      const filePath = path.join(backupDirectory, entry.name);
      if ((await fs.stat(filePath)).mtimeMs < cutoff) await fs.rm(filePath, { force: true });
    }
    process.stdout.write(`Encrypted backup created: ${path.basename(target)}\n`);
  } finally {
    if (!encrypted) await fs.rm(target, { force: true });
    if (path.dirname(tempDirectory) === os.tmpdir() && path.basename(tempDirectory).startsWith('classroom-backup-')) await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => { process.stderr.write(`Backup failed: ${error.message}\n`); process.exitCode = 1; });
