# Jaylogic Quick Start

1. Pull latest:
   - `git pull`

2. Go to jaylogic folder:
   - `cd /Users/senpai/Desktop/Projects/RecognizeAI/recognize/jaylogic`

3. Install deps (first time or after updates):
   - `pip install -r requirements.txt`

4. Environment file:
   - Rename `.env copy` to `.env`
   - Put your Groq API key in `.env` under `GROQ_API_KEY=...`

5. Run backend from jaylogic:
   - `python3 server.py`

6. Load extension from jaylogic folder in Chrome:
   - Open `chrome://extensions`
   - Enable Developer mode
   - Click **Load unpacked**
   - Select: `/Users/senpai/Desktop/Projects/RecognizeAI/recognize/jaylogic/extension`
