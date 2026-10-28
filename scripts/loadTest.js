const { performance } = require('node:perf_hooks');

const baseUrl = process.env.LOAD_BASE_URL || 'http://localhost:3000';
const token = process.env.LOAD_ACCESS_TOKEN;
const subject = process.env.LOAD_SUBJECT;

// Build a tiny structurally valid PDF so upload measurements exercise the real validation path.
function makePdf() {
  let source = '%PDF-1.4\n';
  const offsets = [0];
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>'];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(source);
  source += `xref\n0 3\n0000000000 65535 f \n${offsets[1].toString().padStart(10, '0')} 00000 n \n${offsets[2].toString().padStart(10, '0')} 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(source);
}

async function timedRequest(url, options) {
  const started = performance.now();
  const response = await fetch(url, options);
  const body = await response.text();
  let id;
  try { id = JSON.parse(body)?.data?._id; } catch (_error) { /* List results are measured by status and latency only. */ }
  return { status: response.status, ms: performance.now() - started, id };
}

function percentile(values, percent) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percent) - 1)];
}

async function main() {
  if (!token || !subject) throw new Error('Set LOAD_ACCESS_TOKEN to an admin session and LOAD_SUBJECT to an active subject.');
  const headers = { Authorization: `Bearer ${token}` };
  const reads = await Promise.all(Array.from({ length: 200 }, () => timedRequest(`${baseUrl}/api/posts?type=note&page=1&limit=10`, { headers })));
  const pdf = new Blob([makePdf()], { type: 'application/pdf' });
  const uploads = await Promise.all(Array.from({ length: 20 }, (_, index) => {
    const form = new FormData();
    form.append('type', 'note');
    form.append('title', `Load sample ${index + 1}`);
    form.append('subject', subject);
    form.append('pdf', pdf, `load-${index + 1}.pdf`);
    return timedRequest(`${baseUrl}/api/posts`, { method: 'POST', headers, body: form });
  }));
  const summarize = (items) => ({ requests: items.length, success: items.filter((item) => item.status >= 200 && item.status < 300).length, failures: items.filter((item) => item.status < 200 || item.status >= 300).length, p50Ms: Math.round(percentile(items.map((item) => item.ms), 0.5)), p95Ms: Math.round(percentile(items.map((item) => item.ms), 0.95)), maxMs: Math.round(Math.max(...items.map((item) => item.ms))) });
  process.stdout.write(`${JSON.stringify({ postList: summarize(reads), pdfUploads: summarize(uploads) }, null, 2)}\n`);
  const createdIds = uploads.map((item) => item.id).filter(Boolean);
  let cleanupFailures = 0;
  for (const id of createdIds) {
    const trashed = await fetch(`${baseUrl}/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE', headers });
    const purged = trashed.ok ? await fetch(`${baseUrl}/api/posts/${encodeURIComponent(id)}/permanent`, { method: 'DELETE', headers }) : trashed;
    if (!purged.ok) cleanupFailures += 1;
  }
  process.stdout.write(`Temporary posts removed: ${createdIds.length - cleanupFailures}/${createdIds.length}\n`);
  if (reads.some((item) => item.status !== 200) || uploads.some((item) => item.status < 200 || item.status >= 300) || cleanupFailures) process.exitCode = 1;
}

main().catch((error) => { process.stderr.write(`Load test failed: ${error.message}\n`); process.exitCode = 1; });
