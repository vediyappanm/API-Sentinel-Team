import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchGovernanceEvents, fetchSeverityCounts } from './discovery.service';

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('discovery service — governance events', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, violations: [] }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('calls the real governance/violations endpoint with pagination', async () => {
    await fetchGovernanceEvents(20, 10);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/governance/violations?skip=20&limit=10',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('adds a status filter only when provided', async () => {
    await fetchGovernanceEvents(0, 10, { status: 'OPEN' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/governance/violations?skip=0&limit=10&status=OPEN',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('maps the backend violations list into auditDataList', async () => {
    const violation = {
      id: 'v1',
      severity: 'HIGH',
      method: 'DELETE',
      url: 'api.example.com/users/123',
      timestamp: 1700000000,
      subCategory: 'SECURITY',
      description: 'No DELETE on sensitive paths violated',
      status: 'OPEN',
      eventId: 'v1abcde',
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 1, violations: [violation] }));

    const result = await fetchGovernanceEvents(0, 10);

    expect(result).toEqual({ auditDataList: [violation], total: 1 });
  });

  it('defaults to an empty list when the backend returns nothing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    const result = await fetchGovernanceEvents(0, 10);

    expect(result).toEqual({ auditDataList: [], total: 0 });
  });
});

describe('discovery service — severity counts', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(jsonResponse({ summary: [] }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('skips the network call entirely when no collections are given', async () => {
    const result = await fetchSeverityCounts([]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ severitiesCountResponse: [] });
  });

  it('calls the real vulnerability severity summary endpoint', async () => {
    await fetchSeverityCounts(['col-1', 'col-2']);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/vulnerabilities/summary/by-severity',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('aggregates the backend severity/count rows into one severityCount map', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        summary: [
          { severity: 'HIGH', count: 3 },
          { severity: 'CRITICAL', count: 1 },
        ],
      }),
    );

    const result = await fetchSeverityCounts(['col-1']);

    expect(result).toEqual({
      severitiesCountResponse: [{ severityCount: { HIGH: 3, CRITICAL: 1 } }],
    });
  });
});
