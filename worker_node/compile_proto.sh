#!/bin/bash
# compile_proto.sh — Ejecutar antes de arrancar el nodo
# Genera los archivos Python desde image_processor.proto

mkdir -p generated

python3 -m grpc_tools.protoc \
  -I. \
  --python_out=./generated \
  --grpc_python_out=./generated \
  image_processor.proto

touch generated/__init__.py

echo "[OK] Proto compilado exitosamente"
echo "Archivos generados:"
ls -la generated/
