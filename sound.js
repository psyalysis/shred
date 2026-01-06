// ============================================================================
// WIND SOUND CONSTANTS
// ============================================================================

const WIND_VOLUME_MAX = 1  // Maximum wind volume
const WIND_PITCH_MIN = 0.1  // Minimum pitch (slower = lower)
const WIND_PITCH_MAX = 1  // Maximum pitch (faster = higher)
const WIND_SPEED_THRESHOLD = 1  // Minimum mouse movement to trigger wind
const WIND_SPEED_MAX = 200  // Mouse movement speed that maps to max volume/pitch
const WIND_LOWPASS_FREQ = 700  // Low pass filter cutoff frequency (Hz)

// ============================================================================
// WIND SOUND STATE
// ============================================================================

let windAudioContext = null
let windGainNode = null
let windLowpassFilter = null
let windSource = null
let windBuffer = null
let isWindPlaying = false

// ============================================================================
// WIND SOUND FUNCTIONS
// ============================================================================

function generateWindNoise(audioContext) {
    const sampleRate = audioContext.sampleRate
    const duration = 2  // 2 seconds of noise
    const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate)
    const data = buffer.getChannelData(0)
    
    // Generate filtered white noise (pink noise approximation)
    for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.3
    }
    
    return buffer
}

function startWindLoop() {
    if (!windBuffer || !windAudioContext) return
    
    function playWind() {
        if (!windBuffer || !windAudioContext) return
        
        windSource = windAudioContext.createBufferSource()
        windSource.buffer = windBuffer
        windSource.loop = true
        // Connect: source -> filter -> gain -> destination
        windSource.connect(windLowpassFilter)
        windSource.start(0)
        
        // Restart when buffer ends (for seamless looping)
        windSource.onended = () => {
            if (isWindPlaying) {
                playWind()
            }
        }
    }
    
    playWind()
    isWindPlaying = true
}

export async function initWindSound() {
    try {
        windAudioContext = new (window.AudioContext || window.webkitAudioContext)()
        
        // Create lowpass filter to cut frequencies above 3kHz
        windLowpassFilter = windAudioContext.createBiquadFilter()
        windLowpassFilter.type = 'lowpass'
        windLowpassFilter.frequency.value = WIND_LOWPASS_FREQ
        
        // Create gain node for volume control
        windGainNode = windAudioContext.createGain()
        windGainNode.gain.value = 0
        
        // Connect: filter -> gain -> destination
        windLowpassFilter.connect(windGainNode)
        windGainNode.connect(windAudioContext.destination)
        
        // Generate wind noise
        windBuffer = generateWindNoise(windAudioContext)
        
        startWindLoop()
    } catch (err) {
        console.error('Error initializing wind sound:', err)
    }
}

export function updateWindSound(mouseSpeed, isOnFloor, sfxVolume) {
    if (!windGainNode || !windSource) return
    
    // Only play when in air
    if (isOnFloor) {
        windGainNode.gain.setTargetAtTime(0, windAudioContext.currentTime, 0.1)
        return
    }
    
    // Calculate normalized speed (0 to 1)
    const normalizedSpeed = Math.min(Math.abs(mouseSpeed) / WIND_SPEED_MAX, 1)
    
    if (normalizedSpeed < WIND_SPEED_THRESHOLD / WIND_SPEED_MAX) {
        // Fade out when speed is too low
        windGainNode.gain.setTargetAtTime(0, windAudioContext.currentTime, 0.025)
        return
    }
    
    // Map speed to volume
    const targetVolume = normalizedSpeed * WIND_VOLUME_MAX * sfxVolume
    windGainNode.gain.setTargetAtTime(targetVolume, windAudioContext.currentTime, 0.05)
    
    // Map speed to pitch
    const targetPitch = WIND_PITCH_MIN + (normalizedSpeed * (WIND_PITCH_MAX - WIND_PITCH_MIN))
    windSource.playbackRate.setTargetAtTime(targetPitch / 2, windAudioContext.currentTime, 0.05)
}

export function playRandomCatchSound(catchSounds) {
    if (catchSounds && catchSounds.length > 0) {
        const randomCatch = catchSounds[Math.floor(Math.random() * catchSounds.length)]
        randomCatch.currentTime = 0  // Reset to start
        randomCatch.play().catch(err => {
            console.error('Error playing catch sound:', err)
        })
    }
}

