from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]


def test_alembic_upgrade_head_bootstraps_fresh_database(tmp_path):
    db_path = tmp_path / "fresh-bootstrap.db"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path.as_posix()}"
    env["PYTHONPATH"] = str(ROOT)

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )

    assert result.returncode == 0, result.stderr
    assert db_path.exists()

    with sqlite3.connect(db_path) as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert "alembic_version" in tables
        assert "users" in tables
        assert "api_endpoints" in tables
        version = conn.execute("SELECT version_num FROM alembic_version").fetchone()
        assert version is not None
    assert version[0] == "20260329_acct_scoped_identity_uq"
