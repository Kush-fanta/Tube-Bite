# Tube Bite - FastAPI Backend

## Overview
This is the reference backend for the Tube Bite application.
Built with Python FastAPI, MongoDB, Cloudinary, and Firebase Auth.

## Setup

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## API Endpoints

- `POST /api/auth/verify` - Verify Firebase token
- `POST /api/clips/generate` - Generate clips from video
- `GET /api/clips/history` - Get user clip history
- `DELETE /api/clips/{id}` - Delete a clip
- `GET /api/templates` - Get available templates
