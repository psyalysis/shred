import * as state from "./state.js"
import { SFX_VOLUME } from "./constants.js"

// ============================================================================
// TRICK DETECTION
// ============================================================================

export function updateTrickDetection() {
    if (!state.sceneObjects.cubeMesh) return
    
    // Check if we just became airborne
    if (state.physics.previousIsOnFloor && !state.physics.isOnFloor) {
        // Entering air - initialize tracking
        state.tricks.airStartRotationZ = state.sceneObjects.cubeMesh.rotation.z
        state.tricks.previousRotationZ = state.sceneObjects.cubeMesh.rotation.z
        state.tricks.cumulativeRotationZ = 0
        state.tricks.cumulativeRotationZAbs = 0
        state.tricks.rotationDirectionZ = 0
        state.tricks.previousFlipCount = 0
        
        // Calculate initial camera angle
        const dx = state.sceneObjects.camera.position.x - state.cubeTransform.position.x
        const dz = state.sceneObjects.camera.position.z - state.cubeTransform.position.z
        state.tricks.airStartCameraAngle = Math.atan2(dx, dz)
        state.tricks.previousCameraAngle = state.tricks.airStartCameraAngle
        state.tricks.cumulativeCameraRotation = 0
        state.tricks.cumulativeCameraRotationAbs = 0
        state.tricks.cameraRotationDirection = 0
        
        // Camera rotation velocity is already locked from the last frame when on floor
        // (calculated in updatePhysics before handleMouseSteering)
    }
    
    // Only track tricks when airborne
    if (!state.physics.isOnFloor) {
        // Track A/D rotations (full 360-degree rotations on Z axis)
        const currentRotationZ = state.sceneObjects.cubeMesh.rotation.z
        
        // Calculate frame-to-frame rotation change
        let frameRotationDelta = currentRotationZ - state.tricks.previousRotationZ
        
        // Check if we just completed a snap that should count toward flips
        if (state.snap.snapTargetZ === null && state.snap.snapStartRotationZ !== null && state.snap.previousSnapRotationZ !== null) {
            // Snap just completed - improved detection for flip completion
            // Key insight: Snaps >90 degrees snap to the OTHER side (0 vs 180), which can complete a flip
            
            // Calculate rotation before snap started
            const rotationBeforeSnap = state.tricks.cumulativeRotationZ
            
            // Calculate rotation after snap (add snap rotation)
            const snapRotation = state.snap.snapRotationAccumulator
            const rotationAfterSnap = rotationBeforeSnap + snapRotation
            
            // Check if snap magnitude is >90 degrees (snapping to other side)
            const NINETY_DEGREES = Math.PI / 2
            const snapMagnitude = Math.abs(snapRotation)
            const isSnappingToOtherSide = snapMagnitude > NINETY_DEGREES
            
            // Check if snap crosses a 360-degree boundary
            const rotationsBefore = rotationBeforeSnap / (2 * Math.PI)
            const rotationsAfter = rotationAfterSnap / (2 * Math.PI)
            
            // Calculate completed rotations before and after
            const completedBefore = rotationBeforeSnap > 0 
                ? Math.floor(rotationsBefore) 
                : Math.ceil(rotationsBefore)
            const completedAfter = rotationAfterSnap > 0 
                ? Math.floor(rotationsAfter) 
                : Math.ceil(rotationsAfter)
            
            // If snap crosses a boundary (completes a rotation)
            if (completedAfter !== completedBefore) {
                // Snap completed a rotation - add the snap rotation to cumulative
                state.tricks.cumulativeRotationZ += snapRotation
                state.tricks.cumulativeRotationZAbs += Math.abs(snapRotation)
                
                // Update direction based on snap rotation
                if (snapRotation > 0) {
                    state.tricks.rotationDirectionZ = 1
                } else if (snapRotation < 0) {
                    state.tricks.rotationDirectionZ = -1
                }
            } else if (isSnappingToOtherSide) {
                // Snap is >90 degrees (snapping to other side) - check if it completes a flip
                // Calculate progress toward next rotation before snap
                const progressBefore = Math.abs(rotationBeforeSnap - completedBefore * (2 * Math.PI))
                
                // If we had significant rotation before snap (>270 degrees), snap likely completes it
                const CLOSE_TO_COMPLETE_THRESHOLD = (270 * Math.PI) / 180  // 270 degrees
                if (progressBefore > CLOSE_TO_COMPLETE_THRESHOLD) {
                    // Snap completes the flip
                    const rotationRemaining = (rotationBeforeSnap > 0 ? 1 : -1) * (2 * Math.PI) - 
                                             (rotationBeforeSnap - completedBefore * (2 * Math.PI))
                    
                    // Add remaining rotation to complete the flip
                    state.tricks.cumulativeRotationZ += rotationRemaining
                    state.tricks.cumulativeRotationZAbs += Math.abs(rotationRemaining)
                    
                    // Update direction
                    if (rotationRemaining > 0) {
                        state.tricks.rotationDirectionZ = 1
                    } else if (rotationRemaining < 0) {
                        state.tricks.rotationDirectionZ = -1
                    }
                } else {
                    // Normal snap rotation (doesn't complete flip)
                    state.tricks.cumulativeRotationZ += snapRotation
                    state.tricks.cumulativeRotationZAbs += Math.abs(snapRotation)
                }
            } else {
                // Snap didn't cross boundary and is <=90 degrees
                // Calculate progress toward next rotation
                const progressBefore = Math.abs(rotationBeforeSnap - completedBefore * (2 * Math.PI))
                const progressAfter = Math.abs(rotationAfterSnap - completedAfter * (2 * Math.PI))
                
                // If we were close (> 300 degrees) and snap moves us closer or completes it
                const CLOSE_THRESHOLD = (300 * Math.PI) / 180  // 300 degrees
                if (progressBefore > CLOSE_THRESHOLD && progressAfter < progressBefore) {
                    // Snap helped complete the rotation
                    const rotationRemaining = (rotationBeforeSnap > 0 ? 1 : -1) * (2 * Math.PI) - 
                                             (rotationBeforeSnap - completedBefore * (2 * Math.PI))
                    
                    // Add remaining rotation to complete the flip
                    state.tricks.cumulativeRotationZ += rotationRemaining
                    state.tricks.cumulativeRotationZAbs += Math.abs(rotationRemaining)
                    
                    // Update direction
                    if (rotationRemaining > 0) {
                        state.tricks.rotationDirectionZ = 1
                    } else if (rotationRemaining < 0) {
                        state.tricks.rotationDirectionZ = -1
                    }
                } else {
                    // Normal snap rotation (doesn't complete flip)
                    state.tricks.cumulativeRotationZ += snapRotation
                    state.tricks.cumulativeRotationZAbs += Math.abs(snapRotation)
                }
            }
            
            // Clear snap tracking
            state.snap.snapStartRotationZ = null
            state.snap.previousSnapRotationZ = null
            state.snap.snapRotationAccumulator = 0
        }
        
        // Normal frame delta tracking
        // Normalize delta to handle wrapping (-π to π range)
        while (frameRotationDelta > Math.PI) frameRotationDelta -= 2 * Math.PI
        while (frameRotationDelta < -Math.PI) frameRotationDelta += 2 * Math.PI
        
        // Add signed change to cumulative rotation (preserves direction)
        state.tricks.cumulativeRotationZ += frameRotationDelta
        
        // Track absolute rotation and direction
        if (Math.abs(frameRotationDelta) > 0.001) {
            // Update direction based on current rotation
            if (frameRotationDelta > 0) {
                state.tricks.rotationDirectionZ = 1
            } else if (frameRotationDelta < 0) {
                state.tricks.rotationDirectionZ = -1
            }
            state.tricks.cumulativeRotationZAbs += Math.abs(frameRotationDelta)
        }
        
        // Improved flip counting: use signed cumulative rotation for accurate tracking
        // Calculate rotations based on actual cumulative rotation (signed)
        const rotationsCompleted = state.tricks.cumulativeRotationZ / (2 * Math.PI)
        
        // Count flips more accurately:
        // - For positive rotation: round down (Math.floor) to count only completed rotations
        // - For negative rotation: round up (Math.ceil) to count only completed rotations
        // - This ensures we count flips as we cross 2π boundaries
        let currentFlipCount
        if (Math.abs(state.tricks.cumulativeRotationZ) < 0.01) {
            // No significant rotation
            currentFlipCount = 0
        } else if (state.tricks.cumulativeRotationZ > 0) {
            // Positive rotation: count completed full rotations
            currentFlipCount = Math.floor(rotationsCompleted)
        } else {
            // Negative rotation: count completed full rotations (negative)
            currentFlipCount = Math.ceil(rotationsCompleted)
        }
        
        // Update flip count
        state.trickStats.flips = currentFlipCount
        state.tricks.previousFlipCount = currentFlipCount
        
        // Update previous rotation for next frame
        state.tricks.previousRotationZ = currentRotationZ
        
        // Track camera 180s
        const dx = state.sceneObjects.camera.position.x - state.cubeTransform.position.x
        const dz = state.sceneObjects.camera.position.z - state.cubeTransform.position.z
        const currentCameraAngle = Math.atan2(dx, dz)
        
        // Calculate camera angle change
        let cameraDelta = currentCameraAngle - state.tricks.previousCameraAngle
        while (cameraDelta > Math.PI) cameraDelta -= 2 * Math.PI
        while (cameraDelta < -Math.PI) cameraDelta += 2 * Math.PI
        
        // Track cumulative camera rotation with sign
        if (Math.abs(cameraDelta) > 0.01) {  // Small threshold to avoid noise
            state.tricks.cumulativeCameraRotation += cameraDelta  // Preserve sign
            
            // Track absolute rotation and direction
            if (cameraDelta > 0) {
                state.tricks.cameraRotationDirection = 1
            } else if (cameraDelta < 0) {
                state.tricks.cameraRotationDirection = -1
            }
            state.tricks.cumulativeCameraRotationAbs += Math.abs(cameraDelta)
            
            // Count body 180s with lenience (140 degrees = 7π/9 radians)
            const body180Threshold = (140 * Math.PI) / 180  // 140 degrees in radians
            const body180Count = Math.floor(state.tricks.cumulativeCameraRotationAbs / body180Threshold)
            state.trickStats.body180s = state.tricks.cameraRotationDirection >= 0 ? body180Count : -body180Count
        }
        
        state.tricks.previousCameraAngle = currentCameraAngle
        
        // Track board rotation while right-click is held in air
        if (state.input.isRightMouseHeld && state.sceneObjects.cubeMesh) {
            const currentBoardY = state.sceneObjects.cubeMesh.rotation.y
            
            // Initialize previous rotation on first frame of right-click
            if (state.tricks.cumulativeBoardRotationRightClick === 0) {
                state.tricks.previousBoardYRightClick = state.tricks.boardRotationOnRightClickStart
            }
            
            // Calculate frame-to-frame rotation change
            let frameBoardDelta = currentBoardY - state.tricks.previousBoardYRightClick
            
            // Normalize delta to handle wrapping
            while (frameBoardDelta > Math.PI) frameBoardDelta -= 2 * Math.PI
            while (frameBoardDelta < -Math.PI) frameBoardDelta += 2 * Math.PI
            
            // Track cumulative rotation and direction (signed for better snap detection)
            if (Math.abs(frameBoardDelta) > 0.001) {
                if (frameBoardDelta > 0) {
                    state.tricks.boardRotationDirectionRightClick = 1
                } else if (frameBoardDelta < 0) {
                    state.tricks.boardRotationDirectionRightClick = -1
                }
                // Store signed cumulative rotation for better snap completion detection
                state.tricks.cumulativeBoardRotationRightClick += frameBoardDelta
            }
            
            state.tricks.previousBoardYRightClick = currentBoardY
        }
    }
    
    updateTrickDisplay()
}

export function resetTrickStats() {
    state.trickStats.flips = 0
    state.trickStats.body180s = 0
    state.trickStats.shuvs = 0
    state.trickStats.wasFakie = false
    state.tricks.cumulativeRotationZ = 0
    state.tricks.cumulativeRotationZAbs = 0
    state.tricks.rotationDirectionZ = 0
    state.tricks.previousFlipCount = 0
    state.tricks.cumulativeCameraRotation = 0
    state.tricks.cumulativeCameraRotationAbs = 0
    state.tricks.cameraRotationDirection = 0
    state.snap.snapRotationAccumulator = 0
    state.snap.shuvSnapStartRotationY = null
    state.snap.shuvSnapRotationAccumulator = 0
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

export function detectAndDisplayTrickWithStats(stats) {
    if (!state.ui.tricksData || !state.ui.trickNameDisplayElement) return
    
    // Use SIGNED values (direction matters!)
    const currentStats = [
        stats.flips,      // Keep sign: positive = forward, negative = backward
        stats.body180s,  // Keep sign: positive = frontside, negative = backside
        stats.shuvs      // Keep sign: positive = frontside shuv, negative = backside shuv
    ]
    
    // Priority-based matching: more specific tricks first
    const trickEntries = Object.entries(state.ui.tricksData)
    
    // Sort by specificity (tricks with more non-zero values first)
    trickEntries.sort((a, b) => {
        // Handle both old format (3 elements) and new format (4 elements)
        const aValues = a[1].slice(0, 3)
        const bValues = b[1].slice(0, 3)
        const aSpecificity = aValues.filter(v => v !== 0).length
        const bSpecificity = bValues.filter(v => v !== 0).length
        return bSpecificity - aSpecificity
    })
    
    // Find matching trick (exact match with signs, ignoring fakie flag in tricks.json)
    let matchedTrick = null
    for (const [trickName, trickValues] of trickEntries) {
        // Get first 3 values (ignore fakie flag if present)
        const trickStats = trickValues.slice(0, 3)
        
        if (trickStats[0] === currentStats[0] &&
            trickStats[1] === currentStats[1] &&
            trickStats[2] === currentStats[2]) {
            matchedTrick = trickName
            break
        }
    }
    
    // Display trick name or "No Trick" if no match
    if (matchedTrick) {
        // Prepend "Fakie " if wasFakie is true
        let displayName = matchedTrick.replace(/_/g, ' ')
        if (stats.wasFakie) {
            displayName = 'Fakie ' + displayName
        }
        
        state.ui.trickNameDisplayElement.textContent = displayName
        state.ui.trickNameDisplayElement.style.opacity = '1'
        
        // Hide after 3 seconds
        setTimeout(() => {
            if (state.ui.trickNameDisplayElement) {
                state.ui.trickNameDisplayElement.style.opacity = '0'
            }
        }, 3000)
    } else {
        // Show "No Trick" or nothing if no match found
        state.ui.trickNameDisplayElement.textContent = ''
        state.ui.trickNameDisplayElement.style.opacity = '0'
    }
}

export function triggerFailEffect() {
    // Clear any existing timeout
    if (state.audio.redFlashTimeout) {
        clearTimeout(state.audio.redFlashTimeout)
    }
    
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
            console.error('Error playing fail sound:', err)
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

