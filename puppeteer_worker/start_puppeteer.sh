#!/bin/sh
Xvfb :0 -screen 0 1920x1080x24 &
node worker.js