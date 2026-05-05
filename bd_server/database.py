import os
import psycopg2
import psycopg2.extras

DB_CONFIG = {
    "host":     os.getenv("DB_HOST",     "127.0.0.1"),
    "port":     int(os.getenv("DB_PORT", "5432")),
    "dbname":   os.getenv("DB_NAME",     "imageprocessing"),
    "user":     os.getenv("DB_USER",     "postgres"),
    "password": os.getenv("DB_PASSWORD", "postgres"),
}

def get_connection():
    # Construimos la cadena de conexión usando variables de entorno.
    conn_str = (
        f"host={DB_CONFIG['host']} "
        f"port={DB_CONFIG['port']} "
        f"dbname={DB_CONFIG['dbname']} "
        f"user={DB_CONFIG['user']} "
        f"password={DB_CONFIG['password']} "
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
