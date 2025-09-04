import json
from openai import OpenAI
from pydantic import BaseModel, Field
from tools import get_current_time, get_current_time_async # Import both tools

from redis import Redis
from rq import Queue

# 1.3: Configure OpenAI Client for LM Studio
client = OpenAI(base_url="http://172.30.1.44:1234/v1", api_key="lm-studio") # api_key can be anything for local

# Define Pydantic schema for the tool
class GetCurrentTimeParams(BaseModel):
    """Parameters for get_current_time tool."""
    pass # No parameters for this simple tool

# Tool schema for OpenAI API
tools_schema = [
    {
        "type": "function",
        "function": {
            "name": "get_current_time",
            "description": "현재 날짜와 시간을 가져옵니다.",
            "parameters": GetCurrentTimeParams.model_json_schema(),
        },
    }
]

# Configure Redis and RQ
redis_conn = Redis()
q = Queue(connection=redis_conn)

def run_agent_with_tool_calling_async(prompt_text: str):
    messages = [{"role": "user", "content": prompt_text}]
    response = client.chat.completions.create(
        model="llama-3-8b-instruct-function-calling", # Use the function-calling model
        messages=messages,
        tools=tools_schema,
        tool_choice="auto",
    )

    response_message = response.choices[0].message
    tool_calls = response_message.tool_calls

    if tool_calls:
        # Instead of directly calling, enqueue the job
        for tool_call in tool_calls:
            function_name = tool_call.function.name
            # Assuming 'get_current_time' maps to 'get_current_time_async'
            if function_name == "get_current_time":
                print(f"Agent: Enqueuing tool call '{function_name}' as an RQ job...")
                job = q.enqueue(get_current_time_async) # Enqueue the async version
                print(f"Agent: Job enqueued. Job ID: {job.id}")
                return job.id # Return job ID for polling
    else:
        print(response_message.content)
        return None

def check_job_status(job_id: str):
    job = q.fetch_job(job_id)
    if job:
        print(f"Job {job.id} status: {job.get_status()}")
        if job.is_finished:
            print(f"Job {job.id} result: {job.result}")
            return job.result
    return None

if __name__ == "__main__":
    print("\n--- Testing '지금 몇 시야?' (Asynchronous) ---")
    job_id = run_agent_with_tool_calling_async("지금 몇 시야?")
    if job_id:
        print("Agent: Now free to do other things while the job runs in background.")
        print("Agent: Checking job status after a delay...")
        import time
        time.sleep(7) # Wait for the job to likely finish
        check_job_status(job_id)
    
    print("\n--- Testing '안녕?' (Synchronous) ---")
    run_agent_with_tool_calling_async("안녕?")