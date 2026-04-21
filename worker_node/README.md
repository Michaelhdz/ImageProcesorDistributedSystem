# Nodo Trabajador — VM2 o VM3

## 1. Instalar dependencias del sistema (Windows)
```powershell
# Instalar Python si no está instalado (descargar desde https://www.python.org/)
# O usar Chocolatey: choco install python
# O usar winget: winget install Python.Python.3

pip install -r requirements.txt
```

## 2. Compilar el .proto
```powershell
mkdir -p generated
python -m grpc_tools.protoc `
  -I. `
  --python_out=./generated `
  --grpc_python_out=./generated `
  image_processor.proto

# Crear __init__.py para que Python reconozca el paquete
New-Item -ItemType File -Path generated/__init__.py -Force
```

## 3. Crear directorios de almacenamiento
```powershell
mkdir -p worker_node_storage\uploads, worker_node_storage\results
```

## 4. Variables de entorno
```powershell
# Para VM2 (Nodo 1):
$env:GRPC_PORT='50051'
$env:NODE_HOST='192.168.1.21'
$env:APP_SERVER_URL='http://192.168.1.20:3000'
$env:INTERNAL_API_KEY='clave-interna-upb-2025'
$env:STORAGE_BASE='/images'

# Para VM3 (Nodo 2) — mismos valores excepto:
$env:NODE_HOST='192.168.1.23'
```

### Local / una sola máquina
```powershell
$env:GRPC_PORT='50051'
$env:NODE_HOST='localhost'
$env:APP_SERVER_URL='http://localhost:3000'
$env:INTERNAL_API_KEY='clave-interna-upb-2025'
$env:STORAGE_BASE='./worker_node_storage'
```

## 5. Arrancar
```powershell
python server.py
```

## Verificar que gRPC está activo
```powershell
# Desde otra terminal:
python -c "
import grpc
from generated import image_processor_pb2 as pb
from generated import image_processor_pb2_grpc as pb_grpc
channel = grpc.insecure_channel('localhost:50051')
stub    = pb_grpc.ImageProcessorServiceStub(channel)
resp    = stub.GetHealth(pb.HealthRequest())
print(resp)
"
```
