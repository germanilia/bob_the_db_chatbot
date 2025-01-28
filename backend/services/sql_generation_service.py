import json
from decimal import Decimal
from models.schemas import AIConnection
from services.connection_service import ConnectionService
from services.database_service import DatabaseService
from services.bedrock_service import BedrockService
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class SQLGenerationService:
    def __init__(self):
        self.db_service = DatabaseService()
        self.bedrock_service = BedrockService()
        self.connection_service = ConnectionService()

    async def generate_sql(
        self,
        prompt: str,
        connection:AIConnection,
        error_history: list[str] = [],
        attempt: int = 1
    ) -> dict:
        """Generate SQL query using in-memory schema context and Bedrock AI"""
        schema_content = await self.db_service.generate_schema(connection)
        
        if not schema_content:
            schema_content = "The database is empty"
        
        max_attempts = 3
        last_error = None
        
        while attempt <= max_attempts:
            try:
                full_prompt = self._build_prompt(prompt, schema_content, error_history, attempt)
                response = await self.bedrock_service.invoke_model(full_prompt)
                logger.info(f"Bedrock query generation response: {response}")
                return self._parse_response(response, attempt)
            except json.JSONDecodeError as e:
                last_error = f"Invalid JSON format in attempt {attempt}: {str(e)}"
                logger.warning(last_error)
                error_history.append(last_error)
                attempt += 1
        
        raise ValueError(f"Failed to generate valid SQL after {max_attempts} attempts. Last error: {last_error}")

    def _build_prompt(
        self, 
        prompt: str, 
        schema: str,
        error_history: list[str] = [],
        attempt: int = 1
    ) -> str:
        """Construct the full prompt with schema and examples"""
        attempt_context = f"\n\nThis is attempt {attempt} to generate the correct query."
        error_context = ""
        
        if error_history:
            error_context = "\n\nPrevious errors encountered:\n- " + "\n- ".join(error_history)
            error_context += "\n\nPlease ensure your response:"
            error_context += "\n1. Contains only a SINGLE SQL statement (no semicolons except in string literals)"
            error_context += "\n2. Is a valid JSON object with 'query' and 'summary' fields"
            error_context += "\n3. Has proper spacing in the SQL query (no extra spaces or line breaks)"
            error_context += "\n4. Uses simple single quotes for SQL strings (not escaped)"
            error_context += "\n5. Contains no additional text or formatting outside the JSON object"
            error_context += "\n6. For DELETE operations with constraints, use proper JOIN and WHERE clauses instead of multiple statements"
        
        return f"""Given the following database schema:
{schema}

Generate a SINGLE SQL query for the following request:
{prompt}{attempt_context}{error_context}

IMPORTANT: 
- Return ONLY ONE SQL statement (no semicolons except in string literals)
- For operations requiring multiple steps (like cascading deletes), use proper JOIN and WHERE clauses
- Return a properly formatted JSON object with consistent spacing and no line breaks in the SQL query

Here are two examples of expected outputs:

Example 1 - For the request "Delete all orders and their related items":
{{
    "query": "DELETE FROM orders WHERE order_id IN (SELECT o.order_id FROM orders o JOIN order_items oi ON o.order_id = oi.order_id)",
    "summary": "Deletes orders and their related items using a subquery"
}}

Example 2 - For the request "Update product prices and related order items":
{{
    "query": "UPDATE products p SET price = p.price * 1.1 WHERE product_id IN (SELECT DISTINCT product_id FROM order_items WHERE order_date >= CURRENT_DATE - INTERVAL '30 days')",
    "summary": "Updates product prices with a 10% increase for products ordered in the last 30 days"
}}

Return only a JSON object with two fields:
1. 'query': the SQL query (single statement, proper spacing, no line breaks)
2. 'summary': a brief explanation of what the query does"""

    def _parse_response(self, response: str, attempt: int = 1) -> dict:
        """Parse the raw Bedrock response into structured data"""
        try:
            parsed = json.loads(response)
            
            # Validate required fields
            required_fields = {'query', 'summary'}
            if not all(field in parsed for field in required_fields):
                raise json.JSONDecodeError(
                    f"Missing required fields. Response must include {required_fields}",
                    response,
                    0
                )
            
            # Validate query doesn't contain multiple statements
            query = parsed['query']
            if ';' in query and not self._is_semicolon_in_string(query):
                raise json.JSONDecodeError(
                    "Multiple SQL statements detected. Only one statement is allowed.",
                    response,
                    0
                )
                
            return parsed
        except json.JSONDecodeError as e:
            error_msg = f"""JSON parsing failed. Response must be a valid JSON object with 'query' and 'summary' fields.
Original response: {response}
Error: {str(e)}"""
            raise json.JSONDecodeError(error_msg, response, e.pos)

    def _is_semicolon_in_string(self, query: str) -> bool:
        """Check if semicolon appears only within string literals"""
        in_string = False
        for char in query:
            if char == "'":
                in_string = not in_string
            elif char == ';' and not in_string:
                return False
        return True

    async def generate_visuals(self, results: list, original_prompt: str) -> dict:
        """Generate visualization suggestions"""
        def convert_decimals(obj):
            if isinstance(obj, Decimal):
                return str(obj)  # Convert to string instead of float
            if isinstance(obj, dict):
                return {k: convert_decimals(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [convert_decimals(v) for v in obj]
            return obj

        if not results or len(results) == 0:
            return {"visualizations": []}
            
        try:
            # Convert Decimals before serialization
            converted_results = convert_decimals(results)
            sample_data = json.dumps(converted_results[:3], indent=2)
            visual_prompt = f"""Analyze this data sample:
{sample_data}

Original request: {original_prompt}

Suggest up to 2 relevant visualizations from these options:
- bar_chart (for comparisons, using Chart.js)
- line_chart (for trends over time, using Chart.js)
- pie_chart (for proportions, using Chart.js)
- scatter_plot (for relationships, using Chart.js)

For each visualization, include:
- type: chart type
- title: descriptive title
- labels: array of labels for data points
- datasets: array of dataset objects with:
  - label: dataset name
  - data: array of values
  - backgroundColor: color(s) for the visualization
  - borderColor: border color (for line charts)

Return JSON format:
{{
  "visualizations": [
    {{
      "type": "chart_type",
      "title": "Chart Title",
      "labels": ["label1", "label2", ...],
      "datasets": [
        {{
          "label": "Dataset Name",
          "data": [value1, value2, ...],
          "backgroundColor": ["#color1", "#color2", ...],
          "borderColor": "#color" // for line charts
        }}
      ]
    }}
  ]
}}
The response must be valid JSON compatible with Chart.js library.
"""
            
            response = await self.bedrock_service.invoke_model(visual_prompt)
            return self._parse_visual_response(response)
        except Exception as e:
            logger.error(f"Visual generation failed: {str(e)}")
            return {"visualizations": []}

    def _parse_visual_response(self, response: str) -> dict:
        try:
            parsed = json.loads(response)
            # Validate visualization types
            valid_types = {'bar_chart', 'line_chart', 'pie_chart', 'scatter_plot'}
            if 'visualizations' in parsed:
                parsed['visualizations'] = [
                    viz for viz in parsed['visualizations']
                    if viz.get('type') in valid_types
                ][:2]  # Limit to 2 visuals
            return parsed
        except json.JSONDecodeError:
            return {"visualizations": []}

    async def extract_row_ids(self, schema:str, data:str)->list[str]:
        """Extract row ids from data"""
        prompt = f"""Given the following database schema:
{schema}

Extract row ids from this data sample:
{data}

Example output:
["1", "2", "3"]

The response must be a valid JSON array of strings.
The response must start with [ and end with ].
Return a list of row ids"""
        response = await self.bedrock_service.invoke_model(prompt)
        return json.loads(response)

    async def analyze_query_type(self, user_prompt: str) -> dict:
        """Determine if query requires multiple steps"""
        analysis_prompt = f"""Analyze this database query request:
{user_prompt}

Determine if this requires a single SQL query or multiple chained queries. Consider:
- Multiple distinct operations needed
- Step-by-step data transformations
- Temporary results needed for final output

Respond with JSON format:
{{
    "query_type": "single" | "multi",
    "steps": ["step 1 description", "step 2 description"]  // only if multi
}}"""

        response = await self.bedrock_service.invoke_model(analysis_prompt)
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {"query_type": "single", "steps": []}

    async def generate_chained_sql(self, step_prompt: str, context: dict) -> dict:
        """Generate SQL with context from previous steps"""
        full_prompt = f"""Database schema:
{context['schema']}

Previous step results (sample):
{json.dumps(context.get('previous_results', [])[:3], indent=2)}

Current task: {step_prompt}

Generate SQL that builds on previous results. Return JSON with 'query' and 'summary'."""
        
        response = await self.bedrock_service.invoke_model(full_prompt)
        return self._parse_response(response)
