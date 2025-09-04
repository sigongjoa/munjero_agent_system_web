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

# Removed: import websocket_server

# Redis client for logging agent activities
redis_client = redis.Redis(host='redis', port=6379, db=0)

# Redis List names for communication
AGENT_COMMANDS_LIST = 'agent_commands_list'
EXTENSION_RESPONSES_LIST = 'extension_responses_list'

def log_agent_activity(log_type: str, message: str, details: dict = None):
    timestamp = datetime.datetime.now().isoformat()
    log_entry = {"timestamp": timestamp, "type": log_type, "message": message}
    if details: log_entry["details"] = details
    redis_client.lpush('agent_logs', json.dumps(log_entry))
    # Keep the list size manageable, e.g., last 100 entries
    redis_client.ltrim('agent_logs', 0, 99)

# 1.3: Configure OpenAI Client for LM Studio
client = OpenAI(base_url="http://172.30.1.44:1234/v1", api_key="lm-studio") # api_key can be anything for local

# Define Pydantic schema for the tools
class GetCurrentTimeParams(BaseModel):
    """Parameters for get_current_time tool."""
    pass # No parameters for this simple tool

class SendMessageToChatgptParams(BaseModel):
    prompt: str = Field(..., description="The message to send to the ChatGPT page.")

# Tool schema for OpenAI API
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

# Callback function to send commands to the WebSocket server
async def _send_command_to_websocket_server(command_data: dict):
    redis_client.lpush(AGENT_COMMANDS_LIST, json.dumps(command_data))

# Set the callback for the chatgpt tool
set_send_command_callback(_send_command_to_websocket_server)

async def run_agent_with_tool_calling_async(prompt_text: str):
    log_agent_activity("user_input", prompt_text)
    messages = [{"role": "user", "content": prompt_text}]
    response = client.chat.completions.create(
        model="llama-3-8b-instruct-function-calling", # Use the function-calling model
        messages=messages,
        tools=tools_schema,
        tool_choice="auto",
    )

    response_message = response.choices[0].message
    log_agent_activity("llm_response", response_message.content if response_message.content else "Tool call detected", {"raw_response": response_message.model_dump_json()})
    tool_calls = response_message.tool_calls

    if tool_calls:
        available_functions = {
            "get_current_time": get_current_time_async, # RQ enqueued version
            "send_message_to_chatgpt": send_message_to_chatgpt_tool
        }
        messages.append(response_message)

        for tool_call in tool_calls:
            function_name = tool_call.function.name
            function_args = json.loads(tool_call.function.arguments)
            log_agent_activity("tool_call", f"Calling tool: {function_name}", {"args": function_args})

            if function_name == "get_current_time":
                print(f"Agent: Enqueuing tool call '{function_name}' as an RQ job...")
                job = q.enqueue(available_functions[function_name]) # Enqueue the async version
                print(f"Agent: Job enqueued. Job ID: {job.id}")
                log_agent_activity("rq_job_enqueued", f"Job ID: {job.id}", {"function": function_name})
                # For now, we return the job ID. In a real system, agent would wait for result.
                return job.id
            elif function_name == "send_message_to_chatgpt":
                print(f"Agent: Calling tool '{function_name}' to send message to Chrome Extension...")
                # This tool is async and directly interacts with the WebSocket server
                tool_output = await available_functions[function_name](**function_args)
                log_agent_activity("tool_output", f"Tool output for {function_name}", {"output": tool_output})
                messages.append(
                    {
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "name": function_name,
                        "content": json.dumps(tool_output),
                    }
                )
                # After sending command, agent might wait for response from extension_response_queue
                # For this demo, we'll just print a message.
                print(f"Agent: Tool output: {tool_output}")
                # Try to get a response from the extension (non-blocking check)
                try:
                    # MODIFIED: Use Redis List for extension response
                    _, ext_response_json = redis_client.brpop(EXTENSION_RESPONSES_LIST, timeout=5)
                    if ext_response_json:
                        ext_response = json.loads(ext_response_json)
                        log_agent_activity("extension_response", "Received response from Extension", {"response": ext_response})
                        print(f"Agent: Received response from Extension: {ext_response}")
                        messages.append(
                            {
                                "role": "tool",
                                "name": "chatgpt_response", # A custom name for the response
                                "content": json.dumps(ext_response),
                            }
                        )
                    else:
                        log_agent_activity("extension_response_timeout", "No immediate response from Extension.")
                        print("Agent: No immediate response from Extension.")
                except Exception as e:
                    log_agent_activity("extension_response_error", f"Error reading from extension_response_queue: {e}", {"error": str(e)})
                    print(f"Agent: Error reading from extension_response_queue: {e}")

                # Continue conversation with LLM after tool execution and potential extension response
                second_response = client.chat.completions.create(
                    model="llama-3-8b-instruct-function-calling",
                    messages=messages,
                )
                log_agent_activity("llm_final_response", second_response.choices[0].message.content, {"raw_response": second_response.choices[0].message.model_dump_json()})
                print(second_response.choices[0].message.content)
                return None # Indicate that this path handles the full response

    else:
        print(response_message.content)
        log_agent_activity("llm_direct_response", response_message.content)
        return None

async def check_rq_job_status(job_id: str):
    job = q.fetch_job(job_id)
    if job:
        status = job.get_status()
        log_agent_activity("rq_job_status_check", f"Job {job.id} status: {status}", {"job_id": job_id, "status": status})
        print(f"Job {job.id} status: {status}")
        if job.is_finished:
            result = job.result
            log_agent_activity("rq_job_finished", f"Job {job.id} result: {result}", {"job_id": job_id, "result": result})
            print(f"Job {job.id} result: {result}")
            return result
    return None

async def main_agent_loop():
    print("\n--- Testing '지금 몇 시야?' (Asynchronous RQ Job) ---")
    rq_job_id = await run_agent_with_tool_calling_async("지금 몇 시야?")
    if rq_job_id:
        print("Agent: Now free to do other things while the RQ job runs in background.")
        print("Agent: Checking RQ job status after a delay...")
        await asyncio.sleep(7) # Wait for the RQ job to likely finish
        await check_rq_job_status(rq_job_id)
    
    print("\n--- Testing '안녕?' (Synchronous LLM Response) ---")
    await run_agent_with_tool_calling_async("안녕?")

    print("\n--- Testing 'ChatGPT 페이지에 '안녕, 챗봇!'이라고 보내줘.' (WebSocket Tool Call) ---")
    await run_agent_with_tool_calling_async("ChatGPT 페이지에 '안녕, 챗봇!'이라고 보내줘.")

if __name__ == "__main__":
    asyncio.run(main_agent_loop())