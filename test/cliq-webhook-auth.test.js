import { test, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import cliqRoutes from '../src/routes/cliq.js';
import { agentManager } from '../src/services/bugbuster-manager.js';
import { CLIQ_WEBHOOK_TOKEN_HEADER, isValidWebhookToken } from '../src/middleware/cliq-webhook-auth.js';

const TOKEN = 'test-webhook-token';

let server;
let baseUrl;
let sendMessage;
let closeSession;

before(async () => {
  const app = express();
  app.use('/webhook/cliq', cliqRoutes);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/webhook/cliq`;
});

after(() => new Promise(resolve => server.close(resolve)));

beforeEach(() => {
  sendMessage = mock.method(agentManager, 'sendMessage', async () => '[SILENT]');
  closeSession = mock.method(agentManager, 'closeSession', () => {});
});

afterEach(() => {
  mock.restoreAll();
  delete process.env.CLIQ_WEBHOOK_TOKEN;
});

function postParticipation(headers = {}) {
  return fetch(`${baseUrl}/participate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams({
      message_object: JSON.stringify({ text: 'login page is broken' }),
      user_name: 'Tester',
      channel_id: 'CT_test',
      channel_name: '#test channel'
    })
  });
}

async function waitForCall(mockFn) {
  const deadline = Date.now() + 1000;
  while (mockFn.mock.callCount() === 0 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 50));
}

test('secret set: participation without a token gets 401 and is not processed', async () => {
  process.env.CLIQ_WEBHOOK_TOKEN = TOKEN;

  const res = await postParticipation();
  await settle();

  assert.equal(res.status, 401);
  assert.equal(sendMessage.mock.callCount(), 0);
});

test('secret set: participation with a wrong token gets 401 and is not processed', async () => {
  process.env.CLIQ_WEBHOOK_TOKEN = TOKEN;

  const res = await postParticipation({ [CLIQ_WEBHOOK_TOKEN_HEADER]: `${TOKEN}-wrong` });
  await settle();

  assert.equal(res.status, 401);
  assert.equal(sendMessage.mock.callCount(), 0);
});

test('secret set: participation with the valid token is processed', async () => {
  process.env.CLIQ_WEBHOOK_TOKEN = TOKEN;

  const res = await postParticipation({ [CLIQ_WEBHOOK_TOKEN_HEADER]: TOKEN });
  await waitForCall(sendMessage);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { should_respond: false });
  assert.equal(sendMessage.mock.callCount(), 1);
  const [channelId, textMessage] = sendMessage.mock.calls[0].arguments;
  assert.equal(channelId, 'CT_test');
  assert.equal(textMessage, 'Tester: login page is broken');
});

test('secret not set: participation without a token is still processed', async () => {
  const res = await postParticipation();
  await waitForCall(sendMessage);

  assert.equal(res.status, 200);
  assert.equal(sendMessage.mock.callCount(), 1);
});

test('secret set: reset-session requires the token', async () => {
  process.env.CLIQ_WEBHOOK_TOKEN = TOKEN;

  const denied = await fetch(`${baseUrl}/reset-session/CT_test`, { method: 'POST' });
  assert.equal(denied.status, 401);
  assert.equal(closeSession.mock.callCount(), 0);

  const allowed = await fetch(`${baseUrl}/reset-session/CT_test`, {
    method: 'POST',
    headers: { [CLIQ_WEBHOOK_TOKEN_HEADER]: TOKEN }
  });
  assert.equal(allowed.status, 200);
  assert.equal(closeSession.mock.callCount(), 1);
});

test('isValidWebhookToken rejects missing, empty, prefix and longer tokens', () => {
  assert.equal(isValidWebhookToken(undefined, TOKEN), false);
  assert.equal(isValidWebhookToken('', TOKEN), false);
  assert.equal(isValidWebhookToken(TOKEN.slice(0, -1), TOKEN), false);
  assert.equal(isValidWebhookToken(`${TOKEN}x`, TOKEN), false);
  assert.equal(isValidWebhookToken(TOKEN, TOKEN), true);
});
