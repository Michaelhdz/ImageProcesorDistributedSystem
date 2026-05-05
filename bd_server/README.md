# Servidor de Base de Datos — PC Aula (bare metal)

## 1. Instalar dependencias del sistema (Windows)
```powershell
# Instalar PostgreSQL para Windows (descargar desde https://www.postgresql.org/download/windows/)
# O usar Chocolatey: choco install postgresql
# O usar winget: winget install PostgreSQL.PostgreSQL

# Instalar Python si no está instalado (descargar desde https://www.python.org/)
# O usar Chocolatey: choco install python
```

## 2. Configurar PostgreSQL
```powershell
# Iniciar PostgreSQL si no está corriendo
# Usar pg_ctl o el servicio de Windows

# Crear base de datos y usuario
psql -U postgres -c "ALTER USER postgres PASSWORD 'postgres';"
psql -U postgres -c "CREATE DATABASE imageprocessing;"
psql -U postgres -d imageprocessing -f schema.sql
```

## 3. Instalar dependencias Python
```powershell
pip install -r requirements.txt
```

## 4. Variables de entorno
```powershell
$env:DB_HOST='localhost'
$env:DB_PORT='5432'
$env:DB_NAME='imageprocessing'
$env:DB_USER='postgres'
$env:DB_PASSWORD='postgres'
```

## 5. Arrancar
```powershell
uvicorn main:app --host 0.0.0.0 --port 8000
```

## 6. Verificar
Abrir en el navegador: http://localhost:8000/docs

## IPs de red interna
- Este servidor escucha en 0.0.0.0:8000
- VM1 lo alcanza como http://192.168.56.1:8000
