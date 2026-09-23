import { describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from './httpAdapter';

describe('HTTP adapter', () => {
  it('sends draft analysis according to the API contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ analysisId: 'analysis_1' }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(createHttpAdapter('http://localhost:3000').analyze('Описание')).resolves.toEqual({ analysisId: 'analysis_1' });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/task-drafts/analyze', expect.objectContaining({ method: 'POST', body: JSON.stringify({ draft: 'Описание', language: 'ru' }) }));
  });

  it('uses the backend error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Заполните описание' } }) }));

    await expect(createHttpAdapter('http://localhost:3000/api').analyze('')).rejects.toThrow('Заполните описание');
  });
});
