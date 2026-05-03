
import asyncio
from sqlalchemy import select
from server.models.core import User
from server.modules.persistence.database import AsyncSessionLocal

async def check_users():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User))
        users = result.scalars().all()
        print(f"Total users: {len(users)}")
        for u in users:
            print(f"User: {u.email}, Role: {u.role}")

if __name__ == "__main__":
    asyncio.run(check_users())
