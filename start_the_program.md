# 🚀 How to Start the Program

## Quick Start Guide

### Prerequisites
- Node.js (v14 or higher)
- npm (comes with Node.js)
- Modern web browser (Chrome, Firefox, Safari, Edge)

## 📋 Step-by-Step Instructions

### Step 1: Navigate to Project Directory
```bash
cd /AdaptiveStreaming_Collab_AR_VTK
```

### Step 2: Install Dependencies (First Time Only)
```bash
npm install
```

### Step 3: Start WebSocket Server
```bash
node server.js
```
**Expected Output:** `WebSocket server running at ws://localhost:9001`

### Step 4: Start Development Server (New Terminal)
Open a new terminal and run:
```bash
cd /AdaptiveStreaming_Collab_AR_VTK
npm start
```
**Expected Output:** Webpack dev server starting on port 8080

### Step 5: Access the Application
1. Open your browser
2. Go to: **http://localhost:8080**
3. The application should load without errors

## 🛑 How to Stop the Servers

### Method 1: Using Keyboard Shortcuts
1. **WebSocket Server (Terminal 1)**: Press `Ctrl + C` to stop
2. **Development Server (Terminal 2)**: Press `Ctrl + C` to stop

### Method 2: Using Command Line
```bash
# Kill all Node.js processes
pkill -f "node server.js"
pkill -f "npm"
pkill -f "webpack"

# Or kill everything at once
pkill -f "node"
```

### Method 3: Check and Kill Specific Processes
```bash
# Check what's running
ps aux | grep -E "(node|npm)" | grep -v grep

# Kill specific processes by PID
kill [PID_NUMBER]
```

### Method 4: Emergency Stop (Nuclear Option)
```bash
# Kill all Node.js related processes
pkill -f "node" && pkill -f "npm" && pkill -f "webpack"
```

## 🔄 How to Restart the Servers

### Quick Restart
```bash
# Stop everything first
pkill -f "node" && pkill -f "npm" && pkill -f "webpack"

# Wait 2 seconds
sleep 2

# Start WebSocket server
node server.js &

# Start development server
npm start
```

### Clean Restart (Recommended)
```bash
# Navigate to project directory
cd /Users/shashikant/Desktop/GMU_HW/cs692_project/AdaptiveStreaming_Collab_AR_VTK

# Kill existing processes
pkill -f "node" && pkill -f "npm" && pkill -f "webpack"

# Wait for processes to fully stop
sleep 3

# Start WebSocket server (Terminal 1)
node server.js

# Start development server (Terminal 2 - new terminal)
npm start
```

## 🔧 Testing Features

### Load 3D Data
1. Click "Load VTP File" button
2. Select a file from `vtp_files/` directory:
   - `Bones.vtp`
   - `Lungs.vtp`
   - `Skull.vtp`
   - `Ventricles.vtp`
   - etc.

### Test Viewport Culling
1. Look for "Toggle Viewport Culling" button
2. Click to enable/disable
3. Move camera around to see culling in action
4. Check console for culling statistics

### Test Gaze Prediction
1. Look for "Toggle Gaze Prediction" button
2. Enable gaze prediction
3. Move camera to see prediction stats
4. Monitor console for prediction accuracy

### Test Collaboration
1. Open another browser tab to `http://localhost:8080`
2. Both instances share the same 3D scene
3. Changes in one tab reflect in the other

## 🐛 Common Issues & Debugging

### Issue 1: Port Already in Use
**Error:** `Error: listen EADDRINUSE: address already in use :::8080`

**Solution:**
```bash
# Kill existing processes
pkill -f "node server.js"
pkill -f "npm"
pkill -f "webpack"

# Wait 2 seconds
sleep 2

# Restart servers
node server.js &
npm start
```

### Issue 2: WebSocket Connection Failed
**Error:** "Upgrade Required" on port 9001

**Solution:**
- This is normal! Port 9001 is for WebSocket, not HTTP
- Use port 8080 for the main application
- Go to: `http://localhost:8080`

### Issue 3: VTP File Loading Error
**Error:** `Failed to load VTP file: vtkSphereSource is not defined`

**Solution:**
- This error has been fixed in the latest code
- If you see it, restart the application
- The test spheres code has been removed

### Issue 4: Network Speed Shows 0 Mbps
**Issue:** Network monitoring shows 0 Mbps

**Solution:**
- This is normal on some browsers
- The system will use active bandwidth measurement
- Check console for "Active bandwidth measurement started"

### Issue 5: Gaze Prediction Not Working
**Issue:** Avg Confidence stays at 100%, Prefetches at 0

**Solution:**
- Move the camera more dramatically
- Check if gaze prediction is enabled
- Look for "Gaze prediction enabled" in console

## 🔍 Debugging Commands

### Check Running Processes
```bash
ps aux | grep -E "(node|npm)" | grep -v grep
```

### Check Port Status
```bash
# Check if ports are open
curl -s -o /dev/null -w "Port 8080: %{http_code}\n" http://localhost:8080
curl -s -o /dev/null -w "Port 9001: %{http_code}\n" http://localhost:9001
```

### Kill All Node Processes
```bash
pkill -f "node"
pkill -f "npm"
```

### Restart Everything
```bash
# Kill all processes
pkill -f "node" && pkill -f "npm"

# Wait
sleep 3

# Start WebSocket server
node server.js &

# Start dev server
npm start
```

## 📊 Monitoring & Logs

### Console Logs to Watch For
- `WebSocket server running at ws://localhost:9001`
- `Active bandwidth measurement started`
- `Viewport culling: X/Y objects visible (Z% culled)`
- `Gaze prediction enabled`
- `Current FPS: X (target: 60)`

### Performance Metrics
- **FPS**: Should be around 60 FPS
- **Network**: Should show actual bandwidth after measurement
- **Memory**: Should be reasonable for your system
- **Culling**: Should show percentage of objects culled

## 🎯 Success Indicators

### ✅ Application Running Successfully
- Browser loads `http://localhost:8080` without errors
- Console shows "WebSocket server running at ws://localhost:9001"
- Can load VTP files without errors
- Viewport culling toggle works
- Gaze prediction toggle works

### ✅ Features Working
- 3D models load and display
- Camera controls work (mouse/touch)
- Viewport culling shows statistics
- Gaze prediction shows confidence scores
- Collaboration works between browser tabs

## 🚨 Emergency Reset

If everything fails:
```bash
# Kill everything
pkill -f "node" && pkill -f "npm" && pkill -f "webpack"

# Wait
sleep 5

# Clean restart
cd /Users/shashikant/Desktop/GMU_HW/cs692_project/AdaptiveStreaming_Collab_AR_VTK
node server.js &
npm start
```

## Need Help?

1. **Check console logs** in browser (F12 → Console)
2. **Verify both servers** are running (ports 8080 and 9001)
3. **Try emergency reset** if needed
4. **Check file permissions** if VTP files won't load

---

**Last Updated:** December 2024  
**Version:** 2.3.4  
**Status:** ✅ Ready to Use
