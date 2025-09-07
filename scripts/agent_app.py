import json
import asyncio
from openai import OpenAI
from pydantic import BaseModel, Field
from tools import get_current_time, get_current_time_async
from tools_chatgpt import send_message_to_chatgpt_tool, set_send_command_callback

import redis.asyncio as redis # Use asyncio version of redis
from rq import Queue
import datetime

# --- Global State ---
# Redis client will be initialized in main()
redis_client = None
AGENT_COMMANDS_LIST = 'agent_commands_list'
EXTENSION_RESPONSES_LIST = 'extension_responses_list'

# --- Logging ---
async def log_agent_activity(log_type: str, message: str, details: dict = None):
    """Asynchronously logs agent activity to Redis."""
    if not redis_client:
        print(f"LOGGING ERROR: Redis client not initialized. Log was: {log_type} - {message}")
        return
    timestamp = datetime.datetime.now().isoformat()
    log_entry = {"timestamp": timestamp, "type": log_type, "message": message}
    if details:
        log_entry["details"] = details
    await redis_client.lpush('agent_logs', json.dumps(log_entry))
    await redis_client.ltrim('agent_logs', 0, 999)

# --- OpenAI and Tool Setup ---
client = OpenAI(base_url="http://172.30.1.78:1234/v1", api_key="lm-studio")

class GetCurrentTimeParams(BaseModel):
    pass

class SendMessageToChatgptParams(BaseModel):
    prompt: str = Field(..., description="The message to send to the ChatGPT page.")

tools_schema = [
    {
        "type": "function",
        "function": {
            "name": "get_current_time",
            "description": "Get the current time in ISO format.",
            "parameters": GetCurrentTimeParams.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_message_to_chatgpt_tool",
            "description": "Sends a message to the ChatGPT page via the Chrome Extension. Use this tool when you need to interact with the ChatGPT interface, for example, to send a query or a response.",
            "parameters": SendMessageToChatgptParams.model_json_schema(),
        },
    },
]

# This callback is now async and will be awaited by the tool
async def _send_command_to_websocket_server(command_data: dict):
    await redis_client.lpush(AGENT_COMMANDS_LIST, json.dumps(command_data))

# --- Core Agent Logic ---
async def run_agent_with_tool_calling_async(prompt_text: str):
    await log_agent_activity("agent_prompt", prompt_text)
    messages = [{"role": "user", "content": prompt_text}]
    
    try:
        response = client.chat.completions.create(
            model="llama-3-8b-instruct-function-calling",
            messages=messages,
            tools=tools_schema,
            tool_choice="auto",
        )
        response_message = response.choices[0].message
        await log_agent_activity("llm_response", response_message.content if response_message.content else "Tool call detected", {"raw_response": response_message.model_dump_json()})
        
        tool_calls = response_message.tool_calls
        if tool_calls:
            for tool_call in tool_calls:
                function_name = tool_call.function.name
                function_args = json.loads(tool_call.function.arguments)
                
                if function_name == "get_current_time":
                    result = await get_current_time_async()
                    print(f"Agent: Tool Call: get_current_time -> {result}")
                    await log_agent_activity("tool_call_result", "get_current_time", {"result": result})
                elif function_name == "send_message_to_chatgpt_tool":
                    prompt_to_send = function_args.get("prompt")
                    if prompt_to_send:
                        result = await send_message_to_chatgpt_tool(prompt_to_send)
                        print(f"Agent: Tool Call: send_message_to_chatgpt_tool -> {result}")
                        await log_agent_activity("tool_call_result", "send_message_to_chatgpt_tool", {"prompt": prompt_to_send, "result": result})
                    else:
                        print("Agent: Tool Call: send_message_to_chatgpt_tool called without prompt.")
                        await log_agent_activity("tool_call_error", "send_message_to_chatgpt_tool", {"error": "No prompt provided"})
                else:
                    print(f"Agent: Unknown tool call: {function_name}")
                    await log_agent_activity("tool_call_error", "Unknown tool", {"tool_name": function_name})
        else:
            print(f"Agent Response: {response_message.content}")
            await log_agent_activity("llm_direct_response", response_message.content)

    except Exception as e:
        await log_agent_activity("agent_error", f"Error in agent execution: {e}", {"error": str(e)})
        print(f"Agent execution error: {e}")

# --- Main Application ---
async def main():
    global redis_client
    print("Agent app started.")
    
    # --- Redis Client Setup ---
    try:
        print("Agent: Connecting to Redis...")
        # Note: The sync Redis client for RQ is separate and still works as intended for enqueuing jobs.
        # This new client is for async operations like pub/sub and lists.
        redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)
        await redis_client.ping()
        print("Agent: Redis connection successful.")
    except Exception as e:
        print(f"Agent: Could not connect to Redis: {e}")
        return

    # --- Setup Tool Callback ---
    set_send_command_callback(_send_command_to_websocket_server)
    print("Agent: Tool callback setup complete.")

    # --- Main Loop: Listen for messages from the extension ---
    print(f"Agent: Now listening for messages from the extension on Redis list '{EXTENSION_RESPONSES_LIST}'...")
    await log_agent_activity("service_status", "Agent started and listening for extension messages.")
    
    while True:
        try:
            # Asynchronously wait for a message from the websocket server
            _, response_json = await redis_client.brpop(EXTENSION_RESPONSES_LIST, timeout=0)
            
            if response_json:
                response_data = json.loads(response_json)
                message_type = response_data.get("type")
                
                print(f"--- Agent: Received message of type '{message_type}' from extension ---")
                await log_agent_activity("extension_message", f"Received message of type '{message_type}'", response_data)

                # Example logic: If the extension is ready, greet it.
                if message_type == "EXTENSION_READY":
                    await run_agent_with_tool_calling_async("An extension has connected and is ready. Greet it.")

        except redis.exceptions.ConnectionError as e:
            print(f"Agent: Redis connection error: {e}. Retrying in 5s.")
            await asyncio.sleep(5)
        except Exception as e:
            print(f"Agent: An error occurred in the main loop: {e}")
            await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(main())