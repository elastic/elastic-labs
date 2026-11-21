FROM python:3.12-slim
ARG VERSION
ENV APP_VERSION=$VERSION
WORKDIR /app
RUN pip install --no-cache-dir "flask>=3.1,<3.2" "requests>=2.32,<3"
COPY app.py .
EXPOSE 8080
CMD ["python", "app.py"]
