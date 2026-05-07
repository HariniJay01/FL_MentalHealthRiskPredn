import subprocess
import sys
import time
import os
import signal

def run_background(command, env=None, cwd=None):
    print(f"Starting: {' '.join(command)}")
    env_vars = os.environ.copy()
    if env:
        env_vars.update(env)
    process = subprocess.Popen(
        command,
        env=env_vars,
        cwd=cwd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    return process

def main():
    print("=" * 60)
    print("🧠 Starting FL Mental Health Risk Detection Locally")
    print("=" * 60)
    
    processes = []
    
    try:
        # Start FL Server
        p_server = run_background(
            [sys.executable, "app.py"],
            cwd="server",
            env={"FLASK_ENV": "development"}
        )
        processes.append(("Server (Port 5000)", p_server))
        
        # Start Clients
        clients = [
            ("Twitter", "twitter", "#1DA1F2", "🐦", 5001),
            ("Reddit", "reddit", "#FF4500", "🤖", 5002),
            ("Facebook", "facebook", "#4267B2", "📘", 5003),
            ("Instagram", "instagram", "#C13584", "📸", 5004),
            ("LinkedIn", "linkedin", "#0077B5", "💼", 5005),
        ]
        
        for name, node_id, color, icon, port in clients:
            p = run_background(
                [sys.executable, "app.py"],
                cwd="client",
                env={
                    "NODE_NAME": name,
                    "NODE_ID": node_id,
                    "NODE_COLOR": color,
                    "NODE_ICON": icon,
                    "PORT": str(port),
                    "FL_SERVER_URL": "http://localhost:5000"
                }
            )
            processes.append((f"Client {name} (Port {port})", p))
            time.sleep(0.5)

        # Start Frontend Static Server
        # Using python's built in http.server to serve on port 8000
        p_frontend = run_background(
            [sys.executable, "-m", "http.server", "8000"],
            cwd=os.path.join("frontend", "src")
        )
        processes.append(("Frontend Dashboard (Port 8000)", p_frontend))

        print("\n✅ All services started successfully!")
        print("🌐 Open dashboard at: http://localhost:8000")
        print("\nPress Ctrl+C to stop all services...")
        
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\nStopping all services...")
    finally:
        for name, process in processes:
            print(f"Terminating {name}...")
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
        print("Done. Goodbye!")

if __name__ == "__main__":
    main()
