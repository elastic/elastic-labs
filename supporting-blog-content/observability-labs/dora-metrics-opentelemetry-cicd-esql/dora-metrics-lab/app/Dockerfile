FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && edot-bootstrap --action=install
COPY app.py .
CMD ["opentelemetry-instrument", "flask", "run", "--host=0.0.0.0", "--port=8080"]
