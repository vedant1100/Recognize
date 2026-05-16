# Jaylogic Quick Start

## 1) Pull latest code
- `git pull`

## 2) Go to jaylogic folder
- `cd /Users/senpai/Desktop/Projects/RecognizeAI/recognize/jaylogic`

## 3) Install dependencies
- `pip install -r requirements.txt`

## 4) Set environment file
- Rename `.env copy` to `.env`
- Open `.env` and set:
  - `GROQ_API_KEY=your_groq_key`

## 5) Run backend server
- From the same `jaylogic` folder run:
  - `python3 server.py`
- Wait until you see:
  - `[server] ready on ws://localhost:8765/ws`

## 6) Load Chrome extension
- Open Chrome: `chrome://extensions`
- Turn on **Developer mode**
- Click **Load unpacked**
- Select folder:
  - `/Users/senpai/Desktop/Projects/RecognizeAI/recognize/jaylogic/extension`

## 7) Start in Google Meet
- Open your Meet tab
- Click the Jaylogic extension icon
- Keep backend URL as `ws://localhost:8765/ws`
- Click **Start**
