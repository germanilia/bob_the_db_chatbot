import json
from decimal import Decimal
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

    async def generate_sql(
        self,
        prompt: str,
        connection_name: str,
        error_history: list[str] = [],
        attempt: int = 1
    ) -> dict:
        """Generate SQL query using schema context and Bedrock AI"""
        schema = await self.db_service.get_stored_schema(connection_name)
        schema_content = schema.get('schema_content') if isinstance(schema, dict) else str(schema)
        if not schema_content:
            raise ValueError("No schema content available")
        
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
            error_context += "\n\nPlease ensure your response is:\n"
            error_context += "1. A valid JSON object with 'query' and 'summary' fields\n"
            error_context += "2. Has proper spacing in the SQL query (no extra spaces or line breaks)\n"
            error_context += "3. Uses simple single quotes for SQL strings (not escaped)\n"
            error_context += "4. Contains no additional text or formatting outside the JSON object"
        
        return f"""Given the following database schema:
{schema}

Generate an SQL query for the following request:
{prompt}{attempt_context}{error_context}

IMPORTANT: Return a properly formatted JSON object with consistent spacing and no line breaks in the SQL query.

Here are two examples of expected outputs:

Example 1 - For the request "Show me all orders from last month":
{{
    "query": "SELECT o.order_id, o.order_date, c.customer_name, o.total_amount FROM orders o JOIN customers c ON o.customer_id = c.customer_id WHERE o.order_date >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)",
    "summary": "Retrieves all orders from the last month with order details and customer names"
}}

Example 2 - For the request "Find top 5 products by revenue":
{{
    "query": "SELECT p.product_name, SUM(oi.quantity * oi.unit_price) as total_revenue FROM order_items oi JOIN products p ON oi.product_id = p.product_id GROUP BY p.product_id, p.product_name ORDER BY total_revenue DESC LIMIT 5",
    "summary": "Calculates and returns the top 5 products by total revenue generated"
}}

Return only a JSON object with two fields:
1. 'query': the SQL query (with proper spacing and no line breaks)
2. 'summary': a brief explanation of what the query does"""

    def _parse_response(self, response: str, attempt: int = 1) -> dict:
        """Parse the raw Bedrock response into structured data"""
        try:
            parsed = json.loads(response)
            required_fields = {'query', 'summary'}
            if not all(field in parsed for field in required_fields):
                raise json.JSONDecodeError(
                    f"Missing required fields. Response must include {required_fields}",
                    response,
                    0
                )
            return parsed
        except json.JSONDecodeError as e:
            # Add context to the error message that will be used in the next attempt
            error_msg = f"""JSON parsing failed. Response must be a valid JSON object with 'query' and 'summary' fields.
Original response: {response}
Error: {str(e)}"""
            raise json.JSONDecodeError(error_msg, response, e.pos)

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
