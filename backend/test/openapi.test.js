import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenapi } from '../src/openapi.js';

test('configured API base URL is the first Swagger server option', () => {
  const spec = buildOpenapi('https://api.example.com/api/');
  assert.equal(spec.servers[0].url, 'https://api.example.com/api');
  assert.equal(spec.servers[0].description, 'URL из API_BASE_URL');
});

test('all application operations have response schemas and resolved references', () => {
  const spec = buildOpenapi();
  for (const [path, methods] of Object.entries({
    '/health': ['get'], '/teams': ['get'], '/task-drafts/analyze': ['post'], '/task-drafts/compose': ['post'],
    '/tasks': ['get', 'post'], '/tasks/{taskId}': ['get', 'patch'], '/tasks/{taskId}/publish': ['post'],
    '/tasks/{taskId}/proposals': ['get', 'post'], '/proposals/{proposalId}/status': ['patch'], '/docs': ['get'], '/openapi.json': ['get'],
  })) {
    for (const method of methods) {
      const operation = spec.paths[path]?.[method];
      assert.ok(operation, `${method} ${path}`);
      assert.ok(Object.keys(operation.responses).some(status => status.startsWith('2')));
      assert.ok(operation.responses[500]);
      if (method !== 'get') {
        assert.ok(operation.responses[400]);
        assert.ok(operation.responses[413]);
      }
    }
  }
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      const resolved = value.$ref.slice(2).split('/').reduce((node, key) => node?.[key], spec);
      assert.ok(resolved, value.$ref);
    }
    Object.values(value).forEach(visit);
  }
  visit(spec);
  assert.equal(spec.components.schemas.Analysis.properties.questions.minItems, 3);
});
