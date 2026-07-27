import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import EvidenceViewer from './EvidenceViewer';

describe('EvidenceViewer', () => {
  it('falls back to raw text when the evidence is not JSON', () => {
    render(<EvidenceViewer evidence="Authorization: Bearer redacted-token" />);
    expect(screen.getByText('Authorization: Bearer redacted-token')).toBeInTheDocument();
  });

  it('renders sent request and received response as structured blocks', () => {
    const evidence = JSON.stringify({
      finding_status: 'CONFIRMED',
      sent_request: {
        method: 'GET',
        url: 'https://api.example.com/users/42',
        headers: { Authorization: 'Bearer ****' },
      },
      received_response: {
        status_code: 200,
        body: '{"id":42,"email":"user@example.com"}',
      },
      evidence_completeness: { complete: true, present: ['status'], missing: [] },
      remediation: 'Enforce object-level authorization checks.',
    });

    render(<EvidenceViewer evidence={evidence} />);

    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
    expect(screen.getByText('Evidence complete')).toBeInTheDocument();
    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('https://api.example.com/users/42')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('Enforce object-level authorization checks.')).toBeInTheDocument();
  });

  it('shows a missing-fields badge when evidence is incomplete', () => {
    const evidence = JSON.stringify({
      evidence_completeness: { complete: false, present: [], missing: ['sent_request', 'received_response'] },
    });

    render(<EvidenceViewer evidence={evidence} />);

    expect(screen.getByText('Missing 2 field(s)')).toBeInTheDocument();
  });

  it('renders the reproduction curl command', () => {
    const evidence = JSON.stringify({
      reproduction: { curl: "curl -i -X GET 'https://api.example.com/users/42'" },
    });

    render(<EvidenceViewer evidence={evidence} />);

    expect(screen.getByText(/curl -i -X GET/)).toBeInTheDocument();
  });

  it('renders simple detector-shaped evidence (engine/type/confidence/rationale) as key-value rows', () => {
    const evidence = JSON.stringify({
      engine: 'sqli_probe',
      type: 'SQLI',
      confidence: 'HIGH',
      rationale: 'Boolean-based response size differential detected',
    });

    render(<EvidenceViewer evidence={evidence} />);

    expect(screen.getByText('engine:')).toBeInTheDocument();
    expect(screen.getByText('sqli_probe')).toBeInTheDocument();
    expect(screen.getByText('rationale:')).toBeInTheDocument();
  });

  it('falls back to raw text for JSON arrays (not an evidence object)', () => {
    render(<EvidenceViewer evidence="[1,2,3]" />);
    expect(screen.getByText('[1,2,3]')).toBeInTheDocument();
  });
});
