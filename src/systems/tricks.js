import * as state from "../core/state.js"
import { 
    TWO_PI, 
    PI,
    COMBO_DISPLAY_DURATION,
    COMBO_ANIMATION_DURATION,
    MIN_CUMULATIVE_ROTATION,
    CAMERA_ANGLE_SMOOTHING,
    SHOW_TRICK_NAME_FEEDBACK
} from "../config/constants.js"
import { RotationTracker } from "../utils/rotationTracker.js"
import { shortestAngleDiff, normalizeAngle } from "../utils/math.js"

// ============================================================================
// TRICK DETECTION & COMBO SYSTEM
// ============================================================================
//
// Rotation Tracking:
// - flipTracker: Tracks Z-axis rotations (360° = 1 flip)
// - body180Tracker: Tracks camera rotations (180° = 1 body spin)
// - shuvTracker: Tracks Y-axis rotations during right-click (180° = 1 shuv)
//
// Combo System:
// - Tracks sequence of tricks and grinds: "Kickflip -> Grind -> Heelflip"
// - Resets on landing or fail
// - Tricks are detected when entering grinds and on landing
//

// Create trackers for each rotation type
const flipTracker = new RotationTracker('z', TWO_PI)
const body180Tracker = new RotationTracker('camera', PI)
const shuvTracker = new RotationTracker('y', PI)

// Smooth camera angle for more stable body180 tracking
let smoothedCameraAngle = 0
let previousCameraAngle = 0

export function updateTrickDetection() {
    if (!state.sceneObjects.boardMesh) return
    
    // Check if we just became airborne
    if (state.physics.previousIsOnFloor && !state.physics.isOnFloor) {
        // Entering air - initialize all trackers
        flipTracker.start(state.sceneObjects.boardMesh.rotation.z)
        
        // Calculate initial camera angle for body 180 tracking
        // Use velocity direction if available for more accurate tracking
        let cameraAngle
        if (Math.abs(state.boardVelocity.x) > 0.001 || Math.abs(state.boardVelocity.z) > 0.001) {
            // Use velocity direction for more accurate body rotation tracking
            cameraAngle = Math.atan2(state.boardVelocity.x, state.boardVelocity.z)
        } else {
            // Fallback to camera position relative to board
            const dx = state.sceneObjects.camera.position.x - state.boardTransform.position.x
            const dz = state.sceneObjects.camera.position.z - state.boardTransform.position.z
            cameraAngle = Math.atan2(dx, dz)
        }
        
        smoothedCameraAngle = cameraAngle
        previousCameraAngle = cameraAngle
        body180Tracker.start(cameraAngle)
        
        // Shuv tracker starts when right-click begins (reset it here)
        shuvTracker.reset()
    }
    
    // Only track tricks when airborne
    if (!state.physics.isOnFloor) {
        // ========================================================================
        // IMPORTANT: All three trackers operate independently and simultaneously
        // They can all be active at the same time, allowing for combined tricks
        // like Bigflip [1, 1, 2] = 1 flip + 1 body180 + 2 shuvs
        // ========================================================================
        
        // Track flips (Z-axis rotation - 360° rotations)
        const currentRotationZ = state.sceneObjects.boardMesh.rotation.z
        flipTracker.update(currentRotationZ)
        
        // Clear snap tracking when snap completes (rotation already tracked frame-by-frame)
        if (state.snap.snapTargetZ === null && state.snap.snapStartRotationZ !== null) {
            state.snap.snapStartRotationZ = null
            state.snap.previousSnapRotationZ = null
            state.snap.snapRotationAccumulator = 0
        }
        
        // Update flip count from tracker (validate it's an integer)
        const flipCount = flipTracker.getCount()
        state.trickStats.flips = Number.isInteger(flipCount) ? flipCount : Math.round(flipCount)
        
        // Track body 180s (camera rotation - 180° rotations)
        // This runs independently of flips and shuvs
        // Use velocity direction for more accurate tracking when moving
        let currentCameraAngle
        if (Math.abs(state.boardVelocity.x) > 0.001 || Math.abs(state.boardVelocity.z) > 0.001) {
            // Use velocity direction for more accurate body rotation tracking
            currentCameraAngle = Math.atan2(state.boardVelocity.x, state.boardVelocity.z)
        } else {
            // Fallback to camera position relative to board
            const dx = state.sceneObjects.camera.position.x - state.boardTransform.position.x
            const dz = state.sceneObjects.camera.position.z - state.boardTransform.position.z
            currentCameraAngle = Math.atan2(dx, dz)
        }
        
        // Smooth camera angle to reduce noise
        smoothedCameraAngle = smoothedCameraAngle + (currentCameraAngle - smoothedCameraAngle) * CAMERA_ANGLE_SMOOTHING
        
        // Normalize smoothed angle
        const normalizedSmoothed = normalizeAngle(smoothedCameraAngle)
        body180Tracker.update(normalizedSmoothed)
        
        // Update body 180 count from tracker (validate it's an integer)
        const body180Count = body180Tracker.getCount()
        state.trickStats.body180s = Number.isInteger(body180Count) ? body180Count : Math.round(body180Count)
        
        // Track shuvs (Y-axis rotation during right-click - 180° rotations)
        if (state.input.isRightMouseHeld && state.sceneObjects.boardMesh) {
            const currentBoardY = state.sceneObjects.boardMesh.rotation.y
            
            // Start tracking if not already active
            if (!shuvTracker.isActive) {
                shuvTracker.start(currentBoardY)
            }
            
            // Update shuv tracker
            shuvTracker.update(currentBoardY)
            
            // Update shuv count from tracker (validate it's an integer)
            const shuvCount = shuvTracker.getCount()
            state.trickStats.shuvs = Number.isInteger(shuvCount) ? shuvCount : Math.round(shuvCount)
        } else {
            // Handle snap completion for shuvs when right-click is released
            if (state.snap.shuvSnapStartRotationY !== null) {
                if (shuvTracker.isActive) {
                    // Get snap rotation (should be set by alignBoardToCamera)
                    let snapRotation = state.snap.shuvSnapRotationAccumulator
                    
                    // If snap rotation is not set or is invalid, calculate it from start to current
                    if (!isFinite(snapRotation) || Math.abs(snapRotation) < 0.001) {
                        const currentBoardY = state.sceneObjects.boardMesh.rotation.y
                        snapRotation = shortestAngleDiff(state.snap.shuvSnapStartRotationY, currentBoardY)
                    }
                    
                    // Apply snap if significant (instant snap, not tracked frame-by-frame)
                    if (Math.abs(snapRotation) > 0.001) {
                        shuvTracker.applySnap(snapRotation)
                    }
                }
                
                // Clear snap tracking after processing
                state.snap.shuvSnapStartRotationY = null
                state.snap.shuvSnapRotationAccumulator = 0
            }
            
            // Update shuv count from tracker (if tracker was active, validate it's an integer)
            if (shuvTracker.isActive) {
                const shuvCount = shuvTracker.getCount()
                state.trickStats.shuvs = Number.isInteger(shuvCount) ? shuvCount : Math.round(shuvCount)
            }
        }
    }
    
    updateTrickDisplay()
}

export function resetTrickStats() {
    // Reset all trackers
    flipTracker.reset()
    body180Tracker.reset()
    shuvTracker.reset()
    
    // Reset trick stats
    state.trickStats.flips = 0
    state.trickStats.body180s = 0
    state.trickStats.shuvs = 0
    state.trickStats.wasFakie = false
    
    // Note: Don't reset combo here - combo persists across multiple tricks
    // Combo is reset on fail or when explicitly called
    
    updateTrickDisplay()
}

function updateTrickDisplay() {
    if (!state.ui.trickDisplayElement) return
    
    state.ui.trickDisplayElement.innerHTML = `
        <div style="margin-bottom: 8px; font-weight: bold;">TRICK STATS</div>
        <div>Flips: ${state.trickStats.flips}</div>
        <div>Body 180s: ${state.trickStats.body180s}</div>
        <div>Shuvs: ${state.trickStats.shuvs}</div>
    `
}

export function detectAndDisplayTrick() {
    // Use current trick stats
    detectAndDisplayTrickWithStats(state.trickStats)
}

/**
 * Gets the current trick stats directly from all active trackers
 * This ensures we have the most up-to-date counts, especially for combined tricks
 * Validates and rounds values to ensure integer counts
 * @returns {Object} Current trick stats {flips, body180s, shuvs, wasFakie}
 */
export function getCurrentTrickStats() {
    const flips = flipTracker.isActive ? flipTracker.getCount() : 0
    const body180s = body180Tracker.isActive ? body180Tracker.getCount() : 0
    const shuvs = shuvTracker.isActive ? shuvTracker.getCount() : 0
    
    return {
        flips: Number.isInteger(flips) ? flips : Math.round(flips),
        body180s: Number.isInteger(body180s) ? body180s : Math.round(body180s),
        shuvs: Number.isInteger(shuvs) ? shuvs : Math.round(shuvs),
        wasFakie: state.trickStats.wasFakie
    }
}

/**
 * Detects trick name from stats (shared logic for both display and combo)
 * Validates stats before matching to prevent false positives
 * @param {Object} stats - Trick stats {flips, body180s, shuvs, wasFakie}
 * @returns {string|null} Trick display name or null if no match
 */
function detectTrickNameFromStats(stats) {
    if (!state.ui.tricksData) return null
    
    // Validate and normalize stats (ensure integers, clamp to reasonable values)
    const flips = Math.max(-10, Math.min(10, Math.round(stats.flips || 0)))
    const body180s = Math.max(-10, Math.min(10, Math.round(stats.body180s || 0)))
    const shuvs = Math.max(-10, Math.min(10, Math.round(stats.shuvs || 0)))
    
    // Only detect tricks if there's meaningful rotation
    // This prevents false positives from noise
    if (flips === 0 && body180s === 0 && shuvs === 0) {
        return null
    }
    
    const currentStats = [flips, body180s, shuvs]
    
    // Sort tricks by specificity (more specific tricks first)
    const trickEntries = Object.entries(state.ui.tricksData)
    trickEntries.sort((a, b) => {
        const aValues = a[1].slice(0, 3)
        const bValues = b[1].slice(0, 3)
        const aSpecificity = aValues.filter(v => v !== 0).length
        const bSpecificity = bValues.filter(v => v !== 0).length
        return bSpecificity - aSpecificity
    })
    
    // Find matching trick
    for (const [trickName, trickValues] of trickEntries) {
        const trickStats = trickValues.slice(0, 3)
        if (trickStats[0] === currentStats[0] &&
            trickStats[1] === currentStats[1] &&
            trickStats[2] === currentStats[2]) {
            let displayName = trickName.replace(/_/g, ' ')
            if (stats.wasFakie) {
                displayName = 'Fakie ' + displayName
            }
            return displayName
        }
    }
    
    return null
}

export function detectAndDisplayTrickWithStats(stats) {
    if (!state.ui.trickNameDisplayElement) return
    
    const trickName = detectTrickNameFromStats(stats)
    
    if (trickName) {
        // Add to combo and update display only if feedback is enabled
        if (SHOW_TRICK_NAME_FEEDBACK) {
            // Add to combo FIRST (ensures combo is updated before any reset)
            addTrickToCombo(trickName)
            
            // Force display update to ensure combo is visible
            updateComboDisplay()
            
            // Show trick name feedback
            // Only show white trick name text if there's no combo active
            // (combo display already shows the trick name)
            if (!state.trickCombo.isActive || state.trickCombo.tricks.length <= 1) {
                state.ui.trickNameDisplayElement.textContent = trickName
                state.ui.trickNameDisplayElement.style.opacity = '1'
                
                // Hide after 3 seconds
                setTimeout(() => {
                    if (state.ui.trickNameDisplayElement) {
                        state.ui.trickNameDisplayElement.style.opacity = '0'
                    }
                }, 3000)
            } else {
                // Hide white text when combo is active
                state.ui.trickNameDisplayElement.textContent = ''
                state.ui.trickNameDisplayElement.style.opacity = '0'
            }
        } else {
            // Trick name feedback disabled - hide both trick name and combo
            state.ui.trickNameDisplayElement.textContent = ''
            state.ui.trickNameDisplayElement.style.opacity = '0'
            // Don't add to combo or update combo display when feedback is disabled
        }
    } else {
        // No trick detected
        state.ui.trickNameDisplayElement.textContent = ''
        state.ui.trickNameDisplayElement.style.opacity = '0'
    }
}

// ============================================================================
// COMBO SYSTEM
// ============================================================================

/**
 * Ensures combo is active (initializes if needed, preserves existing combo)
 */
function ensureComboActive() {
    if (!state.trickCombo.isActive) {
        state.trickCombo.isActive = true
        state.trickCombo.tricks = []
    }
}

/**
 * Adds an item to the combo sequence (trick or grind)
 * @param {string} item - The item to add (trick name or "Grind")
 */
function addItemToCombo(item) {
    ensureComboActive()
    
    // Avoid duplicates - don't add if it's the same as the last item
    const lastItem = state.trickCombo.tricks[state.trickCombo.tricks.length - 1]
    if (lastItem !== item) {
        state.trickCombo.tricks.push(item)
        updateComboDisplay()
        
        // Debug logging
        if (import.meta.env.DEV) {
            console.log(`Combo: ${state.trickCombo.tricks.join(' -> ')}`)
        }
    }
}

/**
 * Adds a trick to the combo sequence
 * @param {string} trickName - The name of the trick to add
 */
function addTrickToCombo(trickName) {
    // Only add to combo if feedback is enabled
    if (SHOW_TRICK_NAME_FEEDBACK) {
        addItemToCombo(trickName)
    }
}

/**
 * Handles entering a grind: detects trick before grind, adds both to combo, resets tracking
 */
export function addGrindToCombo() {
    // Only add to combo if feedback is enabled
    if (!SHOW_TRICK_NAME_FEEDBACK) return
    
    // Detect and add trick performed before entering grind
    const currentStats = getCurrentTrickStats()
    const trickName = detectTrickNameFromStats(currentStats)
    
    if (trickName) {
        addItemToCombo(trickName)
    }
    
    // Add grind to combo
    addItemToCombo('Grind')
    
    // Reset tracking for tricks after leaving grind
    resetTrickStats()
    restartTrackers()
}

/**
 * Restarts all trackers (used when entering grind while still airborne)
 */
function restartTrackers() {
    if (!state.sceneObjects.boardMesh || state.physics.isOnFloor) return
    
    flipTracker.start(state.sceneObjects.boardMesh.rotation.z)
    
    const dx = state.sceneObjects.camera.position.x - state.boardTransform.position.x
    const dz = state.sceneObjects.camera.position.z - state.boardTransform.position.z
    const cameraAngle = Math.atan2(dx, dz)
    body180Tracker.start(cameraAngle)
    
    shuvTracker.reset()
}

/**
 * Gets color based on combo length (visual feedback)
 * @param {number} length - Current combo length
 * @returns {string} Color hex code
 */
function getComboColor(length) {
    if (length >= 5) return '#ff0000'  // Bright red for long combos
    if (length >= 3) return '#cc0000'   // Darker red for medium combos
    return '#990000'  // Dark red for short combos
}

/**
 * Updates the combo display element with animations and styling
 */
function updateComboDisplay() {
    if (!state.ui.trickComboDisplayElement) return
    
    // Hide combo display if feedback is disabled
    if (!SHOW_TRICK_NAME_FEEDBACK) {
        state.ui.trickComboDisplayElement.textContent = ''
        state.ui.trickComboDisplayElement.style.opacity = '0'
        return
    }
    
    if (state.trickCombo.tricks.length > 0) {
        const comboString = state.trickCombo.tricks.join(' → ')
        const comboLength = state.trickCombo.tricks.length
        
        // Update combo text
        state.ui.trickComboDisplayElement.textContent = comboString
        state.ui.trickComboDisplayElement.style.opacity = '1'
        state.ui.trickComboDisplayElement.style.color = getComboColor(comboLength)
        
        // Scale animation on update
        state.ui.trickComboDisplayElement.style.transform = 'translateX(-50%) scale(1.1)'
        setTimeout(() => {
            if (state.ui.trickComboDisplayElement) {
                state.ui.trickComboDisplayElement.style.transform = 'translateX(-50%) scale(1)'
            }
        }, COMBO_ANIMATION_DURATION)
    } else {
        state.ui.trickComboDisplayElement.textContent = ''
        state.ui.trickComboDisplayElement.style.opacity = '0'
    }
}

/**
 * Resets the trick combo (called on landing or fail)
 * @param {boolean} immediate - If true, reset immediately. If false, delay reset to show full combo
 */
export function resetTrickCombo(immediate = false) {
    // Clear any pending reset timeout
    if (state.trickCombo.resetTimeout) {
        clearTimeout(state.trickCombo.resetTimeout)
        state.trickCombo.resetTimeout = null
    }
    
    // Always reset combo state, but only update display if feedback is enabled
    if (immediate) {
        // Reset immediately (for fail cases)
        state.trickCombo.tricks = []
        state.trickCombo.isActive = false
        if (SHOW_TRICK_NAME_FEEDBACK) {
            updateComboDisplay()
        }
    } else {
        // Delay reset so full combo is visible before clearing
        state.trickCombo.resetTimeout = setTimeout(() => {
            if (import.meta.env.DEV && state.trickCombo.tricks.length > 0) {
                console.log(`Combo ended: ${state.trickCombo.tricks.join(' → ')}`)
            }
            state.trickCombo.tricks = []
            state.trickCombo.isActive = false
            if (SHOW_TRICK_NAME_FEEDBACK) {
                updateComboDisplay()
            }
            state.trickCombo.resetTimeout = null
        }, COMBO_DISPLAY_DURATION)
    }
}

/**
 * Gets current combo stats (for external use)
 * @returns {Object} Combo stats
 */
export function getComboStats() {
    return {
        tricks: [...state.trickCombo.tricks],
        length: state.trickCombo.tricks.length
    }
}

export function triggerFailEffect() {
    // Clear any existing timeout
    if (state.audio.redFlashTimeout) {
        clearTimeout(state.audio.redFlashTimeout)
    }
    
    // Reset combo on fail (immediately)
    resetTrickCombo(true)  // true = immediate reset
    
    // Change all materials to red
    if (state.audio.originalMaterials && state.audio.originalMaterials.length > 0) {
        state.audio.originalMaterials.forEach(({ mesh, material }) => {
            if (material && material.color) {
                material.color.set(0xff0000)  // Red color
            }
        })
    }
    
    // Play fail sound
    if (state.audio.failAudio) {
        state.audio.failAudio.currentTime = 0  // Reset to start
        state.audio.failAudio.play().catch(err => {
            // Ignore AbortError and NotAllowedError (expected in some cases)
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
                console.error('Error playing fail sound:', err)
            }
        })
    }
    
    // Restore original colors after 0.5 seconds
    state.audio.redFlashTimeout = setTimeout(() => {
        if (state.audio.originalMaterials && state.audio.originalMaterials.length > 0) {
            state.audio.originalMaterials.forEach(({ mesh, originalColor, material }) => {
                if (material && originalColor) {
                    material.color.copy(originalColor)
                }
            })
        }
        state.audio.redFlashTimeout = null
    }, 500)
}

