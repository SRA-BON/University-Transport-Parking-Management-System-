# BRAC University Transport Management System

## Project Overview
A complete transport management system for BRAC University, replacing physical queueing with digital booking, wallet payments, and ID card check-in.

## Tech Stack
- **Backend**: Node.js + Express.js (MVC Architecture)
- **Database**: PostgreSQL (Hosted on Supabase)
- **Caching/Concurrency**: Redis (Hosted on Render)
- **Frontend**: React.js + Vite (Web App) / React Native (Mobile Apps)
- **Deployment**: Firebase Hosting (Frontend), Render (Backend Web Service & Redis)
- **Payments**: SSLCommerz Integration
- **Notifications**: Firebase Cloud Messaging (FCM) & Ethereal/Gmail SMTP

## Project Structure
```
transport-system/
├── backend/
│   ├── src/
│   │   ├── config/         # Database & Redis config
│   │   ├── controllers/    # Controllers (C in MVC)
│   │   ├── models/         # Models (M in MVC)
│   │   ├── routes/         # API Routes
│   │   ├── middleware/     # Auth, error handling
│   │   └── server.js       # Entry point
│   ├── database/
│   │   └── schema.sql      # Database schema
│   ├── .env                # Environment variables
│   └── package.json
├── frontend/               
│   └── web-app/            # React.js Vite Frontend
├── docs/                   # Documentation
├── firebase.json           # Firebase Hosting config
├── .firebaserc             # Firebase Project config
└── README.md
```

## Getting Started (Local Development)

### Prerequisites
- Node.js (v18+)
- PostgreSQL (v14+) or Supabase account
- Redis (v7+)

### Backend Setup
1. Navigate to backend directory: `cd backend`
2. Install dependencies: `npm install`
3. Setup PostgreSQL and Redis (or use remote Supabase/Render URLs).
4. Update `.env` with your `DATABASE_URL` (or DB host credentials) and `REDIS_URL`.
5. Start server: `npm run dev`

### Frontend Setup
1. Navigate to frontend directory: `cd frontend/web-app`
2. Install dependencies: `npm install`
3. Update `.env` (or `.env.production` if building) with `VITE_API_BASE_URL` pointing to the backend.
4. Start development server: `npm run dev`

## Production Deployment

### Backend (Render)
1. The backend is configured to be deployed as a **Web Service** on Render.
2. Ensure the **Root Directory** is set to `backend`.
3. Set the **Build Command** to `npm install` and **Start Command** to `npm start`.
4. Create a Redis instance on Render and add its internal URL to the `REDIS_URL` environment variable.
5. Add `DATABASE_URL` (Supabase), `FRONTEND_URL` (Firebase), and all other necessary secrets to the Render Environment Variables.

### Frontend (Firebase Hosting)
1. Ensure `VITE_API_BASE_URL` in `frontend/web-app/.env.production` points to your live Render backend URL.
2. Build the project:
   ```bash
   cd frontend/web-app
   npm run build
   ```
3. Deploy to Firebase:
   ```bash
   cd ../..
   firebase login
   firebase deploy --only hosting
   ```

## Features
- User Authentication (Student/Management/Admin)
- Digital Seat Booking
- Wallet System (Recharge, Payments, Refunds)
- ID Card Check-in
- No-show Penalty System
- Emergency Cancellations
- Standby Queue Management
- Admin Dashboard (Route/Bus/User Management)
