# FaaS Application Layer

This directory contains the User Interface (Frontend) for the FaaS platform and the supporting Backend Proxy (BFF).

## 📂 Directory Structure

```bash
application/
├── frontend/           # React + Vite + TailwindCSS (User Dashboard)
└── backend/            # Node.js + Express (BFF Proxy & Logging Gateway)
```

---

## 🚀 Getting Started

You need to install dependencies and run the server in each directory.

### 1. Frontend (React App)

A web dashboard where users can deploy functions and check logs.

#### Installation & Run
```bash
cd frontend
npm install
npm run dev
```

#### Configuration (.env)
Create a `.env` file in the `frontend` folder and set the API server address.
Refer to the `.env.example` file.

```ini
# frontend/.env
VITE_API_BASE_URL=http://<YOUR_CONTROLLER_IP>:8080
```
> **Note**: For security reasons, the `.env` file is not uploaded to Git.

---

### 2. Backend (Optional Proxy / Gateway)

Acts as a BFF (Backend For Frontend) mediating between the Frontend and the FaaS Controller, or handling logging/Slack notifications.
*Note: Currently, the Frontend might be configured to call the Controller API directly (check `config.ts`).*

#### Installation & Run
```bash
cd backend
npm install
npm run dev
```

#### Configuration (.env)
Create a `.env` file in the `backend` folder.

```ini
# backend/.env
PORT=3000
AWS_ALB_URL=http://<YOUR_CONTROLLER_IP>:8080
SLACK_BOT_TOKEN=xoxb-... (Optional)
SLACK_CHANNEL_ID=C123... (Optional)
```

---

## 🛠 Features

- **Function Management**: Upload, update, and delete functions
- **Deployment**: Deploy functions with supported runtimes (Python, Node.js, C++, Go)
- **Real-time Logs**: View execution logs in real-time
- **AI Model Integration**: Select LLM models and request inference

## ⚠️ Configuration Guide

**We manage configurations via files to avoid hardcoding.**

- **Frontend**: Loads environment variables (`VITE_API_BASE_URL`) in `src/config.ts`.
- **Backend**: Loads environment variables using `dotenv` in `src/config/index.js`.
- **Git**: Configuration files (`.env`) are registered in `.gitignore` and are not shared. Please inject environment variables upon deployment.
