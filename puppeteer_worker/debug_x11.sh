#!/bin/sh
echo "--- X11 Debug Info ---"
echo "DISPLAY environment variable: $DISPLAY"
echo "Trying to connect to X server..."
if command -v xdpyinfo &> /dev/null
then
    xdpyinfo || echo "xdpyinfo failed. X server connection might be an issue."
else
    echo "xdpyinfo not found. Cannot verify X server connection directly."
    echo "Checking X11 socket presence:"
    ls -l /tmp/.X11-unix || echo "/tmp/.X11-unix not found or accessible."
fi
echo "--- End X11 Debug Info ---"