import boto3
import json
import os
from dotenv import load_dotenv
from botocore.exceptions import ClientError

load_dotenv()

class BedrockService:
    def __init__(self):
        session = boto3.Session(
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            region_name=os.getenv("AWS_REGION", "us-east-1")
        )
        self.client = session.client("bedrock-runtime")
        self.model_id = "us.anthropic.claude-3-5-sonnet-20241022-v2:0"

    async def invoke_model(self, prompt: str) -> str:
        """Generic method to invoke Bedrock model with a prompt"""
        try:
            request = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 8000,
                "temperature": 0.2,
                "messages": [{
                    "role": "user",
                    "content": [{"type": "text", "text": prompt}],
                }]
            }

            response = self.client.invoke_model(
                modelId=self.model_id, 
                body=json.dumps(request)
            )
            
            response_body = json.loads(response["body"].read())
            return response_body["content"][0]["text"]

        except (ClientError, Exception) as e:
            raise Exception(f"Bedrock API error: {str(e)}")
