from server.modules.utils.finding_fingerprint import (
    collapse_by_fingerprint,
    nuclei_fingerprint,
    source_finding_fingerprint,
    vulnerability_fingerprint,
)


def test_vulnerability_fingerprint_ignores_transient_evidence_fields():
    first = {
        "account_id": 1000000,
        "template_id": "auth-check",
        "endpoint_id": "ep-1",
        "method": "GET",
        "type": "BROKEN_AUTH",
        "evidence": {"request_id": "abc", "status_code": 200},
    }
    second = {
        "account_id": 1000000,
        "template_id": "auth-check",
        "endpoint_id": "ep-1",
        "method": "GET",
        "type": "BROKEN_AUTH",
        "evidence": {"request_id": "xyz", "status_code": 200},
    }

    assert vulnerability_fingerprint(first) == vulnerability_fingerprint(second)


def test_source_and_nuclei_fingerprints_are_stable():
    source_finding = {
        "account_id": 1000000,
        "repo_id": "repo-1",
        "file_path": "app/routes.py",
        "line_number": 12,
        "finding_type": "ENDPOINT_DISCOVERED",
        "title": "Endpoint: /users",
        "endpoint_id": "ep-1",
    }
    nuclei_findings = [
        {
            "template-id": "api-exposure",
            "name": "API Exposure",
            "severity": "high",
            "matched-at": "https://api.example.com/users",
        },
        {
            "template-id": "api-exposure",
            "name": "API Exposure",
            "severity": "high",
            "matched-at": "https://api.example.com/users",
        },
    ]

    assert source_finding_fingerprint(source_finding)
    unique, duplicates = collapse_by_fingerprint(
        nuclei_findings,
        lambda item: nuclei_fingerprint(item, target="https://api.example.com", account_id=1000000),
    )
    assert len(unique) == 1
    assert len(duplicates) == 1
