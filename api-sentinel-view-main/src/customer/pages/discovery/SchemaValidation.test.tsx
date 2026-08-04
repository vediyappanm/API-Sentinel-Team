import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import SchemaValidation from './SchemaValidation';

vi.mock('@/hooks/use-openapi-docs', () => ({
  useLatestSpec: () => ({
    data: {
      id: 'spec-2',
      spec: {
        paths: {
          '/users': { get: {} },
          '/orders': { get: {} },
          '/orders/{id}': { get: {}, delete: {} },
        },
      },
    },
    isLoading: false,
    isError: false,
  }),
  useSpecHistory: () => ({
    data: {
      total: 2,
      specs: [
        { id: 'spec-2', version: 'v2', path_count: 3, created_at: '2026-06-04T05:30:00Z' },
        { id: 'spec-1', version: 'v1', path_count: 2, created_at: '2026-06-01T05:30:00Z' },
      ],
    },
    isLoading: false,
  }),
  useSpecDiff: () => ({
    data: {
      base_spec_id: 'spec-1',
      revision_spec_id: 'spec-2',
      summary: { total_breaking_changes: 1, by_change_type: { path_removed: 1 }, by_severity: { HIGH: 1 } },
      breaking_changes: [
        {
          id: 'path_removed',
          severity: 'HIGH',
          path: '/legacy',
          method: 'GET',
          component: 'endpoint',
          message: 'Path /legacy was removed from the revised spec',
          why_it_matters: 'Clients calling this path will receive errors after rollout.',
          recommended_action: 'Keep the path available, or introduce a new version before removing it.',
          details: {},
          fingerprint: 'fingerprint-1',
        },
      ],
      recommendations: ['Keep the path available, or introduce a new version before removing it.'],
    },
    isLoading: false,
    isError: false,
  }),
  useSchemaViolations: () => ({
    data: { total: 0, violations: [] },
    isLoading: false,
    isError: false,
  }),
}));

describe('SchemaValidation', () => {
  it('renders spec path count, version history, and drift diff rows', () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <SchemaValidation />
      </MemoryRouter>,
    );

    expect(screen.getByText(/schema validation/i)).toBeInTheDocument();

    // Path count from useLatestSpec's mocked spec (3 paths)
    expect(screen.getByText(/current spec paths/i)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    // Version history row from useSpecHistory's mocked data
    expect(screen.getByText('spec-1'.slice(0, 8))).toBeInTheDocument();
    expect(screen.getByText('spec-2'.slice(0, 8))).toBeInTheDocument();
    expect(screen.getByText(/2 paths/i)).toBeInTheDocument();

    // Diff row from useSpecDiff's mocked breaking_changes
    expect(screen.getByText(/get \/legacy/i)).toBeInTheDocument();
    expect(screen.getByText(/path \/legacy was removed from the revised spec/i)).toBeInTheDocument();
  });
});
