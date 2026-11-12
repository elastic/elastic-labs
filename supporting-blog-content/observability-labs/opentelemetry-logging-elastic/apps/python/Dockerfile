FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir elastic-opentelemetry==1.17.0 && edot-bootstrap --action=install
COPY app.py .
CMD ["opentelemetry-instrument", "python", "app.py"]
