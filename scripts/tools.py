import datetime
import time

def get_current_time() -> str:
    """현재 날짜와 시간을 YYYY-MM-DD HH:MM:SS 형식으로 반환합니다."""
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def get_current_time_async() -> str:
    """현재 날짜와 시간을 YYYY-MM-DD HH:MM:SS 형식으로 반환합니다. (비동기 시뮬레이션)"""
    print("Simulating long-running task for 5 seconds...")
    time.sleep(5) # Simulate a long-running task
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")