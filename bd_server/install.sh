#!/bin/bash
# ============================================================
# install.sh — Instalación automatizada del Servidor de Base de Datos
# Ubuntu Server
# Ejecutar desde el directorio bd_server:
#   chmod +x install.sh && ./install.sh
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$EUID" -ne 0 ]; then
  SUDO='sudo'
else
  SUDO=''
fi

echo "============================================================"
echo "  Instalación — Servidor de Base de Datos"
echo "  Ubicación: ${PROJECT_DIR}"
echo "============================================================"

log "Actualizando repositorios..."
$SUDO apt-get update -qq

log "Instalando dependencias del sistema..."
$SUDO apt-get install -y python3 python3-venv python3-pip postgresql postgresql-contrib

log "Asegurando que PostgreSQL está activo..."
$SUDO systemctl enable postgresql
$SUDO systemctl start postgresql

log "Configurando PostgreSQL..."
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='imageprocessing'" | grep -q 1; then
  warn "La base de datos 'imageprocessing' ya existe"
else
  sudo -u postgres createdb imageprocessing
  log "Base de datos 'imageprocessing' creada"
fi

log "Ajustando contraseña del usuario postgres"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"

log "Aplicando esquema de base de datos"
sudo -u postgres psql -d imageprocessing -f "$PROJECT_DIR/schema.sql"

cd "$PROJECT_DIR"

if [ ! -d .venv ]; then
  log "Creando entorno virtual Python..."
  python3 -m venv .venv
else
  log "Entorno virtual .venv ya existe"
fi

log "Instalando dependencias Python..."
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

if [ ! -f .env ]; then
  log "Creando archivo .env con la configuración por defecto"
  cat > .env <<'EOF'
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=imageprocessing
DB_USER=postgres
DB_PASSWORD=postgres
EOF
else
  log "Archivo .env ya existe — no se sobreescribe"
fi

log "Instalación completada"

echo ""
echo "============================================================"
echo "  Paso siguiente"
echo "  1) Activar el entorno virtual: source .venv/bin/activate"
echo "  2) Arrancar el servidor de BD: uvicorn main:app --host 0.0.0.0 --port 8000"
echo "  3) Verificar: http://localhost:8000/docs"
echo "============================================================"
