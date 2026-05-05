import os
import psycopg2
import psycopg2.extras

DB_CONFIG = {
    "host":     os.getenv("DB_HOST",     "127.0.0.1"),
    "port":     int(os.getenv("DB_PORT", "5434")),
    "dbname":   os.getenv("DB_NAME",     "imageprocessing"),
    "user":     os.getenv("DB_USER",     "postgres"),
    "password": os.getenv("DB_PASSWORD", "postgres"),
}

def get_connection():
    # Los hosts y puertos deben estar en el mismo orden
    # Host 1 (Maestro) usa Puerto 1, Host 2 (Réplica) usa Puerto 2
    hosts = "10.245.168.182,10.245.168.246"
    ports = "5434,5432"
    
    dbname = "imageprocessing"
    user = "postgres"
    password = "postgres"

    # Construimos la cadena usando parámetros separados para host y port
    conn_str = (
        f"host={hosts} port={ports} dbname={dbname} user={user} password={password} "
        f"target_session_attrs=any connect_timeout=5"
    )
    
    try:
        return psycopg2.connect(
            conn_str,
            cursor_factory=psycopg2.extras.RealDictCursor
        )
    except Exception as e:
        print(f"Error de conexión: {e}")
        raise

class DB:
    def fetchone(self, query: str, params: tuple = ()):
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                conn.commit()
                return cur.fetchone()

    def fetchall(self, query: str, params: tuple = ()):
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                conn.commit()
                return cur.fetchall()

    def execute(self, query: str, params: tuple = ()):
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                conn.commit()

db = DB()
