import os

BUTTERBASE_API_KEY = os.environ["BUTTERBASE_API_KEY"]
BUTTERBASE_APP_ID = os.environ["BUTTERBASE_APP_ID"]
BUTTERBASE_API_URL = os.environ["BUTTERBASE_API_URL"]

NOSANA_GPU_ENDPOINT = os.environ["NOSANA_GPU_ENDPOINT"]
DEEPGRAM_API_KEY = os.environ["DEEPGRAM_API_KEY"]

GOOGLE_CLIENT_ID = os.environ["GOOGLE_CLIENT_ID"]
GOOGLE_CLIENT_SECRET = os.environ["GOOGLE_CLIENT_SECRET"]
GOOGLE_SERVICE_ACCOUNT_KEY = os.environ["GOOGLE_SERVICE_ACCOUNT_KEY"]

AGENTFIELD_CONTROL_PLANE_URL = os.environ.get("AGENTFIELD_CONTROL_PLANE_URL", "http://localhost:8080")

# Enrollment thresholds
FACE_MATCH_THRESHOLD = 0.85       # cosine similarity for face re-identification
VOICE_MATCH_THRESHOLD = 0.80      # cosine similarity for voice re-identification
FRAME_SAMPLE_RATE_FPS = 2         # video frames sampled per second
AUDIO_CHUNK_SECONDS = 5           # diarization window
AUDIO_CHUNK_OVERLAP_SECONDS = 1   # overlap between windows
CALENDAR_POLL_INTERVAL_SECONDS = 60
MEETING_JOIN_LEAD_SECONDS = 60    # join this many seconds before scheduled start
