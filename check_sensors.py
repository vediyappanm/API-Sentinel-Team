
import asyncio
from sqlalchemy import select
from server.models.core import Sensor
from server.modules.persistence.database import AsyncSessionLocal

async def check_sensors():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Sensor))
        sensors = result.scalars().all()
        print(f"Total sensors: {len(sensors)}")
        for s in sensors:
            print(f"ID: {s.id}, Name: {s.name}, Status: {s.status}, Key: {s.sensor_key}, Last Heartbeat: {s.last_heartbeat}")

if __name__ == "__main__":
    try:
        asyncio.run(check_sensors())
    except Exception as e:
        print(f"Error: {e}")
