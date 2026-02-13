# Nodehost

Nodehost is a production-grade Web Bot Manager designed to run on Render's Free Tier. It allows users to deploy, manage, and interact with Node.js WhatsApp bots via a web interface, using a virtual coin economy.

## Architecture & Constraints

**Render Free Tier Survival Strategy:**
1.  **Ephemeral Filesystem**: The local disk is assumed to be volatile.
2.  **Rehydration Pattern**: 
    -   **MongoDB Atlas** is the Single Source of Truth for all bot files.
    -   On server start, files are "rehydrated" from MongoDB to `/tmp`.
    -   File changes are synced back to MongoDB immediately.
3.  **Single Service**: Express serves both API and Static Frontend on one port. Socket.io shares this port.
4.  **Cold Start**: Async loading states and request queuing (via frontend retry/socket logic) handle spin-downs.

## Project Structure

-   `server/`: Backend (Node.js, Express, Socket.io, Mongoose)
    -   `services/rehydration.js`: Core logic for disk<->DB sync.
    -   `services/processManager.js`: Handles `node-pty` processes.
-   `client/`: Frontend (Vite, Vanilla JS)
    -   `src/components/`: Reusable logic (Terminal, FileManager).
    -   `src/pages/`: Route views.

## Setup & Deployment

### Prerequisites
-   Node.js 18+
-   MongoDB Atlas Cluster
-   Clerk Account

### Local Development

1.  **Install Dependencies:**
    ```bash
    npm install
    cd client && npm install && cd ..
    ```

2.  **Environment Variables:**
    Create `.env` in root:
    ```env
    NODE_ENV=development
    PORT=10000
    MONGO_URI=your_mongo_uri
    CLERK_SECRET_KEY=your_clerk_secret
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_pub_key
    ```
    (Note: `NEXT_PUBLIC_...` is used by Clerk client side, ensure it's exposed or hardcoded in client config if not using a bundler replacer, but Vite handles `import.meta.env` or define. We used hardcoded key in `client/src/main.js` for simplicity as per instructions, but env var is better practice).

3.  **Run Dev Server:**
    ```bash
    npm run dev
    ```
    Access at `http://localhost:10000` (API) and `http://localhost:5173` (Vite).
    *Note: In dev, Vite runs on separate port. Configure Vite proxy in `vite.config.js` to tested API.*

### Deployment to Render

1.  Connect GitHub repo to Render.
2.  Select **Web Service**.
3.  **Build Command:** `npm run render-build`
4.  **Start Command:** `npm start`
5.  **Environment Variables:**
    -   `MONGO_URI`
    -   `CLERK_SECRET_KEY`
    -   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
    -   `NODE_ENV=production`

## Usage

1.  **Sign Up:** Uses Clerk. Get 100 free coins.
2.  **Dashboard:** Claim daily reward (10 coins).
3.  **Create Server:** Costs 50 coins.
4.  **Server Cockpit:**
    -   **Terminal:** Interactive `node-pty` shell. Supports QR codes.
    -   **Files:** Create/Edit `index.js`, `package.json`.
    -   **Start:** Runs `npm start` (ensure you have a start script).
    -   **Reinstall Dependencies:** Runs `npm install` in the rehydrated directory.
