#!/bin/sh
echo "--- X11 Debug Info ---"
echo "DISPLAY environment variable: $DISPLAY"
echo "Trying to connect to X server..."
echo "Path to xdpyinfo: $(which xdpyinfo)"
xdpyinfo || echo "xdpyinfo failed. X server connection might be an issue."
echo "--- End X11 Debug Info ---" 