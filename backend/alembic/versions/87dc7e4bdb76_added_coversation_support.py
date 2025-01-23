"""added coversation support

Revision ID: 87dc7e4bdb76
Revises: 4fe2e505b2ad
Create Date: 2025-01-23 08:52:01.313893

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '87dc7e4bdb76'
down_revision: Union[str, None] = '4fe2e505b2ad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index('ix_history_id', table_name='history')
    op.drop_table('history')
    op.add_column('conversations', sa.Column('name', sa.String(length=100), nullable=False))
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('conversations', 'name')
    op.create_table('history',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('prompt', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('query', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('connection_name', sa.VARCHAR(length=50), autoincrement=False, nullable=True),
    sa.Column('timestamp', postgresql.TIMESTAMP(), autoincrement=False, nullable=True),
    sa.Column('user_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='history_user_id_fkey'),
    sa.PrimaryKeyConstraint('id', name='history_pkey')
    )
    op.create_index('ix_history_id', 'history', ['id'], unique=False)
    # ### end Alembic commands ###
