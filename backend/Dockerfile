FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .

EXPOSE 8001
# Worker: (2 x vCPU) + 1 — override via env WEB_CONCURRENCY di docker-compose
CMD ["sh", "-c", "gunicorn server:app -k uvicorn.workers.UvicornWorker -w ${WEB_CONCURRENCY:-5} --bind 0.0.0.0:8001 --timeout 90 --keep-alive 15 --max-requests 5000 --max-requests-jitter 500 --access-logfile - --error-logfile -"]
