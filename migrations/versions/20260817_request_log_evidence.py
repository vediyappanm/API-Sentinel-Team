"""Persist captured bodies and identity on request_logs.

Revision ID: 20260817_request_log_evidence
Revises: 20260815_request_log_host
Create Date: 2026-08-17 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260817_request_log_evidence"
down_revision = "20260815_request_log_host"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(table_name)


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    return any(
        column["name"] == column_name
        for column in sa.inspect(bind).get_columns(table_name)
    )


def upgrade() -> None:
    if not _has_table("request_logs"):
        return
    columns = {
        "request_body": sa.Column("request_body", sa.Text(), nullable=True),
        "response_body": sa.Column("response_body", sa.Text(), nullable=True),
        "user_id": sa.Column("user_id", sa.String(length=128), nullable=True),
        "user_role": sa.Column("user_role", sa.String(length=64), nullable=True),
        "session_id": sa.Column("session_id", sa.String(length=128), nullable=True),
        "protocol": sa.Column("protocol", sa.String(length=32), nullable=True),
    }
    for name, column in columns.items():
        if not _has_column("request_logs", name):
            op.add_column("request_logs", column)


def downgrade() -> None:
    if not _has_table("request_logs"):
        return
    for name in ("protocol", "session_id", "user_role", "user_id", "response_body", "request_body"):
        if _has_column("request_logs", name):
            op.drop_column("request_logs", name)
