FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir "flask>=3.1,<3.2"
COPY app.py .
EXPOSE 8080
CMD ["python", "app.py"]
