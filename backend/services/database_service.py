import logging
import traceback
from decimal import Decimal
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
import pandas as pd
from typing import Dict, List, Any, Union
import json
from pathlib import Path
import asyncio
from datetime import datetime
from models.schemas import AIConnection, DatabaseType
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
        self.engine_creation_times = {}  # Track engine creation times
        self.connection_service = ConnectionService()

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
        current_time = datetime.now()
        
        # Create a unique key that includes both connection name and database name
        connection_key = f"{connection.name}_{connection.database_name}"
        
        # Check if engine exists and needs to be disposed
        if connection_key in self.engines:
            creation_time = self.engine_creation_times.get(connection_key)
            if creation_time and (current_time - creation_time).total_seconds() > 300:  # 5 minutes
                await self.engines[connection_key].dispose()
                del self.engines[connection_key]
                del self.engine_creation_times[connection_key]
        
        # Create new engine if needed
        if connection_key not in self.engines:
            if connection_key not in self.engine_locks:
                self.engine_locks[connection_key] = asyncio.Lock()
            
            async with self.engine_locks[connection_key]:
                # Double check after acquiring lock
                if connection_key not in self.engines:
                    connection_url = self._create_connection_url(connection)
                    logger.info(f"Creating new engine for {connection_key} with database {connection.database_name}")
                    self.engines[connection_key] = create_async_engine(
                        connection_url,
                        pool_size=5,  # Reduced pool size
                        max_overflow=0,  # No overflow connections
                        pool_timeout=30,
                        pool_recycle=300,  # Recycle connections every 5 minutes
                        pool_pre_ping=True,  # Check connection validity
                        future=True
                    )
                    self.engine_creation_times[connection_key] = current_time
        
        return self.engines[connection_key]

    async def _execute_with_connection(self, connection: AIConnection, query: str, params: Union[dict, list, None] = None):
        engine = await self._get_engine(connection)
        async with engine.connect() as conn:
            if isinstance(params, list):
                result = await conn.execute(text(query), tuple(params))
            else:
                result = await conn.execute(text(query), params or {})
            return result

    async def test_connection(self, connection: AIConnection) -> bool:
        """Test database connection asynchronously"""
        try:
            engine = await self._get_engine(connection)
            async with engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
                await self.generate_schema(connection)
                return True
        except SQLAlchemyError as e:
            raise Exception(f"Connection failed: {str(e)}")
    
    async def get_tables(self, connection: AIConnection) -> List[str]:
         """Get list of tables in the database"""
         logger.info(f"Getting tables for {connection.name} ({connection.db_type})")
         logger.info(f"Connection details - DB Name: {connection.database_name}, Host: {connection.host}, Port: {connection.port}")
         
         try:
             if not connection.database_name:
                 raise ValueError("Database name is not set for this connection")
             
             engine = await self._get_engine(connection)
             
             if connection.db_type == DatabaseType.POSTGRESQL:
                 # First, get all available schemas
                 schemas_query = """
                     SELECT schema_name 
                     FROM information_schema.schemata 
                     WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
                     ORDER BY schema_name
                 """
                 
                 async with engine.connect() as conn:
                     async with conn.begin():
                         # Get all schemas
                         result = await conn.execute(text(schemas_query))
                         schemas = [row[0] for row in result.fetchall()]
                         
                         # Get tables for each schema
                         tables = []
                         for schema in schemas:
                             tables_query = text("""
                                 SELECT table_name 
                                 FROM information_schema.tables 
                                 WHERE table_schema = :schema
                                 AND table_type = 'BASE TABLE'
                                 ORDER BY table_name
                             """)
                             result = await conn.execute(tables_query, {"schema": schema})
                             rows = result.fetchall()
                             tables.extend(f"{schema}.{row[0]}" for row in rows)
                         
                         return tables
             else:  # MySQL
                 query = "SHOW TABLES"
                 result = await self._execute_with_connection(connection, query)
                 rows = result.fetchall()
                 tables = [row[0] for row in rows] if rows else []

             logger.info(f"Final table list: {tables}")
             return tables

         except Exception as e:
             logger.error(f"Error in get_tables for {connection.name}: {str(e)}")
             logger.error(f"Full traceback: {traceback.format_exc()}")
             raise

    async def generate_schema(self, connection: AIConnection) -> str:
        """Generate schema information asynchronously in memory"""
        try:
            engine = await self._get_engine(connection)
            async with engine.connect() as conn:
                inspector = inspect(conn.sync_connection)
                
                schema_info = []
                tables = await conn.run_sync(lambda sync_conn: inspector.get_table_names())
                
                for table_name in tables:
                    columns = await conn.run_sync(lambda sync_conn: inspector.get_columns(table_name))
                    column_info = [f"{col['name']} {col['type']}" for col in columns]
                    
                    pk_columns = await conn.run_sync(
                        lambda sync_conn: inspector.get_pk_constraint(table_name)['constrained_columns']
                    )
                    
                    schema_entry = f"Table: {table_name}\nColumns:\n  " + "\n  ".join(column_info)
                    if pk_columns:
                        schema_entry += f"\nPrimary Keys: {', '.join(pk_columns)}"
                    
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
        conn = None
        try:
            engine = await self._get_engine(connection)
            logger.info(f"Executing query: {query[:100]}...")
            logger.info(f"Using database: {connection.database_name}")
            
            # Create a new connection and set isolation level
            async with engine.connect() as conn:
                # For PostgreSQL, ensure we're using the correct schema
                if connection.db_type == DatabaseType.POSTGRESQL and not query.lower().startswith(('select', 'with')):
                    # If the table name doesn't include a schema, and it's not a full SELECT query
                    # Split on spaces and get the table reference (usually the last part)
                    parts = query.split()
                    table_ref_idx = -1
                    for i, part in enumerate(parts):
                        if part.lower() == "from":
                            table_ref_idx = i + 1
                            break
                    
                    if table_ref_idx >= 0 and table_ref_idx < len(parts):
                        table_ref = parts[table_ref_idx]
                        if '.' not in table_ref:
                            # Add schema name if not present
                            parts[table_ref_idx] = f"{table_ref}"
                            query = ' '.join(parts)
                
                # For DDL and DML statements, use explicit transaction
                is_write_query = query.strip().upper().startswith(('CREATE', 'DROP', 'ALTER', 'INSERT', 'UPDATE', 'DELETE'))
                if is_write_query:
                    async with conn.begin():
                        result = await conn.execute(text(query))
                else:
                    # Set isolation level and execute query for read-only statements
                    await conn.execute(text("SET TRANSACTION ISOLATION LEVEL READ COMMITTED"))
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
