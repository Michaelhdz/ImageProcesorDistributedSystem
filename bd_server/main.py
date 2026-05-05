import json
from fastapi import FastAPI, HTTPException, Query
from typing  import List, Optional
from models  import (
    UserCreate, UserOut,
    BatchCreate, BatchUpdate, BatchOut,
    ImageJobCreate, ImageJobUpdate, ImageJobOut,
    TransformationCreate, TransformationOut,
    NodeCreate, NodeStatusUpdate, NodeOut,
    JobLogCreate, JobLogOut,
    NodeMetricCreate, NodeMetricOut, NodeMetricsSummary
)
from database import db

app = FastAPI(
    title       = "API REST Interna — Servidor de Base de Datos",
    description = "Microservicio que envuelve PostgreSQL. Solo accesible desde red interna.",
    version     = "1.0.0"
)

# ── USERS ─────────────────────────────────────────────────────────────────────

@app.post("/users", response_model=UserOut, status_code=201)
def create_user(user: UserCreate):
    print(f"[BD_SERVER] create_user called with: {user.username}, {user.email}")
    existing = db.fetchone(
        "SELECT id FROM users WHERE email=%s OR username=%s",
        (user.email, user.username)
    )
    if existing:
        print(f"[BD_SERVER] User already exists: {user.email}")
        raise HTTPException(409, "Email o username ya existe")
    result = db.fetchone(
        "INSERT INTO users (username,email,password_hash) VALUES(%s,%s,%s) RETURNING *",
        (user.username, user.email, user.password_hash)
    )
    print(f"[BD_SERVER] User created: {result['id']}")
    return result

@app.get("/users/{email}", response_model=UserOut)
def get_user_by_email(email: str):
    result = db.fetchone("SELECT * FROM users WHERE email=%s", (email,))
    if not result:
        raise HTTPException(404, "Usuario no encontrado")
    return result

# ── BATCHES ───────────────────────────────────────────────────────────────────

@app.post("/batches", response_model=BatchOut, status_code=201)
def create_batch(batch: BatchCreate):
    result = db.fetchone(
        "INSERT INTO batches (user_id,total_images,status) VALUES(%s,%s,'PENDING') RETURNING *",
        (batch.user_id, batch.total_images)
    )
    return result

@app.get("/batches", response_model=List[BatchOut])
def get_batches(
    userId: int = Query(...),
    page:   int = Query(1,  ge=1),
    limit:  int = Query(10, ge=1, le=100)
):
    print(f"[BD_SERVER] get_batches called for user: {userId}, page: {page}, limit: {limit}")
    offset = (page - 1) * limit
    result = db.fetchall(
        "SELECT * FROM batches WHERE user_id=%s ORDER BY created_at DESC LIMIT %s OFFSET %s",
        (userId, limit, offset)
    )
    print(f"[BD_SERVER] Batches retrieved: {len(result)} items")
    return result

@app.get("/batches/{id}", response_model=BatchOut)
def get_batch(id: int):
    result = db.fetchone("SELECT * FROM batches WHERE id=%s", (id,))
    if not result:
        raise HTTPException(404, "Lote no encontrado")
    return result

@app.patch("/batches/{id}", response_model=BatchOut)
def update_batch(id: int, update: BatchUpdate):
    fields = {k: v for k, v in update.dict().items() if v is not None}
    if not fields:
        raise HTTPException(400, "Sin campos para actualizar")
    set_clause = ", ".join(f"{k}=%s" for k in fields)
    values     = list(fields.values()) + [id]
    result = db.fetchone(
        f"UPDATE batches SET {set_clause} WHERE id=%s RETURNING *", values
    )
    if not result:
        raise HTTPException(404, "Lote no encontrado")
    return result

# ── IMAGE JOBS ────────────────────────────────────────────────────────────────

@app.post("/image-jobs", response_model=ImageJobOut, status_code=201)
def create_image_job(job: ImageJobCreate):
    result = db.fetchone(
        "INSERT INTO image_jobs (batch_id,original_filename,local_input_path,status) "
        "VALUES(%s,%s,%s,'PENDING') RETURNING *",
        (job.batch_id, job.original_filename, job.local_input_path)
    )
    return result

@app.get("/image-jobs", response_model=List[ImageJobOut])
def get_image_jobs(batchId: int = Query(...)):
    return db.fetchall(
        "SELECT * FROM image_jobs WHERE batch_id=%s ORDER BY id", (batchId,)
    )

@app.get("/image-jobs/{id}", response_model=ImageJobOut)
def get_image_job(id: int):
    result = db.fetchone("SELECT * FROM image_jobs WHERE id=%s", (id,))
    if not result:
        raise HTTPException(404, "Trabajo no encontrado")
    return result

@app.patch("/image-jobs/{id}", response_model=ImageJobOut)
def update_image_job(id: int, update: ImageJobUpdate):
    fields = {k: v for k, v in update.dict().items() if v is not None}
    if not fields:
        raise HTTPException(400, "Sin campos para actualizar")
    set_clause = ", ".join(f"{k}=%s" for k in fields)
    values     = list(fields.values()) + [id]
    result = db.fetchone(
        f"UPDATE image_jobs SET {set_clause} WHERE id=%s RETURNING *", values
    )
    if not result:
        raise HTTPException(404, "Trabajo no encontrado")
    return result

# ── TRANSFORMATIONS ───────────────────────────────────────────────────────────

@app.post("/transformations", response_model=List[TransformationOut], status_code=201)
def create_transformations(transformations: List[TransformationCreate]):
    results = []
    for t in transformations:
        row = db.fetchone(
            "INSERT INTO transformations (image_job_id,type,params,exec_order) "
            "VALUES(%s,%s,%s,%s) RETURNING *",
            (t.image_job_id, t.type,
             json.dumps(t.params) if t.params else None, t.exec_order)
        )
        results.append(row)
    return results

@app.get("/transformations", response_model=List[TransformationOut])
def get_transformations(jobId: int = Query(...)):
    return db.fetchall(
        "SELECT * FROM transformations WHERE image_job_id=%s ORDER BY exec_order",
        (jobId,)
    )

# ── NODES ─────────────────────────────────────────────────────────────────────

@app.post("/nodes", response_model=NodeOut, status_code=201)
def create_or_update_node(node: NodeCreate):
    print(f"[BD_SERVER] create_or_update_node called with: {node.name}, {node.host}:{node.port}")
    result = db.fetchone(
        "INSERT INTO nodes (name,host,port,status,last_ping_at) "
        "VALUES(%s,%s,%s,'ACTIVE',NOW()) "
        "ON CONFLICT (host,port) DO UPDATE "
        "SET status='ACTIVE', last_ping_at=NOW(), "
        "    name=COALESCE(EXCLUDED.name, nodes.name) "
        "RETURNING *",
        (node.name, node.host, node.port)
    )
    print(f"[BD_SERVER] Node created/updated: {result}")
    return result

@app.get("/nodes", response_model=List[NodeOut])
def list_nodes():
    return db.fetchall("SELECT * FROM nodes ORDER BY created_at")

@app.get("/nodes/active", response_model=List[NodeOut])
def list_active_nodes():
    return db.fetchall(
        "SELECT * FROM nodes WHERE status='ACTIVE' ORDER BY last_ping_at DESC"
    )

@app.patch("/nodes/{id}/status", response_model=NodeOut)
def update_node_status(id: int, update: NodeStatusUpdate):
    result = db.fetchone(
        "UPDATE nodes SET status=%s, last_ping_at=%s WHERE id=%s RETURNING *",
        (update.status, update.last_ping_at, id)
    )
    if not result:
        raise HTTPException(404, "Nodo no encontrado")
    return result

@app.delete("/nodes/{id}", status_code=204)
def delete_node(id: int):
    db.execute("DELETE FROM nodes WHERE id=%s", (id,))

# ── LOGS ──────────────────────────────────────────────────────────────────────

@app.post("/logs", response_model=JobLogOut, status_code=201)
def create_log(log: JobLogCreate):
    result = db.fetchone(
        "INSERT INTO job_logs "
        "(image_job_id,node_id,level,transformation_type,message,context) "
        "VALUES(%s,%s,%s,%s,%s,%s) RETURNING *",
        (log.image_job_id, log.node_id, log.level,
         log.transformation_type, log.message,
         json.dumps(log.context) if log.context else None)
    )
    return result

@app.get("/logs", response_model=List[JobLogOut])
def get_logs(jobId: int = Query(...)):
    return db.fetchall(
        "SELECT * FROM job_logs WHERE image_job_id=%s ORDER BY ts", (jobId,)
    )

@app.get("/limpiar-nodos-emergencia")
async def limpiar_nodos():
    try:
        query = "TRUNCATE TABLE nodes RESTART IDENTITY CASCADE;"
        # Intentamos usar el método directo de tu objeto db
        db.execute(query) 
        # Si tu clase no hace auto-commit, descomenta la siguiente línea:
        # db.commit() 
        
        return {"status": "Éxito", "message": "Tabla de nodos limpia."}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error en el objeto DB: {str(e)}")


@app.post("/metrics")
async def create_node_metric(metric: NodeMetricCreate): # Ahora Python ya sabe qué es esto
    query = """
        INSERT INTO node_metrics (node_id, cpu_usage, ram_usage, active_threads)
        VALUES (%s, %s, %s, %s)
    """
    params = (metric.node_id, metric.cpu_usage, metric.ram_usage, metric.active_threads)
    db.execute(query, params)
    return {"status": "success"}

@app.get("/metrics", response_model=list[NodeMetricsSummary])
async def get_metrics():
    query = "SELECT node_id, ROUND(AVG(cpu_usage)::numeric, 2) as avg_cpu, ROUND(AVG(ram_usage)::numeric, 2) as avg_ram, MAX(active_threads) as peak_threads, COUNT(*) as total_samples FROM node_metrics WHERE ts > NOW() - INTERVAL '1 hour' GROUP BY node_id;"
    try:
        return db.fetchall(query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

