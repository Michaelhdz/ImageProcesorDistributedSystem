#!/bin/bash
# ============================================================
# install.sh — Instalación automatizada del Nodo Trabajador
# VM2 o VM3 — Ubuntu Server 24.04
# Ejecutar: chmod +x install.sh && ./install.sh
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo "============================================================"
echo "  Instalación — Nodo Trabajador (VM2 o VM3)"
echo "  Sistema Distribuido UPB"
echo "============================================================"

# ── 1. Actualizar sistema ─────────────────────────────────────────────────────
log "Actualizando lista de paquetes..."
sudo apt-get update -qq

# ── 2. Instalar Python 3 y pip ────────────────────────────────────────────────
if command -v python3 &>/dev/null; then
  log "Python3 ya instalado: $(python3 --version)"
else
  log "Instalando Python3..."
  sudo apt-get install -y python3 python3-pip
fi

# Instalar pip si falta
if ! command -v pip3 &>/dev/null; then
  sudo apt-get install -y python3-pip
fi
log "pip3 disponible: $(pip3 --version)"

# ── 3. Instalar dependencias Python ──────────────────────────────────────────
log "Instalando dependencias Python..."
pip3 install -r requirements.txt --break-system-packages
log "Dependencias instaladas"

# ── 4. Compilar el .proto ────────────────────────────────────────────────────
log "Compilando image_processor.proto..."
bash compile_proto.sh

# Verificar compilación
python3 -c "from generated import image_processor_pb2; print('[OK] Proto importado correctamente')"

# ── 5. Crear directorios de almacenamiento ───────────────────────────────────
STORAGE_BASE="${STORAGE_BASE:-/images}"
log "Creando directorios de almacenamiento en $STORAGE_BASE..."
sudo mkdir -p "$STORAGE_BASE/uploads" "$STORAGE_BASE/results"
sudo chown -R "$USER:$USER" "$STORAGE_BASE"
log "Directorios creados: $STORAGE_BASE/uploads y $STORAGE_BASE/results"

# ── 6. Crear archivo .env si no existe ───────────────────────────────────────
if [ ! -f .env ]; then
  log "Creando .env desde .env.example..."
  cp .env.example .env
  warn "IMPORTANTE: Editar .env y ajustar NODE_HOST con la IP de esta VM"
  warn "  VM2: NODE_HOST=192.168.1.21"
  # warn "  VM3: NODE_HOST=192.168.56.12"
else
  log ".env ya existe — no se sobreescribe"
fi

# ── 7. Verificar conectividad con el Servidor de Aplicación ──────────────────
APP_URL=$(grep APP_SERVER_URL .env 2>/dev/null | cut -d'=' -f2 | tr -d ' ')
APP_URL="${APP_URL:-http://192.168.1.20:3000}"

log "Verificando conectividad con App Server: $APP_URL"
if curl -s --connect-timeout 5 "$APP_URL/health" > /dev/null; then
  log "App Server accesible en $APP_URL"
else
  warn "App Server no accesible en $APP_URL"
  warn "Asegúrate de que el Servidor de Aplicación esté corriendo antes de iniciar el nodo"
fi

# ── 8. Resumen ────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Instalación completada"
echo "============================================================"
echo ""
echo "  Próximos pasos:"
echo "  1. Editar .env y ajustar NODE_HOST con la IP de esta VM"
echo "  2. Arrancar el nodo:"
echo "     python3 server.py"
echo ""
echo "  Verificar que el nodo está activo:"
echo "  Desde el Servidor de Aplicación:"
echo "     GET http://192.168.1.20:3000/api/nodes"
echo "============================================================"
