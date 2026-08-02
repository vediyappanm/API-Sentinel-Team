import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestSpec, fetchSpecHistory, diffSpecs, fetchSchemaViolations } from './openapi.service';

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('openapi.service', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('fetches the latest spec', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'spec-1', spec: { paths: {} } }));
    const result = await fetchLatestSpec();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/openapi/latest',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
    expect(result.id).toBe('spec-1');
  });

  it('fetches spec history with a limit', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0, specs: [] }));
    await fetchSpecHistory(10);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/openapi/history?limit=10',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('diffs two spec versions', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ summary: {}, breaking_changes: [], recommendations: [] }));
    await diffSpecs('base-1', 'rev-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/openapi/diff',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ base_spec_id: 'base-1', revision_spec_id: 'rev-1' }),
      }),
    );
  });

  it('fetches schema violations', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0, violations: [] }));
    await fetchSchemaViolations();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/openapi/violations?limit=50',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });
});
