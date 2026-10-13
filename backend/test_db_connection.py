
from sqlalchemy import text

from app.config import settings
from app.database.connection import engine


print("Loaded database:", settings.POSTGRES_DB)
print("Loaded database user:", settings.POSTGRES_USER)

try:
    with engine.connect() as connection:
        result = connection.execute(text("SELECT 1"))
        print("Database connection successful!")
        print("Test query result:", result.scalar())

except Exception as error:
    print("Database connection failed.")
    print("Error type:", type(error).__name__)
    print("Error:", error)

finally:
    engine.dispose()
