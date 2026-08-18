import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchOrganizationAttention } from './organization.service';

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('organization attention service', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(jsonResponse({
      window_hours: 24,
      top_risks: [],
      notes: [],
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('requests the tenant attention inbox with the selected window', async () => {
    await fetchOrganizationAttention(168);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/organization/attention?window_hours=168',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });
});
