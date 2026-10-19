# Worker de LENTE para Railway.
#
# La app vive en Vercel (serverless, sin Python ni disco persistente). El
# análisis deportivo corre en Python (YOLOv8/OpenCV), así que este contenedor
# levanta el worker de Node que consume la cola `processing_jobs` y dispara el
# pipeline pesado. Resultados y videos van a Supabase Storage, no al disco.
#
# Base Debian bookworm → Python 3.11 + glibc (wheels de torch/opencv/sharp ok).
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/opt/venv/bin:$PATH"

# python3: pipeline de análisis. ffmpeg: merge de yt-dlp y clips.
# libgomp1: runtime de torch. libglib2.0-0: dependencia de OpenCV/Ultralytics.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      python3-venv \
      python3-pip \
      ffmpeg \
      curl \
      ca-certificates \
      libgomp1 \
      libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python: torch CPU primero, después el resto ────────────────────────────────
# Instalar torch desde el índice CPU evita bajar los wheels con CUDA (~2 GB de
# más) que Railway no puede aprovechar. ultralytics reutiliza este torch.
RUN python3 -m venv /opt/venv \
    && pip install --upgrade pip \
    && pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir yt-dlp

# ── Node ───────────────────────────────────────────────────────────────────────
COPY package.json package-lock.json ./
RUN npm ci

# Copiamos el resto del repo y sobreescribimos requirements como capa cacheable
# únicamente si cambia (se copia antes para no invalidar la instalación de npm).
COPY scripts/sports/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY . .

# Pesos YOLO pre-descargados: el código los busca en el cwd de scripts/sports.
# Sin esto, Ultralytics los baja en el primer job (lento y dependiente de red).
RUN cd scripts/sports \
    && curl -fsSL -o yolov8s.pt https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8s.pt \
    && curl -fsSL -o yolov8x.pt https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8x.pt

CMD ["npm", "run", "worker"]
