FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Shell form on purpose: Render (and Railway) inject the port via $PORT.
CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
