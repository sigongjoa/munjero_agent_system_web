import redis.asyncio as redis # Use the async version of the redis library
import json
import asyncio
import sys
import logging
import os

# Add the project root to the Python path to allow imports from other directories
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from scripts.tools_chatgpt import generate_shorts_script, generate_images_for_script

# Configure logging
logging.basicConfig(
    level=logging.INFO, 
    stream=sys.stdout,
    format='[%(levelname)s] AGENT: %(message)s'
)

# Redis Key for the task list
AGENT_TASKS_LIST = 'agent_tasks'

async def main():
    """
    The main async function for the agent.
    It connects to Redis and listens for tasks in a single, persistent event loop.
    """
    logging.info("Agent starting up...")
    try:
        # Use an async client, as the whole application is now async
        redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)
        await redis_client.ping() # Check connection
        logging.info("Agent connected to Redis.")
    except redis.exceptions.ConnectionError as e:
        logging.error(f"Agent could not connect to Redis: {e}. Exiting.")
        sys.exit(1)

    while True:
        try:
            logging.info(f"Agent waiting for task on Redis list: '{AGENT_TASKS_LIST}'")
            # Use the async version of brpop
            _, task_json = await redis_client.brpop(AGENT_TASKS_LIST)
            
            task_data = json.loads(task_json)
            task_type = task_data.get("type")
            task_id = task_data.get("task_id", "N/A")
            
            logging.info(f"Agent received task: {task_type} (ID: {task_id})")

            if task_type == "generate_script":
                topic = task_data.get("topic")
                if topic:
                    # Directly await the async function
                    result_id = await generate_shorts_script(topic)
                    logging.info(f"Task {task_id} (generate_script) completed. Result ID: {result_id}")
                else:
                    logging.error(f"Task {task_id} is missing 'topic'.")

            elif task_type == "generate_images":
                script_id = task_data.get("script_id")
                if script_id:
                    # Directly await the async function
                    result_json = await generate_images_for_script(script_id)
                    logging.info(f"Task {task_id} (generate_images) completed. Result: {result_json[:100]}...")
                else:
                    logging.error(f"Task {task_id} is missing 'script_id'.")
            
            else:
                logging.warning(f"Unknown task type received: {task_type}")

        except json.JSONDecodeError:
            logging.error(f"Could not decode task from Redis: {task_json}")
        except Exception as e:
            logging.error(f"An unexpected error occurred in the agent loop: {e}", exc_info=True)

if __name__ == "__main__":
    # Run the main async function once. It will loop internally.
    asyncio.run(main())