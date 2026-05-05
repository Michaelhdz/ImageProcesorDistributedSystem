# Backend Cliente — Portátil

## 1. Instalar Node.js (ya instalado)
Node.js ya está instalado en el dispositivo.

## 2. Instalar dependencias
```powershell
npm install
```

## 3. Variables de entorno
```powershell
$env:PORT='4000'
$env:APP_SERVER_URL='http://localhost:3000'
```

## 4. Arrancar
```powershell
node server.js
```

## 5. Probar con Postman

### Registro
```
POST http://localhost:4000/api/auth/register
Body (JSON):
{
  "username": "michael",
  "email": "michael@upb.edu.co",
  "password": "password123"
}
```

### Login
```
POST http://localhost:4000/api/auth/login
Body (JSON):
{
  "email": "michael@upb.edu.co",
  "password": "password123"
}
```

### Enviar lote de imágenes
```
POST http://localhost:4000/api/batches
Body (form-data):
  images: [archivo1.jpg, archivo2.jpg]  (tipo File)
  metadata: [
    {
      "filename": "archivo1.jpg",
      "transformations": [
        { "type": "RESIZE",    "exec_order": 1, "params": { "width": 800, "height": 600 } },
        { "type": "GRAYSCALE", "exec_order": 2, "params": {} }
      ]
    },
    {
      "filename": "archivo2.jpg",
      "transformations": [
        { "type": "ROTATE", "exec_order": 1, "params": { "degrees": 90 } }
      ]
    }
  ]
```

### Consultar estado
```
GET http://localhost:4000/api/batches/{batchId}/status
```

### Descargar ZIP
```
GET http://localhost:4000/api/batches/{batchId}/download?format=zip
```

### Descargar imagen individual
```
GET http://localhost:4000/api/batches/{batchId}/download?format=individual&jobId={jobId}
```

### Ver nodos activos
```
GET http://localhost:4000/api/batches/nodes
```
