# Nodo Trabajador — VM2 / VM3
## Sistema Distribuido de Procesamiento de Imágenes — UPB

---

## Descripción

Componente del **plano de datos**. Almacena y procesa imágenes.

Responsabilidades:
- Recibir imágenes desde VM1 vía gRPC client streaming y guardarlas en `/images/uploads/`
- Ejecutar pipelines de transformaciones con Pillow usando ThreadPoolExecutor
- Servir imágenes procesadas a VM1 vía gRPC server streaming
- Reportar estado de salud (active_jobs, CPU, memoria) al Servidor de Aplicación

**El nodo almacena todas las imágenes en su disco local.** VM1 no almacena nada.

---

## Requisitos previos

- Ubuntu Server 24.04
- Red Host-Only configurada (192.168.1.x)
- Servidor de Aplicación corriendo en 192.168.1.21:3000

---

## Instalación rápida

```bash
chmod +x install.sh
./install.sh
```

El script instala Python3, pip, las dependencias, compila el proto, crea los directorios de almacenamiento y el archivo `.env`.

---

## Instalación manual

### 1. Instalar Python3 y pip
```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip
```

### 2. Instalar dependencias Python
```bash
pip3 install -r requirements.txt --break-system-packages
```

### 3. Compilar el .proto
```bash
bash compile_proto.sh
```

Esto genera `generated/image_processor_pb2.py` y `generated/image_processor_pb2_grpc.py`.

### 4. Crear directorios de almacenamiento
```bash
sudo mkdir -p /images/uploads /images/results
sudo chown -R $USER:$USER /images
```

### 5. Configurar variables de entorno
```bash
cp .env.example .env
nano .env  # Ajustar NODE_HOST con la IP de esta VM
```

---

## Variables de entorno

| Variable | VM2 | VM3 | Descripción |
|---|---|---|---|
| `GRPC_PORT` | `50051` | `50051` | Puerto gRPC |
| `NODE_HOST` | `192.168.56.11` | `192.168.56.12` | IP de esta VM |
| `APP_SERVER_URL` | `http://192.168.1.20:3000` | `http://192.168.1.20:3000` | URL del App Server |
| `INTERNAL_API_KEY` | `clave-interna-upb-2025` | `clave-interna-upb-2025` | Clave del heartbeat |
| `STORAGE_BASE` | `/images` | `/images` | Directorio raíz de imágenes |
| `CHUNK_SIZE` | `65536` | `65536` | Tamaño de chunk gRPC (bytes) |
| `MAX_WORKERS` | `4` | `4` | Threads paralelos |
| `MAX_IMAGE_SIZE` | `52428800` | `52428800` | Límite por imagen (50 MB) |

---

## Arrancar el nodo

```bash
python3 server.py
```

Salida esperada:
```
═══════════════════════════════════════════════════════
  Nodo Trabajador — Sistema Distribuido UPB
═══════════════════════════════════════════════════════
  Host:        192.168.56.11
  Puerto gRPC: 50051
  App Server:  http://192.168.56.10:3000
  Storage:     /images
  Max workers: 4
═══════════════════════════════════════════════════════
[Server] Servidor gRPC escuchando en puerto 50051
[Heartbeat] Registrado exitosamente — nodeId=1
[Server] Nodo listo para recibir trabajos
```

---

## Verificación

### Desde la misma VM
```bash
# Verificar que el proto compiló correctamente
python3 -c "from generated import image_processor_pb2; print('OK')"

# Verificar que el directorio de almacenamiento existe
ls -la /images/uploads /images/results
```

### Desde VM1 (después de que el nodo esté corriendo)
```bash
# Ver nodos registrados
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/nodes

# El nodo debe aparecer con status: ACTIVE
```

---

## Operaciones gRPC disponibles

| RPC | Tipo | Descripción |
|---|---|---|
| `UploadImage` | Client streaming | VM1 envía imagen en chunks — nodo guarda en `/images/uploads/` |
| `ProcessImage` | Unary | Ejecuta pipeline de transformaciones — resultado en `/images/results/` |
| `DownloadImage` | Server streaming | Nodo envía imagen procesada en chunks a VM1 |
| `DownloadBatchImages` | Server streaming | Nodo envía múltiples imágenes (fan-out) |
| `GetHealth` | Unary | Devuelve estado: SERVING/NOT_SERVING, active_jobs, CPU%, MEM% |

---

## Transformaciones disponibles

| Tipo | Params | Ejemplo |
|---|---|---|
| `GRAYSCALE` | `{}` | — |
| `RESIZE` | `{"width": int, "height": int}` | `{"width": 800, "height": 600}` |
| `CROP` | `{"x": int, "y": int, "w": int, "h": int}` | `{"x": 0, "y": 0, "w": 400, "h": 300}` |
| `ROTATE` | `{"degrees": int}` | `{"degrees": 90}` |
| `FLIP` | `{"direction": "horizontal"\|"vertical"}` | `{"direction": "horizontal"}` |
| `BLUR` | `{"radius": float}` | `{"radius": 2.0}` |
| `SHARPEN` | `{"factor": float}` | `{"factor": 2.0}` |
| `BRIGHTNESS_CONTRAST` | `{"brightness": float, "contrast": float}` | `{"brightness": 1.2, "contrast": 1.1}` |
| `WATERMARK` | `{"text": str, "position": str}` | `{"text": "UPB 2025", "position": "bottom_right"}` |
| `CONVERT` | `{"format": "JPG"\|"PNG"\|"TIFF"}` | `{"format": "JPG"}` |

---

## Estructura del proyecto

```
worker_node/
├── .env.example                     # Plantilla de variables de entorno
├── requirements.txt                 # Dependencias Python
├── install.sh                       # Script de instalación automatizada
├── compile_proto.sh                 # Compila image_processor.proto
├── image_processor.proto            # Contrato gRPC (fuente de verdad)
├── server.py                        # Punto de entrada — arranca gRPC + heartbeat
├── servicer.py                      # Implementa IImageProcessorService
├── interfaces/
│   ├── __init__.py
│   └── i_image_processor_service.py # Contrato abstracto Python (ABC)
├── services/
│   ├── __init__.py
│   ├── processor.py                 # Encapsula Pillow — aplica transformaciones
│   └── pipeline.py                  # Ejecuta transformaciones en orden
└── generated/                       # Generado por compile_proto.sh
    ├── __init__.py
    ├── image_processor_pb2.py       # Clases de mensajes proto
    └── image_processor_pb2_grpc.py  # Stubs del servicio gRPC
```

---

## Arquitectura interna

```
VM1 (gRPC client)
    │
    ▼ gRPC call
[ImageProcessorServicer]  ← implementa IImageProcessorService
    │                                  + pb_grpc.ImageProcessorServiceServicer
    ├── UploadImage → guarda chunks → /images/uploads/{imageId}_{filename}
    │
    ├── ProcessImage
    │       │
    │       ├── [ImageProcessor].load_from_disk()
    │       ├── [TransformationPipeline].execute()
    │       │       └── aplica cada paso en exec_order 1..5
    │       └── [ImageProcessor].save_to_disk() → /images/results/result_{imageId}_{filename}
    │
    ├── DownloadImage → lee /images/results/ → chunks → VM1
    ├── DownloadBatchImages → múltiples archivos → chunks → VM1 (fan-out)
    └── GetHealth → psutil CPU/MEM + active_jobs counter
```

---

## Notas de operación

- El nodo usa `ThreadPoolExecutor` con `MAX_WORKERS` threads. Cada llamada `ProcessImage` se ejecuta en un thread del pool, permitiendo procesar múltiples imágenes en paralelo.
- `active_jobs` es un contador thread-safe protegido por `threading.Lock`. El Servidor de Aplicación lo usa para el algoritmo least-load.
- Los archivos en `/images/uploads/` no se eliminan automáticamente. En producción se implementaría una política de retención.
- El nodo valida las rutas de archivo contra `STORAGE_BASE` para prevenir path traversal — ninguna operación puede leer o escribir fuera de `/images/`.
- Si el heartbeat falla al arrancar, el nodo sigue activo. El Servidor de Aplicación puede registrar el nodo manualmente vía `POST /api/nodes`.
