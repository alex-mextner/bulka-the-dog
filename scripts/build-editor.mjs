import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyVerifiedEditorModule } from './editor-artifact.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const spec = JSON.parse(await readFile(join(root, 'editor-source.json'), 'utf8'));
assert.match(spec.commit, /^[a-f0-9]{40}$/, 'The editor source must be pinned to an exact commit');
assert.match(spec.repository, /^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\.git$/, 'Invalid source repository');

// A local mirror can replace the transport for an offline build, never the commit or expected output.
const fetchRepository = process.env.EDITOR_BUILD_SOURCE_REPOSITORY || spec.repository;
const inherited = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'WINDIR', 'SSL_CERT_FILE',
  'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY'];
const env = Object.fromEntries(inherited.filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
env.CI = '1'; env.LANG = 'C.UTF-8';
const source = await mkdtemp(join(tmpdir(), 'editor-source-build-'));
const run = (command, args, capture = false) => execFileSync(command, args, {
  cwd: source, env, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8', timeout: 600_000,
});
try {
  run('git', ['init', '--quiet']);
  run('git', ['remote', 'add', 'origin', spec.repository]);
  run('git', ['fetch', '--no-tags', '--depth=1', fetchRepository, spec.commit]);
  run('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD']);
  const head = run('git', ['rev-parse', 'HEAD'], true).trim();
  assert.equal(head, spec.commit, 'Fetched editor source differs from the reviewed commit');
  run('pnpm', ['install', '--frozen-lockfile']);
  run('pnpm', ['build']);
  await copyVerifiedEditorModule(join(source, 'dist/_conloca/editor'), join(root, 'public/_conloca/editor'), spec);
  console.log(`Editor module verified: ${spec.module}; source ${spec.commit}`);
} finally { await rm(source, { recursive: true, force: true }); }
