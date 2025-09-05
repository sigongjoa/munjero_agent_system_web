
import json
import asyncio
from openai import OpenAI
from pydantic import BaseModel, Field
from tools import get_current_time, get_current_time_async # Import both tools
from tools_chatgpt import send_message_to_chatgpt_tool, set_send_command_callback # New tool

from redis import Redis
from rq import Queue
import redis
import datetime

# Redis client for logging agent activities
redis_client = redis.Redis(host='redis', port=6379, db=0)

# Redis List names for communication
AGENT_COMMANDS_LIST = 'agent_commands_list'
EXTENSION_RESPONSES_LIST = 'extension_responses_list'
USER_INPUT_QUEUE = 'user_input_queue'

def log_agent_activity(log_type: str, message: str, details: dict = None):
    timestamp = datetime.datetime.now().isoformat()
    log_entry = {"timestamp": timestamp, "type": log_type, "message": message}
    if details: log_entry["details"] = details
    redis_client.lpush('agent_logs', json.dumps(log_entry))
    redis_client.ltrim('agent_logs', 0, 999) # Store more logs

# Configure OpenAI Client
client = OpenAI(base_url="http://172.30.1.78:1234/v1", api_key="lm-studio")

# Pydantic schemas for tools
class GetCurrentTimeParams(BaseModel):
    pass

class SendMessageToChatgptParams(BaseModel):
    prompt: str = Field(..., description="The message to send to the ChatGPT page.")

tools_schema = [
    {
        "type": "function",
        "function": {
            "name": "get_current_time",
            "description": "현재 날짜와 시간을 가져옵니다.",
            "parameters": GetCurrentTimeParams.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_message_to_chatgpt",
            "description": "Chrome Extension을 통해 ChatGPT 페이지로 메시지를 보냅니다.",
            "parameters": SendMessageToChatgptParams.model_json_schema(),
        },
    }
]

# Configure Redis and RQ
redis_conn = Redis(host='redis')
q = Queue(connection=redis_conn)

async def _send_command_to_websocket_server(command_data: dict):
    redis_client.lpush(AGENT_COMMANDS_LIST, json.dumps(command_data))

set_send_command_callback(_send_command_to_websocket_server)

async def run_agent_with_tool_calling_async(prompt_text: str):
    log_agent_activity("user_input", prompt_text)
    messages = [{"role": "user", "content": prompt_text}]
    try:
        response = client.chat.completions.create(
            model="llama-3-8b-instruct-function-calling",
            messages=messages,
            tools=tools_schema,
            tool_choice="auto",
        )
        response_message = response.choices[0].message
        log_agent_activity("llm_response", response_message.content if response_message.content else "Tool call detected", {"raw_response": response_message.model_dump_json()})
        tool_calls = response_message.tool_calls

        if tool_calls:
            # ... (tool calling logic remains the same)
            pass # Placeholder for existing logic
        else:
            print(response_message.content)
            log_agent_activity("llm_direct_response", response_message.content)

    except Exception as e:
        log_agent_activity("agent_error", f"Error in agent execution: {e}", {"error": str(e)})
        print(f"Agent execution error: {e}")

async def main():
    print("Agent app started. Waiting for user input from dashboard...")
    log_agent_activity("service_status", "Agent app started")
    while True:
        try:
            # Blocking pop from the user input queue
            _, user_input_json = redis_client.brpop(USER_INPUT_QUEUE, timeout=0)
            
            if user_input_json:
                user_input_data = json.loads(user_input_json)
                prompt = user_input_data.get("user_input")
                
                if prompt:
                    print(f"--- Received prompt from dashboard: '{prompt}' ---")
                    await run_agent_with_tool_calling_async(prompt)
                else:
                    log_agent_activity("input_error", "Received empty prompt from queue.")
        except redis.exceptions.ConnectionError as e:
            log_agent_activity("redis_error", f"Connection to Redis failed: {e}", {"error": str(e)})
            print(f"Connection to Redis failed, retrying in 5 seconds... Error: {e}")
            await asyncio.sleep(5)
        except Exception as e:
            log_agent_activity("main_loop_error", f"An unexpected error occurred: {e}", {"error": str(e)})
            print(f"An unexpected error occurred in the main loop: {e}")
            await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(main())
