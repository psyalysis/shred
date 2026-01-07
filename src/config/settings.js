import * as state from "../core/state.js"
import * as THREE from "three"
import { SFX_VOLUME, PIXELATION_LEVEL, MOUSE_STEERING_SENSITIVITY } from "./constants.js"
import { updatePixelRenderer, updateBloomIntensity as updateBloomIntensityFromRender, recreatePixelRenderer } from "../systems/render.js"
import { openMenu } from "../core/init.js"
import { sendNameUpdate } from "../systems/network.js"

// ============================================================================
// SETTINGS MENU
// ============================================================================

let settingsMenu = null
let isOpen = false
let animationFrame = 0
let animationTimer = 0
let applySettingsThrottle = null
let lastApplyTime = 0

// Settings state (stored in localStorage)
let settings = {
    sfxVolume: SFX_VOLUME,
    pixelationLevel: PIXELATION_LEVEL,
    mouseSensitivity: MOUSE_STEERING_SENSITIVITY,
    bloomIntensity: 1.0,  // Default to 100% (which equals 0.3 strength, 60% of original 0.5)
    swapShuvFlip: false,  // Swap A/D barrel roll with right-click shuv
    displayName: ''  // Player display name for multiplayer
}

// Export current mouse sensitivity for use in physics
export let currentMouseSensitivity = MOUSE_STEERING_SENSITIVITY

// Load settings from localStorage
function loadSettings() {
    const saved = localStorage.getItem('shredSettings')
    if (saved) {
        try {
            const parsed = JSON.parse(saved)
            settings = { ...settings, ...parsed }
            // Ensure mouse sensitivity is within valid range
            if (settings.mouseSensitivity < 0.0005 || settings.mouseSensitivity > 0.002) {
                settings.mouseSensitivity = MOUSE_STEERING_SENSITIVITY
            }
            currentMouseSensitivity = settings.mouseSensitivity
            // Apply bloom intensity on load
            if (settings.bloomIntensity !== undefined) {
                updateBloomIntensityFromRender(settings.bloomIntensity)
            }
        } catch (e) {
            console.warn('Failed to load settings:', e)
        }
    } else {
        // Apply default bloom intensity
        updateBloomIntensityFromRender(settings.bloomIntensity)
    }
}

// Save settings to localStorage
function saveSettings() {
    localStorage.setItem('shredSettings', JSON.stringify(settings))
}

// Apply settings to game (throttled to max 2 times per second)
function applySettings() {
    const now = performance.now()
    const throttleDelay = 500 // 2 times per second = 500ms
    
    if (now - lastApplyTime < throttleDelay) {
        // Clear existing throttle and set new one
        if (applySettingsThrottle) {
            clearTimeout(applySettingsThrottle)
        }
        applySettingsThrottle = setTimeout(() => {
            applySettingsImmediate()
            lastApplyTime = performance.now()
        }, throttleDelay - (now - lastApplyTime))
        return
    }
    
    applySettingsImmediate()
    lastApplyTime = now
}

function applySettingsImmediate() {
    // Update SFX volume
    if (state.audio.failAudio) state.audio.failAudio.volume = settings.sfxVolume
    if (state.audio.popSounds) {
        state.audio.popSounds.forEach(sound => sound.volume = settings.sfxVolume)
    }
    if (state.audio.landSounds) {
        state.audio.landSounds.forEach(sound => sound.volume = settings.sfxVolume)
    }
    if (state.audio.catchSounds) {
        state.audio.catchSounds.forEach(sound => sound.volume = settings.sfxVolume)
    }
    if (state.audio.railSound) state.audio.railSound.volume = settings.sfxVolume
    
    // Update pixelation (requires renderer recreation)
    // Note: This is handled separately as it requires more complex setup
    
    saveSettings()
}

/**
 * Initialize the settings menu
 */
export function initSettingsMenu() {
    loadSettings()
    applySettings()
    
    // Create menu container
    settingsMenu = document.createElement('div')
    settingsMenu.id = 'settings-menu'
    settingsMenu.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        font-family: 'Ari', monospace;
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
        overflow: auto;
    `
    
    // Create menu panel
    const panel = document.createElement('div')
    panel.id = 'settings-panel'
    
    // Function to update panel size based on window
    function updatePanelSize() {
        const maxWidth = Math.min(600, window.innerWidth - 40)
        const maxHeight = window.innerHeight - 40
        const minWidth = Math.min(400, window.innerWidth - 40)
        
        panel.style.cssText = `
            background: #404040;
            border: 4px solid #fff;
            box-shadow: 
                inset -4px -4px 0 #000,
                inset 4px 4px 0 #666,
                0 0 0 2px #000;
            padding: 20px;
            min-width: ${minWidth}px;
            max-width: ${maxWidth}px;
            max-height: ${maxHeight}px;
            width: ${Math.min(600, window.innerWidth - 40)}px;
            color: #fff;
            position: relative;
            transform: scale(0);
            image-rendering: pixelated;
            transform-origin: center center;
            overflow-y: auto;
            overflow-x: hidden;
            margin: 20px;
        `
    }
    
    updatePanelSize()
    
    // Update panel size on window resize
    window.addEventListener('resize', () => {
        if (isOpen) {
            updatePanelSize()
        }
    })
    
    // Title
    const title = document.createElement('h1')
    title.textContent = 'SETTINGS'
    title.style.cssText = `
        margin: 0 0 20px 0;
        font-size: clamp(24px, 5vw, 32px);
        font-weight: bold;
        text-align: center;
        text-shadow: 3px 3px 0 #000;
        letter-spacing: 2px;
    `
    panel.appendChild(title)
    
    // Create sections
    createSoundSection(panel)
    createControlSection(panel)
    createGraphicsSection(panel)
    createMultiplayerSection(panel)
    
    // Back button
    const closeBtn = createPixelButton('BACK', () => {
        closeSettings()
        // Return to main menu
        openMenu()
    })
    closeBtn.style.cssText += `
        margin-top: 20px;
        width: 100%;
        font-size: clamp(16px, 3vw, 20px);
        padding: 12px;
    `
    panel.appendChild(closeBtn)
    
    settingsMenu.appendChild(panel)
    document.body.appendChild(settingsMenu)
    
    // Handle ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            closeSettings()
        }
    })
    
    // Prevent pointer lock when clicking anywhere in settings menu
    settingsMenu.addEventListener('mousedown', (e) => {
        e.stopPropagation()
    })
    settingsMenu.addEventListener('click', (e) => {
        e.stopPropagation()
    })
}

/**
 * Create sound settings section
 */
function createSoundSection(parent) {
    const section = createSection('SOUND', parent)
    
    // SFX Volume
    const volumeLabel = createLabel('SFX Volume')
    section.appendChild(volumeLabel)
    
    const volumeContainer = document.createElement('div')
    volumeContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 15px;
        flex-wrap: wrap;
    `
    
    const volumeSlider = createPixelSlider(
        settings.sfxVolume,
        0,
        1,
        0.01,
        (value) => {
            // Round to avoid floating point precision issues
            const rounded = Math.round(value * 100) / 100
            settings.sfxVolume = rounded
            applySettings()
            updateSliderValue(volumeValue, rounded)
        }
    )
    volumeContainer.appendChild(volumeSlider)
    
    const volumeValue = document.createElement('span')
    volumeValue.className = 'slider-value'
    volumeValue.textContent = Math.round(settings.sfxVolume * 100) + '%'
    volumeValue.style.cssText = `
        min-width: 50px;
        text-align: right;
        font-size: clamp(16px, 3vw, 18px);
        font-weight: bold;
    `
    volumeContainer.appendChild(volumeValue)
    section.appendChild(volumeContainer)
}

/**
 * Create control settings section
 */
function createControlSection(parent) {
    const section = createSection('CONTROLS', parent)
    
    // Mouse Sensitivity
    const sensitivityLabel = createLabel('Mouse Sensitivity')
    section.appendChild(sensitivityLabel)
    
    const sensitivityContainer = document.createElement('div')
    sensitivityContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 15px;
        flex-wrap: wrap;
    `
    
    const sensitivitySlider = createPixelSlider(
        settings.mouseSensitivity,
        0.0005,
        0.002,
        0.0001,
        (value) => {
            // Round to avoid floating point precision issues
            const rounded = Math.round(value * 10000) / 10000
            settings.mouseSensitivity = rounded
            currentMouseSensitivity = rounded
            saveSettings()
            updateSliderValue(sensitivityValue, rounded, false, false, true)
        }
    )
    sensitivityContainer.appendChild(sensitivitySlider)
    
    const sensitivityValue = document.createElement('span')
    sensitivityValue.className = 'slider-value'
    sensitivityValue.textContent = Math.round(settings.mouseSensitivity * 10000) / 10
    sensitivityValue.style.cssText = `
        min-width: 50px;
        text-align: right;
        font-size: clamp(16px, 3vw, 18px);
        font-weight: bold;
    `
    sensitivityContainer.appendChild(sensitivityValue)
    section.appendChild(sensitivityContainer)
    
    // Swap Shuv/Flip checkbox
    const swapContainer = document.createElement('div')
    swapContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 15px;
        flex-wrap: wrap;
    `
    
    const swapCheckbox = createPixelCheckbox(
        settings.swapShuvFlip,
        (checked) => {
            settings.swapShuvFlip = checked
            saveSettings()
            updateControlsInfo(controlsInfo)
        }
    )
    swapContainer.appendChild(swapCheckbox)
    
    const swapLabel = document.createElement('label')
    swapLabel.textContent = 'Swap Shuv/Flip'
    swapLabel.style.cssText = `
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        user-select: none;
    `
    swapLabel.addEventListener('click', () => {
        swapCheckbox.click()
    })
    swapContainer.appendChild(swapLabel)
    section.appendChild(swapContainer)
    
    // Controls info
    const controlsInfo = document.createElement('div')
    controlsInfo.style.cssText = `
        background: #202020;  // Dark grey
        border: 2px solid #666;
        padding: 15px;
        margin-top: 15px;
        font-size: 14px;
        line-height: 1.6;
    `
    updateControlsInfo(controlsInfo)
    section.appendChild(controlsInfo)
}

/**
 * Create graphics settings section
 */
function createGraphicsSection(parent) {
    const section = createSection('GRAPHICS', parent)
    
    // Pixelation Level
    const pixelLabel = createLabel('Pixelation Level')
    section.appendChild(pixelLabel)
    
    const pixelContainer = document.createElement('div')
    pixelContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 15px;
        flex-wrap: wrap;
    `
    
    const pixelSlider = createPixelSlider(
        settings.pixelationLevel,
        1,
        8,
        1,
        (value) => {
            const rounded = Math.round(value)
            settings.pixelationLevel = rounded
            saveSettings()
            updateSliderValue(pixelValue, rounded, false, true)
            // Recreate renderer with new pixelation level
            if (state.sceneObjects.renderer && state.sceneObjects.scene && state.sceneObjects.camera) {
                const newComposer = recreatePixelRenderer(rounded)
                if (newComposer) {
                    state.sceneObjects.composer = newComposer
                    // Reapply bloom intensity after recreating renderer
                    updateBloomIntensity(settings.bloomIntensity)
                }
            }
        }
    )
    pixelContainer.appendChild(pixelSlider)
    
    const pixelValue = document.createElement('span')
    pixelValue.className = 'slider-value'
    pixelValue.textContent = settings.pixelationLevel === 1 ? 'Off' : settings.pixelationLevel
    pixelValue.style.cssText = `
        min-width: 50px;
        text-align: right;
        font-size: clamp(16px, 3vw, 18px);
        font-weight: bold;
    `
    pixelContainer.appendChild(pixelValue)
    section.appendChild(pixelContainer)
    
    // Bloom Intensity
    const bloomLabel = createLabel('Bloom Intensity')
    section.appendChild(bloomLabel)
    
    const bloomContainer = document.createElement('div')
    bloomContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 15px;
        flex-wrap: wrap;
    `
    
    const bloomSlider = createPixelSlider(
        settings.bloomIntensity,
        0,
        1,
        0.05,
        (value) => {
            // Round to avoid floating point precision issues
            const rounded = Math.round(value * 100) / 100
            settings.bloomIntensity = rounded
            saveSettings()
            updateSliderValue(bloomValue, rounded, true)
            updateBloomIntensity(rounded)
        }
    )
    bloomContainer.appendChild(bloomSlider)
    
    const bloomValue = document.createElement('span')
    bloomValue.className = 'slider-value'
    bloomValue.textContent = settings.bloomIntensity === 0 ? 'Off' : Math.round(settings.bloomIntensity * 100) + '%'
    bloomValue.style.cssText = `
        min-width: 50px;
        text-align: right;
        font-size: clamp(16px, 3vw, 18px);
        font-weight: bold;
    `
    bloomContainer.appendChild(bloomValue)
    section.appendChild(bloomContainer)
}

/**
 * Create multiplayer settings section
 */
function createMultiplayerSection(parent) {
    const section = createSection('MULTIPLAYER', parent)
    
    // Display Name
    const nameLabel = createLabel('Display Name')
    section.appendChild(nameLabel)
    
    const nameInput = document.createElement('input')
    nameInput.type = 'text'
    nameInput.value = settings.displayName || ''
    nameInput.placeholder = 'Enter your name'
    nameInput.maxLength = 20
    nameInput.style.cssText = `
        width: 100%;
        padding: 10px;
        font-size: clamp(14px, 3vw, 18px);
        font-family: 'Ari', monospace;
        background: #202020;
        border: 3px solid #fff;
        box-shadow:
            inset -3px -3px 0 #000,
            inset 3px 3px 0 #666;
        color: #fff;
        margin-bottom: 15px;
        image-rendering: pixelated;
        box-sizing: border-box;
    `
    
    nameInput.addEventListener('input', (e) => {
        settings.displayName = e.target.value.trim()
        state.displayName = settings.displayName
        saveSettings()
        
        // Update local player name label if it exists
        if (state.ui.localPlayerNameLabel) {
            state.ui.localPlayerNameLabel.element.textContent = state.displayName || ''
        }
        
        // Immediately send name update to server so other players see it
        sendNameUpdate(state.displayName)
    })
    
    nameInput.addEventListener('keydown', (e) => {
        // Prevent Enter from submitting/closing menu
        if (e.key === 'Enter') {
            e.preventDefault()
            nameInput.blur()
        }
    })
    
    section.appendChild(nameInput)
}

/**
 * Create a section container
 */
function createSection(title, parent) {
    const section = document.createElement('div')
    section.className = 'settings-section'
    section.style.cssText = `
        margin-bottom: 20px;
        padding-bottom: 15px;
        border-bottom: 2px solid #444;
    `
    
    const sectionTitle = document.createElement('h2')
    sectionTitle.textContent = title
    sectionTitle.style.cssText = `
        margin: 0 0 15px 0;
        font-size: clamp(18px, 4vw, 22px);
        font-weight: bold;
        text-shadow: 2px 2px 0 #000;
        letter-spacing: 1px;
    `
    section.appendChild(sectionTitle)
    parent.appendChild(section)
    return section
}

/**
 * Create a label
 */
function createLabel(text) {
    const label = document.createElement('div')
    label.textContent = text
    label.style.cssText = `
        font-size: clamp(14px, 3vw, 16px);
        margin-bottom: 6px;
        font-weight: bold;
    `
    return label
}

/**
 * Create a pixelated slider
 */
function createPixelSlider(value, min, max, step, onChange) {
    const container = document.createElement('div')
    container.style.cssText = `
        flex: 1;
        position: relative;
        height: 30px;
    `
    
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = min
    slider.max = max
    slider.step = step
    slider.value = value
    slider.style.cssText = `
        width: 100%;
        height: 30px;
        -webkit-appearance: none;
        appearance: none;
        background: #202020;  // Dark grey
        border: 3px solid #fff;
        box-shadow: 
            inset -3px -3px 0 #000,
            inset 3px 3px 0 #666;
        outline: none;
        image-rendering: pixelated;
    `
    
    // Custom slider styling
    slider.style.background = `linear-gradient(to right, #ff0000 0%, #ff0000 ${(value - min) / (max - min) * 100}%, #202020 ${(value - min) / (max - min) * 100}%, #202020 100%)`
    
    // Webkit thumb
    slider.style.setProperty('--webkit-slider-thumb', `
        -webkit-appearance: none;
        appearance: none;
        width: 20px;
        height: 20px;
        background: #fff;
        border: 2px solid #000;
        box-shadow: 
            inset -2px -2px 0 #666,
            inset 2px 2px 0 #000;
        cursor: pointer;
        image-rendering: pixelated;
    `)
    
    slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value)
        slider.style.background = `linear-gradient(to right, #ff0000 0%, #ff0000 ${(val - min) / (max - min) * 100}%, #202020 ${(val - min) / (max - min) * 100}%, #202020 100%)`
        onChange(val)
    })
    
    // Prevent pointer lock when interacting with slider
    slider.addEventListener('mousedown', (e) => {
        e.stopPropagation()
    })
    slider.addEventListener('click', (e) => {
        e.stopPropagation()
    })
    
    // Add CSS for webkit slider
    if (!document.getElementById('slider-styles')) {
        const style = document.createElement('style')
        style.id = 'slider-styles'
        style.textContent = `
            input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 20px;
                height: 20px;
                background: #fff;
                border: 2px solid #000;
                box-shadow: 
                    inset -2px -2px 0 #666,
                    inset 2px 2px 0 #000;
                cursor: pointer;
                image-rendering: pixelated;
            }
            input[type="range"]::-moz-range-thumb {
                width: 20px;
                height: 20px;
                background: #fff;
                border: 2px solid #000;
                box-shadow: 
                    inset -2px -2px 0 #666,
                    inset 2px 2px 0 #000;
                cursor: pointer;
                image-rendering: pixelated;
                -moz-appearance: none;
            }
        `
        document.head.appendChild(style)
    }
    
    container.appendChild(slider)
    return container
}

/**
 * Create a pixelated checkbox
 */
function createPixelCheckbox(checked, onChange) {
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = checked
    checkbox.style.cssText = `
        width: 24px;
        height: 24px;
        cursor: pointer;
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        background: ${checked ? '#ff0000' : '#202020'};
        border: 3px solid #fff;
        box-shadow: 
            inset -3px -3px 0 #000,
            inset 3px 3px 0 #666;
        image-rendering: pixelated;
        position: relative;
    `
    
    // Add checkmark when checked
    if (checked) {
        checkbox.style.backgroundImage = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath fill='%23000' d='M13.5 2L6 9.5 2.5 6l1.5-1.5L6 6.5l6-6z'/%3E%3C/svg%3E")`
        checkbox.style.backgroundRepeat = 'no-repeat'
        checkbox.style.backgroundPosition = 'center'
    }
    
    checkbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked
        checkbox.style.background = isChecked ? '#ff0000' : '#202020'
        if (isChecked) {
            checkbox.style.backgroundImage = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath fill='%23000' d='M13.5 2L6 9.5 2.5 6l1.5-1.5L6 6.5l6-6z'/%3E%3C/svg%3E")`
            checkbox.style.backgroundRepeat = 'no-repeat'
            checkbox.style.backgroundPosition = 'center'
        } else {
            checkbox.style.backgroundImage = 'none'
        }
        onChange(isChecked)
    })
    
    // Prevent pointer lock when clicking checkbox
    checkbox.addEventListener('mousedown', (e) => {
        e.stopPropagation()
    })
    checkbox.addEventListener('click', (e) => {
        e.stopPropagation()
    })
    
    return checkbox
}

/**
 * Update controls info text based on settings
 */
function updateControlsInfo(element) {
    const swapped = settings.swapShuvFlip
    element.innerHTML = `
        <div><strong>SPACE</strong> - Jump</div>
        <div><strong>MOUSE</strong> - Steer</div>
        <div><strong>LEFT CLICK</strong> - Grind</div>
        <div><strong>RIGHT CLICK</strong> - ${swapped ? 'Flip tricks' : 'Rotate board'}</div>
        <div><strong>A/D</strong> - ${swapped ? 'Shuv tricks' : 'Flip tricks'}</div>
        <div><strong>O</strong> - Toggle camera</div>
        <div><strong>ESC</strong> - Close menu</div>
    `
}

/**
 * Create a pixelated button
 */
function createPixelButton(text, onClick) {
    const button = document.createElement('button')
    button.textContent = text
    button.style.cssText = `
        background: #404040;  // Dark grey
        border: 3px solid #fff;
        box-shadow: 
            inset -3px -3px 0 #000,
            inset 3px 3px 0 #666,
            0 0 0 2px #000;
        color: #fff;
        font-family: 'Ari', monospace;
        font-size: 16px;
        font-weight: bold;
        padding: 12px 24px;
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 1px;
        image-rendering: pixelated;
        transition: none;
    `
    
    // Pixelated hover/press effects
    button.addEventListener('mouseenter', () => {
        button.style.background = '#505050'
        button.style.transform = 'translate(1px, 1px)'
        button.style.boxShadow = `
            inset -2px -2px 0 #000,
            inset 2px 2px 0 #666,
            0 0 0 2px #000
        `
    })
    
    button.addEventListener('mouseleave', () => {
        button.style.background = '#404040'
        button.style.transform = 'translate(0, 0)'
        button.style.boxShadow = `
            inset -3px -3px 0 #000,
            inset 3px 3px 0 #666,
            0 0 0 2px #000
        `
    })
    
    button.addEventListener('mousedown', () => {
        button.style.background = '#303030'
        button.style.transform = 'translate(2px, 2px)'
        button.style.boxShadow = `
            inset -1px -1px 0 #000,
            inset 1px 1px 0 #666,
            0 0 0 2px #000
        `
    })
    
    button.addEventListener('mouseup', () => {
        button.style.background = '#505050'
        button.style.transform = 'translate(1px, 1px)'
    })
    
    button.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
    })
    
    // Prevent pointer lock when clicking button
    button.addEventListener('mousedown', (e) => {
        e.stopPropagation()
    })
    
    return button
}

/**
 * Update slider value display
 */
function updateSliderValue(element, value, isBloom = false, isPixelation = false, isSensitivity = false) {
    if (element.classList.contains('slider-value')) {
        // Round to avoid floating point precision issues
        const rounded = Math.round(value * 100) / 100
        
        // Format based on value range
        if (isSensitivity) {
            // Mouse sensitivity: display as decimal (e.g., 0.0010)
            element.textContent = Math.round(value * 10000) / 10
        } else if (rounded >= 0 && rounded <= 1) {
            if (isBloom && rounded === 0) {
                element.textContent = 'Off'
            } else {
                element.textContent = Math.round(rounded * 100) + '%'
            }
        } else if (rounded < 0.01) {
            element.textContent = Math.round(rounded * 10000) / 10
        } else {
            // For pixelation level, show "Off" when value is 1
            if (isPixelation && Math.round(rounded) === 1) {
                element.textContent = 'Off'
            } else {
                element.textContent = Math.round(rounded)
            }
        }
    }
}

/**
 * Update bloom intensity
 */
function updateBloomIntensity(intensity) {
    updateBloomIntensityFromRender(intensity)
}

/**
 * Open settings menu with pixelated animation
 */
export function openSettings() {
    if (!settingsMenu) return
    
    // Unlock pointer when opening settings
    if (state.input.isPointerLocked) {
        document.exitPointerLock = document.exitPointerLock || 
                                  document.mozExitPointerLock || 
                                  document.webkitExitPointerLock
        if (document.exitPointerLock) {
            document.exitPointerLock()
        }
    }
    
    isOpen = true
    settingsMenu.style.display = 'flex'
    
    const panel = settingsMenu.querySelector('#settings-panel')
    animationFrame = 0
    animationTimer = 0
    
    // Pixelated scale animation (frame-based, not smooth)
    function animate() {
        if (!isOpen) return
        
        animationTimer++
        // Update every 2 frames for chunky animation
        if (animationTimer % 2 === 0) {
            animationFrame++
            const frames = 8  // 8 frames for animation
            const progress = Math.min(animationFrame / frames, 1)
            
            // Ease-out function (chunky steps)
            const eased = 1 - Math.pow(1 - progress, 3)
            const scale = eased * 0.8  // Scale to 0.8x
            
            panel.style.transform = `scale(${scale})`
            
            if (progress < 1) {
                requestAnimationFrame(animate)
            } else {
                panel.style.transform = 'scale(0.8)'
            }
        } else {
            requestAnimationFrame(animate)
        }
    }
    
    animate()
}

/**
 * Close settings menu with pixelated animation
 */
export function closeSettings() {
    if (!settingsMenu || !isOpen) return
    
    const panel = settingsMenu.querySelector('#settings-panel')
    animationFrame = 8
    animationTimer = 0
    
    // Reverse animation
    function animate() {
        animationTimer++
        if (animationTimer % 2 === 0) {
            animationFrame--
            const frames = 8
            const progress = Math.max(animationFrame / frames, 0)
            const eased = 1 - Math.pow(1 - progress, 3)
            const scale = eased
            
            panel.style.transform = `scale(${scale})`
            
            if (progress > 0) {
                requestAnimationFrame(animate)
            } else {
                panel.style.transform = 'scale(0)'
                settingsMenu.style.display = 'none'
                isOpen = false
            }
        } else {
            requestAnimationFrame(animate)
        }
    }
    
    animate()
}

/**
 * Toggle settings menu
 */
export function toggleSettings() {
    if (isOpen) {
        closeSettings()
    } else {
        openSettings()
    }
}

// Export settings for use in other modules
export function getSettings() {
    return { ...settings }
}

export function getSetting(key) {
    return settings[key]
}

export function isSwapShuvFlipEnabled() {
    return settings.swapShuvFlip || false
}

