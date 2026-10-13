"""FastAPI entry point for the fulfillment scheduler dashboard."""

from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.scheduler_service import SchedulerService


scheduler = SchedulerService()


@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler.start()
    scheduler.seed_demo()
    yield
    scheduler.stop()


app = FastAPI(
    title="Fulfillment Scheduler API",
    description="Priority-aware order fulfillment task scheduling API.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TaskCreate(BaseModel):
    order_id: str | None = Field(default=None, min_length=3, max_length=32)
    task_type: Literal[
        "Payment verification",
        "Inventory reservation",
        "Pick & pack",
        "Fraud review",
        "Shipping label",
        "Carrier booking",
    ]
    priority: Literal["HIGH", "MEDIUM", "LOW"] = "MEDIUM"
    weight: int = Field(default=5, ge=1, le=10)
    resource_units: int = Field(default=2, ge=1, le=8)
    execution_seconds: int = Field(default=5, ge=1, le=30)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "fulfillment-scheduler"}


@app.get("/api/dashboard")
def get_dashboard() -> dict:
    return scheduler.dashboard()


@app.get("/api/tasks")
def get_tasks(
    task_status: Literal["QUEUED", "RUNNING", "COMPLETED"] | None = Query(
        default=None, alias="status"
    ),
) -> list[dict]:
    return scheduler.list_tasks(task_status)


@app.post("/api/tasks", status_code=status.HTTP_201_CREATED)
def create_task(task: TaskCreate) -> dict:
    created = scheduler.create_task(**task.model_dump())
    if created is None:
        raise HTTPException(status_code=429, detail="Task queue is full")
    return created


@app.post("/api/demo/seed")
def seed_demo() -> dict[str, int]:
    created = scheduler.seed_demo()
    if not created:
        raise HTTPException(status_code=429, detail="Task queue is full")
    return {"created": created}