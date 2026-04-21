# Servidor de Aplicación — VM1
## Sistema Distribuido de Procesamiento de Imágenes — UPB

---

## Descripción

Componente central del sistema distribuido. Actúa como **plano de control**:
- Gestiona autenticación de usuarios (JWT)
- Recibe lotes de imágenes del cliente y los distribuye a los nodos vía gRPC streaming
- Coordina el procesamiento mediante cola Bull/Redis
- Selecciona nodos por menor carga (algoritmo least-load)
- Retransmite imágenes procesadas al cliente sin almacenarlas en disco
- Ensambla ZIPs en streaming con patrón fan-out/fan-in

**No almacena imágenes.** Todo el almacenamiento vive en los nodos (VM2, VM3).

---

## Requisitos previos

- Ubuntu Server 24.04
- Acceso a internet (para instalación)
- Red Host-Only configurada en VirtualBox
- Servidor de BD corriendo en `192.168.56.1:8000`

---

## Instalación rápida

```bash
chmod +x install.sh
./install.sh
```

El script instala Node.js 20, Redis, las dependencias npm, y crea el archivo `.env`.

---

## Instalación manual

### 1. Instalar Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Instalar Redis
```bash
sudo apt-get install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### 3. Instalar dependencias
```bash
npm install
```

### 4. Configurar variables de entorno
```bash
cp .env.example .env
nano .env   # Ajustar valores según el entorno
```

---

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor Express |
| `JWT_SECRET` | `secreto-upb-2025` | Secreto para JWT — cambiar en producción |
| `REDIS_HOST` | `127.0.0.1` | Host de Redis |
| `REDIS_PORT` | `6379` | Puerto de Redis |
| `BD_API_URL` | `http://192.168.56.1:8000` | URL de la API REST interna de BD |
| `INTERNAL_API_KEY` | `clave-interna-upb-2025` | Clave para autenticar heartbeats de nodos |
| `QUEUE_MAX_ATTEMPTS` | `3` | Reintentos máximos para trabajos fallidos |
| `QUEUE_BACKOFF_DELAY` | `2000` | Delay base de backoff exponencial (ms) |

---

## Arrancar el servidor

```bash
node server.js
```

Salida esperada:
```
═══════════════════════════════════════════════════════
  Servidor de Aplicación — Sistema Distribuido UPB
═══════════════════════════════════════════════════════
  Puerto:      3000
  BD API:      http://192.168.56.1:8000
  Redis:       127.0.0.1:6379
═══════════════════════════════════════════════════════
[NodeManager] Health checks iniciados (cada 30s)
```

---

## Verificación

```bash
# Health check
curl http://localhost:3000/health

# Registro de usuario
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@upb.edu.co","password":"password123"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@upb.edu.co","password":"password123"}'
```

---

## API REST — Referencia de endpoints

### Autenticación

| Método | Ruta | Auth | Body | Respuesta |
|---|---|---|---|---|
| POST | `/api/auth/register` | — | `{username, email, password}` | `201 {id, username, email}` |
| POST | `/api/auth/login` | — | `{email, password}` | `200 {token, user}` |

### Lotes de procesamiento

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/batches` | JWT | Enviar lote — `multipart: images[], metadata(JSON)` |
| GET | `/api/batches` | JWT | Historial — query: `?page=1&limit=10` |
| GET | `/api/batches/:id/status` | JWT | Estado y progreso del lote |
| GET | `/api/batches/:id/download` | JWT | Descarga — query: `?format=zip` o `?format=individual&jobId=N` |

### Gestión de nodos

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/nodes/heartbeat` | X-Internal-Key | Registro automático del nodo al arrancar |
| POST | `/api/nodes` | JWT | Registro manual de nodo |
| GET | `/api/nodes` | JWT | Listar nodos |
| GET | `/api/nodes/:id/status` | JWT | Estado del nodo |
| DELETE | `/api/nodes/:id` | JWT | Eliminar nodo |

### Ejemplo de metadata para envío de lote

```json
[
  {
    "filename": "foto.jpg",
    "transformations": [
      { "type": "RESIZE",    "exec_order": 1, "params": { "width": 800, "height": 600 } },
      { "type": "GRAYSCALE", "exec_order": 2, "params": {} },
      { "type": "WATERMARK", "exec_order": 3, "params": { "text": "UPB 2025", "position": "bottom_right" } }
    ]
  }
]
```

**Tipos de transformación disponibles:**

| Tipo | Params requeridos |
|---|---|
| `GRAYSCALE` | `{}` |
| `RESIZE` | `{ "width": int, "height": int }` |
| `CROP` | `{ "x": int, "y": int, "w": int, "h": int }` |
| `ROTATE` | `{ "degrees": int }` |
| `FLIP` | `{ "direction": "horizontal"\|"vertical" }` |
| `BLUR` | `{ "radius": float }` |
| `SHARPEN` | `{ "factor": float }` |
| `BRIGHTNESS_CONTRAST` | `{ "brightness": float, "contrast": float }` |
| `WATERMARK` | `{ "text": string, "position": "bottom_right"\|"bottom_left"\|"top_right"\|"top_left" }` |
| `CONVERT` | `{ "format": "JPG"\|"PNG"\|"TIFF" }` |

---

## Estructura del proyecto

```
app_server/
├── .env.example              # Plantilla de variables de entorno
├── package.json
├── install.sh                # Script de instalación automatizada
├── server.js                 # Punto de entrada — arranca Express + health checks
├── app.js                    # Configuración Express, rate limiting, rutas
├── proto/
│   └── image_processor.proto # Contrato gRPC con los nodos
├── interfaces/
│   ├── IAuthService.js       # Contrato de autenticación
│   ├── IBatchService.js      # Contrato de gestión de lotes
│   ├── INodeService.js       # Contrato de gestión de nodos
│   └── IBdApi.js             # Contrato del gateway BD
├── services/
│   ├── auth.service.js       # Lógica de autenticación (implementa IAuthService)
│   ├── batch.service.js      # Lógica de lotes + cola Bull (implementa IBatchService)
│   ├── node.manager.js       # Clientes gRPC + least-load (implementa INodeService)
│   └── bd.api.client.js      # Gateway HTTP hacia BD API (implementa IBdApi)
├── controllers/
│   ├── auth.controller.js    # HTTP in/out para autenticación
│   ├── batch.controller.js   # HTTP in/out para lotes
│   └── node.controller.js    # HTTP in/out para nodos
├── middleware/
│   └── auth.middleware.js    # Verificación JWT
└── routes/
    ├── auth.routes.js
    ├── batch.routes.js
    └── node.routes.js
```

---

## Arquitectura interna

```
Cliente HTTP
    │
    ▼
[Routes] → [authMiddleware] → [Controller]
                                    │
                              [Service / NodeManager]
                                    │
                         ┌──────────┼──────────┐
                         ▼          ▼          ▼
                   [BdApiClient]  [Bull]  [gRPC clients]
                         │          │          │
                   BD FastAPI    Redis      Nodos
                   (bare metal)  (local)   (VM2, VM3)
```

---

## Notas de operación

- El servidor requiere que el Servidor de BD esté activo antes de arrancar, ya que AuthService y BatchService hacen llamadas a BD al recibir peticiones.
- Los nodos (VM2, VM3) deben estar corriendo y haber enviado su heartbeat antes de poder enviar lotes. Verificar con `GET /api/nodes`.
- Redis debe estar activo localmente. Si Redis cae, la cola de trabajos se detiene pero el servidor HTTP sigue funcionando.
- Los health checks se ejecutan cada 30 segundos automáticamente. Los nodos inactivos se marcan como `ERROR` en BD y dejan de recibir trabajos.
