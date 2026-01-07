#!/usr/bin/env python3
"""
Temporary script to speed up all sound effects by 1.3x (affects speed and pitch).
Requires: pip install pydub
"""

import os
import shutil
from pathlib import Path
from pydub import AudioSegment

def speedup_audio(input_path, output_path, speed_factor=1.3):
    """Speed up audio file by the given factor (affects speed and pitch)."""
    print(f"Processing: {input_path.name}")
    
    # Load audio file
    audio = AudioSegment.from_file(input_path)
    
    # Speed up by changing frame rate (affects both speed and pitch)
    new_sample_rate = int(audio.frame_rate * speed_factor)
    audio = audio._spawn(audio.raw_data, overrides={"frame_rate": new_sample_rate})
    
    # Export with new sample rate (this speeds up playback and raises pitch)
    audio.export(output_path, format=output_path.suffix[1:])
    print(f"  ✓ Completed: {output_path.name}")

def main():
    script_dir = Path(__file__).parent
    slower_dir = script_dir / "slower"
    speed_factor = 1.15
    
    print(f"Speeding up all audio files in {script_dir} by {speed_factor}x...")
    print("-" * 50)
    
    # Find all audio files (excluding the script itself and slower folder)
    audio_extensions = ['.mp3', '.wav', '.m4a', '.ogg', '.flac']
    audio_files = [
        f for f in script_dir.iterdir() 
        if f.is_file() and f.suffix.lower() in audio_extensions and f.name != "speedup_sfx.py"
    ]
    
    if not audio_files:
        print("No audio files found!")
        return
    
    print(f"Found {len(audio_files)} audio file(s)\n")
    
    # Create slower folder if it doesn't exist
    slower_dir.mkdir(exist_ok=True)
    print(f"Created/using backup folder: {slower_dir}\n")
    
    # Move originals to slower folder and process
    for audio_file in audio_files:
        try:
            # Move original to slower folder
            backup_path = slower_dir / audio_file.name
            if not backup_path.exists():
                shutil.move(str(audio_file), str(backup_path))
                print(f"Moved original: {audio_file.name} -> slower/")
            else:
                print(f"Using existing backup: {audio_file.name}")
                backup_path = slower_dir / audio_file.name
            
            # Process from backup and save to original location
            speedup_audio(backup_path, audio_file, speed_factor)
        except Exception as e:
            print(f"  ✗ Error processing {audio_file.name}: {e}")
    
    print("-" * 50)
    print("Done! Original files are preserved in the 'slower' folder.")

if __name__ == "__main__":
    main()

