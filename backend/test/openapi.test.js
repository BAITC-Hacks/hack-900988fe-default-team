import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenapi } from '../src/openapi.js';

test('configured API base URL is the first Swagger server option', () => {
  const spec = buildOpenapi('https://api.example.com/api/');
  assert.equal(spec.servers[0].url, 'https://api.example.com/api');
  assert.equal(spec.servers[0].description, 'URL из API_BASE_URL');
});
