# Arma Reforger Mod Checker

A web application to check Arma Reforger mod versions and analyze their dependencies.

## 🚀 Quick Start

### 1. Installing Dependencies
```bash
npm install
```

### 2. Choose Development Mode

#### Mock Mode (Recommended for Development)
```bash
npm run dev:mock
# or
npm start
```
- ✅ No network calls
- ✅ Instant responses
- ✅ Realistic simulated data
- ✅ Perfect for testing the interface

#### Real Mode (with Network Calls)
```bash
npm run dev:real
```
- ⚠️ Network calls to mod sites
- ⏱️ Slower responses
- 🌐 Requires internet connection
- 🔍 Real-time data

### 3. Open the Application
Open your browser and go to: http://localhost:3000

### Production Deployment

```bash
# Deploy to Vercel
npm run deploy
```

## 🔧 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:mock` | Starts the server in mock mode (no network calls) |
| `npm run dev:real` | Starts the server in real mode (with network calls) |
| `npm run deploy` | Deploy to Vercel |

## 🌐 API Endpoints

### Local Development
- **Application** : http://localhost:3000
- **API Check Mods** : http://localhost:3000/api/check-mods



## 🎯 Features

- ✅ Mod version checking
- ✅ Dependency analysis
- ✅ Dependency graph visualization
- ✅ Fullscreen view with zoom
- ✅ Modern user interface
- ✅ Local development
- ✅ Mock mode (no network calls)
- ✅ Real mode (with network calls)
- ✅ Vercel deployment

## 🔄 Differences between Local and Production

| Aspect | Local | Vercel Production |
|--------|-------|-------------------|
| Server | Express.js | Vercel Serverless |
| Port | 3000 | Auto-detected |
| CORS | Configured | Managed by Vercel |
| Timeout | Unlimited | 300s max |
| Logs | Console | Vercel Dashboard |

## 🚨 Troubleshooting

### Port Already in Use
If port 3000 is occupied, change the environment variable:
```bash
PORT=3001 npm start
```

### CORS Errors
The local server already includes CORS configuration. If you have problems, make sure you're using `http://localhost:3000`.

### Server Issues
If the server doesn't start, check that:
1. All dependencies are installed
2. Port 3000 is not already in use
3. Node.js version 18+ is used

## 📝 Recommended Development Workflow

1. **Development** : Use `npm run dev:mock` for local development (mock mode)
2. **Real Testing** : Use `npm run dev:real` to test with real data
3. **Vercel Testing** : Use `npm run vercel-dev` to test the Vercel environment
4. **Deployment** : Use `npm run deploy` to deploy to production

