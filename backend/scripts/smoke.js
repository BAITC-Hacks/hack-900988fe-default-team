const configuredBaseUrl = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 3388}/api`;
const baseUrl = configuredBaseUrl.replace(/\/$/, '');

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response;
}

try {
  const [healthResponse, docsResponse, openapiResponse] = await Promise.all([
    request('/health'), request('/docs'), request('/openapi.json'),
  ]);
  const health = await healthResponse.json();
  const docs = await docsResponse.text();
  const openapi = await openapiResponse.json();
  if (health.status !== 'ok') throw new Error('Health response does not contain status=ok');
  if (!docs.includes('SwaggerUIBundle')) throw new Error('Swagger UI page is invalid');
  if (openapi.openapi !== '3.0.3') throw new Error('OpenAPI document is invalid');
  console.log(`Smoke check passed: ${baseUrl}`);
} catch (error) {
  console.error(`Smoke check failed: ${error.message}`);
  process.exitCode = 1;
}
