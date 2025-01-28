"""add_database_name_to_conversations

Revision ID: c936c54bf2a4
Revises: ac6c8c7eb310
Create Date: 2024-03-14 15:05:15.123456

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c936c54bf2a4'
down_revision: Union[str, None] = 'ac6c8c7eb310'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add database_name column to conversations table
    op.add_column('conversations', sa.Column('database_name', sa.String(length=100), nullable=True))


def downgrade() -> None:
    # Remove the column
    op.drop_column('conversations', 'database_name')
