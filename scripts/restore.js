const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createReadStream, createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const env = require('../config/env');

function runTool(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString().slice(0, 1000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Database restore failed (${code}): ${stderr.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[REDACTED]')}`)));
  });
}

function configYaml(uri) { return `uri: ${JSON.stringify(uri)}\n`;
}

async function decryptBackup(source, destination) {
  const handle = await fs.open(source, 'r');
  const metadata = Buffer.alloc(32);
  const { size } = await handle.stat();
  if (size < 32) { await handle.close(); throw new Error('This is not a supported encrypted backup.'); }
  await handle.read(metadata, 0, 16, 0);
  await handle.read(metadata, 16, 16, size - 16);
  await handle.close();
  if (metadata.subarray(0, 4).toString('ascii') !== 'CHB1') throw new Error('This is not a supported encrypted backup.');
  const iv = metadata.subarray(4, 16);
  const tag = metadata.subarray(16, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(env.BACKUP_ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(tag);
  await pipeline(createReadStream(source, { start: 16, end: size - 17 }), decipher, createWriteStream(destination, { mode: 0o600, flags: 'wx' }));
}

async function main() {
  if (process.env.RESTORE_CONFIRM !== 'YES') throw new Error('Set RESTORE_CONFIRM=YES after verifying the target database and backup. Restore replaces matching database records.');
  const backupDirectory = path.resolve(process.cwd(), 'backups');
  const source = path.resolve(process.argv[2] || '');
  if (!source.startsWith(`${backupDirectory}${path.sep}`) || !source.endsWith('.archive.enc')) throw new Error('Pass an encrypted .archive.enc file located inside the backups directory.');
  const tempDirectory = path.join(os.tmpdir(), `classroom-restore-${crypto.randomUUID()}`);
  await fs.mkdir(tempDirectory, { recursive: false, mode: 0o700 });
  const archive = path.join(tempDirectory, 'database.archive.gz');
  const configPath = path.join(tempDirectory, 'database.yaml');
  try {
    await decryptBackup(source, archive);
    await fs.writeFile(configPath, configYaml(env.MONGODB_URI), { mode: 0o600, flag: 'wx' });
    await runTool(env.MONGORESTORE_PATH, ['--config', configPath, `--archive=${archive}`, '--gzip', '--drop']);
    process.stdout.write(`Database restored from ${path.basename(source)}\n`);
  } finally {
    if (path.dirname(tempDirectory) === os.tmpdir() && path.basename(tempDirectory).startsWith('classroom-restore-')) await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => { process.stderr.write(`Restore failed: ${error.message}\n`); process.exitCode = 1; });
