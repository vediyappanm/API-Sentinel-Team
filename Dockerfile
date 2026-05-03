FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    gcc \
    libpcap-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

COPY server/ ./server/
COPY migrations/ ./migrations/
COPY tests-library/ ./tests-library/
COPY alembic.ini .

RUN useradd -m -u 1000 appuser && \
    mkdir -p /app/data/archives && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "server.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
