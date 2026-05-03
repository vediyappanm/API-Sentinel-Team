"""API workflow sequences - multi-step chained API testing."""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from server.models.core import APIWorkflow, APIWorkflowRun
from server.modules.auth.rbac import Permission, RBAC
from server.modules.persistence.database import get_db
from server.modules.workflows.executor import WorkflowExecutor

router = APIRouter(tags=["API Workflows"])
_executor = WorkflowExecutor()


@router.get("/")
async def list_workflows(
    payload: dict = Depends(RBAC.require_permission(Permission.WORKFLOWS_READ)),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload["account_id"]
    result = await db.execute(select(APIWorkflow).where(APIWorkflow.account_id == account_id))
    workflows = result.scalars().all()
    return {
        "total": len(workflows),
        "workflows": [
            {
                "id": workflow.id,
                "name": workflow.name,
                "description": workflow.description,
                "step_count": len(workflow.steps or []),
                "enabled": workflow.enabled,
                "created_at": workflow.created_at,
            }
            for workflow in workflows
        ],
    }


@router.post("/")
async def create_workflow(
    name: str = Body(...),
    description: Optional[str] = Body(None),
    steps: List[dict] = Body(...),
    payload: dict = Depends(RBAC.require_permission(Permission.WORKFLOWS_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a workflow.
    Each step: {name, method, url, headers, body, extract, assert, stop_on_failure}
    """
    account_id = payload["account_id"]
    workflow = APIWorkflow(
        id=str(uuid.uuid4()),
        account_id=account_id,
        name=name,
        description=description,
        steps=steps,
    )
    db.add(workflow)
    await db.commit()
    await db.refresh(workflow)
    return {"id": workflow.id, "name": workflow.name, "step_count": len(steps)}


@router.get("/{workflow_id}")
async def get_workflow(
    workflow_id: str,
    payload: dict = Depends(RBAC.require_permission(Permission.WORKFLOWS_READ)),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload["account_id"]
    result = await db.execute(
        select(APIWorkflow).where(
            APIWorkflow.id == workflow_id,
            APIWorkflow.account_id == account_id,
        )
    )
    workflow = result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(404, "Workflow not found")
    return {
        "id": workflow.id,
        "name": workflow.name,
        "description": workflow.description,
        "steps": workflow.steps,
        "enabled": workflow.enabled,
        "created_at": workflow.created_at,
    }


@router.post("/{workflow_id}/execute")
async def execute_workflow(
    workflow_id: str,
    auth_headers: Optional[dict] = Body(None),
    payload: dict = Depends(RBAC.require_permission(Permission.WORKFLOWS_EXECUTE)),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload["account_id"]
    result = await db.execute(
        select(APIWorkflow).where(
            APIWorkflow.id == workflow_id,
            APIWorkflow.account_id == account_id,
        )
    )
    workflow = result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(404, "Workflow not found")
    if not workflow.enabled:
        raise HTTPException(400, "Workflow is disabled")

    run = APIWorkflowRun(
        id=str(uuid.uuid4()),
        workflow_id=workflow_id,
        account_id=account_id,
        status="RUNNING",
        started_at=datetime.now(timezone.utc),
    )
    db.add(run)
    await db.commit()

    try:
        result_payload = await _executor.run(workflow.steps or [], auth_headers=auth_headers or {})
        run.status = result_payload["status"]
        run.step_results = result_payload["step_results"]
        run.variables = result_payload.get("variables", {})
        run.error = result_payload.get("error")
    except Exception as exc:
        run.status = "FAILED"
        run.error = str(exc)
    finally:
        run.completed_at = datetime.now(timezone.utc)
        await db.commit()

    return {
        "run_id": run.id,
        "status": run.status,
        "step_results": run.step_results,
        "error": run.error,
    }


@router.get("/{workflow_id}/runs")
async def list_runs(
    workflow_id: str,
    limit: int = Query(20),
    payload: dict = Depends(RBAC.require_permission(Permission.WORKFLOWS_READ)),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload["account_id"]
    result = await db.execute(
        select(APIWorkflowRun)
        .where(
            APIWorkflowRun.workflow_id == workflow_id,
            APIWorkflowRun.account_id == account_id,
        )
        .order_by(APIWorkflowRun.created_at.desc())
        .limit(limit)
    )
    runs = result.scalars().all()
    return {
        "total": len(runs),
        "runs": [
            {
                "id": run.id,
                "status": run.status,
                "started_at": run.started_at,
                "completed_at": run.completed_at,
                "error": run.error,
            }
            for run in runs
        ],
    }


@router.delete("/{workflow_id}")
async def delete_workflow(
    workflow_id: str,
    payload: dict = Depends(RBAC.require_permission(Permission.WORKFLOWS_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload["account_id"]
    result = await db.execute(
        select(APIWorkflow).where(
            APIWorkflow.id == workflow_id,
            APIWorkflow.account_id == account_id,
        )
    )
    workflow = result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(404, "Workflow not found")
    await db.delete(workflow)
    await db.commit()
    return {"deleted": workflow_id}
