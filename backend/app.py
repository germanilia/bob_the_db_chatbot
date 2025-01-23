import logging
import traceback
from typing import List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from services.database_service import DatabaseService
from services.bedrock_service import BedrockService
from services.connection_service import ConnectionService
from services.query_service import QueryService
from services.sql_generation_service import SQLGenerationService
from models.models import AIConnection
import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://0.0.0.0:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Initialize services with logging
logger.info("Initializing application services...")
db_service = DatabaseService()
bedrock_service = BedrockService()
connection_service = ConnectionService()
query_service = QueryService()
logger.info("All services initialized successfully")

@app.post("/api/connections", status_code=201)
async def add_connection(connection: AIConnection) -> dict[str, str]:
    try:
        logger.info(f"Attempting to add new connection: {connection.name}")
        logger.debug(f"Connection details: {connection.dict(exclude={'password'})}")
        
        if not connection.name:
            logger.warning("Add connection failed - missing connection name")
            raise HTTPException(status_code=400, detail="Connection name is required")
            
        await db_service.test_connection(connection)
        logger.debug(f"Connection test successful for: {connection.name}")
        
        await connection_service.add_connection(connection)
        logger.info(f"Connection added successfully: {connection.name}")
        
        return {"message": "Connection added successfully"}
        
    except ValueError as e:
        logger.error(f"Validation error in add_connection: {str(e)}")
        logger.debug(traceback.format_exc())
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.critical(f"Unexpected error in add_connection: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/connections")        
async def get_connections() -> List[AIConnection]:
    try:
        logger.info("Fetching all connections")
        connections = await connection_service.get_ai_connections()
        logger.debug(f"Found {len(connections)} connections")
        return connections
    except Exception as e:
        logger.error(f"Error in get_connections: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/connections/{name}")
async def delete_connection(name: str) -> dict[str, str]:
    try:
        logger.info(f"Deleting connection: {name}")
        await connection_service.delete_connection(name)
        # Delete schema file if it exists
        schema_path = db_service._get_schema_path(name)
        if schema_path.exists():
            logger.debug(f"Deleting schema file for connection: {name}")
            schema_path.unlink()
        logger.info(f"Connection deleted successfully: {name}")
        return {"message": "Connection deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting connection {name}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

class QueryRequest(BaseModel):
    prompt: str
    connection_name: str
    conversation_id: int  # Add this field

@app.post("/api/query")
async def execute_query(request: QueryRequest):
    sql_service = SQLGenerationService()
    
    # Analyze query type first
    analysis = await sql_service.analyze_query_type(request.prompt)
    
    if analysis.get("query_type") == "multi" and len(analysis.get("steps", [])) > 1:
        # Process as multi-step query
        return await handle_multi_step(
            analysis["steps"], 
            request.connection_name,
            original_prompt=request.prompt
        )
    else:
        # Process as single query
        return await handle_single_query(
            request.prompt,
            request.connection_name,
            request.conversation_id
        )

async def handle_single_query(prompt: str, connection_name: str, conversation_id: int):
    max_attempts = 4
    attempt = 0
    error_history = []  # Changed from last_error to track history
    sql_service = SQLGenerationService()
    
    while attempt < max_attempts:
        attempt += 1
        try:
            logger.info(f"Attempt {attempt} for query: {prompt}")
            
            # Generate SQL with full error history
            ai_response = await sql_service.generate_sql(
                prompt,
                connection_name,
                error_history=error_history,  # Changed parameter name and type
                attempt=attempt
            )
            
            # Get connection and execute query
            connection = await connection_service.get_connection_by_name(connection_name)
            results = await db_service.get_data_table(connection, ai_response["query"])
            
            # Generate visualizations first
            visual_response = await sql_service.generate_visuals(
                results,
                prompt
            )
            visuals = visual_response.get("visualizations", [])
            
            logger.info(f"Query succeeded on attempt {attempt}")
            
            # Save successful query with visualizations
            result_data = {
                "query": ai_response["query"],
                "summary": ai_response["summary"],
                "results": results,
                "visuals": visuals,
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
            
            await query_service.add_conversation_message(
                conversation_id=conversation_id,
                prompt=prompt,
                sql_query=ai_response["query"],
                results_summary=ai_response["summary"],
                result_data=result_data
            )
            
            return {
                "type": "single",
                "query": ai_response["query"],
                "summary": ai_response["summary"],
                "results": results,
                "visuals": visuals,
                "attempts": attempt,
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            error_msg = str(e)
            error_history.append(f"Attempt {attempt} error: {error_msg}")  # Store all errors
            logger.warning(f"Attempt {attempt} failed: {error_msg}")
            
            if attempt >= max_attempts:
                logger.error(f"Query failed after {max_attempts} attempts")
                raise HTTPException(
                    status_code=500,
                    detail={
                        "message": "Failed to generate valid query",
                        "errors": error_history,  # Return full history
                        "attempts": attempt
                    }
                )

async def handle_multi_step(steps: list, connection_name: str, original_prompt: str):
    sql_service = SQLGenerationService()
    db_service = DatabaseService()
    connection_service = ConnectionService()
    
    context = {
        "schema": await db_service.get_stored_schema(connection_name),
        "previous_results": [],
        "previous_queries": []
    }
    
    all_steps = []
    
    for step in steps:
        try:
            # Generate SQL with chain context
            ai_response = await sql_service.generate_chained_sql(step, context)
            connection = await connection_service.get_connection_by_name(connection_name)
            results = await db_service.get_data_table(connection, ai_response["query"])
            
            # Update context
            context["previous_results"] = results
            context["previous_queries"].append(ai_response["query"])
            
            # Store step results
            all_steps.append({
                "prompt": step,
                "query": ai_response["query"],
                "results": results,
                "summary": ai_response["summary"]
            })
            
        except Exception as e:
            logger.error(f"Failed at step '{step}': {str(e)}")
            return {
                "type": "multi",
                "steps": all_steps,
                "error": str(e),
                "failed_step": step
            }
    
    # Generate visuals for final step
    visual_response = await sql_service.generate_visuals(
        context["previous_results"],
        original_prompt
    )
    
    return {
        "type": "multi",
        "steps": all_steps,
        "visuals": visual_response.get("visualizations", []),
        "timestamp": datetime.datetime.utcnow().isoformat()
    }

class CreateConversationRequest(BaseModel):
    name: str
    user_id: int
    connection_name: str  # Add this field

@app.post("/api/conversations")
async def create_conversation(req: CreateConversationRequest):
    try:
        conversation = await query_service.create_conversation(
            user_id=req.user_id,
            connection_name=req.connection_name,  # Use the passed connection name
            name=req.name
        )
        return conversation
    except Exception as e:
        logger.error(f"Error creating conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/conversations")
async def get_all_conversations(user_id: int):
    try:
        conversations = await query_service.get_conversations(connection_name=None, user_id=user_id)
        return conversations
    except Exception as e:
        logger.error(f"Error fetching all conversations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/conversations/{connection_name}")
async def get_conversations_by_connection(connection_name: str, user_id: int):
    try:
        conversations = await query_service.get_conversations(connection_name=connection_name, user_id=user_id)
        return conversations
    except Exception as e:
        logger.error(f"Error fetching conversations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/users/create-default")
async def create_default_user():
    try:
        from models.models import User
        from database import get_db
        
        async with next(get_db()) as session:
            default_user = User(
                email="default@example.com",
                hashed_password="temp_password"  # Remove after adding auth
            )
            session.add(default_user)
            await session.commit()
            
        return {"message": "Default user created"}
    except Exception as e:
        logger.error(f"Error creating default user: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: int):
    try:
        await query_service.delete_conversation(conversation_id)
        return {"message": "Conversation deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/connections/{name}/schema")
async def get_schema(name: str):
    try:
        logger.info(f"Fetching schema for connection: {name}")
        schema = await db_service.get_stored_schema(name)
        logger.debug(f"Schema retrieved for {name} - length: {len(schema)} characters")
        return {"schema": schema, "timestamp": datetime.datetime.utcnow().isoformat()}
    except FileNotFoundError:
        logger.warning(f"Schema not found for connection: {name}")
        raise HTTPException(status_code=404, detail="Schema not found")
    except Exception as e:
        logger.error(f"Error retrieving schema for {name}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/connections/{name}/schema/regenerate")
async def regenerate_schema(name: str):
    try:
        logger.info(f"Regenerating schema for connection: {name}")
        
        # Get the connection details
        connection = await connection_service.get_connection_by_name(name)
        
        # Generate new schema
        new_schema = await db_service.generate_schema(connection)
        await db_service.store_schema(name, new_schema)
        
        logger.info(f"Schema regenerated successfully for: {name}")
        return {"schema_content": new_schema, "timestamp": datetime.datetime.utcnow().isoformat()}
        
    except Exception as e:
        logger.error(f"Error regenerating schema for {name}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
