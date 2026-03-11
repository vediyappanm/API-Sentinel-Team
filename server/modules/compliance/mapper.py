"""
Maps vulnerability categories to compliance frameworks:
- OWASP API Security Top 10 (2023)
- GDPR Article references
- HIPAA Safeguard references
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from server.models.core import Vulnerability


# ── OWASP API Top 10 (2023) ─────────────────────────────────────────────────
OWASP_MAP = {
    "BOLA":             {"id": "API1:2023", "name": "Broken Object Level Authorization"},
    "NO_AUTH":          {"id": "API2:2023", "name": "Broken Authentication"},
    "MA":               {"id": "API3:2023", "name": "Broken Object Property Level Authorization"},
    "INPUT":            {"id": "API4:2023", "name": "Unrestricted Resource Consumption"},
    "BFLA":             {"id": "API5:2023", "name": "Broken Function Level Authorization"},
    "RL":               {"id": "API4:2023", "name": "Unrestricted Resource Consumption"},
    "SM":               {"id": "API8:2023", "name": "Security Misconfiguration"},
    "INJECT":           {"id": "API10:2023","name": "Unsafe Consumption of APIs"},
    "COMMAND_INJECTION":{"id": "API10:2023","name": "Unsafe Consumption of APIs"},
    "SSRF":             {"id": "API7:2023", "name": "Server Side Request Forgery"},
    "XSS":              {"id": "API8:2023", "name": "Security Misconfiguration"},
    "LFI":              {"id": "API8:2023", "name": "Security Misconfiguration"},
    "CORS":             {"id": "API8:2023", "name": "Security Misconfiguration"},
    "CRLF":             {"id": "API8:2023", "name": "Security Misconfiguration"},
    "SSTI":             {"id": "API10:2023","name": "Unsafe Consumption of APIs"},
    "MHH":              {"id": "API8:2023", "name": "Security Misconfiguration"},
    "IIM":              {"id": "API9:2023", "name": "Improper Inventory Management"},
    "SVD":              {"id": "API8:2023", "name": "Security Misconfiguration"},
    "UHM":              {"id": "API8:2023", "name": "Security Misconfiguration"},
    "VEM":              {"id": "API8:2023", "name": "Security Misconfiguration"},
}

# ── GDPR ─────────────────────────────────────────────────────────────────────
GDPR_MAP = {
    "BOLA":             "Art. 5(1)(f) — Integrity & Confidentiality",
    "NO_AUTH":          "Art. 32 — Security of Processing",
    "MA":               "Art. 25 — Data Protection by Design",
    "BFLA":             "Art. 5(1)(f) — Integrity & Confidentiality",
    "SM":               "Art. 32 — Security of Processing",
    "SSRF":             "Art. 32 — Security of Processing",
    "COMMAND_INJECTION":"Art. 32 — Security of Processing",
    "LFI":              "Art. 32 — Security of Processing",
}

# ── HIPAA ─────────────────────────────────────────────────────────────────────
HIPAA_MAP = {
    "BOLA":             "§164.312(a)(1) — Access Control",
    "NO_AUTH":          "§164.312(d) — Person or Entity Authentication",
    "BFLA":             "§164.312(a)(1) — Access Control",
    "MA":               "§164.308(a)(3) — Workforce Access Management",
    "SM":               "§164.312(a)(2)(iv) — Encryption and Decryption",
    "SSRF":             "§164.312(e)(1) — Transmission Security",
}


class ComplianceMapper:
    """Maps vulnerability findings to compliance frameworks and generates reports."""

    def map_category(self, category: str) -> dict:
        cat = category.upper()
        return {
            "owasp_api": OWASP_MAP.get(cat, {"id": "UNKNOWN", "name": "Unclassified"}),
            "gdpr":      GDPR_MAP.get(cat, "No direct mapping"),
            "hipaa":     HIPAA_MAP.get(cat, "No direct mapping"),
        }

    async def generate_report(self, account_id: int, db: AsyncSession) -> dict:
        """Aggregate all open vulnerabilities into a compliance summary."""
        result = await db.execute(
            select(Vulnerability.type, func.count(Vulnerability.id))
            .where(Vulnerability.account_id == account_id, Vulnerability.status == "OPEN")
            .group_by(Vulnerability.type)
        )
        rows = result.all()

        owasp_summary = {}
        gdpr_violations = []
        hipaa_violations = []
        total_vulns = 0

        for category, count in rows:
            total_vulns += count
            mapping = self.map_category(category or "UNKNOWN")

            owasp = mapping["owasp_api"]
            owasp_id = owasp["id"]
            if owasp_id not in owasp_summary:
                owasp_summary[owasp_id] = {
                    "id": owasp_id,
                    "name": owasp["name"],
                    "count": 0,
                    "categories": [],
                }
            owasp_summary[owasp_id]["count"] += count
            owasp_summary[owasp_id]["categories"].append(category)

            gdpr = mapping["gdpr"]
            if gdpr != "No direct mapping" and gdpr not in gdpr_violations:
                gdpr_violations.append(gdpr)

            hipaa = mapping["hipaa"]
            if hipaa != "No direct mapping" and hipaa not in hipaa_violations:
                hipaa_violations.append(hipaa)

        return {
            "account_id": account_id,
            "total_open_vulnerabilities": total_vulns,
            "owasp_api_top_10": {
                "compliant": len(owasp_summary) == 0,
                "violations": list(owasp_summary.values()),
            },
            "gdpr": {
                "compliant": len(gdpr_violations) == 0,
                "articles_violated": gdpr_violations,
            },
            "hipaa": {
                "compliant": len(hipaa_violations) == 0,
                "safeguards_violated": hipaa_violations,
            },
        }
