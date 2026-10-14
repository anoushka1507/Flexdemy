from fastapi import FastAPI
from backend.main import app as backend_app

app = FastAPI(title="Flexdemy API Root")
app.mount("/api", backend_app)
# Also register backend router at root so both /api/... and /... resolve seamlessly on Vercel
app.include_router(backend_app.router)