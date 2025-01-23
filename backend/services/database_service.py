import logging
from decimal import Decimal
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
import pandas as pd
from typing import Dict, List, Any
from models.models import AIConnection, DatabaseType
import json
from pathlib import Path
import asyncio
from datetime import datetime
from services.connection_service import ConnectionService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class DatabaseService:
    def __init__(self):
        self.engines = {}
        self.engine_locks = {}  # Add locking mechanism
        self.schema_folder = Path("schemas")
        self.schema_folder.mkdir(exist_ok=True, parents=True)
        self.connection_service = ConnectionService()

    def _get_schema_path(self, connection_name: str) -> Path:
        """Get the path for the schema file."""
        return self.schema_folder / f"{connection_name}.json"

    def _create_connection_url(self, connection: AIConnection) -> str:
        """Create async SQLAlchemy connection URL"""
        if connection.db_type == DatabaseType.MYSQL:
            return f"mysql+asyncmy://{connection.username}:{connection.password}@{connection.host}:{connection.port}/{connection.database_name}"
        elif connection.db_type == DatabaseType.POSTGRESQL:
            return f"postgresql+asyncpg://{connection.username}:{connection.password}@{connection.host}:{connection.port}/{connection.database_name}"
        else:
            raise ValueError(f"Unsupported database type: {connection.db_type}")

    async def _get_engine(self, connection: AIConnection):
        """Get or create async SQLAlchemy engine with thread safety"""
        if connection.name not in self.engines:
            if connection.name not in self.engine_locks:
                self.engine_locks[connection.name] = asyncio.Lock()
            
            async with self.engine_locks[connection.name]:
                # Double check after acquiring lock
                if connection.name not in self.engines:
                    connection_url = self._create_connection_url(connection)
                    self.engines[connection.name] = create_async_engine(
                        connection_url,
                        pool_size=20,
                        max_overflow=10,
                        pool_timeout=30,
                        pool_recycle=3600,
                        future=True
                    )
        return self.engines[connection.name]

    async def _execute_with_connection(self, connection: AIConnection, query: str):
        """Execute raw SQL query asynchronously"""
        engine = await self._get_engine(connection)
        async with engine.begin() as conn:
            result = await conn.execute(text(query))
            return result

    async def test_connection(self, connection: AIConnection) -> bool:
        """Test database connection asynchronously"""
        try:
            engine = await self._get_engine(connection)
            async with engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
                schema = await self.generate_schema(connection)
                await self.store_schema(connection.name, schema)
                return True
        except SQLAlchemyError as e:
            raise Exception(f"Connection failed: {str(e)}")

    async def generate_schema(self, connection: AIConnection) -> str:
        """Generate schema information asynchronously"""
        try:
            engine = await self._get_engine(connection)
            async with engine.connect() as conn:
                inspector = inspect(conn.sync_connection)
                
                schema_info = []
                tables = await conn.run_sync(lambda sync_conn: inspector.get_table_names())
                
                for table_name in tables:
                    columns = await conn.run_sync(lambda sync_conn: inspector.get_columns(table_name))
                    column_info = [f"{col['name']} {col['type']}" for col in columns]
                    
                    # Get primary keys
                    pk_columns = await conn.run_sync(
                        lambda sync_conn: inspector.get_pk_constraint(table_name)['constrained_columns']
                    )
                    
                    schema_entry = f"Table: {table_name}\nColumns:\n  " + "\n  ".join(column_info)
                    if pk_columns:
                        schema_entry += f"\nPrimary Keys: {', '.join(pk_columns)}"
                    
                    # Get foreign keys
                    fks = await conn.run_sync(
                        lambda sync_conn: inspector.get_foreign_keys(table_name)
                    )
                    if fks:
                        fk_info = [
                            f"  {', '.join(fk['constrained_columns'])} -> {fk['referred_table']}.{', '.join(fk['referred_columns'])}"
                            for fk in fks
                        ]
                        schema_entry += "\nForeign Keys:\n" + "\n".join(fk_info)
                    
                    schema_info.append(schema_entry)
                
                return "\n\n".join(schema_info)
        except SQLAlchemyError as e:
            raise Exception(f"Schema generation failed: {str(e)}")

    async def get_data_table(self, connection: AIConnection, query: str) -> List[Dict[str, Any]]:
        try:
            engine = await self._get_engine(connection)
            logger.info(f"Executing query: {query[:100]}...")
            async with engine.connect() as conn:
                # Use async context manager for execution
                async with conn.begin():
                    result = await conn.execute(text(query))
                    
                    if result.returns_rows:
                        # Proper async result handling
                        rows = result.fetchall()
                        columns = list(result.keys())
                        
                        processed_rows = []
                        for row in rows:
                            processed_row = {}
                            for idx, value in enumerate(row):
                                col_name = columns[idx]
                                if isinstance(value, Decimal):
                                    processed_row[col_name] = float(value)
                                elif isinstance(value, datetime):
                                    processed_row[col_name] = value.isoformat()
                                elif isinstance(value, int) and (value > 9007199254740991 or value < -9007199254740991):
                                    processed_row[col_name] = str(value)
                                else:
                                    processed_row[col_name] = value
                            processed_rows.append(processed_row)
                        return processed_rows
                    else:
                        return [{"affected_rows": result.rowcount}]
                        
        except SQLAlchemyError as e:
            logger.error(f"Query execution failed: {str(e)} Query: {query}")
            raise Exception(f"Query execution failed: {str(e)}")

    async def close_all_connections(self):
        """Close all database connections asynchronously"""
        for engine in self.engines.values():
            await engine.dispose()
        self.engines.clear()

    # File operations should use thread pool executor since they're blocking
    async def store_schema(self, connection_name: str, schema: str):
        loop = asyncio.get_running_loop()
        schema_path = self._get_schema_path(connection_name)
        schema_data = {
            "connection_name": connection_name,
            "schema_content": schema,
            "timestamp": pd.Timestamp.now().isoformat()
        }
        await loop.run_in_executor(
            None,  # Use default executor
            lambda: json.dump(schema_data, open(schema_path, 'w'), indent=2)
        )

    async def get_stored_schema(self, connection_name: str) -> str:
        loop = asyncio.get_running_loop()
        schema_path = self._get_schema_path(connection_name)
        if not schema_path.exists():
            raise Exception(f"No schema found: {connection_name}")
        
        data = await loop.run_in_executor(
            None,
            lambda: json.load(open(schema_path))
        )
        return data["schema_content"]

    async def execute_query(self, query: str, connection_name: str) -> list:
        try:
            connection = await self.connection_service.get_connection_by_name(connection_name)
            engine = await self._get_engine(connection)
            async with engine.connect() as conn:
                async with conn.begin():
                    result = await conn.execute(text(query))
                    
                    if result.returns_rows:
                        # Proper async result handling
                        rows = result.fetchall()
                        columns = list(result.keys())
                        
                        processed_rows = []
                        for row in rows:
                            processed_row = {}
                            for idx, value in enumerate(row):
                                col_name = columns[idx]
                                if isinstance(value, Decimal):
                                    processed_row[col_name] = float(value)
                                elif isinstance(value, datetime):
                                    processed_row[col_name] = value.isoformat()
                                elif isinstance(value, int) and (value > 9007199254740991 or value < -9007199254740991):
                                    processed_row[col_name] = str(value)
                                else:
                                    processed_row[col_name] = value
                            processed_rows.append(processed_row)
                        return processed_rows
                    else:
                        return [{"affected_rows": result.rowcount}]
        except Exception as e:
            logger.error(f"Query execution failed: {str(e)}")
            raise
