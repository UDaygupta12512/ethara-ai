# Ethara AI 🚀

Ethara is a task manager I built for teams who want to stop guessing and start moving. It's not just another Kanban board; it's designed to be fast, secure, and actually pleasant to use every day.

## What makes it different?
- **Hand-crafted UI**: No heavy frameworks. Just fast, custom CSS with glassmorphism and a focus on clarity.
- **Real-time Tracking**: You can see exactly who's doing what without refreshing constantly.
- **Built for Security**: It uses high-cost bcrypt hashing and JWT sessions. It's production-ready from day one.
- **Fast Database**: Built on SQLite with WAL mode for performance that's usually overkill for a task manager.

## Quick Start

1. **Install things**:
   ```bash
   npm install
   ```

2. **Setup your environment**:
   Create a `.env` file (see `.env.example`). Don't forget to set a strong `JWT_SECRET`!

3. **Get some data in there**:
   ```bash
   node scripts/seed.js
   ```

4. **Run it**:
   ```bash
   npm run dev
   ```

## The Stack
- **Frontend**: Vanilla JS (ES6+), Modern CSS (Custom properties, Glassmorphism).
- **Backend**: Node.js, Express.
- **Database**: SQLite (via better-sqlite3) — it's fast and file-based.
- **Security**: Hardened with Helmet and Rate Limiting.

## Folders
- `/src` - All the backend magic.
- `/public` - Where the frontend lives.
- `/scripts` - Useful tools for seeding and testing.

## License
MIT. Feel free to use it for whatever.
