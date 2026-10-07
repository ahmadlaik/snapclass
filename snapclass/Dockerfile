FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY frontend frontend
ENV SNAPCLASS_DATA=/data PORT=8000
VOLUME /data
EXPOSE 8000
# one worker on purpose: the login rate-limiter keeps its counters in memory
CMD gunicorn -w 1 --threads 8 -t 120 -b 0.0.0.0:${PORT} --chdir backend app:app
