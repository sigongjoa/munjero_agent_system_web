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
WORKER_STATUS_KEY = 'worker_status'

from scripts.websocket_server import EXTENSION_STATUS_KEY, DOM_READY_STATUS_KEY # Import new keys

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
        await redis_client.set(WORKER_STATUS_KEY, 'ready')
        logging.info("Agent status set to 'ready' in Redis.")
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
                # The task_id from the dashboard IS the script_id we need to use.
                script_id = task_id
                if topic:
                    # Pass the script_id to the function.
                    result = await generate_shorts_script(topic, script_id)
                    logging.info(f"Task {script_id} (generate_script) completed. Result: {result}")
                else:
                    logging.error(f"Task {script_id} is missing 'topic'.")

            elif task_type == "generate_images":
                script_id = task_data.get("script_id")
                if script_id:
                    # Set task status to processing
                    await redis_client.set(f"task:{task_id}:status", "processing")
                    logging.info(f"Task {task_id} (generate_images) status set to 'processing'.")

                    try:
                        # Set task status to generating_images before calling the tool
                        await redis_client.set(f"task:{task_id}:status", "generating_images")
                        logging.info(f"Task {task_id} (generate_images) status set to 'generating_images'.")

                        result_json = await generate_images_for_script(script_id)
                        # Store the image URLs in Redis for the dashboard to retrieve
                        await redis_client.set(f"images:{script_id}", result_json)
                        
                        # Set task status to completed
                        await redis_client.set(f"task:{task_id}:status", "completed")
                        await redis_client.set(f"task:{task_id}:result", result_json) # Store result as well
                        logging.info(f"Task {task_id} (generate_images) completed. Result stored in Redis. Result: {result_json[:100]}...")
                    except Exception as e:
                        # Set task status to failed
                        await redis_client.set(f"task:{task_id}:status", "failed")
                        error_message = f"Image generation failed: {str(e)}"
                        await redis_client.set(f"task:{task_id}:result", json.dumps({"error": error_message}))
                        logging.error(f"Task {task_id} (generate_images) failed: {error_message}", exc_info=True)
                else:
                    logging.error(f"Task {task_id} is missing 'script_id'.")
                    await redis_client.set(f"task:{task_id}:status", "failed")
                    await redis_client.set(f"task:{task_id}:result", json.dumps({"error": "Missing script_id"}))

            elif task_type == "healthcheck":
                healthcheck_id = task_data.get("id")
                if healthcheck_id:
                    # Set the result in Redis
                    await redis_client.set(f"healthcheck_result:{healthcheck_id}", "OK")
                    logging.info(f"Agent processed healthcheck task {healthcheck_id}. Result set to OK in Redis.")
                else:
                    logging.error(f"Healthcheck task received without an 'id'. Task data: {task_data}")

            elif task_type == "store_generated_image":
                script_id = task_data.get("script_id")
                image_url = task_data.get("image_url")
                if script_id and image_url:
                    # Store the single image URL in a JSON array to be consistent with generate_images
                    await redis_client.set(f"images:{script_id}", json.dumps([image_url]))
                    logging.info(f"Task {task_id} (store_generated_image) completed. Image URL for script {script_id} stored in Redis.")
                else:
                    logging.error(f"Task {task_id} is missing 'script_id' or 'image_url'.")

            else:
                logging.warning(f"Unknown task type received: {task_type}")

        except json.JSONDecodeError:
            logging.error(f"Could not decode task from Redis: {task_json}")
        except Exception as e:
            logging.error(f"An unexpected error occurred in the agent loop: {e}", exc_info=True)

if __name__ == "__main__":
    # Run the main async function once. It will loop internally.
    asyncio.run(main())