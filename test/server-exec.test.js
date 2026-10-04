import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand, execute } from '../src/tools/server-exec/index.js';

const REJECTED = [
  'docker ps; id',
  'docker ps && id',
  'docker ps || id',
  'docker ps | sh',
  'docker ps $(id)',
  'docker ps `id`',
  'docker ps > /tmp/out',
  'docker ps < /etc/passwd',
  'docker ps\nid',
  'docker ps\rid',
  'docker ps\tid',
  'docker ps \\\nid',
  'docker exec supabase-db psql',
  'docker inspect x',
  'docker inspect awkward-seo-engine',
  'docker restart awkward-seo-engine',
  'docker top awkward-seo-engine',
  'docker logs -f awkward-seo-engine',
  'docker logs --follow awkward-seo-engine',
  'docker logs --tail 100',
  'docker logs awkward-seo-engine --tail',
  'docker logs awkward-seo-engine --tail abc',
  'docker logs awkward-seo-engine other-container',
  'docker logs --since=1h awkward-seo-engine',
  'docker stats',
  'docker stats awkward-seo-engine',
  'docker psx',
  'df -h /etc',
  'free -m --help-me',
  'uptime --version x',
  'curl http://example.com',
  'wget http://example.com',
  'env',
  'printenv',
  'cat /proc/1/environ',
  'ps aux',
  'ls',
  '',
  '   '
];

const ACCEPTED = [
  ['docker ps', 'docker ps'],
  ['docker ps -a', 'docker ps -a'],
  ['docker logs awkward-seo-engine --tail 100', 'docker logs awkward-seo-engine --tail 100'],
  ['docker logs --tail 50 --since 30m awkward-seo-engine', 'docker logs --tail 50 --since 30m awkward-seo-engine'],
  ['docker logs supabase-db --since 2026-10-01T12:00:00Z -t', 'docker logs supabase-db --since 2026-10-01T12:00:00Z -t'],
  ['docker stats --no-stream', 'docker stats --no-stream'],
  ['docker stats --no-stream awkward-seo-engine', 'docker stats --no-stream awkward-seo-engine'],
  ['df -h', 'df -h'],
  ['free -m', 'free -m'],
  ['uptime', 'uptime'],
  ['docker logs constructor', 'docker logs constructor'],
  ['  docker   logs   awkward-seo-engine   --tail 100  ', 'docker logs awkward-seo-engine --tail 100']
];

for (const command of REJECTED) {
  test(`rejects ${JSON.stringify(command)}`, () => {
    assert.throws(() => validateCommand(command), /Command not allowed/);
  });
}

for (const [command, expected] of ACCEPTED) {
  test(`accepts ${JSON.stringify(command)}`, () => {
    assert.equal(validateCommand(command), expected);
  });
}

test('rejects non-string input', () => {
  assert.throws(() => validateCommand(undefined), /Command not allowed/);
  assert.throws(() => validateCommand(['docker', 'ps']), /Command not allowed/);
});

test('execute() refuses a rejected command before opening an SSH connection', async () => {
  process.env.SERVER_TESTBOX_HOST = '192.0.2.1';
  process.env.SERVER_TESTBOX_USER = 'nobody';
  process.env.SERVER_TESTBOX_PASSWORD = 'unused';
  try {
    const result = await execute({ server: 'testbox', command: 'docker ps; id' });
    assert.match(result, /Command not allowed/);
  } finally {
    delete process.env.SERVER_TESTBOX_HOST;
    delete process.env.SERVER_TESTBOX_USER;
    delete process.env.SERVER_TESTBOX_PASSWORD;
  }
});
