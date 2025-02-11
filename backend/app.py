import logging
import traceback
from typing import Dict, List, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from models.schemas import AIConnection
from services.database_service import DatabaseService
from services.bedrock_service import BedrockService
from services.connection_service import ConnectionService
from services.query_service import QueryService
from services.sql_generation_service import SQLGenerationService
import datetime
import json
from sqlalchemy import text
from sqlalchemy import select
from models.models import User
from database import get_db


def convert_value(col_name: str, value: Any, col_type: str = "") -> Any:
    """Convert a value to the appropriate type for SQL operations."""
    if value is None:
        return None

    col_type = col_type.lower()

    # Handle JSON fields first
    if "json" in col_type:
        try:
            # Return parsed JSON value for parameter binding
            return json.loads(value) if isinstance(value, str) else value
        except (json.JSONDecodeError, TypeError):
            return value  # Return original value if parsing fails

    # If the value is already a string and we're dealing with a character type,
    # or if we don't know the type, preserve the string value
    if isinstance(value, str):
        if not col_type or any(t in col_type for t in ["char", "text", "varchar"]):
            return str(value)

        try:
            # Handle numeric types
            if "integer" in col_type or "serial" in col_type:
                return int(value)
            elif any(t in col_type for t in ["numeric", "decimal", "float", "double"]):
                return float(value)

            # Handle boolean type
            elif "bool" in col_type:
                return value.lower() in ("true", "t", "yes", "y", "1")

            # Handle datetime types
            elif any(t in col_type for t in ["timestamp", "date", "time"]):
                if "T" in value and "+" in value:
                    return datetime.datetime.fromisoformat(value)

        except ValueError:
            return str(value)

    # If the value is not a string, convert it to string for character types
    elif any(t in col_type for t in ["char", "text", "varchar"]):
        return str(value)

    return value


class BatchSQLRequest(BaseModel):
    server_name: str
    database_name: str
    sql_queries: list[str]


class SQLExecuteRequest(BaseModel):
    sql: str
    connection_name: str
    database_name: str


class CreateConversationRequest(BaseModel):
    name: str
    user_id: int
    connection_name: str
    database_name: str

class QueryRequest(BaseModel):
    prompt: str
    connection_name: str
    conversation_id: int | None = None  # Make it optional with None as default
    database_name: str
    table_name: str
    mode: str = "ask"  # Default to 'ask' mode

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:9877",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:9877",
        "http://0.0.0.0:5173",
        "http://0.0.0.0:9877",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Initialize services with logging
logger.info("Initializing application services...")
db_service = DatabaseService()
bedrock_service = BedrockService()
connection_service = ConnectionService()
sql_generation_service = SQLGenerationService()
query_service = QueryService()
logger.info("All services initialized successfully")

async def handle_single_query(
    prompt: str, connection: AIConnection, conversation_id: int | None, mode: str, table_name: str
):
    max_attempts = 4
    attempt = 0
    error_history = []
    sql_service = SQLGenerationService()

    while attempt < max_attempts:
        attempt += 1
        try:
            logger.info(f"Attempt {attempt} for query: {prompt}")
            prompt += f"\n Table: {table_name}, Database: {connection.database_name}, Server: {connection.name}"
            # Generate SQL with full error history
            ai_response = await sql_service.generate_sql(
                prompt,
                connection,
                error_history=error_history,
                attempt=attempt,
            )
            
            # Create base result data
            result_data = {
                "query": ai_response["query"],
                "summary": ai_response["summary"],
                "results": [],
                "visuals": [],
                "timestamp": datetime.datetime.utcnow().isoformat(),
            }

            if mode == "ask":
                return {
                    "query": ai_response["query"],
                    "summary": ai_response["summary"],
                    "timestamp": datetime.datetime.utcnow().isoformat(),
                }

            # Check for foreign key violations first
            try:
                results = await db_service.get_data_table(
                    connection, ai_response["query"]
                )
            except Exception as db_error:
                error_msg = str(db_error).lower()
                if (
                    "foreign key" in error_msg
                    or "violates foreign key constraint" in error_msg
                ):
                    logger.error(f"Foreign key constraint violation: {error_msg}")
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "message": "Foreign key constraint violation",
                            "error": str(db_error),
                            "query": ai_response["query"],
                        },
                    )
                raise  # Re-raise other database errors

            # Generate visualizations first
            visual_response = await sql_service.generate_visuals(results, prompt)
            visuals = visual_response.get("visualizations", [])

            logger.info(f"Query succeeded on attempt {attempt}")

            # Update result data with results and visuals
            result_data.update({
                "results": results,
                "visuals": visuals,
            })

            # Save message to conversation only once
            if conversation_id:
                try:
                    await query_service.add_conversation_message(
                        conversation_id=conversation_id,
                        prompt=prompt,
                        sql_query=ai_response["query"],
                        results_summary=ai_response["summary"],
                        result_data=result_data,
                        database_name=connection.database_name,
                        connection_name=connection.name,
                    )
                except Exception as e:
                    logger.error(f"Error saving conversation message: {str(e)}")
                    # Continue even if saving fails

            return {
                "type": "single",
                "query": ai_response["query"],
                "summary": ai_response["summary"],
                "results": results,
                "visuals": visuals,
                "attempts": attempt,
                "timestamp": datetime.datetime.utcnow().isoformat(),
            }

        except Exception as e:
            error_msg = str(e)
            error_history.append(
                f"Attempt {attempt} error: {error_msg}"
            )  # Store all errors
            logger.warning(f"Attempt {attempt} failed: {error_msg}")

            if attempt >= max_attempts:
                logger.error(f"Query failed after {max_attempts} attempts")
                raise HTTPException(
                    status_code=500,
                    detail={
                        "message": "Failed to generate valid query",
                        "errors": error_history,  # Return full history
                        "attempts": attempt,
                    },
                )

async def handle_multi_step(steps: list, connection_name: str, original_prompt: str):
    """Handle multi-step query execution."""
    results = []
    for i, step in enumerate(steps):
        try:
            connection = await connection_service.get_connection_by_name(connection_name)
            result = await db_service.get_data_table(connection, step["query"])
            results.append({
                "prompt": step["prompt"],
                "query": step["query"],
                "results": result,
                "summary": step["summary"]
            })
        except Exception as e:
            logger.error(f"Error in step {i + 1}: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail={
                    "message": f"Error in step {i + 1}",
                    "error": str(e),
                    "failed_step": i + 1,
                    "steps": results
                }
            )
    
    return {
        "type": "multi",
        "steps": results,
        "summary": f"Executed {len(steps)} steps successfully"
    }

@app.on_event("startup")
async def startup_event():
    """Run startup tasks."""
    await ensure_default_user()

@app.get("/api/tables/{connection_name}")
async def get_tables(connection_name: str, database_name: str | None = None):
    try:
        logger.info(
            f"Fetching tables for connection: {connection_name}, database: {database_name}"
        )
        logger.debug(f"Request details: {locals()}")

        connection = await connection_service.get_connection_by_name(connection_name)
        if database_name:
            connection.database_name = database_name
        logger.debug(f"Connection object: {connection.dict(exclude={'password'})}")

        tables = await db_service.get_tables(connection)
        logger.debug(f"Tables retrieved: {tables}")

        return {"tables": tables, "timestamp": datetime.datetime.utcnow().isoformat()}
    except Exception as e:
        logger.error(f"Error getting tables: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to fetch tables: {str(e)}")

@app.post("/api/query")
async def execute_query(request: QueryRequest):
    sql_service = SQLGenerationService()
    logger.info(f"Executing query with conversation_id: {request.conversation_id}")

    # Get connection and update database name
    connection = await connection_service.get_connection_by_name(
        request.connection_name
    )
    connection.database_name = request.database_name

    # For DDL statements, use direct connection
    if request.prompt.lower().startswith(('create', 'drop', 'alter')):
        engine = await db_service._get_engine(connection)
        async with engine.connect() as conn:
            await conn.execute(text("COMMIT"))  # Close any open transaction

    # Create new conversation if no conversation_id provided
    conversation_id = request.conversation_id
    if not conversation_id:
        try:
            logger.info("Creating new conversation")
            conversation = await query_service.create_conversation(
                name=f"Query: {request.prompt[:50]}...",  # Use prompt as conversation name
                user_id=1,  # Using default user
                connection_name=request.connection_name,
                database_name=request.database_name
            )
            # Get the actual value from the SQLAlchemy model
            conversation_id = getattr(conversation, 'id')
            logger.info(f"Created new conversation with ID: {conversation_id}")
        except Exception as e:
            logger.error(f"Error creating conversation: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

    # Analyze query type first
    analysis = await sql_service.analyze_query_type(request.prompt)

    if analysis.get("query_type") == "multi" and len(analysis.get("steps", [])) > 1:
        # Process as multi-step query
        result = await handle_multi_step(
            analysis["steps"], request.connection_name, original_prompt=request.prompt
        )
        result["conversation_id"] = conversation_id
        return result
    else:
        # Process as single query
        result = await handle_single_query(
            request.prompt, connection, conversation_id, request.mode, request.table_name
        )

        # Add conversation_id to the response
        if result and isinstance(result, dict):
            result["conversation_id"] = conversation_id

            # Serialize any JSON objects in the results
            results = result.get("results", [])
            if results:
                serialized_results = []
                for row in results:
                    serialized_row = {}
                    for key, value in row.items():
                        if isinstance(value, (dict, list)):
                            serialized_row[key] = json.dumps(value)
                        elif isinstance(value, (datetime.date, datetime.datetime)):
                            serialized_row[key] = value.isoformat()
                        else:
                            serialized_row[key] = value
                    serialized_results.append(serialized_row)
                result["results"] = serialized_results

        return result

@app.post("/api/execute-raw-sql")
async def execute_raw_sql(request: SQLExecuteRequest):
    try:
        connection = await connection_service.get_connection_by_name(
            request.connection_name
        )
        # Update the database name for this query
        connection.database_name = request.database_name

        # Execute query
        start_time = datetime.datetime.utcnow()
        
        # For DDL and DML statements, use direct connection with explicit transaction
        if request.sql.strip().upper().startswith(('CREATE', 'DROP', 'ALTER', 'INSERT', 'UPDATE', 'DELETE')):
            engine = await db_service._get_engine(connection)
            async with engine.connect() as conn:
                async with conn.begin():
                    await conn.execute(text(request.sql))
            results = []
            affected_rows = 0
        else:
            results = await db_service.get_data_table(connection, request.sql)
            affected_rows = len(results) if results else 0
            
        execution_time = datetime.datetime.utcnow() - start_time

        # Generate summary
        summary = f"Executed SQL query successfully in {execution_time.total_seconds():.2f}s"
        if affected_rows is not None:
            summary += f"\nAffected rows: {affected_rows}"

        return {
            "type": "single",
            "query": request.sql,
            "summary": summary,
            "results": results,
            "affected_rows": affected_rows
        }

    except Exception as e:
        logger.error(f"Error executing SQL: {str(e)}")
        error_message = str(e)
        if "Query execution failed:" in error_message:
            error_message = error_message.replace("Query execution failed:", "").strip()
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Error executing SQL query",
                "error": error_message,
                "query": request.sql
            }
        )

@app.get("/api/conversations")
async def get_all_conversations(user_id: int):
    try:
        conversations = await query_service.get_conversations(
            connection_name=None, user_id=user_id
        )
        return conversations
    except Exception as e:
        logger.error(f"Error fetching all conversations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/conversations/{connection_name}")
async def get_conversations_by_connection(connection_name: str, user_id: int):
    try:
        conversations = await query_service.get_conversations(
            connection_name=connection_name, user_id=user_id
        )
        return conversations
    except Exception as e:
        logger.error(f"Error fetching conversations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: int):
    try:
        await query_service.delete_conversation(conversation_id)
        return {"message": "Conversation deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/servers")
async def get_servers() -> Dict[str, List[Dict[str, Any]]]:
    try:
        servers = await connection_service.get_servers()
        return {"servers": servers}
    except Exception as e:
        logger.error(f"Error getting servers: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/servers")
async def add_server(connection: AIConnection) -> Dict[str, Any]:
    try:
        server_id = await connection_service.add_server(connection)
        # Get the full server object to return
        server_data = await connection_service.get_server_by_id(server_id)
        return server_data
    except Exception as e:
        logger.error(f"Error adding server: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/servers/{server_id}")
async def delete_server(server_id: str):
    try:
        await connection_service.delete_server(server_id)
        return {"message": "Server deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting server: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/servers/{server_id}/databases")
async def manage_database(server_id: str, database_name: str, operation: str) -> dict[str, str]:
    try:
        server = await connection_service.get_server_by_id(server_id)
        # Create AIConnection with required fields
        server_conn = AIConnection(
            name=server["alias"],
            db_type=server["db_type"],
            host=server["host"],
            port=server["port"],
            username=server["username"],
            password=server["password"],
            database_name="postgres",  # Use default database for operations
            server_id=server["id"],
            alias=server["alias"],
        )
        
        query = ""
        queries = []
        if operation == "create":
            queries.append(f"CREATE DATABASE {database_name};")
        elif operation == "delete":
            # First terminate connections, then drop database
            queries.extend([
                f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{database_name}';",
                f"DROP DATABASE {database_name};"
            ])
        else:
            raise HTTPException(status_code=400, detail="Invalid operation")

        # Execute queries in batch
        engine = await db_service._get_engine(server_conn)
        async with engine.connect() as conn:
            await conn.execute(text("COMMIT"))  # Close any open transaction
            for query in queries:
                await conn.execute(text(query))
        return {"message": f"Database {operation}d successfully"}
    except Exception as e:
        logger.error(f"Error {operation}ing database: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/servers/{server_id}/databases")
async def get_server_databases(server_id: str) -> dict[str, List[str]]:
    try:
        server = await connection_service.get_server_by_id(server_id)
        # Create AIConnection with required fields
        server_conn = AIConnection(
            name=server["alias"],  # Use alias as name
            db_type=server["db_type"],
            host=server["host"],
            port=server["port"],
            username=server["username"],
            password=server["password"],
            database_name="postgres",  # Use default database for listing
            server_id=server["id"],
            alias=server["alias"],
        )
        databases = await connection_service.get_available_databases(server_conn)
        return {"databases": databases}
    except Exception as e:
        logger.error(f"Error getting databases for server {server_id}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/servers/{server_id}/select")
async def select_server(server_id: str) -> dict[str, str]:
    try:
        server = await connection_service.get_server_by_id(server_id)
        logger.info(f"Generating schema for server {server_id}")
        logger.info(f"Schema generated and stored for server {server_id}")

        # Ensure a default connection exists for this server
        await connection_service.ensure_default_connection(server)
        return {"message": "Server selected, connection created, and schema generated"}
    except Exception as e:
        logger.error(f"Error selecting server {server_id}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tables/batch")
async def execute_batch_sql(request: BatchSQLRequest):
    try:
        if not request.sql_queries:
            raise HTTPException(status_code=400, detail="No SQL queries provided")

        connection = await connection_service.get_connection_by_name(
            request.server_name
        )
        connection.database_name = request.database_name

        # Begin transaction
        engine = await db_service._get_engine(connection)
        total_affected = 0

        async with engine.connect() as conn:
            async with conn.begin():
                try:
                    for query in request.sql_queries:
                        logger.info(f"Executing query: {query}")
                        result = await conn.execute(text(query))
                        total_affected += (
                            result.rowcount if hasattr(result, "rowcount") else 0
                        )
                        logger.info(
                            f"Query affected {result.rowcount if hasattr(result, 'rowcount') else 0} rows"
                        )

                    return {
                        "message": "Batch execution successful",
                        "affected_rows": total_affected,
                    }
                except Exception as e:
                    logger.error(f"Error executing batch queries: {str(e)}")
                    logger.error(traceback.format_exc())
                    # Rollback will happen automatically due to context manager
                    raise HTTPException(
                        status_code=500,
                        detail={
                            "message": "Error executing batch queries",
                            "error": str(e),
                        },
                    )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in batch execution: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tables/{connection_name}/{table_name}")
async def get_table_data(connection_name: str, table_name: str, database_name: str):
    try:
        logger.info(
            f"Fetching data for table: {table_name} from connection: {connection_name}, database: {database_name}"
        )

        connection = await connection_service.get_connection_by_name(connection_name)
        connection.database_name = database_name

        # Get table data using a simple SELECT query
        query = f"SELECT * FROM {table_name} LIMIT 1000"  # Limit to prevent large data transfers
        results = await db_service.get_data_table(connection, query)

        # Get column names from the first row if results exist
        columns = list(results[0].keys()) if results else []

        return {
            "data": results,
            "columns": columns,
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting table data: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to fetch table data: {str(e)}")

@app.post("/api/conversations")
async def create_conversation(request: CreateConversationRequest):
    try:
        logger.info(f"Creating new conversation: {request}")
        conversation = await query_service.create_conversation(
            name=request.name,
            user_id=request.user_id,
            connection_name=request.connection_name,
            database_name=request.database_name
        )
        logger.info(f"Created conversation with ID: {conversation.id}")
        return {
            "id": conversation.id,
            "name": conversation.name,
            "created_at": conversation.created_at.isoformat(),
            "database_name": conversation.database_name
        }
    except Exception as e:
        logger.error(f"Error creating conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def ensure_default_user():
    """Check if default user exists."""
    try:
        db = next(get_db())
        async with db as session:
            # Check if any user exists
            result = await session.execute(select(User))
            if not result.scalar_one_or_none():
                logger.info("No users found. Creating default user...")
                default_user = User(
                    email="default@example.com",
                    hashed_password="temp_password",  # Remove after adding auth
                )
                session.add(default_user)
                await session.commit()
                logger.info("Default user created successfully")
            else:
                logger.debug("Default user exists, skipping creation")
    except Exception as e:
        logger.error(f"Error checking default user: {str(e)}")
        logger.error(traceback.format_exc())
        # Don't raise the exception - just log it
        # The application can continue even if user check fails
