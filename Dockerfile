# Use a Python base image
FROM python:3.9-slim-buster

# Set the working directory in the container
WORKDIR /app

# Copy requirements.txt from the nested directory and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire munjero_rag_system directory into the container
COPY . /app

# Set PYTHONPATH to include the nested directory for imports
ENV PYTHONPATH=/app/src:$PYTHONPATH

# The commands will be overridden by docker-compose