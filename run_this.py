import os
import subprocess
import threading
import sys
import time

def run_command(command, cwd=None):
    print(f"[*] Starting: {command} (cwd: {cwd or '.'})")
    process = subprocess.Popen(
        command,
        shell=True,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    
    # Setup prefix for readability
    prefix = "[SYSTEM] "
    if "jaylogic" in command:
        prefix = "[JAYLOGIC] "
    elif "backend" in command:
        prefix = "[BACKEND]  "
    elif "npm" in command:
        prefix = "[FRONTEND] "
        
    for line in iter(process.stdout.readline, ''):
        sys.stdout.write(f"{prefix}{line}")
    
    process.wait()
    print(f"\n[*] Process exited with code {process.returncode}: {command}\n")

def check_dependencies():
    print("=== Checking Dependencies ===")
    
    # 1. Frontend dependencies (npm install)
    print("[*] Verifying Frontend dependencies...")
    subprocess.run("npm install", shell=True, check=True)
        
    # 2. Python dependencies (pip install)
    print("[*] Verifying Python dependencies...")
    subprocess.run(f"{sys.executable} -m pip install -r jaylogic/requirements.txt", shell=True, check=True)
    subprocess.run(f"{sys.executable} -m pip install -r backend/requirements.txt", shell=True, check=True)
    print("=== All dependencies verified! ===\n")

def main():
    try:
        check_dependencies()
    except subprocess.CalledProcessError as e:
        print(f"\n[ERROR] Failed to install dependencies. Error: {e}")
        sys.exit(1)
        
    print("=== Starting RecognizeAI Stack ===")
    
    threads = []
    
    # 1. Start Jaylogic Tracking & ASR Server
    t1 = threading.Thread(target=run_command, args=(f"{sys.executable} server.py", "jaylogic"))
    t1.daemon = True
    threads.append(t1)
    
    # 2. Start Backend Neo4j Knowledge Graph Server
    t2 = threading.Thread(target=run_command, args=(f"{sys.executable} main.py", "backend"))
    t2.daemon = True
    threads.append(t2)
    
    # 3. Start Frontend UI
    t3 = threading.Thread(target=run_command, args=("npm run dev", "."))
    t3.daemon = True
    threads.append(t3)
    
    # Launch all threads
    for t in threads:
        t.start()
        
    # Keep main thread alive to catch KeyboardInterrupt
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[*] Ctrl+C received. Shutting down all processes...")
        sys.exit(0)

if __name__ == "__main__":
    main()
