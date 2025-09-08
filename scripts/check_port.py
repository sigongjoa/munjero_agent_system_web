import os
import sys

def check_port(expected_port, env_var_name, default_port):
    actual_port_str = os.environ.get(env_var_name, str(default_port))
    try:
        actual_port = int(actual_port_str)
    except ValueError:
        print(f"❌ Error: Environment variable {env_var_name} is not a valid integer: {actual_port_str}")
        sys.exit(1)

    if actual_port != expected_port:
        print(f"❌ Port mismatch! Expected {expected_port} but got {actual_port} from {env_var_name}")
        sys.exit(1)
    else:
        print(f"✅ Port check passed: {actual_port}")

if __name__ == "__main__":
    # This script expects arguments: expected_port, env_var_name, default_port
    if len(sys.argv) != 4:
        print("Usage: python check_port.py <expected_port> <env_var_name> <default_port>")
        sys.exit(1)

    expected_port = int(sys.argv[1])
    env_var_name = sys.argv[2]
    default_port = int(sys.argv[3])

    check_port(expected_port, env_var_name, default_port)
