# Ethara AI - Premium Task Management

Ethara AI is a production-ready, task management platform built for modern teams. It features a hand-crafted UI, robust role-based access control, and real-time activity tracking.

## 🚀 Key Features
- **Project & Team Management**: Create projects, set brand colors, and invite collaborators.
- **Kanban Board**: Drag-and-drop tasks to update progress effortlessly.
- **RBAC**: Multi-role system (Team Lead, Collaborator, Project Owner) with human-friendly permissions.
- **Dashboard**: Real-time stats, overdue tracking, and global activity feed.
- **Secure Auth**: JWT-based sessions with high-cost password hashing.

## 🛠️ Tech Stack
- **Frontend**: Vanilla JS (ES6+), Modern CSS (Custom properties, Glassmorphism).
- **Backend**: Node.js, Express.
- **Database**: SQLite (better-sqlite3) with WAL mode enabled for high performance.
- **Security**: Helmet, Rate Limiting, express-validator.

## 🏁 Getting Started

### 1. Installation
```bash
npm install
```

### 2. Environment Setup
Create a `.env` file in the root:
```env
PORT=3000
JWT_SECRET=your_random_secret_here
```

### 3. Initialize & Seed
```bash
# Seed with demo data
node scripts/seed.js
```

### 4. Start Development
```bash
npm run dev
```

## 📂 Project Structure
- `/src` - Backend logic, routes, and middleware.
- `/public` - Frontend assets and core application logic.
- `/data` - Local SQLite storage (auto-created).
- `/scripts` - Utilities for seeding and testing.

## 📄 License
MIT
