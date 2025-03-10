from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get MongoDB URI from environment
MONGO_URI = os.environ["MONGO_URI"]
if not MONGO_URI:
    raise ValueError("No MONGO_URI environment variable set")

# Create client once at module level
client = AsyncIOMotorClient(MONGO_URI)  # type: ignore
db = client.ATS_Test

def get_db():
    """Returns the database instance."""
    return db
