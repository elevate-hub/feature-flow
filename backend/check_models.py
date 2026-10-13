from app.database.base import Base

print("Registered SQLAlchemy tables:")

for table_name in sorted(Base.metadata.tables):
    print(table_name)

print("Total registered tables:", len(Base.metadata.tables))