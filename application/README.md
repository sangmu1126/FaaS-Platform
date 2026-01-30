# 🖥️ FaaS Application Layer

<div align="center">

![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![Vite](https://img.shields.io/badge/Vite-Fast-646CFF?style=for-the-badge&logo=vite)
![TailwindCSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=for-the-badge&logo=tailwind-css)
![Node](https://img.shields.io/badge/BFF-Node.js-339933?style=for-the-badge&logo=node.js)

**User-Friendly FaaS Dashboard & BFF Layer**

</div>

---

## 📖 Introduction

This directory contains the **Web Frontend** for deploying functions, viewing logs, and monitoring system status, along with a supporting **Backend Proxy**. It is built with a modern React stack to provide an intuitive UI/UX.

---

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

The user dashboard for function management, execution, and log viewing.

#### Installation & Run
```bash
cd frontend
npm install
npm run dev
```

#### Configuration (.env)
Create a `.env` file in the `frontend` folder and set the API server address.
Note: `.env` is not committed to Git for security (`.env.example` provided).

```ini
# frontend/.env
VITE_API_BASE_URL=http://<YOUR_CONTROLLER_IP>:8080
```

---

### 2. Backend (Optional Proxy)

A BFF (Backend For Frontend) mediating between the Frontend and Infra Controller.
It handles CORS, hides API keys, and aggregates logs.

#### Installation & Run
```bash
cd backend
npm install
npm run dev
```

#### Configuration (.env)
```ini
# backend/.env
PORT=3000
AWS_CONTROLLER_URL=http://<YOUR_CONTROLLER_IP>:8080
INFRA_API_KEY=test-api-key
```

---

## ✨ Features

### 1. ⚡ Intuitive Function Deployment
- **Drag & Drop**: Supports Zip file upload or direct code pasting.
- **Multi-Runtime**: Python, Node.js, C++, and Go runtimes supported.
- **Build Log**: Real-time visualization of deployment progress.

### 2. 📊 Real-time Observability
- **Log Explorer**: View execution logs, memory usage, and duration in real-time.
- **System Status**: Global dashboard for Controller and Worker node status.
- **Log Expansion**: Expand large log messages for detailed inspection.

### 3. 🎛️ Control & Visualization Layer
- **Live Stress Testing UI**: Integrated terminal interface to trigger load tests and toggle between 'Capacity' and 'Resiliency' modes.
- **Dynamic Chart Rendering**: High-performance rendering of real-time metrics (CPU, Memory, Latency) using Recharts.
- **State Feedback System**: Visual indicators for system states, including 'Warm/Cold' pool status and auto-scaling events.



---

## ⚠️ Configuration Guide

Configuration is managed via environment variables, not hardcoding.

- **Frontend**: Loads variables prefixed with `VITE_` in `src/config.ts`.
- **Backend**: Uses `dotenv` for configuration management.
- **Git**: All sensitive `.env` files are in `.gitignore`. Inject variables during deployment.
