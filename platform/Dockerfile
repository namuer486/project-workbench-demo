FROM python:3.12-slim
WORKDIR /app/platform
COPY platform/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home workbench \
    && mkdir /app/data && chown workbench:workbench /app/data
COPY platform/server.py .
COPY platform/static ./static
COPY skills/ipd-report-json /app/skills/ipd-report-json
USER workbench
ENV WORKBENCH_HOST=0.0.0.0 WORKBENCH_DATA=/app/data PYTHONUNBUFFERED=1
EXPOSE 8765
CMD ["python", "server.py"]
