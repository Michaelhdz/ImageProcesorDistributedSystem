from pydantic import BaseModel
from typing  import Optional, List
from datetime import datetime

class UserCreate(BaseModel):
    username:      str
    email:         str
    password_hash: str

class UserOut(BaseModel):
    id:            int
    username:      str
    email:         str
    password_hash: str
    created_at:    datetime
    class Config: from_attributes = True

class BatchCreate(BaseModel):
    user_id:      int
    total_images: int

class BatchUpdate(BaseModel):
    status:           Optional[str]      = None
    processed_images: Optional[int]      = None
    completed_at:     Optional[datetime] = None

class BatchOut(BaseModel):
    id:               int
    user_id:          int
    status:           str
    total_images:     int
    processed_images: int
    created_at:       datetime
    completed_at:     Optional[datetime] = None
    class Config: from_attributes = True

class ImageJobCreate(BaseModel):
    batch_id:          int
    original_filename: str
    local_input_path:  str

class ImageJobUpdate(BaseModel):
    status:            Optional[str]      = None
    node_id:           Optional[int]      = None
    local_result_path: Optional[str]      = None
    local_input_path:  Optional[str]      = None
    converted_at:      Optional[datetime] = None
    error_message:     Optional[str]      = None

class ImageJobOut(BaseModel):
    id:                int
    batch_id:          int
    node_id:           Optional[int]      = None
    original_filename: str
    local_input_path:  str
    local_result_path: Optional[str]      = None
    status:            str
    received_at:       datetime
    converted_at:      Optional[datetime] = None
    error_message:     Optional[str]      = None
    class Config: from_attributes = True

class TransformationCreate(BaseModel):
    image_job_id: int
    type:         str
    params:       Optional[dict] = None
    exec_order:   int

class TransformationOut(BaseModel):
    id:           int
    image_job_id: int
    type:         str
    params:       Optional[dict] = None
    exec_order:   int
    class Config: from_attributes = True

class NodeCreate(BaseModel):
    name:   Optional[str] = None
    host:   str
    port:   int
    status: Optional[str] = 'ACTIVE'

class NodeStatusUpdate(BaseModel):
    status:       str
    last_ping_at: Optional[datetime] = None

class NodeOut(BaseModel):
    id:           int
    name:         Optional[str]      = None
    host:         str
    port:         int
    status:       str
    last_ping_at: Optional[datetime] = None
    created_at:   datetime
    class Config: from_attributes = True

class JobLogCreate(BaseModel):
    image_job_id:        int
    node_id:             Optional[int]  = None
    level:               str            = 'INFO'
    transformation_type: Optional[str]  = None
    message:             str
    context:             Optional[dict] = None

class JobLogOut(BaseModel):
    id:                  int
    image_job_id:        int
    node_id:             Optional[int]  = None
    level:               str
    transformation_type: Optional[str]  = None
    message:             str
    context:             Optional[dict] = None
    ts:                  datetime
    class Config: from_attributes = True

class NodeMetricCreate(BaseModel):
    node_id:         str  # Puede ser la IP o un ID único
    cpu_usage:       float
    ram_usage:       float
    active_threads:  int
    
class NodeMetricOut(BaseModel):
    id:              int
    node_id:         str
    cpu_usage:       float
    ram_usage:       float
    active_threads:  int
    ts:              datetime
    
    class Config: 
        from_attributes = True

class NodeMetricCreate(BaseModel):
    node_id: str
    cpu_usage: float
    ram_usage: float
    active_threads: int

class NodeMetricOut(BaseModel):
    id: int
    node_id: str
    cpu_usage: float
    ram_usage: float
    active_threads: int
    ts: datetime

class NodeMetricsSummary(BaseModel):
    node_id: str
    avg_cpu: float
    avg_ram: float
    peak_threads: int
    total_samples: int

    class Config:
        from_attributes = True