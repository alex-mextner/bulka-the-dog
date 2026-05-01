FROM python:3.11-slim

ENV PIP_NO_CACHE_DIR=1 \
    HF_HOME=/cache/huggingface \
    TRANSFORMERS_CACHE=/cache/huggingface \
    PYTHONUNBUFFERED=1

RUN python -m pip install --upgrade pip \
    && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir pillow transformers safetensors

WORKDIR /work

ENTRYPOINT ["python", "scripts/image-focus/generate_focus_metadata.py"]
