
# Use an official Python runtime as a parent image
FROM python:3.9-slim-buster

# Set the working directory
WORKDIR /app/munjero_rag_system

# Copy and install requirements
COPY munjero_rag_system/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The application code will be mounted via docker-compose volumes
# No COPY command is needed here for the source code
