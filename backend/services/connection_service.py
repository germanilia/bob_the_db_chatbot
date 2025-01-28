from typing import List, Dict, Any, TypedDict, Optional, AsyncGenerator, cast
from models.schemas import AIConnection, DatabaseType
from sqlalchemy import text, select
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from database import get_db
from models.models import Server
import contextlib
import logging

logger = logging.getLogger(__name__)

class ServerDict(TypedDict):
    id: str
    db_type: str
    host: str
    port: int
    username: str
    password: str
    alias: str
    database_name: Optional[str]

def safe_get(d: Optional[Dict[str, Any]], key: str, default: Any = '') -> Any:
    """Safely get a value from a dictionary that might be None."""
    if d is None:
        return default
    return d.get(key, default)

class ConnectionService:
    def __init__(self):
        db = next(get_db())
        self.async_session = async_sessionmaker(
            bind=db.bind,
            expire_on_commit=False
        )

    @contextlib.asynccontextmanager
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        async with self.async_session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def get_servers(self) -> List[Dict[str, Any]]:
        async with self.get_session() as session:
            result = await session.execute(select(Server))
            servers = result.scalars().all()
            return [{
                'id': server.server_id,
                'db_type': server.db_type,
                'host': server.host,
                'port': server.port,
                'username': server.username,
                'password': server.password,
                'alias': server.alias,
                'database_name': server.database_name
            } for server in servers]

    async def get_server_by_id(self, server_id: str) -> Dict[str, Any]:
        async with self.get_session() as session:
            result = await session.execute(
                select(Server).filter(Server.server_id == server_id)
            )
            server = result.scalar_one_or_none()
            if not server:
                raise Exception(f"Server not found: {server_id}")
            return {
                'id': server.server_id,
                'db_type': server.db_type,
                'host': server.host,
                'port': server.port,
                'username': server.username,
                'password': server.password,
                'alias': server.alias,
                'database_name': server.database_name
            }

    async def add_server(self, connection: AIConnection) -> str:
        """Add a server from connection details"""
        async with self.get_session() as session:
            # Generate a unique server ID based on connection details
            server_id = f"{connection.db_type}_{connection.host}_{connection.port}_{connection.username}"
            
            # Check if server already exists
            result = await session.execute(
                select(Server).filter(Server.server_id == server_id)
            )
            existing = result.scalar_one_or_none()
            if existing:
                # Update database_name if provided
                if connection.database_name:
                    setattr(existing, 'database_name', connection.database_name)
                    await session.commit()
                return server_id
            
            # Add new server
            new_server = Server(
                server_id=server_id,
                db_type=connection.db_type,
                host=connection.host,
                port=connection.port,
                username=connection.username,
                password=connection.password,
                alias=connection.alias,
                database_name=connection.database_name
            )
            session.add(new_server)
            await session.commit()
            
            return server_id

    async def get_connection_by_name(self, name: str) -> AIConnection:
        """Get server by alias as AIConnection"""
        async with self.get_session() as session:
            result = await session.execute(
                select(Server).filter(Server.alias == name)
            )
            server = result.scalar_one_or_none()
            if not server:
                raise Exception(f"Server not found: {name}")
            
            return AIConnection(
                name=str(server.alias),
                db_type=DatabaseType(server.db_type),
                host=str(server.host),
                port=int(cast(int, server.port)),
                username=str(server.username),
                password=str(server.password),
                database_name=str(server.database_name if server.database_name is not None else ''),
                server_id=str(server.server_id),
                alias=str(server.alias)
            )

    async def ensure_default_connection(self, server: Dict[str, Any]) -> None:
        """Ensure server has a database selected"""
        try:
            # If server already has a database, we're done
            if server.get('database_name'):
                return

            # Get available databases
            server_conn = AIConnection(
                name=server['alias'],
                db_type=server['db_type'],
                host=server['host'],
                port=server['port'],
                username=server['username'],
                password=server['password'],
                database_name='',  # Don't set a default database name
                server_id=server['id'],
                alias=server['alias']
            )
            
            try:
                databases = await self.get_available_databases(server_conn)
                if databases:
                    # Use the first non-system database as default
                    default_db = next((db for db in databases if db not in ['postgres', 'template0', 'template1']), databases[0])
                    
                    # Update server with selected database
                    async with self.get_session() as session:
                        result = await session.execute(
                            select(Server).filter(Server.server_id == server['id'])
                        )
                        server_record = result.scalar_one_or_none()
                        if server_record:
                            setattr(server_record, 'database_name', default_db)
                            await session.commit()
                            logger.info(f"Updated server {server['alias']} with default database {default_db}")
                else:
                    logger.warning(f"No databases available for server {server['alias']}")
            except Exception as e:
                logger.error(f"Error getting available databases: {str(e)}")
                # Don't set a default database if we can't get the list

        except Exception as e:
            logger.error(f"Error ensuring default database: {str(e)}")
            raise

    async def get_available_databases(self, connection: AIConnection) -> List[str]:
        try:
            # Create a connection URL without specifying the database
            if connection.db_type == DatabaseType.POSTGRESQL:
                url = URL.create(
                    "postgresql+asyncpg",
                    username=connection.username,
                    password=connection.password,
                    host=connection.host,
                    port=connection.port,
                    database="postgres"  # Connect to default postgres database
                )
                engine = create_async_engine(url, pool_pre_ping=True)
                try:
                    async with engine.connect() as conn:
                        async with conn.begin():
                            result = await conn.stream(text("SELECT datname FROM pg_database WHERE datistemplate = false;"))
                            databases = []
                            async for row in result:
                                databases.append(row[0])
                            return databases
                finally:
                    await engine.dispose()
                    
            elif connection.db_type == DatabaseType.MYSQL:
                url = URL.create(
                    "mysql+aiomysql",
                    username=connection.username,
                    password=connection.password,
                    host=connection.host,
                    port=connection.port
                )
                engine = create_async_engine(url, pool_pre_ping=True)
                try:
                    async with engine.connect() as conn:
                        async with conn.begin():
                            result = await conn.stream(text("SHOW DATABASES;"))
                            databases = []
                            async for row in result:
                                databases.append(row[0])
                            return databases
                finally:
                    await engine.dispose()
            else:
                raise ValueError(f"Unsupported database type: {connection.db_type}")
        except Exception as e:
            raise Exception(f"Failed to get available databases: {str(e)}")

    async def delete_server(self, server_id: str) -> None:
        async with self.get_session() as session:
            result = await session.execute(
                select(Server).filter(Server.server_id == server_id)
            )
            server = result.scalar_one_or_none()
            if server:
                await session.delete(server)
                await session.commit() 