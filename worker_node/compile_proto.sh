#!/bin/bash
# compile_proto.sh — Compila image_processor.proto y genera los stubs Python
# Ejecutar desde el directorio raíz del nodo: bash compile_proto.sh

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[OK]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo "============================================================"
echo "  Compilando image_processor.proto"
echo "============================================================"

# Verificar que grpcio-tools esté instalado
python3 -c "import grpc_tools" 2>/dev/null || err "grpcio-tools no instalado. Ejecuta: pip3 install -r requirements.txt --break-system-packages"

# Crear directorio de salida
mkdir -p generated

# Compilar
python3 -m grpc_tools.protoc \
  -I. \
  --python_out=./generated \
  --grpc_python_out=./generated \
  image_processor.proto

# Crear __init__.py para que Python reconozca el paquete
touch generated/__init__.py

log "Proto compilado exitosamente"
echo ""
echo "Archivos generados:"
ls -lh generated/
echo ""
echo "Para verificar que la compilación fue correcta:"
echo "  python3 -c \"from generated import image_processor_pb2; print('OK')\""
