"""add chartmind_analyses table

Revision ID: 0003_chartmind
Revises: 0002_candles
Create Date: 2026-10-16
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_chartmind"
down_revision: Union[str, None] = "0002_candles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chartmind_analyses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=False),
        sa.Column("interval", sa.String(length=8), nullable=False),
        sa.Column("trend", sa.String(length=16), nullable=False),
        sa.Column("direction", sa.String(length=16), nullable=False),
        sa.Column("data_source", sa.String(length=64), nullable=False),
        sa.Column("is_real", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("has_screenshot", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("candles_analyzed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("result_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_chartmind_analyses_user_id", "chartmind_analyses", ["user_id"])
    op.create_index("ix_chartmind_analyses_created_at", "chartmind_analyses", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_chartmind_analyses_created_at", table_name="chartmind_analyses")
    op.drop_index("ix_chartmind_analyses_user_id", table_name="chartmind_analyses")
    op.drop_table("chartmind_analyses")
