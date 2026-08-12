# BRAC University Transport Management System

## Project Overview
A complete transport management system for BRAC University, replacing physical queueing with digital booking, wallet payments, and ID card check-in.

## Tech Stack
- **Backend**: Node.js + Express.js (MVC Architecture)
- **Database**: PostgreSQL
- **Caching/Concurrency**: Redis
- **Frontend**: React Native (Student/Management Apps), React.js (Admin Dashboard)

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
│   ├── .env.example        # Env template
│   ├── .gitignore
│   └── package.json
├── frontend/               # React Native & React.js apps
├── docs/                   # Documentation
└── README.md
```

## Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL (v14+)
- Redis (v7+)

### Backend Setup
1. Navigate to backend directory: `cd backend`
2. Install dependencies: `npm install`
3. Create PostgreSQL database: `createdb transport_system`
4. Copy `.env.example` to `.env` and update credentials
5. Run schema.sql to create tables
6. Start server: `npm run dev`

## Features
- User Authentication (Student/Management/Admin)
- Digital Seat Booking
- Wallet System (Recharge, Payments, Refunds)
- ID Card Check-in
- No-show Penalty System
- Emergency Cancellations
- Standby Queue Management
- Admin Dashboard (Route/Bus/User Management)
