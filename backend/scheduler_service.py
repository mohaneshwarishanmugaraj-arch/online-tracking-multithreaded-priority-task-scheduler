"""In-memory, threaded fulfillment task scheduler used by the REST API."""

from __future__ import annotations

import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


PRIORITY_RANK = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}
TOTAL_RESOURCES = 12
MAX_QUEUED_TASKS = 100
AGING_SECONDS = 15


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SchedulerService:
    """Dispatch order-fulfillment jobs by priority, weight, and resource fit."""

    def __init__(self, worker_count: int = 3) -> None:
        self.worker_count = worker_count
        self._condition = threading.Condition()
        self._tasks: dict[str, dict[str, Any]] = {}
        self._queue: list[str] = []
        self._events: deque[dict[str, Any]] = deque(maxlen=80)
        self._threads: list[threading.Thread] = []
        self._running = False
        self._available_resources = TOTAL_RESOURCES
        self._order_counter = 2401
        self._completed_count = 0
        self._priority_promotions = 0
        self._total_wait_seconds = 0.0
        self._total_run_seconds = 0.0

    def start(self) -> None:
        with self._condition:
            if self._running:
                return
            self._running = True
            self._threads = [
                threading.Thread(
                    target=self._worker_loop,
                    args=(worker_number,),
                    name=f"fulfillment-worker-{worker_number}",
                    daemon=True,
                )
                for worker_number in range(1, self.worker_count + 1)
            ]
            for thread in self._threads:
                thread.start()
            self._add_event_locked("Scheduler online", "System")

    def stop(self) -> None:
        with self._condition:
            self._running = False
            self._condition.notify_all()
        for thread in self._threads:
            thread.join(timeout=1)

    def create_task(
        self,
        *,
        task_type: str,
        priority: str,
        weight: int,
        resource_units: int,
        execution_seconds: int,
        order_id: str | None = None,
    ) -> dict[str, Any] | None:
        with self._condition:
            if len(self._queue) >= MAX_QUEUED_TASKS:
                return None

            if order_id is None:
                order_id = f"ORD-{self._order_counter}"
                self._order_counter += 1

            now = time.time()
            task = {
                "id": uuid4().hex[:10],
                "order_id": order_id,
                "task_type": task_type,
                "priority": priority,
                "requested_priority": priority,
                "weight": weight,
                "resource_units": resource_units,
                "execution_seconds": execution_seconds,
                "status": "QUEUED",
                "created_at": utc_now(),
                "started_at": None,
                "completed_at": None,
                "worker": None,
                "_created_epoch": now,
            }
            self._tasks[task["id"]] = task
            self._queue.append(task["id"])
            self._add_event_locked(
                f'{task_type} queued for {order_id}', priority
            )
            self._condition.notify_all()
            return self._public_task(task)

    def seed_demo(self) -> int:
        examples = [
            ("Payment verification", "HIGH", 9, 2, 5),
            ("Inventory reservation", "HIGH", 8, 3, 7),
            ("Pick & pack", "MEDIUM", 7, 5, 9),
            ("Fraud review", "HIGH", 10, 2, 8),
            ("Shipping label", "LOW", 4, 1, 4),
            ("Carrier booking", "MEDIUM", 6, 2, 6),
            ("Pick & pack", "MEDIUM", 6, 4, 8),
            ("Inventory reservation", "LOW", 3, 2, 5),
            ("Payment verification", "HIGH", 8, 1, 4),
        ]
        created = 0
        for task_type, priority, weight, units, seconds in examples:
            if self.create_task(
                task_type=task_type,
                priority=priority,
                weight=weight,
                resource_units=units,
                execution_seconds=seconds,
            ):
                created += 1
        return created

    def list_tasks(self, status: str | None = None) -> list[dict[str, Any]]:
        with self._condition:
            tasks = [
                self._public_task(task)
                for task in self._tasks.values()
                if status is None or task["status"] == status
            ]
            return sorted(tasks, key=lambda task: task["created_at"], reverse=True)

    def dashboard(self) -> dict[str, Any]:
        with self._condition:
            tasks = list(self._tasks.values())
            queued = sum(task["status"] == "QUEUED" for task in tasks)
            running = [task for task in tasks if task["status"] == "RUNNING"]
            completed = sum(task["status"] == "COMPLETED" for task in tasks)
            active_resources = TOTAL_RESOURCES - self._available_resources
            return {
                "orders_processed": completed,
                "active_tasks": len(running),
                "queued_tasks": queued,
                "total_tasks": len(tasks),
                "workers_online": self.worker_count if self._running else 0,
                "resource_utilization": round(
                    active_resources / TOTAL_RESOURCES * 100, 1
                ),
                "resources_in_use": active_resources,
                "total_resources": TOTAL_RESOURCES,
                "priority_promotions": self._priority_promotions,
                "avg_wait_seconds": round(
                    self._total_wait_seconds / self._completed_count, 1
                )
                if self._completed_count
                else 0,
                "avg_run_seconds": round(
                    self._total_run_seconds / self._completed_count, 1
                )
                if self._completed_count
                else 0,
                "priority_breakdown": {
                    priority: sum(
                        task["priority"] == priority
                        and task["status"] != "COMPLETED"
                        for task in tasks
                    )
                    for priority in PRIORITY_RANK
                },
                "activity": list(reversed(self._events)),
            }

    def _worker_loop(self, worker_number: int) -> None:
        while True:
            with self._condition:
                while self._running:
                    self._promote_aged_tasks_locked()
                    task = self._next_fitting_task_locked()
                    if task is not None:
                        break
                    self._condition.wait(timeout=1)
                else:
                    return

                self._queue.remove(task["id"])
                task["status"] = "RUNNING"
                task["started_at"] = utc_now()
                task["worker"] = f"Worker {worker_number}"
                task["_started_epoch"] = time.time()
                self._available_resources -= task["resource_units"]
                self._add_event_locked(
                    f'{task["task_type"]} started for {task["order_id"]}',
                    task["worker"],
                )

            time.sleep(task["execution_seconds"])

            with self._condition:
                task["status"] = "COMPLETED"
                task["completed_at"] = utc_now()
                self._available_resources += task["resource_units"]
                self._completed_count += 1
                self._total_wait_seconds += (
                    task["_started_epoch"] - task["_created_epoch"]
                )
                self._total_run_seconds += (
                    time.time() - task["_started_epoch"]
                )
                self._add_event_locked(
                    f'{task["task_type"]} completed for {task["order_id"]}',
                    task["worker"],
                )
                self._condition.notify_all()

    def _next_fitting_task_locked(self) -> dict[str, Any] | None:
        available = [
            self._tasks[task_id]
            for task_id in self._queue
            if self._tasks[task_id]["resource_units"] <= self._available_resources
        ]
        if not available:
            return None
        return max(
            available,
            key=lambda task: (
                PRIORITY_RANK[task["priority"]],
                task["weight"],
                -task["_created_epoch"],
            ),
        )

    def _promote_aged_tasks_locked(self) -> None:
        now = time.time()
        changed = False
        for task_id in self._queue:
            task = self._tasks[task_id]
            elapsed = now - task["_created_epoch"]
            steps = int(elapsed // AGING_SECONDS)
            current_rank = PRIORITY_RANK[task["priority"]]
            requested_rank = PRIORITY_RANK[task["requested_priority"]]
            promoted_rank = min(PRIORITY_RANK["HIGH"], requested_rank + steps)
            if promoted_rank > current_rank:
                old_priority = task["priority"]
                task["priority"] = next(
                    priority
                    for priority, rank in PRIORITY_RANK.items()
                    if rank == promoted_rank
                )
                self._priority_promotions += promoted_rank - current_rank
                self._add_event_locked(
                    f'{task["order_id"]} priority raised: '
                    f'{old_priority} → {task["priority"]}',
                    "Aging policy",
                )
                changed = True
        if changed:
            self._condition.notify_all()

    def _add_event_locked(self, message: str, source: str) -> None:
        self._events.appendleft(
            {"id": uuid4().hex[:8], "message": message, "source": source, "at": utc_now()}
        )

    @staticmethod
    def _public_task(task: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in task.items() if not key.startswith("_")}