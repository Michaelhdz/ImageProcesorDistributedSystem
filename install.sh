#!/bin/bash
# ============================================================
# install.sh — Instalación automatizada del Servidor de Aplicación
# VM1 — Ubuntu Server 24.04
# Ejecutar como usuario normal con sudo disponible:
#   chmod +x install.sh && ./install.sh
# ============================================================

set -e  # Detener en cualquier error

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # Sin color

log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo "============================================================"
echo "  Instalación — Servidor de Aplicación (VM1)"
echo "  Sistema Distribuido UPB"
echo "============================================================"

# ── 1. Actualizar sistema ─────────────────────────────────────────────────────
log "Actualizando lista de paquetes..."
sudo apt-get update -qq

# ── 2. Instalar Node.js 20 LTS ────────────────────────────────────────────────
if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v)
  log "Node.js ya instalado: $NODE_VERSION"
else
  log "Instalando Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  log "Node.js $(node -v) instalado"
fi

# ── 3. Instalar Redis ─────────────────────────────────────────────────────────
if systemctl is-active --quiet redis-server; then
  log "Redis ya está activo"
else
  log "Instalando Redis..."
  sudo apt-get install -y redis-server
  sudo systemctl enable redis-server
  sudo systemctl start redis-server
  log "Redis instalado y activo"
fi

# Verificar Redis
if redis-cli ping | grep -q "PONG"; then
  log "Redis respondiendo correctamente"
else
  err "Redis no responde. Verificar instalación."
fi

# ── 4. Crear archivo .env si no existe ───────────────────────────────────────
if [ ! -f .env ]; then
  log "Creando archivo .env desde .env.example..."
  cp .env.example .env
  warn "Revisar y ajustar los valores en .env antes de continuar"
  warn "  Especialmente: BD_API_URL, JWT_SECRET, INTERNAL_API_KEY"
else
  log "Archivo .env ya existe — no se sobreescribe"
fi

# ── 5. Instalar dependencias Node.js ─────────────────────────────────────────
log "Instalando dependencias npm..."
npm install --production
log "Dependencias instaladas"

# ── 6. Verificar conectividad con la BD ──────────────────────────────────────
BD_URL=$(grep BD_API_URL .env | cut -d '=' -f2 | tr -d ' ')
BD_URL=${BD_URL:-http://192.168.56.1:8000}

log "Verificando conectividad con BD API: $BD_URL"
if curl -s --connect-timeout 5 "$BD_URL/docs" > /dev/null; then
  log "BD API accesible en $BD_URL"
else
  warn "BD API no accesible en $BD_URL"
  warn "Asegúrate de que el Servidor de BD esté corriendo antes de iniciar el App Server"
fi

# ── 7. Resumen ────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Instalación completada"
echo "============================================================"
echo ""
echo "  Para arrancar el servidor:"
echo "    node server.js"
echo ""
echo "  Para verificar:"
echo "    curl http://localhost:3000/health"
echo ""
echo "  Endpoints principales:"
echo "    POST http://localhost:3000/api/auth/register"
echo "    POST http://localhost:3000/api/auth/login"
echo "    POST http://localhost:3000/api/batches"
echo "    GET  http://localhost:3000/api/batches/:id/status"
echo "    GET  http://localhost:3000/api/batches/:id/download"
echo "    POST http://localhost:3000/api/nodes/heartbeat"
echo "    GET  http://localhost:3000/api/nodes"
echo "============================================================"
