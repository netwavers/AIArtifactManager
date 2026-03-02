import eel
import json
import os
import sys
import re
import bottle
import tkinter as tk
from tkinter import filedialog
from urllib.parse import unquote
import base64
from mutagen import File as MutagenFile
import subprocess
import webbrowser
import threading

# Set web files folder
eel.init('web')

data_file = 'data.json'

def get_default_data():
    return [
        {
            "id": 1,
            "title": "Neon Cyberpunk City",
            "prompt": "A sprawling cyberpunk city at night with neon lights, reflections in puddles, cinematic lighting, 8k resolution.",
            "type": "image",
            "content": "https://images.unsplash.com/photo-1605142859862-978be7eba909?auto=format&fit=crop&w=800&q=80",
            "tags": ["cyberpunk", "concept-art", "landscape"],
            "timestamp": "2023-01-01T00:00:00.000Z"
        }
    ]

@eel.expose
def load_data():
    if os.path.exists(data_file):
        try:
            with open(data_file, 'r', encoding='utf-8') as f:
                artifacts = json.load(f)
                
                # Enrich with file creation time for sorting
                for a in artifacts:
                    content = a.get('content', '')
                    # Check if it's a local path
                    is_local = content.startswith('/') or content.startswith('\\') or re.match(r'^[a-zA-Z]:[\\/]', content)
                    if is_local and os.path.exists(content):
                        try:
                            a['file_ctime'] = os.path.getctime(content)
                        except:
                            a['file_ctime'] = 0
                    else:
                        # Fallback to entry timestamp if not a local file
                        try:
                            from datetime import datetime
                            # Convert ISO string to timestamp
                            dt = datetime.fromisoformat(a.get('timestamp', '').replace('Z', '+00:00'))
                            a['file_ctime'] = dt.timestamp()
                        except:
                            a['file_ctime'] = 0
                return artifacts
        except Exception as e:
            print(f"Error loading data: {e}")
            return []
    else:
        # Create default data on first run
        default = get_default_data()
        save_data(default)
        return default

@eel.expose
def save_data(data):
    try:
        with open(data_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        return True
    except Exception as e:
        print(f"Error saving data: {e}")
        return False

# Custom route to serve local absolute paths
@eel.btl.route('/local/<filepath:path>')
def serve_local_file(filepath):
    filepath = unquote(filepath)
    if filepath.startswith('/') and len(filepath) > 2 and filepath[2] == ':':
        filepath = filepath[1:]
    
    # Simple check to avoid directory traversal outside of drives
    if not os.path.exists(filepath):
        return bottle.HTTPError(404, "File not found")
        
    folder = os.path.dirname(filepath)
    filename = os.path.basename(filepath)
    return bottle.static_file(filename, root=folder)

# Dedicated route for audio cover extraction
@eel.btl.route('/cover/<filepath:path>')
def serve_audio_cover(filepath):
    filepath = unquote(filepath)
    if filepath.startswith('/') and len(filepath) > 2 and filepath[2] == ':':
        filepath = filepath[1:]
        
    try:
        audio = MutagenFile(filepath)
        if audio is None:
            return bottle.HTTPError(404)
            
        data = None
        mime = "image/jpeg"
        
        # ID3 (MP3)
        if hasattr(audio, 'tags') and audio.tags:
            for key, tag in audio.tags.items():
                if key.startswith('APIC'):
                    data = tag.data
                    mime = tag.mime
                    break
        
        # FLAC
        if not data and hasattr(audio, 'pictures') and audio.pictures:
            pic = audio.pictures[0]
            data = pic.data
            mime = pic.mime
            
        # MP4 / M4A
        if not data and hasattr(audio, 'tags') and hasattr(audio.tags, 'get') and 'covr' in audio.tags:
            covr = audio.tags['covr'][0]
            data = covr
            mime = 'image/jpeg' if covr.startswith(b'\xff\xd8') else 'image/png'
            
        if data:
            return bottle.HTTPResponse(body=data, headers={'Content-Type': mime})
            
    except Exception as e:
        print(f"Error serving cover for {filepath}: {e}")
        
    return bottle.HTTPError(404)

@eel.expose
def run_app(content):
    try:
        if content.startswith('http://') or content.startswith('https://'):
            webbrowser.open(content)
            return True
        elif os.path.exists(content):
            # Run local file or open document
            if os.name == 'nt':
                os.startfile(content)
            else:
                subprocess.Popen(['xdg-open', content])
            return True
        else:
            print(f"Cannot run: {content} not found or invalid URL")
            return False
    except Exception as e:
        print(f"Error running app {content}: {e}")
        return False

@eel.expose
def get_directory_contents(target_path):
    if not target_path:
        target_path = os.path.expanduser("~")
    
    try:
        items = []
        with os.scandir(target_path) as it:
            for entry in it:
                try:
                    # Skip hidden files
                    if entry.name.startswith('.') and os.name != 'nt':
                        continue
                    
                    stat = entry.stat()
                    items.append({
                        "name": entry.name,
                        "path": entry.path,
                        "is_dir": entry.is_dir(),
                        "ext": os.path.splitext(entry.name)[1].lower() if entry.is_file() else "",
                        "ctime": int(stat.st_ctime),
                        "mtime": int(stat.st_mtime),
                        "size": stat.st_size
                    })
                except Exception:
                    continue
        
        # Sort: Directories first, then alphabetical
        items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
        return {"success": True, "path": os.path.abspath(target_path), "items": items}
    except Exception as e:
        return {"success": False, "error": str(e)}

@eel.expose
def get_system_drives():
    drives = []
    if os.name == 'nt':
        import string
        from ctypes import windll
        bitmask = windll.kernel32.GetLogicalDrives()
        for letter in string.ascii_uppercase:
            if bitmask & 1:
                drives.append(f"{letter}:\\")
            bitmask >>= 1
    else:
        drives.append("/")
    return drives

@eel.expose
def get_user_home():
    return os.path.expanduser("~")

@eel.expose
def get_parent_dir(current_path):
    return os.path.dirname(os.path.abspath(current_path))


def on_close(page, sockets):
    # Do nothing so the server keeps running even if a browser window is closed
    pass

if __name__ == '__main__':
    # Start Eel app
    try:
        eel.start('index.html', size=(1280, 900), port=8000, close_callback=on_close)
    except Exception as e:
        print(f"Failed to start Eel: {e}")
