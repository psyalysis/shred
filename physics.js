import * as THREE from "three"
import * as state from "./state.js"
import {
    GRAVITY, JUMP_IMPULSE, ROTATION_SPEED, ALIGNMENT_TORQUE, ALIGNMENT_DAMPING,
    ALIGNMENT_SNAP_THRESHOLD, FLOOR_Y, CUBE_HALF_HEIGHT, FORWARD_SPEED, FRICTION,
    MIN_VELOCITY, MOUSE_STEERING_SENSITIVITY, RIGHT_CLICK_ROTATION_SENSITIVITY,
    MOUSE_SMOOTHING, AIR_TURNING_RESISTANCE, SNAP_SPEED, SFX_VOLUME
} from "./constants.js"
import { updateWindSound, playRandomCatchSound } from "./sound.js"
import { updateCameraFollow } from "./camera.js"
import { updateTrickDetection, detectAndDisplayTrickWithStats, resetTrickStats, triggerFailEffect } from "./tricks.js"

// ============================================================================
// PHYSICS
// ============================================================================

// Calculate distance from point to closest point on rail mesh bounding box
function getDistanceToRail(boardPos) {
    if (!state.sceneObjects.railMesh) return Infinity
    
    // Get bounding box of rail mesh (accounts for scale, rotation, position)
    const box = new THREE.Box3().setFromObject(state.sceneObjects.railMesh)
    
    // Clamp board position to bounding box to get closest point
    const closestPoint = new THREE.Vector3()
    closestPoint.x = Math.max(box.min.x, Math.min(boardPos.x, box.max.x))
    closestPoint.y = Math.max(box.min.y, Math.min(boardPos.y, box.max.y))
    closestPoint.z = Math.max(box.min.z, Math.min(boardPos.z, box.max.z))
    
    // Calculate distance from board to closest point
    return boardPos.distanceTo(closestPoint)
}

export function updatePhysics() {
    handleRotation()
    handleForwardMovement()
    handleMouseSteering()
    
    // Apply air resistance to turning velocity when airborne
    if (!state.physics.isOnFloor) {
        state.input.airborneCameraRotationVelocity *= AIR_TURNING_RESISTANCE
    }
    
    handleGravity()
    handleGrinding()
    handleMovement()
    handleMomentum()
    handleCollision()
    handleRotationInput()
    handleSmoothSnapping()
    updateCubeTransform()
    
    // Update camera if in attached mode - must be in physics loop to move with cube
    if (state.sceneObjects.controls && !state.sceneObjects.controls.enabled) {
        updateCameraFollow()
    }
    
    // Update trick detection
    updateTrickDetection()
    
    // Update rail glow effect
    updateRailGlow()
}

function handleRotation() {
    if (!state.sceneObjects.cubeMesh) return
    state.sceneObjects.cubeMesh.rotation.x = 0
    state.sceneObjects.cubeMesh.rotation.z += state.angularVelocity.z
}

function handleGravity() {
    // Don't apply gravity when grinding
    if (!state.physics.isGrinding) {
        state.cubeVelocity.y += GRAVITY
    }
}

function handleGrinding() {
    if (!state.sceneObjects.railMesh || !state.sceneObjects.cubeMesh) {
        return
    }
    
    // Try to start grinding if not already grinding and conditions are met
    if (!state.physics.isGrinding && state.input.isLeftMouseHeld) {
        startGrinding()
    }
    
    // Continue grinding only if left mouse is held and still grinding
    // Also stop if right-click is held, A/D keys are pressed, or board is upside down
    if (!state.physics.isGrinding || !state.input.isLeftMouseHeld || 
        state.input.isRightMouseHeld || state.keys['KeyA'] || state.keys['KeyD']) {
        if (state.physics.isGrinding) {
            stopGrinding()
        }
        return
    }
    
    // Stop grinding if board flips upside down
    if (state.sceneObjects.cubeMesh) {
        let normalizedZ = state.sceneObjects.cubeMesh.rotation.z
        if (isFinite(normalizedZ)) {
            let attempts = 0
            while (normalizedZ < 0 && attempts < 10) {
                normalizedZ += 2 * Math.PI
                attempts++
            }
            attempts = 0
            while (normalizedZ >= 2 * Math.PI && attempts < 10) {
                normalizedZ -= 2 * Math.PI
                attempts++
            }
        } else {
            normalizedZ = 0
        }
        
        const upsideDownThreshold = 0.5
        let distanceToPi = Math.abs(normalizedZ - Math.PI)
        if (distanceToPi > Math.PI) {
            distanceToPi = 2 * Math.PI - distanceToPi
        }
        const isUpsideDown = distanceToPi < upsideDownThreshold
        if (isUpsideDown) {
            stopGrinding()
            return
        }
    }
    
    // Ensure rail sound is playing while grinding (it should loop automatically)
    if (state.audio.railSound && state.audio.railSound.paused) {
        // Don't reset currentTime - let it continue from where it was
        state.audio.railSound.play().catch(err => {
            // Ignore AbortError - it's expected when sound is interrupted
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
                console.error('Error playing rail sound:', err)
            }
        })
    }
    
    // Rail is rotated 45 degrees (Math.PI / 4) around Y axis
    const railAngle = Math.PI / 4
    const railDirX = Math.sin(railAngle)
    const railDirZ = Math.cos(railAngle)
    
    // Project board momentum onto rail direction
    const momentumDotRail = state.cubeVelocity.x * railDirX + state.cubeVelocity.z * railDirZ
    
    // Determine grind direction based on momentum
    if (Math.abs(momentumDotRail) > 0.001) {
        state.physics.railGrindDirection = momentumDotRail > 0 ? 1 : -1
    }
    
    // Move along rail at constant speed (preserve momentum magnitude)
    const grindSpeed = Math.max(Math.abs(momentumDotRail), FORWARD_SPEED * 1.2)
    state.cubeVelocity.x = railDirX * grindSpeed * state.physics.railGrindDirection
    state.cubeVelocity.z = railDirZ * grindSpeed * state.physics.railGrindDirection
    
    // Keep board on rail height and snap position to rail
    const railPos = state.sceneObjects.railMesh.position
    const boardPos = state.sceneObjects.cubeMesh.position
    
    // Project current position onto rail
    const toRailX = boardPos.x - railPos.x
    const toRailZ = boardPos.z - railPos.z
    const projection = toRailX * railDirX + toRailZ * railDirZ
    
    // Snap position to rail
    state.sceneObjects.cubeMesh.position.x = railPos.x + railDirX * projection
    state.sceneObjects.cubeMesh.position.z = railPos.z + railDirZ * projection
    state.sceneObjects.cubeMesh.position.y = railPos.y + CUBE_HALF_HEIGHT
    
    // Check distance to rail - automatically exit if too far
    const distance = getDistanceToRail(boardPos)
    if (distance > 0.6) {
        stopGrinding()
        return
    }
    
    // Stop grinding if we land (distance check happens in collision detection)
    if (state.physics.isOnFloor) {
        stopGrinding()
    }
}

export function stopGrinding() {
    if (state.physics.isGrinding) {
        state.physics.isGrinding = false
        state.physics.railGrindDirection = 0
        
        // Stop rail sound
        if (state.audio.railSound) {
            state.audio.railSound.pause()
            state.audio.railSound.currentTime = 0
        }
    }
}

function handleMovement() {
    if (!state.sceneObjects.cubeMesh) return
    state.sceneObjects.cubeMesh.position.y += state.cubeVelocity.y
    state.sceneObjects.cubeMesh.position.z += state.cubeVelocity.z
    state.sceneObjects.cubeMesh.position.x += state.cubeVelocity.x
}

function handleForwardMovement() {
    if (!state.sceneObjects.cubeMesh) return
    // Don't allow forward movement when grinding
    if (state.physics.isGrinding) {
        return
    }
    // Only allow movement when on floor
    if (state.physics.isOnFloor) {
        const forwardX = Math.sin(state.sceneObjects.cubeMesh.rotation.y)
        const forwardZ = Math.cos(state.sceneObjects.cubeMesh.rotation.y)
        
        if (state.keys['KeyW']) {
            // Instantly set forward velocity in the direction the cube is facing
            state.cubeVelocity.x = forwardX * FORWARD_SPEED
            state.cubeVelocity.z = forwardZ * FORWARD_SPEED
        } else if (state.keys['KeyS']) {
            // Instantly set backward velocity (opposite direction)
            state.cubeVelocity.x = -forwardX * FORWARD_SPEED
            state.cubeVelocity.z = -forwardZ * FORWARD_SPEED
        } else {
            // Apply minimal friction when not pressing W or S
            state.cubeVelocity.x *= FRICTION
            state.cubeVelocity.z *= FRICTION
            
            // Stop very small velocities
            const speed = Math.sqrt(state.cubeVelocity.x ** 2 + state.cubeVelocity.z ** 2)
            if (speed < MIN_VELOCITY) {
                state.cubeVelocity.x = 0
                state.cubeVelocity.z = 0
            }
        }
    }
    // In air: momentum is preserved (handled in handleMomentum)
}

function handleMouseSteering() {
    if (!state.sceneObjects.cubeMesh) return
    // Only allow steering when in attached mode (orbit controls disabled)
    if (!state.sceneObjects.controls.enabled && state.input.isPointerLocked) {
        if (state.physics.isOnFloor) {
            // On floor: allow mouse input to control camera rotation (no smoothing)
            if (Math.abs(state.input.mouseDeltaX) > 0.001) {
                // Capture mouse speed before resetting
                state.input.currentMouseSpeed = Math.abs(state.input.mouseDeltaX)
                
                // Calculate and store rotation velocity from raw mouse delta
                // This will be locked when entering air
                state.input.airborneCameraRotationVelocity = -state.input.mouseDeltaX * MOUSE_STEERING_SENSITIVITY
                
                // Rotate cube's Y rotation (yaw) based on raw mouse movement
                state.sceneObjects.cubeMesh.rotation.y += state.input.airborneCameraRotationVelocity
            } else {
                // No mouse movement - zero velocity
                state.input.airborneCameraRotationVelocity = 0
            }
            
            // Reset raw mouse delta after processing
            state.input.mouseDeltaX = 0
        } else {
            // In air: apply locked camera rotation velocity (ignore mouse input)
            // Cannot right-click while grinding
            if (state.input.isRightMouseHeld && !state.physics.isGrinding) {
                // When right-clicking: board rotates independently from mouse input
                // Apply exponential smoothing to mouse delta for board rotation
                state.input.smoothedMouseDeltaX = state.input.smoothedMouseDeltaX * (1 - MOUSE_SMOOTHING) + state.input.mouseDeltaX * MOUSE_SMOOTHING
                
                // Board rotation is additive to camera rotation velocity
                // This makes board rotation feel consistent regardless of camera rotation speed
                state.sceneObjects.cubeMesh.rotation.y += state.input.airborneCameraRotationVelocity
                
                if (Math.abs(state.input.smoothedMouseDeltaX) > 0.001) {
                    // Rotate board independently based on mouse movement (additive to camera rotation)
                    state.sceneObjects.cubeMesh.rotation.y -= state.input.smoothedMouseDeltaX * RIGHT_CLICK_ROTATION_SENSITIVITY
                    
                    // Decay smoothed delta
                    state.input.smoothedMouseDeltaX *= 0.9
                } else {
                    state.input.smoothedMouseDeltaX = 0
                }
                
                // Reset raw mouse delta after processing
                state.input.mouseDeltaX = 0
            } else {
                // Not right-clicking: apply camera rotation velocity to board
                // Cannot right-click while grinding
                if (!state.physics.isGrinding) {
                    state.sceneObjects.cubeMesh.rotation.y += state.input.airborneCameraRotationVelocity
                }
                
                // Decay speed when in air (no mouse input)
                state.input.currentMouseSpeed *= 0.9
                state.input.smoothedMouseDeltaX = 0
                state.input.mouseDeltaX = 0  // Ignore mouse input in air
            }
        }
    } else {
        // Decay speed when not moving
        state.input.currentMouseSpeed *= 0.9
        state.input.smoothedMouseDeltaX = 0
        // Reset velocity when not in attached mode
        if (!state.physics.isOnFloor) {
            state.input.airborneCameraRotationVelocity = 0
        }
    }
    
    // Update wind sound
    updateWindSound(state.input.currentMouseSpeed, state.physics.isOnFloor, SFX_VOLUME)
}

function handleMomentum() {
    // In air: horizontal momentum is preserved (no friction)
    // Friction is already applied in handleForwardMovement when on floor
}

function handleCollision() {
    if (!state.sceneObjects.cubeMesh) return
    
    // Improved collision detection with better ground checking
    const cubeBottom = state.sceneObjects.cubeMesh.position.y - CUBE_HALF_HEIGHT
    state.physics.previousIsOnFloor = state.physics.isOnFloor
    state.physics.isOnFloor = false
    
    // Check if cube is intersecting or below floor
    if (cubeBottom <= FLOOR_Y) {
        // Calculate penetration depth for more accurate collision response
        const penetration = FLOOR_Y - cubeBottom
        
        // Push cube up by penetration amount
        state.sceneObjects.cubeMesh.position.y += penetration
        
        // Stop vertical velocity on landing (preserve horizontal momentum)
        state.cubeVelocity.y = 0
        
        // Set on floor state
        state.physics.isOnFloor = true
        
        // Check if we just landed (was in air, now on floor)
        const justLanded = state.physics.previousIsOnFloor === false
        
        // Detect and display trick when landing (defer to avoid blocking physics)
        if (justLanded && !state.physics.isProcessingLanding) {
            state.physics.isProcessingLanding = true
            
            // Capture final trick stats before any reset
            const finalTrickStats = {
                flips: state.trickStats.flips,
                body180s: state.trickStats.body180s,
                shuvs: state.trickStats.shuvs,
                wasFakie: state.trickStats.wasFakie
            }
            
            // Print trick stats to console
            console.log('Trick Stats on Landing:', finalTrickStats)
            
            // Defer trick detection and display to avoid blocking physics loop
            requestAnimationFrame(() => {
                detectAndDisplayTrickWithStats(finalTrickStats)
                resetTrickStats()
                state.physics.isProcessingLanding = false
            })
            
            // Reset airborne camera rotation velocity
            state.input.airborneCameraRotationVelocity = 0
        }
        
        // Check if board is upside down along z axis (rotation.z near π or -π)
        let normalizedZ = state.sceneObjects.cubeMesh.rotation.z
        // Safety check and limit iterations
        if (isFinite(normalizedZ)) {
            let attempts = 0
            while (normalizedZ < 0 && attempts < 10) {
                normalizedZ += 2 * Math.PI
                attempts++
            }
            attempts = 0
            while (normalizedZ >= 2 * Math.PI && attempts < 10) {
                normalizedZ -= 2 * Math.PI
                attempts++
            }
        } else {
            normalizedZ = 0  // Default to 0 if invalid
        }
        
        // Upside down if rotation is close to π (180 degrees)
        // Calculate shortest angular distance to π
        const upsideDownThreshold = 0.5  // radians tolerance
        let distanceToPi = Math.abs(normalizedZ - Math.PI)
        if (distanceToPi > Math.PI) {
            distanceToPi = 2 * Math.PI - distanceToPi
        }
        const isUpsideDown = distanceToPi < upsideDownThreshold
        
        // If just landed and upside down, trigger fail effect
        if (justLanded && isUpsideDown) {
            triggerFailEffect()
        }
        
        // Play random land sound on landing (only if not upside down)
        if (justLanded && !isUpsideDown && state.audio.landSounds && state.audio.landSounds.length > 0) {
            const randomLand = state.audio.landSounds[Math.floor(Math.random() * state.audio.landSounds.length)]
            randomLand.currentTime = 0  // Reset to start
            randomLand.play().catch(err => {
                console.error('Error playing land sound:', err)
            })
        }
        
        // Automatically reattach camera when landing (even if right click is held)
        // Defer to avoid blocking physics loop
        if (justLanded && state.input.isRightMouseHeld) {
            state.input.isRightMouseHeld = false
            requestAnimationFrame(() => {
                alignBoardToCamera()
            })
        }
        
        // Apply alignment torque to make board level
        applyAlignmentTorque()
    }
}

function applyAlignmentTorque() {
    if (!state.sceneObjects.cubeMesh) return
    const targetRotation = 0
    const rotationDiff = targetRotation - state.sceneObjects.cubeMesh.rotation.z
    
    // Safety check for invalid values
    if (!isFinite(rotationDiff)) return
    
    // Normalize rotation difference to shortest path (with safety limit)
    let normalizedDiff = rotationDiff
    let attempts1 = 0
    while (normalizedDiff > Math.PI && attempts1 < 10) {
        normalizedDiff -= 2 * Math.PI
        attempts1++
    }
    let attempts2 = 0
    while (normalizedDiff < -Math.PI && attempts2 < 10) {
        normalizedDiff += 2 * Math.PI
        attempts2++
    }
    
    // If very close to target, snap directly to avoid oscillation
    if (Math.abs(normalizedDiff) < ALIGNMENT_SNAP_THRESHOLD && Math.abs(state.angularVelocity.z) < 0.01) {
        state.sceneObjects.cubeMesh.rotation.z = 0
        state.angularVelocity.z = 0
        return
    }
    
    // PD Controller: Proportional (position error) + Derivative (velocity damping)
    // Reduce torque as we get closer to target (prevents overshooting)
    const distanceFactor = Math.min(Math.abs(normalizedDiff) / Math.PI, 1.0)
    const proportionalTorque = normalizedDiff * ALIGNMENT_TORQUE * distanceFactor
    
    // Apply stronger damping when on floor to prevent oscillation
    state.angularVelocity.z *= ALIGNMENT_DAMPING
    
    // Add proportional torque
    state.angularVelocity.z += proportionalTorque
    
    // Clamp angular velocity to prevent excessive spinning
    const maxAngularVelocity = 0.5
    if (Math.abs(state.angularVelocity.z) > maxAngularVelocity) {
        state.angularVelocity.z = state.angularVelocity.z > 0 ? maxAngularVelocity : -maxAngularVelocity
    }
}

function handleRotationInput() {
    // Cannot use A/D keys while grinding
    if (state.physics.isGrinding) return
    
    if (!state.physics.isOnFloor) {
        // Check if A or D was just released
        if (state.previousKeys['KeyD'] && !state.keys['KeyD']) {
            playRandomCatchSound(state.audio.catchSounds)
            snapRotationToNearest180()
        } else if (state.previousKeys['KeyA'] && !state.keys['KeyA']) {
            playRandomCatchSound(state.audio.catchSounds)
            snapRotationToNearest180()
        }
        
        if (state.keys['KeyD'] && !state.previousKeys['KeyD']) {
            playRandomCatchSound(state.audio.catchSounds)
        } else if (state.keys['KeyA'] && !state.previousKeys['KeyA']) {
            playRandomCatchSound(state.audio.catchSounds)
        }

        // Handle current key presses (cancel snapping if keys are pressed)
        if (state.keys['KeyD']) {
            state.angularVelocity.z = ROTATION_SPEED
            state.snap.snapTargetZ = null  // Cancel snapping if key is pressed
            state.snap.snapStartRotationZ = null
            state.snap.previousSnapRotationZ = null
        } else if (state.keys['KeyA']) {
            state.angularVelocity.z = -ROTATION_SPEED
            state.snap.snapTargetZ = null  // Cancel snapping if key is pressed
            state.snap.snapStartRotationZ = null
            state.snap.previousSnapRotationZ = null
        } else {
            state.angularVelocity.z = 0
        }
    }
    
    // Update previous keys state
    state.previousKeys['KeyA'] = state.keys['KeyA']
    state.previousKeys['KeyD'] = state.keys['KeyD']
}

function snapRotationToNearest180() {
    if (!state.sceneObjects.cubeMesh) return
    
    // Get current rotation normalized to 0-2π
    let currentRotation = state.sceneObjects.cubeMesh.rotation.z
    
    // Safety check for invalid values
    if (!isFinite(currentRotation)) return
    
    let attempts3 = 0
    while (currentRotation < 0 && attempts3 < 10) {
        currentRotation += 2 * Math.PI
        attempts3++
    }
    let attempts4 = 0
    while (currentRotation >= 2 * Math.PI && attempts4 < 10) {
        currentRotation -= 2 * Math.PI
        attempts4++
    }
    
    // Options are 0 and π (180 degrees)
    const option1 = 0
    const option2 = Math.PI
    
    // Calculate distances to both options (accounting for wrap-around)
    const dist1 = Math.min(
        Math.abs(currentRotation - option1),
        Math.abs(currentRotation - option1 + 2 * Math.PI),
        Math.abs(currentRotation - option1 - 2 * Math.PI)
    )
    const dist2 = Math.min(
        Math.abs(currentRotation - option2),
        Math.abs(currentRotation - option2 + 2 * Math.PI),
        Math.abs(currentRotation - option2 - 2 * Math.PI)
    )
    
    // Set target to whichever is closer (will be smoothly interpolated)
    if (dist1 < dist2) {
        state.snap.snapTargetZ = 0
    } else {
        state.snap.snapTargetZ = Math.PI
    }
    
    // Track rotation when snap starts (for counting snap rotation in flips)
    state.snap.snapStartRotationZ = state.sceneObjects.cubeMesh.rotation.z
    state.snap.previousSnapRotationZ = state.sceneObjects.cubeMesh.rotation.z
    state.snap.snapRotationAccumulator = 0  // Reset snap rotation accumulator
    
    // Stop angular velocity when snapping starts
    state.angularVelocity.z = 0
}

function handleSmoothSnapping() {
    if (!state.sceneObjects.cubeMesh) return
    
    // Smooth snap z-axis rotation (A/D release)
    if (state.snap.snapTargetZ !== null) {
        let currentZ = state.sceneObjects.cubeMesh.rotation.z
        
        // Safety check for invalid values
        if (!isFinite(currentZ)) return
        
        // Normalize to 0-2π (with safety limit)
        let attempts9 = 0
        while (currentZ < 0 && attempts9 < 10) {
            currentZ += 2 * Math.PI
            attempts9++
        }
        let attempts10 = 0
        while (currentZ >= 2 * Math.PI && attempts10 < 10) {
            currentZ -= 2 * Math.PI
            attempts10++
        }
        
        // Calculate shortest path to target
        let diff = state.snap.snapTargetZ - currentZ
        
        // Safety check for diff
        if (!isFinite(diff)) return
        
        let attempts11 = 0
        while (diff > Math.PI && attempts11 < 10) {
            diff -= 2 * Math.PI
            attempts11++
        }
        let attempts12 = 0
        while (diff < -Math.PI && attempts12 < 10) {
            diff += 2 * Math.PI
            attempts12++
        }
        
        // Track rotation during snap for completion detection
        if (state.snap.previousSnapRotationZ !== null && state.snap.snapStartRotationZ !== null) {
            let frameSnapDelta = state.sceneObjects.cubeMesh.rotation.z - state.snap.previousSnapRotationZ
            
            // Safety check for delta
            if (isFinite(frameSnapDelta)) {
                // Normalize delta to handle wrapping (with safety limit)
                let attempts13 = 0
                while (frameSnapDelta > Math.PI && attempts13 < 10) {
                    frameSnapDelta -= 2 * Math.PI
                    attempts13++
                }
                let attempts14 = 0
                while (frameSnapDelta < -Math.PI && attempts14 < 10) {
                    frameSnapDelta += 2 * Math.PI
                    attempts14++
                }
            } else {
                frameSnapDelta = 0
            }
            state.snap.snapRotationAccumulator += frameSnapDelta
        } else if (state.snap.previousSnapRotationZ === null) {
            state.snap.previousSnapRotationZ = state.sceneObjects.cubeMesh.rotation.z
        }
        
        // If very close, snap directly and clear target
        if (Math.abs(diff) < 0.01) {
            // Calculate final snap rotation
            if (state.snap.snapStartRotationZ !== null) {
                let finalSnapDelta = state.snap.snapTargetZ - state.snap.snapStartRotationZ
                // Safety check and normalize to handle wrapping (with safety limit)
                if (isFinite(finalSnapDelta)) {
                    let attempts15 = 0
                    while (finalSnapDelta > Math.PI && attempts15 < 10) {
                        finalSnapDelta -= 2 * Math.PI
                        attempts15++
                    }
                    let attempts16 = 0
                    while (finalSnapDelta < -Math.PI && attempts16 < 10) {
                        finalSnapDelta += 2 * Math.PI
                        attempts16++
                    }
                    state.snap.snapRotationAccumulator = finalSnapDelta
                } else {
                    state.snap.snapRotationAccumulator = 0
                }
            }
            
            state.snap.previousSnapRotationZ = state.sceneObjects.cubeMesh.rotation.z  // Store final rotation before clearing
            state.sceneObjects.cubeMesh.rotation.z = state.snap.snapTargetZ
            state.snap.snapTargetZ = null
            // Don't clear snapStartRotationZ and previousSnapRotationZ here - let trick detection handle it
        } else {
            // Smoothly interpolate towards target
            const step = diff * SNAP_SPEED
            state.sceneObjects.cubeMesh.rotation.z += step
            state.snap.previousSnapRotationZ = state.sceneObjects.cubeMesh.rotation.z
        }
    }
}

export function updateCubeTransform() {
    if (!state.sceneObjects.cubeMesh) return
    state.cubeTransform.position.x = state.sceneObjects.cubeMesh.position.x
    state.cubeTransform.position.y = state.sceneObjects.cubeMesh.position.y
    state.cubeTransform.position.z = state.sceneObjects.cubeMesh.position.z
    state.cubeTransform.rotation.x = state.sceneObjects.cubeMesh.rotation.x
    state.cubeTransform.rotation.y = state.sceneObjects.cubeMesh.rotation.y
    state.cubeTransform.rotation.z = state.sceneObjects.cubeMesh.rotation.z
}

export function handleJump() {
    // Can jump from floor or while grinding
    if (state.physics.isOnFloor || state.physics.isGrinding) {
        state.cubeVelocity.y = JUMP_IMPULSE
        
        // Stop grinding if jumping from rail
        if (state.physics.isGrinding) {
            stopGrinding()
        }
        
        // Detect if jumping while going backward (fakie)
        if (state.sceneObjects.cubeMesh) {
            const forwardX = Math.sin(state.sceneObjects.cubeMesh.rotation.y)
            const forwardZ = Math.cos(state.sceneObjects.cubeMesh.rotation.y)
            
            // Check if S key is pressed (backward) or if velocity is in backward direction
            const isMovingBackward = state.keys['KeyS'] || 
                (state.cubeVelocity.x !== 0 || state.cubeVelocity.z !== 0) && 
                (state.cubeVelocity.x * forwardX + state.cubeVelocity.z * forwardZ < 0)
            
            state.trickStats.wasFakie = isMovingBackward
        }
        
        // Play random pop sound
        if (state.audio.popSounds && state.audio.popSounds.length > 0) {
            const randomPop = state.audio.popSounds[Math.floor(Math.random() * state.audio.popSounds.length)]
            randomPop.currentTime = 0  // Reset to start
            randomPop.play().catch(err => {
                console.error('Error playing pop sound:', err)
            })
        }
    }
}

function updateRailGlow() {
    if (!state.sceneObjects.railMesh || !state.sceneObjects.cubeMesh || !state.sceneObjects.railMaterials) return
    
    // Only glow when in air
    if (state.physics.isOnFloor) {
        // Reset glow when on floor
        state.sceneObjects.railMaterials.forEach(({ mesh, originalEmissive }) => {
            if (mesh.material && mesh.material.emissive) {
                mesh.material.emissive.copy(originalEmissive)
            }
        })
        return false
    }
    
    // Calculate distance from skateboard to closest point on rail mesh
    const boardPos = state.sceneObjects.cubeMesh.position
    const distance = getDistanceToRail(boardPos)
    
    // Glow when within 0.6 units (reduced reach)
    const glowDistance = 0.6
    const maxGlowIntensity = 0.8
    
    if (distance < glowDistance) {
        // Calculate glow intensity based on proximity (closer = brighter)
        const glowIntensity = maxGlowIntensity * (1 - distance / glowDistance)
        
        // Apply green glow to rail materials
        state.sceneObjects.railMaterials.forEach(({ mesh }) => {
            if (mesh.material) {
                if (!mesh.material.emissive) {
                    mesh.material.emissive = new THREE.Color(0x000000)
                }
                mesh.material.emissive.setRGB(0, glowIntensity, 0)
            }
        })
        return true  // Rail is glowing (close enough)
    } else {
        // Reset glow when too far
        state.sceneObjects.railMaterials.forEach(({ mesh, originalEmissive }) => {
            if (mesh.material && mesh.material.emissive) {
                mesh.material.emissive.copy(originalEmissive)
            }
        })
        return false
    }
}

export function startGrinding() {
    if (!state.sceneObjects.railMesh || !state.sceneObjects.cubeMesh) return false
    
    // Only start grinding if airborne, close to rail, and left mouse is held
    if (state.physics.isOnFloor) return false
    if (!state.input.isLeftMouseHeld) return false
    
    // Cannot grind while right-click is held
    if (state.input.isRightMouseHeld) return false
    
    // Cannot grind while A/D keys are held
    if (state.keys['KeyA'] || state.keys['KeyD']) return false
    
    // Cannot grind if board is upside down
    let normalizedZ = state.sceneObjects.cubeMesh.rotation.z
    // Normalize rotation to 0-2π
    if (isFinite(normalizedZ)) {
        let attempts = 0
        while (normalizedZ < 0 && attempts < 10) {
            normalizedZ += 2 * Math.PI
            attempts++
        }
        attempts = 0
        while (normalizedZ >= 2 * Math.PI && attempts < 10) {
            normalizedZ -= 2 * Math.PI
            attempts++
        }
    } else {
        normalizedZ = 0
    }
    
    // Check if upside down (rotation.z close to π)
    const upsideDownThreshold = 0.5  // radians tolerance
    let distanceToPi = Math.abs(normalizedZ - Math.PI)
    if (distanceToPi > Math.PI) {
        distanceToPi = 2 * Math.PI - distanceToPi
    }
    const isUpsideDown = distanceToPi < upsideDownThreshold
    if (isUpsideDown) return false
    
    const boardPos = state.sceneObjects.cubeMesh.position
    const distance = getDistanceToRail(boardPos)
    
    // Must be within 0.6 units to start grinding (reduced reach)
    if (distance > 0.6) return false
    
    // Snap board position to rail
    const railPos = state.sceneObjects.railMesh.position
    const railAngle = Math.PI / 4  // Rail rotation
    const railDirX = Math.sin(railAngle)
    const railDirZ = Math.cos(railAngle)
    
    // Project current position onto rail
    const toRailX = boardPos.x - railPos.x
    const toRailZ = boardPos.z - railPos.z
    const projection = toRailX * railDirX + toRailZ * railDirZ
    
    // Set position on rail
    state.sceneObjects.cubeMesh.position.x = railPos.x + railDirX * projection
    state.sceneObjects.cubeMesh.position.z = railPos.z + railDirZ * projection
    state.sceneObjects.cubeMesh.position.y = railPos.y + CUBE_HALF_HEIGHT
    
    // Calculate grind direction from momentum
    const momentumDotRail = state.cubeVelocity.x * railDirX + state.cubeVelocity.z * railDirZ
    state.physics.railGrindDirection = Math.abs(momentumDotRail) > 0.001 ? (momentumDotRail > 0 ? 1 : -1) : 1
    
    // Start grinding
    state.physics.isGrinding = true
    
    // Play rail sound if available (only start if not already playing)
    if (state.audio.railSound && state.audio.railSound.paused) {
        state.audio.railSound.currentTime = 0
        state.audio.railSound.play().catch(err => {
            // Ignore errors if sound is already playing or interrupted
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
                console.error('Error playing rail sound:', err)
            }
        })
    }
    
    return true
}

export function alignBoardToCamera() {
    if (!state.sceneObjects.cubeMesh) return
    
    // Calculate camera's angle
    const dx = state.sceneObjects.camera.position.x - state.cubeTransform.position.x
    const dz = state.sceneObjects.camera.position.z - state.cubeTransform.position.z
    
    // Safety check for NaN or invalid values
    if (!isFinite(dx) || !isFinite(dz)) return
    
    const cameraAngle = Math.atan2(dx, dz)
    
    // Normalize camera angle to 0-2π range (with safety limit to prevent infinite loops)
    let normalizedCameraAngle = cameraAngle
    let normalizeAttempts1 = 0
    while (normalizedCameraAngle < 0 && normalizeAttempts1 < 10) {
        normalizedCameraAngle += 2 * Math.PI
        normalizeAttempts1++
    }
    let normalizeAttempts2 = 0
    while (normalizedCameraAngle >= 2 * Math.PI && normalizeAttempts2 < 10) {
        normalizedCameraAngle -= 2 * Math.PI
        normalizeAttempts2++
    }
    
    // Board can face camera or opposite direction (180 degrees apart)
    const option2 = normalizedCameraAngle
    const option1 = normalizedCameraAngle + Math.PI
    // Normalize option2
    const normalizedOption2 = option2 >= 2 * Math.PI ? option2 - 2 * Math.PI : option2
    
    // Get current board rotation before snap
    let currentRotation = state.sceneObjects.cubeMesh.rotation.y
    
    // Safety check for NaN or invalid values
    if (!isFinite(currentRotation)) return
    
    let currentRotationNormalized = currentRotation
    let normalizeAttempts3 = 0
    while (currentRotationNormalized < 0 && normalizeAttempts3 < 10) {
        currentRotationNormalized += 2 * Math.PI
        normalizeAttempts3++
    }
    let normalizeAttempts4 = 0
    while (currentRotationNormalized >= 2 * Math.PI && normalizeAttempts4 < 10) {
        currentRotationNormalized -= 2 * Math.PI
        normalizeAttempts4++
    }
    
    // Calculate distances to both options (accounting for wrap-around)
    const dist1 = Math.min(
        Math.abs(currentRotationNormalized - option1),
        Math.abs(currentRotationNormalized - option1 + 2 * Math.PI),
        Math.abs(currentRotationNormalized - option1 - 2 * Math.PI)
    )
    const dist2 = Math.min(
        Math.abs(currentRotationNormalized - normalizedOption2),
        Math.abs(currentRotationNormalized - normalizedOption2 + 2 * Math.PI),
        Math.abs(currentRotationNormalized - normalizedOption2 - 2 * Math.PI)
    )
    
    // Determine target rotation and calculate rotation direction
    let targetRotation
    if (dist1 < dist2) {
        targetRotation = option1
    } else {
        // Board snapped to opposite direction - rotate another 180 degrees to face camera
        targetRotation = normalizedOption2 + Math.PI
        // Normalize if needed
        if (targetRotation >= 2 * Math.PI) {
            targetRotation -= 2 * Math.PI
        }
    }
    
    // Calculate rotation direction for shuv (positive = clockwise, negative = counterclockwise)
    let rotationDelta = targetRotation - currentRotationNormalized
    // Normalize to shortest path (with safety limit)
    let normalizeAttempts5 = 0
    while (rotationDelta > Math.PI && normalizeAttempts5 < 10) {
        rotationDelta -= 2 * Math.PI
        normalizeAttempts5++
    }
    let normalizeAttempts6 = 0
    while (rotationDelta < -Math.PI && normalizeAttempts6 < 10) {
        rotationDelta += 2 * Math.PI
        normalizeAttempts6++
    }
    
    // Count shuv if airborne
    // Improved snap completion detection for shuvs
    // Key insight: Snaps >90 degrees snap to the OTHER side, which can complete a shuv
    if (!state.physics.isOnFloor) {
        // Track shuv snap rotation
        if (state.snap.shuvSnapStartRotationY === null) {
            state.snap.shuvSnapStartRotationY = state.sceneObjects.cubeMesh.rotation.y
            state.snap.shuvSnapRotationAccumulator = 0
        }
        
        // Calculate snap rotation (signed, preserves direction)
        let snapRotation = rotationDelta
        // Safety check for invalid values
        if (!isFinite(snapRotation)) {
            snapRotation = 0
        } else {
            // Normalize to handle wrapping (with safety limit)
            let attempts7 = 0
            while (snapRotation > Math.PI && attempts7 < 10) {
                snapRotation -= 2 * Math.PI
                attempts7++
            }
            let attempts8 = 0
            while (snapRotation < -Math.PI && attempts8 < 10) {
                snapRotation += 2 * Math.PI
                attempts8++
            }
        }
        
        // Calculate total rotation: rotation during right-click + snap rotation
        // cumulativeBoardRotationRightClick is now signed
        const rotationBeforeSnap = state.tricks.cumulativeBoardRotationRightClick
        const rotationAfterSnap = rotationBeforeSnap + snapRotation
        const totalRotation = Math.abs(rotationAfterSnap)
        
        // Determine shuv direction
        let shuvDirection = 0
        if (state.tricks.boardRotationDirectionRightClick !== 0) {
            shuvDirection = state.tricks.boardRotationDirectionRightClick > 0 ? 1 : -1
        } else {
            shuvDirection = snapRotation > 0 ? 1 : (snapRotation < 0 ? -1 : 1)
        }
        
        // Check if snap is >90 degrees (snapping to other side)
        const NINETY_DEGREES = Math.PI / 2
        const snapMagnitude = Math.abs(snapRotation)
        const isSnappingToOtherSide = snapMagnitude > NINETY_DEGREES
        
        // If snapping to other side (>90 degrees), this likely completes a shuv
        if (isSnappingToOtherSide) {
            // Calculate rotation before snap relative to nearest 180-degree boundary
            const rotationBeforeSnapNormalized = rotationBeforeSnap % (2 * Math.PI)
            const progressBeforeSnap = Math.abs(rotationBeforeSnapNormalized) % Math.PI
            const progressBeforeSnapFromBoundary = Math.min(progressBeforeSnap, Math.PI - progressBeforeSnap)
            
            // If we had significant rotation before snap (>90 degrees), snap completes it
            if (progressBeforeSnapFromBoundary > NINETY_DEGREES || Math.abs(rotationBeforeSnap) > NINETY_DEGREES) {
                // Snap completes a shuv
                state.trickStats.shuvs += shuvDirection
            } else {
                // Check if total rotation (before + snap) crosses a 180-degree boundary
                const shuvsBefore = rotationBeforeSnap / Math.PI
                const shuvsAfter = rotationAfterSnap / Math.PI
                
                const completedShuvsBefore = rotationBeforeSnap > 0 
                    ? Math.floor(shuvsBefore) 
                    : Math.ceil(shuvsBefore)
                const completedShuvsAfter = rotationAfterSnap > 0 
                    ? Math.floor(shuvsAfter) 
                    : Math.ceil(shuvsAfter)
                
                if (completedShuvsAfter !== completedShuvsBefore) {
                    // Snap completed one or more shuvs
                    const shuvCount = Math.abs(completedShuvsAfter - completedShuvsBefore)
                    state.trickStats.shuvs += shuvDirection * shuvCount
                } else if (totalRotation >= NINETY_DEGREES) {
                    // At least 90 degrees of rotation, count as half shuv or more
                    const shuvCount = Math.floor(totalRotation / Math.PI)
                    if (shuvCount > 0) {
                        state.trickStats.shuvs += shuvDirection * shuvCount
                    } else {
                        // Between 90-180 degrees, count as 1 shuv
                        state.trickStats.shuvs += shuvDirection
                    }
                }
            }
        } else {
            // Snap is <=90 degrees (snapping to same side)
            // Check if snap crosses a 180-degree boundary
            const shuvsBefore = rotationBeforeSnap / Math.PI
            const shuvsAfter = rotationAfterSnap / Math.PI
            
            const completedShuvsBefore = rotationBeforeSnap > 0 
                ? Math.floor(shuvsBefore) 
                : Math.ceil(shuvsBefore)
            const completedShuvsAfter = rotationAfterSnap > 0 
                ? Math.floor(shuvsAfter) 
                : Math.ceil(shuvsAfter)
            
            // Count shuvs based on completed rotations
            if (completedShuvsAfter !== completedShuvsBefore) {
                // Snap completed one or more shuvs
                const shuvCount = Math.abs(completedShuvsAfter - completedShuvsBefore)
                state.trickStats.shuvs += shuvDirection * shuvCount
            } else {
                // Snap didn't cross boundary, but check if it was close enough
                const progressBefore = Math.abs(rotationBeforeSnap - completedShuvsBefore * Math.PI)
                const progressAfter = Math.abs(rotationAfterSnap - completedShuvsAfter * Math.PI)
                
                // If we were close (> 150 degrees) and snap completes it
                const CLOSE_THRESHOLD = (150 * Math.PI) / 180  // 150 degrees
                if (progressBefore > CLOSE_THRESHOLD && progressAfter < progressBefore) {
                    // Snap completed the shuv
                    state.trickStats.shuvs += shuvDirection
                } else if (totalRotation >= Math.PI * 0.5) {
                    // At least half a shuv completed, count it
                    const shuvCount = Math.floor(totalRotation / Math.PI)
                    state.trickStats.shuvs += shuvDirection * shuvCount
                }
            }
        }
        
        // Reset tracking
        state.tricks.cumulativeBoardRotationRightClick = 0
        state.tricks.boardRotationDirectionRightClick = 0
        state.snap.shuvSnapStartRotationY = null
        state.snap.shuvSnapRotationAccumulator = 0
    }
    
    // Apply the snap
    state.sceneObjects.cubeMesh.rotation.y = targetRotation
    
    // Update transform to reflect the change
    updateCubeTransform()
}

