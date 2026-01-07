import * as THREE from "three"
import * as state from "../core/state.js"
import {
    GRAVITY, JUMP_IMPULSE, KICKFLIP_A_D_ROTATION_SPEED, SHUV_A_D_ROTATION_SPEED,
    ALIGNMENT_TORQUE, ALIGNMENT_DAMPING, ALIGNMENT_SNAP_THRESHOLD, FLOOR_Y, BOARD_HALF_HEIGHT,
    FORWARD_SPEED, FRICTION, MIN_VELOCITY, MOUSE_STEERING_SENSITIVITY,
    KICKFLIP_RIGHT_CLICK_SENSITIVITY, SHUV_RIGHT_CLICK_SENSITIVITY,
    MOUSE_SMOOTHING, AIR_TURNING_RESISTANCE, SNAP_SPEED, SFX_VOLUME,
    BOARD_REFRESH_RATE,
    RAIL_ANGLE, RAIL_GRIND_DISTANCE_THRESHOLD, RAIL_GRIND_SPEED_MULTIPLIER,
    MIN_MOMENTUM_DOT_RAIL, MIN_MOUSE_DELTA, MIN_ROTATION_DELTA,
    MIN_ANGULAR_VELOCITY, MAX_ANGULAR_VELOCITY, SNAP_COMPLETION_THRESHOLD,
    UPSIDE_DOWN_THRESHOLD, ANGLE_NORMALIZATION_MAX_ATTEMPTS, PI, TWO_PI, NINETY_DEGREES,
    RAIL_GLOW_DISTANCE, RAIL_GLOW_MAX_INTENSITY,
    MANUAL_DIP_SPEED, MANUAL_DIP_SMOOTHING, MANUAL_MIN_DIP, MANUAL_MAX_DIP, MANUAL_DIP_THRESHOLD,
    MANUAL_BALANCE_BAR_HEIGHT, MANUAL_BALANCE_LINE_WIDTH,
    MANUAL_BALANCE_LINEAR_SPEED, MANUAL_BALANCE_SCROLL_SPEED, MANUAL_BALANCE_FAILURE_THRESHOLD,
    MANUAL_RETURN_SPEED, BOARD_HALF_LENGTH
} from "../config/constants.js"
import { normalizeAngle, shortestAngleDiff, magnitude3D } from "../utils/math.js"
import { error, warn } from "../utils/logger.js"
import { updateWindSound, playRandomCatchSound } from "./sound.js"
import { updateCameraFollow, triggerScreenShake } from "./camera.js"
import { updateTrickDetection, detectAndDisplayTrickWithStats, resetTrickStats, triggerFailEffect, getCurrentTrickStats, addGrindToCombo, resetTrickCombo } from "./tricks.js"
import { currentMouseSensitivity, isSwapShuvFlipEnabled } from "../config/settings.js"

// ============================================================================
// PHYSICS
// ============================================================================

/**
 * Calculates distance from point to closest point on rail mesh bounding box
 * @param {THREE.Vector3} boardPos - Board position
 * @returns {number} Distance to rail (Infinity if rail doesn't exist)
 */
function getDistanceToRail(boardPos) {
    if (!state.sceneObjects.railMesh) return Infinity
    
    try {
        // Get bounding box of rail mesh (accounts for scale, rotation, position)
        const box = new THREE.Box3().setFromObject(state.sceneObjects.railMesh)
        
        // Clamp board position to bounding box to get closest point
        const closestPoint = new THREE.Vector3()
        closestPoint.x = Math.max(box.min.x, Math.min(boardPos.x, box.max.x))
        closestPoint.y = Math.max(box.min.y, Math.min(boardPos.y, box.max.y))
        closestPoint.z = Math.max(box.min.z, Math.min(boardPos.z, box.max.z))
        
        // Calculate distance from board to closest point
        return boardPos.distanceTo(closestPoint)
    } catch (err) {
        error('Error calculating distance to rail:', err)
        return Infinity
    }
}

/**
 * Normalizes rotation.z and checks if board is upside down
 * @param {number} rotationZ - Rotation.z value
 * @returns {Object} { normalized, isUpsideDown }
 */
function checkUpsideDown(rotationZ) {
    const normalized = normalizeAngle(rotationZ, ANGLE_NORMALIZATION_MAX_ATTEMPTS)
    
    // Calculate shortest angular distance to π (180 degrees)
    let distanceToPi = Math.abs(normalized - PI)
    if (distanceToPi > PI) {
        distanceToPi = TWO_PI - distanceToPi
    }
    
    const isUpsideDown = distanceToPi < UPSIDE_DOWN_THRESHOLD
    
    return { normalized, isUpsideDown }
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
    handleFallDetection()
    handleBoundaryTeleport()
    handleRotationInput()
    handleManualSystem()
    // Apply alignment torque after manual system (so manual system can set manual pitch first)
    // This ensures board aligns to ramp surfaces, with manual pitch added on top if in manual
    if (state.physics.isOnFloor) {
        applyAlignmentTorque()
    }
    handleSmoothSnapping()
    updateBoardTransform()
    
    // Update camera if in attached mode - must be in physics loop to move with board
    if (state.sceneObjects.controls && !state.sceneObjects.controls.enabled) {
        updateCameraFollow()
    }
    
    // Update trick detection
    updateTrickDetection()
    
    // Update rail glow effect
    updateRailGlow()
}

function handleRotation() {
    if (!state.sceneObjects.boardMesh) return
    // Don't modify rotation.x when airborne (manual system handles it)
    // Don't modify rotation.x when on ramp (applyAlignmentTorque handles it)
    // Only apply rotation.x when on flat floor (not ramp) and not in manual
    // Note: currentSurface might not be set yet, so we check if it's explicitly 'ramp' or undefined/null
    const isOnRamp = state.physics.currentSurface === 'ramp'
    if (state.physics.isOnFloor && !isOnRamp && !state.physics.isInManual) {
        // Update target rotation (physics always runs at full speed)
        state.boardTargetRotation.x += state.angularVelocity.x
    }
    // rotation.z is for flips (barrel rolls)
    state.boardTargetRotation.z += state.angularVelocity.z
}

function handleGravity() {
    // Don't apply gravity when grinding
    if (!state.physics.isGrinding && state.boardVelocity) {
        // Don't apply gravity when stationary on ramp (prevents rolling down)
        const isOnRamp = state.physics.currentSurface === 'ramp'
        const mouseDelta = state.input && state.input.mouseDeltaX ? Math.abs(state.input.mouseDeltaX) : 0
        const hasInput = state.keys && (state.keys['KeyW'] || state.keys['KeyS'] || mouseDelta > 0.01)
        const isMoving = state.boardVelocity ? Math.sqrt(state.boardVelocity.x ** 2 + state.boardVelocity.z ** 2) > MIN_VELOCITY : false
        
        if (!isOnRamp || hasInput || isMoving) {
            state.boardVelocity.y += GRAVITY
        }
        // When stationary on ramp with no input, gravity is handled by collision system
    }
}

function handleGrinding() {
    if (!state.sceneObjects.railMesh || !state.sceneObjects.boardMesh) {
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
    
    // Stop grinding if board flips upside down (use target rotation for physics accuracy)
    if (state.sceneObjects.boardMesh) {
        const { isUpsideDown } = checkUpsideDown(state.boardTargetRotation.z)
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
                error('Error playing rail sound:', err)
            }
        })
    }
    
    // Rail is rotated 45 degrees around Y axis
    const railDirX = Math.sin(RAIL_ANGLE)
    const railDirZ = Math.cos(RAIL_ANGLE)
    
    // Project board momentum onto rail direction
    const momentumDotRail = state.boardVelocity.x * railDirX + state.boardVelocity.z * railDirZ
    
    // Determine grind direction based on momentum
    if (Math.abs(momentumDotRail) > MIN_MOMENTUM_DOT_RAIL) {
        state.physics.railGrindDirection = momentumDotRail > 0 ? 1 : -1
    }
    
    // Move along rail at constant speed (preserve momentum magnitude)
    const grindSpeed = Math.max(Math.abs(momentumDotRail), FORWARD_SPEED * RAIL_GRIND_SPEED_MULTIPLIER)
    state.boardVelocity.x = railDirX * grindSpeed * state.physics.railGrindDirection
    state.boardVelocity.z = railDirZ * grindSpeed * state.physics.railGrindDirection
    
    // Keep board on rail height and snap position to rail
    const railPos = state.sceneObjects.railMesh.position
    const boardPos = state.sceneObjects.boardMesh.position
    
    // Project current position onto rail
    const toRailX = boardPos.x - railPos.x
    const toRailZ = boardPos.z - railPos.z
    const projection = toRailX * railDirX + toRailZ * railDirZ
    
    // Snap position to rail
    state.sceneObjects.boardMesh.position.x = railPos.x + railDirX * projection
    state.sceneObjects.boardMesh.position.z = railPos.z + railDirZ * projection
    state.sceneObjects.boardMesh.position.y = railPos.y + BOARD_HALF_HEIGHT
    
    // Check distance to rail - automatically exit if too far
    const distance = getDistanceToRail(boardPos)
    if (distance > RAIL_GRIND_DISTANCE_THRESHOLD) {
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
        // Note: Don't add grind to combo here - it's added when grinding starts
        // This prevents duplicate "Grind" entries when grinding stops and restarts
        
        // Stop rail sound
        if (state.audio.railSound) {
            state.audio.railSound.pause()
            state.audio.railSound.currentTime = 0
        }
    }
}

function handleMovement() {
    if (!state.sceneObjects.boardMesh) return
    state.sceneObjects.boardMesh.position.y += state.boardVelocity.y
    state.sceneObjects.boardMesh.position.z += state.boardVelocity.z
    state.sceneObjects.boardMesh.position.x += state.boardVelocity.x
}

function handleForwardMovement() {
    if (!state.sceneObjects.boardMesh || state.physics.isGrinding) return
    
    // Only allow movement when on floor
    if (state.physics.isOnFloor) {
        const rotationY = state.boardTargetRotation.y
        const forwardX = Math.sin(rotationY)
        const forwardZ = Math.cos(rotationY)
        
        if (state.keys['KeyW']) {
            // Instantly set forward velocity in the direction the board is facing
            state.boardVelocity.x = forwardX * FORWARD_SPEED
            state.boardVelocity.z = forwardZ * FORWARD_SPEED
        } else if (state.keys['KeyS']) {
            // Instantly set backward velocity (opposite direction)
            state.boardVelocity.x = -forwardX * FORWARD_SPEED
            state.boardVelocity.z = -forwardZ * FORWARD_SPEED
        } else {
            // When in manual, preserve momentum and align with board direction
            if (state.physics.isInManual) {
                // Reuse forward direction from above (rotationY, forwardX, forwardZ already calculated in outer scope)
                
                // Calculate current velocity magnitude
                const currentSpeed = Math.sqrt(state.boardVelocity.x ** 2 + state.boardVelocity.z ** 2)
                
                // Align velocity with board direction (preserve speed, align direction)
                // No friction during manual - velocity is preserved
                if (currentSpeed > MIN_VELOCITY) {
                    // Determine if we're moving forward or backward relative to board
                    const velocityDotForward = state.boardVelocity.x * forwardX + state.boardVelocity.z * forwardZ
                    const isMovingForward = velocityDotForward >= 0
                    
                    if (isMovingForward) {
                        // Moving forward - align with forward direction
                        state.boardVelocity.x = forwardX * currentSpeed
                        state.boardVelocity.z = forwardZ * currentSpeed
                    } else {
                        // Moving backward - align with backward direction
                        state.boardVelocity.x = -forwardX * currentSpeed
                        state.boardVelocity.z = -forwardZ * currentSpeed
                    }
                }
                // If speed is very low, keep velocity as-is (no friction, no stopping)
            } else {
                // Apply normal friction when not pressing W or S and not in manual
                state.boardVelocity.x *= FRICTION
                state.boardVelocity.z *= FRICTION
                
                // Stop very small velocities
                const speed = Math.sqrt(state.boardVelocity.x ** 2 + state.boardVelocity.z ** 2)
                if (speed < MIN_VELOCITY) {
                    state.boardVelocity.x = 0
                    state.boardVelocity.z = 0
                }
            }
        }
    }
    // In air: momentum is preserved (handled in handleMomentum)
}

function handleMouseSteering() {
    if (!state.sceneObjects.boardMesh) return
    // Only allow steering when in attached mode (orbit controls disabled)
    if (!state.sceneObjects.controls.enabled && state.input.isPointerLocked) {
        if (state.physics.isOnFloor) {
            // On floor: allow mouse input to control camera rotation (no smoothing)
            if (Math.abs(state.input.mouseDeltaX) > MIN_MOUSE_DELTA) {
                // Capture mouse speed before resetting
                state.input.currentMouseSpeed = Math.abs(state.input.mouseDeltaX)
                
                // Calculate and store rotation velocity from raw mouse delta
                // This will be locked when entering air
                state.input.airborneCameraRotationVelocity = -state.input.mouseDeltaX * currentMouseSensitivity
                
                // Rotate board's Y rotation (yaw) based on raw mouse movement
                state.boardTargetRotation.y += state.input.airborneCameraRotationVelocity
            } else {
                // No mouse movement - zero velocity
                state.input.airborneCameraRotationVelocity = 0
            }
            
            // Reset raw mouse delta after processing
            state.input.mouseDeltaX = 0
        } else {
            // In air: apply locked camera rotation velocity (ignore mouse input)
            // Cannot right-click while grinding
            const swapEnabled = isSwapShuvFlipEnabled()
            
            if (state.input.isRightMouseHeld && !state.physics.isGrinding) {
                // When right-clicking: board rotates independently from mouse input
                // Apply exponential smoothing to mouse delta for board rotation
                state.input.smoothedMouseDeltaX = state.input.smoothedMouseDeltaX * (1 - MOUSE_SMOOTHING) + state.input.mouseDeltaX * MOUSE_SMOOTHING
                
                if (swapEnabled) {
                    // Swapped: Right-click controls barrel roll (Z rotation)
                    // Camera continues rotating with velocity (apply to board Y rotation)
                    state.boardTargetRotation.y += state.input.airborneCameraRotationVelocity
                    
                    if (Math.abs(state.input.smoothedMouseDeltaX) > MIN_MOUSE_DELTA) {
                        // Rotate board Z axis (barrel roll) based on mouse movement (reversed direction)
                        state.boardTargetRotation.z += state.input.smoothedMouseDeltaX * KICKFLIP_RIGHT_CLICK_SENSITIVITY
                        state.input.smoothedMouseDeltaX *= 0.9  // Decay smoothed delta
                    } else {
                        state.input.smoothedMouseDeltaX = 0
                    }
                } else {
                    // Normal: Right-click controls shuv (Y rotation)
                    // Board rotation is additive to camera rotation velocity
                    // This makes board rotation feel consistent regardless of camera rotation speed
                    state.boardTargetRotation.y += state.input.airborneCameraRotationVelocity
                    
                    if (Math.abs(state.input.smoothedMouseDeltaX) > MIN_MOUSE_DELTA) {
                        // Rotate board independently based on mouse movement (additive to camera rotation)
                        state.boardTargetRotation.y -= state.input.smoothedMouseDeltaX * SHUV_RIGHT_CLICK_SENSITIVITY
                        state.input.smoothedMouseDeltaX *= 0.9  // Decay smoothed delta
                    } else {
                        state.input.smoothedMouseDeltaX = 0
                    }
                }
                
                // Reset raw mouse delta after processing
                state.input.mouseDeltaX = 0
            } else {
                // Not right-clicking: apply camera rotation velocity to board
                // Cannot right-click while grinding
                // When swap is enabled and A/D keys are pressed, camera rotation is handled in handleRotationInput
                if (!state.physics.isGrinding && !(swapEnabled && (state.keys['KeyA'] || state.keys['KeyD']))) {
                    state.boardTargetRotation.y += state.input.airborneCameraRotationVelocity
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

/**
 * Check collision with manual pad (flat box)
 * @param {THREE.Vector3} boardPos - Board position
 * @returns {Object|null} { surfaceY, normal } or null if no collision
 */
function checkManualPadCollision(boardPos) {
    if (!state.sceneObjects.manualPad) return null
    
    const pad = state.sceneObjects.manualPad
    const padPos = pad.position
    const padWidth = 5
    const padLength = 3
    const padTopY = padPos.y + pad.geometry.parameters.height / 2
    const padRotationY = pad.rotation.y
    
    // Transform board position to pad's local space (accounting for rotation)
    const dx = boardPos.x - padPos.x
    const dz = boardPos.z - padPos.z
    
    // Rotate point back to pad's local coordinate system
    const cosY = Math.cos(-padRotationY)
    const sinY = Math.sin(-padRotationY)
    const localX = dx * cosY - dz * sinY
    const localZ = dx * sinY + dz * cosY
    
    // Check if board is within pad bounds in local space
    const halfWidth = padWidth / 2
    const halfLength = padLength / 2
    
    if (localX >= -halfWidth && localX <= halfWidth &&
        localZ >= -halfLength && localZ <= halfLength) {
        return {
            surfaceY: padTopY,
            normal: new THREE.Vector3(0, 1, 0)  // Upward normal
        }
    }
    
    return null
}

/**
 * Check collision with kicker ramp (angled box)
 * @param {THREE.Vector3} boardPos - Board position
 * @returns {Object|null} { surfaceY, normal } or null if no collision
 */
function checkKickerRampCollision(boardPos) {
    if (!state.sceneObjects.kickerRamp) return null
    
    const ramp = state.sceneObjects.kickerRamp
    const rampPos = ramp.position
    const rampWidth = 2
    const rampLength = 2  // Updated to match init
    const rampAngle = -ramp.rotation.x  // Get the angle (should be PI/9 = ~20 degrees)
    const rampHeight = ramp.geometry.parameters.height
    
    // Check if board is within ramp bounds (X)
    const halfWidth = rampWidth / 2
    if (boardPos.x < rampPos.x - halfWidth || boardPos.x > rampPos.x + halfWidth) {
        return null
    }
    
    // Get local Z position relative to ramp center
    const localZ = boardPos.z - rampPos.z
    
    // Check if within ramp length bounds (before rotation)
    const halfLength = rampLength / 2
    if (localZ < -halfLength || localZ > halfLength) {
        return null
    }
    
    // Calculate height of ramp surface at this Z position
    // The ramp slopes upward in +Z direction
    // At localZ = -halfLength, surface is at minimum height
    // At localZ = +halfLength, surface is at maximum height
    // Height difference = rampLength * sin(rampAngle)
    const sinAngle = Math.sin(rampAngle)
    const heightRange = rampLength * sinAngle
    
    // Calculate Z offset from minimum (-halfLength to +halfLength maps to 0 to 1)
    const zOffset = (localZ + halfLength) / rampLength
    
    // Calculate surface height
    // The ramp box center is at rampCenterY
    // The top surface of the box (before rotation) is at rampCenterY + rampHeight/2
    // When rotated, the top surface slopes, so we need to calculate the top surface height
    // Minimum height (at -halfLength) is at rampCenterY + rampHeight/2 - heightRange/2
    // Maximum height (at +halfLength) is at rampCenterY + rampHeight/2 + heightRange/2
    const rampCenterY = rampPos.y
    const topSurfaceCenterY = rampCenterY + rampHeight / 2
    const minSurfaceY = topSurfaceCenterY - heightRange / 2
    const surfaceY = minSurfaceY + heightRange * zOffset
    
    // Calculate normal vector (perpendicular to ramp surface)
    // The ramp is rotated around X by -rampAngle, so it slopes upward in +Z direction
    // The normal should point upward and slightly backward (in -Z direction)
    // Since rampAngle is positive (PI/6), sin(rampAngle) is positive, but we need negative Z
    const normal = new THREE.Vector3(0, Math.cos(rampAngle), -Math.sin(rampAngle))
    normal.normalize()
    
    return {
        surfaceY: surfaceY,
        normal: normal
    }
}

/**
 * Calculate the actual lowest Y position of the board considering rotation
 * @returns {number} Lowest Y position of the board
 */
function getBoardBottomY() {
    if (!state.sceneObjects.boardMesh) return 0
    
    const boardPos = state.sceneObjects.boardMesh.position
    const rotationX = state.boardTargetRotation.x
    
    // When rotated around X axis, the lowest point is at the front or back edge
    // Calculate how much the rotation lowers the bottom edge
    // rotationX > 0 means nose down (front edge lower)
    // rotationX < 0 means tail down (back edge lower)
    const rotationOffset = Math.abs(Math.sin(rotationX)) * BOARD_HALF_LENGTH
    
    // The base bottom is at boardPos.y - BOARD_HALF_HEIGHT
    // Subtract the rotation offset to get the actual lowest point
    return boardPos.y - BOARD_HALF_HEIGHT - rotationOffset
}

function handleCollision() {
    if (!state.sceneObjects.boardMesh) return
    
    // Improved collision detection with better ground checking
    const boardPos = state.sceneObjects.boardMesh.position
    const boardBottom = getBoardBottomY()
    state.physics.previousIsOnFloor = state.physics.isOnFloor
    state.physics.wasGrinding = state.physics.isGrinding
    state.physics.isOnFloor = false
    
    // Check collisions in priority order: manual pad, kicker ramp, floor
    let collisionSurfaceY = null
    let collisionNormal = null
    let currentSurface = null
    
    // Check manual pad collision
    const padCollision = checkManualPadCollision(boardPos)
    if (padCollision && boardBottom <= padCollision.surfaceY) {
        collisionSurfaceY = padCollision.surfaceY
        collisionNormal = padCollision.normal
        currentSurface = 'pad'
    }
    
    // Check kicker ramp collision (only if not already colliding with pad)
    if (!collisionSurfaceY) {
        const rampCollision = checkKickerRampCollision(boardPos)
        if (rampCollision) {
            // Only collide if we're actually on or above the ramp surface
            // Add small tolerance to prevent oscillation when leaving ramp
            const surfaceTolerance = 0.05
            if (boardBottom <= rampCollision.surfaceY + surfaceTolerance) {
                // Only register collision if we're not falling too fast past the ramp
                // This prevents hovering when going down past the ramp edge
                if (state.boardVelocity.y <= 0.01 || boardBottom <= rampCollision.surfaceY) {
                    collisionSurfaceY = rampCollision.surfaceY
                    collisionNormal = rampCollision.normal
                    currentSurface = 'ramp'
                }
            }
        }
    }
    
    // Check floor collision (only if not already colliding with pad or ramp)
    if (!collisionSurfaceY && boardBottom <= FLOOR_Y) {
        collisionSurfaceY = FLOOR_Y
        collisionNormal = new THREE.Vector3(0, 1, 0)
        currentSurface = 'floor'
    }
    
    // Update surface tracking
    state.physics.currentSurface = currentSurface
    state.physics.surfaceNormal = collisionNormal ? collisionNormal.clone() : null
    
    // Handle collision if any surface was hit
    if (collisionSurfaceY !== null) {
        // Calculate penetration depth for more accurate collision response
        // Use actual bottom Y considering rotation to prevent clipping
        const actualBoardBottom = getBoardBottomY()
        const penetration = collisionSurfaceY - actualBoardBottom
        
        // For angled surfaces (ramp), constrain board to surface
        if (collisionNormal && collisionNormal.y < 0.99) {  // Not perfectly flat (ramp)
            // Constrain board position to ramp surface
            const boardPos = state.sceneObjects.boardMesh.position
            const rampCollision = checkKickerRampCollision(boardPos)
            if (rampCollision) {
                // Calculate where board center should be to have bottom at surfaceY
                const targetBoardCenterY = rampCollision.surfaceY + BOARD_HALF_HEIGHT
                const surfaceOffset = 0.001
                // Constrain board to ramp surface (both push up and pull down)
                state.sceneObjects.boardMesh.position.y = targetBoardCenterY + surfaceOffset
            }
            
            // Project velocity onto ramp surface to prevent sliding down
            const velocity = new THREE.Vector3(state.boardVelocity.x, state.boardVelocity.y, state.boardVelocity.z)
            const normalComponent = velocity.dot(collisionNormal)
            
            // If moving away from surface (positive normal component), allow falling
            if (normalComponent > 0.01) {
                // Falling away from ramp - allow falling
            } else {
                // On or moving into ramp surface - project velocity onto surface
                const surfaceVelocity = new THREE.Vector3()
                surfaceVelocity.subVectors(velocity, collisionNormal.clone().multiplyScalar(normalComponent))
                
                // Check if player has input (W/S keys or mouse movement)
                const hasInput = state.keys['KeyW'] || state.keys['KeyS'] || Math.abs(state.input.mouseDeltaX) > 0.01
                const speed = Math.sqrt(surfaceVelocity.x ** 2 + surfaceVelocity.z ** 2)
                
                if (hasInput && speed > MIN_VELOCITY) {
                    // Player is moving - apply surface velocity with friction
                    state.boardVelocity.x = surfaceVelocity.x * 0.98
                    state.boardVelocity.z = surfaceVelocity.z * 0.98
                } else {
                    // No input or very slow - stop all movement to prevent rolling
                    state.boardVelocity.x = 0
                    state.boardVelocity.z = 0
                }
                
                // Always cancel vertical velocity (board stays on ramp surface)
                state.boardVelocity.y = 0
            }
        } else {
            // Flat surface - push board up if penetrating, stop vertical velocity
            const surfaceOffset = 0.001
            if (penetration > 0) {
                state.sceneObjects.boardMesh.position.y += penetration + surfaceOffset
            }
            state.boardVelocity.y = 0
        }
        
        // Set on floor state
        state.physics.isOnFloor = true
        
        // Check if we just landed (was in air, now on floor)
        const justLanded = state.physics.previousIsOnFloor === false
        
        // Trigger screen shake on landing
        if (justLanded) {
            if (state.physics.wasGrinding) {
                // Stronger shake after grinding
                triggerScreenShake(0.12)
            } else {
                // Small shake on normal landing
                triggerScreenShake(0.08)
            }
        }
        
        // Detect and display trick when landing (defer to avoid blocking physics)
        if (justLanded && !state.physics.isProcessingLanding) {
            state.physics.isProcessingLanding = true
            
            // Capture final trick stats directly from trackers to ensure accuracy
            // This is especially important for combined tricks (flips + body180s + shuvs)
            // Use getCurrentTrickStats() to get the absolute latest counts from all active trackers
            const finalTrickStats = getCurrentTrickStats()
            
            // Defer trick detection and display to avoid blocking physics loop
            requestAnimationFrame(() => {
                // Detect and add final trick to combo first
                detectAndDisplayTrickWithStats(finalTrickStats)
                resetTrickStats()
                
                // Reset combo on landing (delayed so full combo is visible)
                // Use another requestAnimationFrame to ensure combo display has updated
                requestAnimationFrame(() => {
                    resetTrickCombo(false)  // false = delayed reset
                })
                
                state.physics.isProcessingLanding = false
            })
            
            // Reset airborne camera rotation velocity
            state.input.airborneCameraRotationVelocity = 0
        }
        
        // Check if board is upside down along z axis (rotation.z near π or -π) (use target rotation for physics accuracy)
        const { isUpsideDown } = checkUpsideDown(state.boardTargetRotation.z)
        
        // If just landed and upside down, trigger fail effect
        if (justLanded && isUpsideDown) {
            triggerFailEffect()
        }
        
        // Play random land sound on landing (only if not upside down)
        if (justLanded && !isUpsideDown && state.audio.landSounds && state.audio.landSounds.length > 0) {
            const randomLand = state.audio.landSounds[Math.floor(Math.random() * state.audio.landSounds.length)]
            randomLand.currentTime = 0  // Reset to start
            randomLand.play().catch(err => {
                // Ignore AbortError and NotAllowedError (expected in some cases)
                if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
                    error('Error playing land sound:', err)
                }
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
        
        // Apply alignment torque to align board with surface
        applyAlignmentTorque()
    }
}

function applyAlignmentTorque() {
    if (!state.sceneObjects.boardMesh) return
    
    // Handle X-axis rotation (pitch) for ramp alignment - instant snap
    let targetRotationX = 0
    
    // If on ramp, calculate target rotation to align with ramp surface
    if (state.physics.currentSurface === 'ramp' && state.physics.surfaceNormal) {
        const normal = state.physics.surfaceNormal
        // Calculate the ramp's tilt angle in the Z-Y plane
        const rampTiltAngle = Math.atan2(normal.z, normal.y)
        
        // Get board's forward direction in world space
        const rotationY = state.sceneObjects.boardMesh.rotation.y
        const boardForwardX = Math.sin(rotationY)
        const boardForwardZ = Math.cos(rotationY)
        
        // The ramp slopes upward in the +Z direction
        // Calculate pitch (rotation.x) based on how aligned the board is with the ramp slope
        // When board is going straight up ramp (forwardZ = 1): full tilt forward
        // When board is going sideways (forwardZ = 0): no pitch tilt
        // When board is going backward (forwardZ = -1): negative tilt
        targetRotationX = rampTiltAngle * boardForwardZ
        
        // Calculate roll (rotation.z) based on sideways movement
        // When board is going sideways (forwardX = ±1): full roll tilt
        // When board is going straight (forwardX = 0): no roll tilt
        // The roll should match the ramp's tilt when going sideways
        // Use the X component to determine roll: positive X = roll right, negative X = roll left
        const targetRotationZ = rampTiltAngle * boardForwardX
        
        // Store base aligned rotation
        state.physics.alignedRotationX = targetRotationX
        
        // If in manual, add manual pitch to aligned rotation
        if (state.physics.isInManual) {
            state.boardTargetRotation.x = targetRotationX + state.physics.manualPitch
        } else {
            // Not in manual, just use aligned rotation
            state.boardTargetRotation.x = targetRotationX
        }
        
        // Apply roll rotation (barrel roll) to match ramp surface when going sideways
        state.boardTargetRotation.z = targetRotationZ
        state.angularVelocity.x = 0
        state.angularVelocity.z = 0
    } else if (state.physics.isOnFloor) {
        // On flat surface (floor, pad) - target rotation.x is 0
        state.physics.alignedRotationX = 0
        
        // If in manual, add manual pitch to aligned rotation (which is 0)
        if (state.physics.isInManual) {
            state.boardTargetRotation.x = state.physics.manualPitch
        } else {
            // Not in manual, just use aligned rotation (0)
            state.boardTargetRotation.x = 0
        }
        state.angularVelocity.x = 0
    } else {
        // Not on floor - no alignment
        state.physics.alignedRotationX = 0
    }
    
    // Handle Z-axis rotation (roll) for flat surface alignment - instant snap
    const targetRotationZ = 0
    
    // Instantly snap Z rotation to 0 when on floor
    state.boardTargetRotation.z = targetRotationZ
    state.angularVelocity.z = 0
}

function applyManualPitchRotation() {
    if (!state.sceneObjects.boardMesh) return
    
    // With rotation order 'YXZ', rotation.x rotates around the local X axis
    // (after Y rotation is applied). When airborne, there's no alignment, so just use manual pitch
    state.boardTargetRotation.x = state.physics.manualPitch
    state.physics.alignedRotationX = 0  // No alignment when airborne
}

function handleManualSystem() {
    if (!state.sceneObjects.boardMesh) return
    
    // Handle airborne board dipping (only when NOT in manual)
    if (!state.physics.isOnFloor && !state.physics.isGrinding && !state.physics.isInManual) {
        // Allow scrollwheel to dip board forward/backward relative to board's orientation
        if (Math.abs(state.input.scrollDelta) > 0.1) {
            // Normalize scroll delta to prevent huge jumps (typical scroll is ~100, cap it)
            const normalizedScroll = Math.max(-100, Math.min(100, state.input.scrollDelta))
            const dipChange = -normalizedScroll * MANUAL_DIP_SPEED
            
            // Update target manual pitch (relative to board's orientation)
            state.physics.targetManualPitch += dipChange
            state.physics.targetManualPitch = Math.max(MANUAL_MIN_DIP, Math.min(MANUAL_MAX_DIP, state.physics.targetManualPitch))
            
            state.input.scrollDelta = 0
        }
        
        // Smoothly interpolate manual pitch towards target
        const pitchDiff = state.physics.targetManualPitch - state.physics.manualPitch
        state.physics.manualPitch += pitchDiff * MANUAL_DIP_SMOOTHING
        
        // Always apply manual pitch rotation when airborne (if pitch is non-zero)
        // This must happen AFTER handleMouseSteering() has updated rotation.y
        if (Math.abs(state.physics.manualPitch) > 0.001) {
            applyManualPitchRotation()
        } else {
            // Reset rotation.x to upright (0) if no manual pitch
            state.boardTargetRotation.x = 0
            state.physics.targetManualPitch = 0  // Reset target too
        }
    }
    
    // Check if we should enter manual on landing
    const justLanded = state.physics.previousIsOnFloor === false && state.physics.isOnFloor
    // Only enter manual if we just landed, aren't grinding, aren't already in manual, and have sufficient dip
    if (justLanded && !state.physics.isGrinding && !state.physics.isInManual) {
        // Check if board is upside down - don't enter manual if upside down (use target rotation for physics accuracy)
        const { isUpsideDown } = checkUpsideDown(state.boardTargetRotation.z)
        if (isUpsideDown) {
            // Reset manual pitch if upside down
            state.physics.manualPitch = 0
            state.physics.targetManualPitch = 0
            // Snap board to flat (or ramp-aligned) rotation
            state.boardTargetRotation.x = state.physics.alignedRotationX
        } else {
            const currentDip = Math.abs(state.physics.manualPitch)
            if (currentDip >= MANUAL_DIP_THRESHOLD) {
                // Enter manual state
                state.physics.isInManual = true
                // Store the pitch angle we entered with (this is the center/base angle)
                state.physics.manualEntryPitch = state.physics.manualPitch
                // Set initial balance based on dip amount
                // Shallow dips are punished by starting balance near the opposite edge
                // This encourages landing with a moderate dip (not too shallow, not too extreme)
                // Map manualPitch from [MANUAL_MIN_DIP, MANUAL_MAX_DIP] to balance [0.1, 0.9]
                // Shallow forward dip (small positive) → balance near bottom (0.1) - opposite side
                // Shallow backward dip (small negative) → balance near top (0.9) - opposite side
                // Moderate forward dip → balance near center (0.5)
                // Moderate backward dip → balance near center (0.5)
                // Extreme forward dip → balance near top (0.9) - forward side
                // Extreme backward dip → balance near bottom (0.1) - backward side
                const normalizedPitch = state.physics.manualPitch / MANUAL_MAX_DIP  // Maps [-0.3, 0.3] to [-1, 1]
                const absNormalizedPitch = Math.abs(normalizedPitch)
                // Create U-shaped curve: shallow dips (small abs) map to opposite edges, moderate/extreme map to same side
                // Formula: balance = 0.5 + normalizedPitch * (2 * absNormalizedPitch - 1) * 0.4
                // When abs is small (shallow): (2*abs - 1) is negative, so balance goes to opposite side
                // When abs is large (extreme): (2*abs - 1) is positive, so balance goes to same side
                // When abs = 0.5 (moderate): (2*0.5 - 1) = 0, so balance = 0.5 (center)
                const curveFactor = (2 * absNormalizedPitch - 1) * 0.4
                state.physics.manualBalance = 0.5 + normalizedPitch * curveFactor
                // Clamp to [0.15, 0.85] to leave more room at edges for shallow dips to correct
                // This gives shallow dips 0.1 units of space before failure (instead of 0.05)
                state.physics.manualBalance = Math.max(0.15, Math.min(0.85, state.physics.manualBalance))
                state.physics.manualBalanceDirection = Math.random() > 0.5 ? 1 : -1  // Random initial direction
                
                // Calculate and apply manual pitch rotation based on balance position
                const normalizedBalance = (state.physics.manualBalance - 0.5) * 2
                state.physics.manualPitch = state.physics.manualEntryPitch + normalizedBalance * MANUAL_MAX_DIP
                
                // Apply manual pitch rotation - collision system will adjust position if needed
                state.boardTargetRotation.x = state.physics.alignedRotationX + state.physics.manualPitch
                
                // Show balance UI
                if (state.ui.manualBalanceBar) {
                    state.ui.manualBalanceBar.style.display = 'block'
                }
            } else {
                // Reset manual pitch if not entering manual
                state.physics.manualPitch = 0
                state.physics.targetManualPitch = 0
                // Snap board to flat (or ramp-aligned) rotation
                state.boardTargetRotation.x = state.physics.alignedRotationX
            }
        }
    }
    
    // Handle manual balance mechanics
    if (state.physics.isInManual && state.physics.isOnFloor) {
        // Check if board is upside down or falling - exit manual if so (use target rotation for physics accuracy)
        const { isUpsideDown } = checkUpsideDown(state.boardTargetRotation.z)
        const isFalling = state.boardVelocity.y < -0.01  // Falling if vertical velocity is negative
        
        if (isUpsideDown || isFalling) {
            // Exit manual if upside down or falling
            state.physics.isInManual = false
            state.physics.manualBalance = 0.5
            state.physics.manualBalanceDirection = 1
            state.physics.manualPitch = 0  // Reset pitch
            state.physics.targetManualPitch = 0
            
            // Hide balance UI
            if (state.ui.manualBalanceBar) {
                state.ui.manualBalanceBar.style.display = 'none'
            }
            return  // Exit early, don't process balance mechanics
        }
        
        // Map balance position (0.0 to 1.0) to manual pitch angle
        // balance = 0.0 (bottom) → tail manual (entry pitch - max dip)
        // balance = 0.5 (center) → entry pitch (angle we started with)
        // balance = 1.0 (top) → nose manual (entry pitch + max dip)
        const normalizedBalance = (state.physics.manualBalance - 0.5) * 2  // Maps 0.0-1.0 to -1.0 to 1.0
        state.physics.manualPitch = state.physics.manualEntryPitch + normalizedBalance * MANUAL_MAX_DIP
        
        // Apply manual pitch rotation to board based on balance position
        // Add manual pitch on top of aligned rotation
        // With rotation order 'YXZ', rotation.x rotates around local X axis
        const previousRotationX = state.boardTargetRotation.x
        state.boardTargetRotation.x = state.physics.alignedRotationX + state.physics.manualPitch
        
        // Adjust board position to prevent clipping into ground when rotating
        // Calculate how much the rotation changed the lowest point
        const previousBottomY = state.sceneObjects.boardMesh.position.y - BOARD_HALF_HEIGHT - Math.abs(Math.sin(previousRotationX)) * BOARD_HALF_LENGTH
        const newBottomY = getBoardBottomY()
        const bottomYChange = newBottomY - previousBottomY
        
        // If rotation lowered the bottom, raise the board to compensate
        if (bottomYChange < 0) {
            state.sceneObjects.boardMesh.position.y -= bottomYChange
        }
        
        // Apply scrollwheel input to change direction
        if (Math.abs(state.input.scrollDelta) > 0.1) {
            // Normalize scroll delta to prevent huge jumps
            const normalizedScroll = Math.max(-100, Math.min(100, state.input.scrollDelta))
            
            // Change direction based on scroll (negative scroll = scroll up = move balance up = direction 1)
            // Positive scroll = scroll down = move balance down = direction -1
            if (normalizedScroll < 0) {
                state.physics.manualBalanceDirection = 1  // Move up
            } else if (normalizedScroll > 0) {
                state.physics.manualBalanceDirection = -1  // Move down
            }
            
            state.input.scrollDelta = 0
        }
        
        // Move balance at constant linear speed in current direction
        state.physics.manualBalance += state.physics.manualBalanceDirection * MANUAL_BALANCE_LINEAR_SPEED
        
        // Clamp balance between 0 and 1
        state.physics.manualBalance = Math.max(0, Math.min(1, state.physics.manualBalance))
        
        // Check for failure (balance reached top or bottom)
        if (state.physics.manualBalance <= MANUAL_BALANCE_FAILURE_THRESHOLD || 
            state.physics.manualBalance >= 1 - MANUAL_BALANCE_FAILURE_THRESHOLD) {
            // Exit manual
            state.physics.isInManual = false
            state.physics.manualBalance = 0.5
            state.physics.manualBalanceDirection = 1
            state.physics.manualPitch = 0  // Reset pitch
            state.physics.targetManualPitch = 0
            state.physics.manualEntryPitch = 0  // Reset entry pitch
            
            // Hide balance UI
            if (state.ui.manualBalanceBar) {
                state.ui.manualBalanceBar.style.display = 'none'
            }
        }
        
        // Update balance UI
        updateManualBalanceUI()
    } else if (state.physics.isInManual && !state.physics.isOnFloor) {
        // Exit manual if we leave the ground
        state.physics.isInManual = false
        state.physics.manualBalance = 0.5
        state.physics.manualBalanceDirection = 1
        state.physics.manualEntryPitch = 0  // Reset entry pitch
        // Keep manual pitch when leaving ground (for air tricks)
        
        // Hide balance UI
        if (state.ui.manualBalanceBar) {
            state.ui.manualBalanceBar.style.display = 'none'
        }
    }
    
    // Return board to normal if manual failed (apply pitch rotation)
    if (!state.physics.isInManual && state.physics.isOnFloor && 
        state.physics.currentSurface !== 'ramp' &&
        Math.abs(state.physics.manualPitch) > 0.01) {
        // Smoothly return manual pitch to zero
        state.physics.manualPitch *= (1 - MANUAL_RETURN_SPEED)
        if (Math.abs(state.physics.manualPitch) < 0.01) {
            state.physics.manualPitch = 0
        }
        
        // Apply the pitch rotation to board using simple rotation.x
        state.boardTargetRotation.x = state.physics.manualPitch
    }
    
    // Reset scroll delta if not being used
    if (state.input.scrollDelta !== 0 && Math.abs(state.input.scrollDelta) < 0.1) {
        state.input.scrollDelta = 0
    }
}

function updateManualBalanceUI() {
    if (!state.ui.manualBalanceLine || !state.ui.manualBalanceBar) return
    
    // Calculate position from balance (0.0 = bottom, 1.0 = top)
    const barHeight = MANUAL_BALANCE_BAR_HEIGHT
    const lineHeight = MANUAL_BALANCE_LINE_WIDTH
    const maxTop = barHeight - lineHeight
    const smoothPosition = (1 - state.physics.manualBalance) * maxTop
    
    // Snap to discrete pixel steps (every 2 pixels for visible stepping)
    const stepSize = MANUAL_BALANCE_LINE_WIDTH
    const steppedPosition = Math.round(smoothPosition / stepSize) * stepSize
    
    state.ui.manualBalanceLine.style.top = `${steppedPosition}px`
}

function handleRotationInput() {
    // Cannot use A/D keys while grinding
    if (state.physics.isGrinding) return
    
    const swapEnabled = isSwapShuvFlipEnabled()
    
    if (!state.physics.isOnFloor) {
        if (swapEnabled) {
            // Swapped: A/D keys control shuv (Y rotation)
            // Check if A or D was just released
            if (state.previousKeys['KeyD'] && !state.keys['KeyD']) {
                playRandomCatchSound(state.audio.catchSounds)
                alignBoardToCamera()  // Snap Y rotation on release
            } else if (state.previousKeys['KeyA'] && !state.keys['KeyA']) {
                playRandomCatchSound(state.audio.catchSounds)
                alignBoardToCamera()  // Snap Y rotation on release
            }
            
            if (state.keys['KeyD'] && !state.previousKeys['KeyD']) {
                playRandomCatchSound(state.audio.catchSounds)
            } else if (state.keys['KeyA'] && !state.previousKeys['KeyA']) {
                playRandomCatchSound(state.audio.catchSounds)
            }

            // Handle current key presses - continuously rotate Y axis (shuv)
            // Shuv rotation is additive to camera rotation velocity for consistency
            if (!state.physics.isGrinding) {
                state.boardTargetRotation.y += state.input.airborneCameraRotationVelocity
            }
            
            if (state.keys['KeyD']) {
                state.boardTargetRotation.y -= SHUV_A_D_ROTATION_SPEED
            } else if (state.keys['KeyA']) {
                state.boardTargetRotation.y += SHUV_A_D_ROTATION_SPEED
            }
        } else {
            // Normal: A/D keys control barrel roll (Z rotation)
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
                state.angularVelocity.z = KICKFLIP_A_D_ROTATION_SPEED
                state.snap.snapTargetZ = null  // Cancel snapping if key is pressed
                state.snap.snapStartRotationZ = null
                state.snap.previousSnapRotationZ = null
            } else if (state.keys['KeyA']) {
                state.angularVelocity.z = -KICKFLIP_A_D_ROTATION_SPEED
                state.snap.snapTargetZ = null  // Cancel snapping if key is pressed
                state.snap.snapStartRotationZ = null
                state.snap.previousSnapRotationZ = null
            } else {
                state.angularVelocity.z = 0
            }
        }
    }
    
    // Update previous keys state
    state.previousKeys['KeyA'] = state.keys['KeyA']
    state.previousKeys['KeyD'] = state.keys['KeyD']
}

export function snapRotationToNearest180() {
    if (!state.sceneObjects.boardMesh) return
    
    const currentRotation = normalizeAngle(state.boardTargetRotation.z, ANGLE_NORMALIZATION_MAX_ATTEMPTS)
    
    // Options are 0 and π (180 degrees)
    const option1 = 0
    const option2 = PI
    
    // Calculate distances to both options using shortest angle diff
    const dist1 = Math.abs(shortestAngleDiff(currentRotation, option1))
    const dist2 = Math.abs(shortestAngleDiff(currentRotation, option2))
    
    // Set target to whichever is closer (will be smoothly interpolated)
    state.snap.snapTargetZ = dist1 < dist2 ? 0 : PI
    
    // Track rotation when snap starts (for counting snap rotation in flips)
    state.snap.snapStartRotationZ = state.boardTargetRotation.z
    state.snap.previousSnapRotationZ = state.boardTargetRotation.z
    state.snap.snapRotationAccumulator = 0  // Reset snap rotation accumulator
    
    // Stop angular velocity when snapping starts
    state.angularVelocity.z = 0
}

function handleSmoothSnapping() {
    if (!state.sceneObjects.boardMesh) return
    
    // Smooth snap z-axis rotation (A/D release)
    if (state.snap.snapTargetZ !== null) {
        const currentZ = normalizeAngle(state.boardTargetRotation.z, ANGLE_NORMALIZATION_MAX_ATTEMPTS)
        
        // Calculate shortest path to target
        const diff = shortestAngleDiff(currentZ, state.snap.snapTargetZ)
        
        // Track rotation during snap for completion detection
        if (state.snap.previousSnapRotationZ !== null && state.snap.snapStartRotationZ !== null) {
            const frameSnapDelta = shortestAngleDiff(
                state.snap.previousSnapRotationZ,
                state.boardTargetRotation.z
            )
            state.snap.snapRotationAccumulator += frameSnapDelta
        } else if (state.snap.previousSnapRotationZ === null) {
            state.snap.previousSnapRotationZ = state.boardTargetRotation.z
        }
        
        // If very close, snap directly and clear target
        if (Math.abs(diff) < SNAP_COMPLETION_THRESHOLD) {
            // Calculate final snap rotation
            if (state.snap.snapStartRotationZ !== null) {
                const finalSnapDelta = shortestAngleDiff(
                    state.snap.snapStartRotationZ,
                    state.snap.snapTargetZ
                )
                state.snap.snapRotationAccumulator = finalSnapDelta
            }
            
            state.snap.previousSnapRotationZ = state.boardTargetRotation.z  // Store final rotation before clearing
            state.boardTargetRotation.z = state.snap.snapTargetZ
            state.snap.snapTargetZ = null
            // Don't clear snapStartRotationZ and previousSnapRotationZ here - let trick detection handle it
        } else {
            // Smoothly interpolate towards target
            const step = diff * SNAP_SPEED
            state.boardTargetRotation.z += step
            state.snap.previousSnapRotationZ = state.boardTargetRotation.z
        }
    }
}

/**
 * Check if player has fallen off the map and teleport back to spawn
 */
function handleFallDetection() {
    if (!state.sceneObjects.boardMesh) return
    
    const FALL_THRESHOLD = -10  // Y position threshold for falling off map
    
    // Check if player has fallen below threshold
    if (state.sceneObjects.boardMesh.position.y < FALL_THRESHOLD) {
        // Teleport back to spawn position
        state.sceneObjects.boardMesh.position.set(
            state.SPAWN_POSITION.x,
            state.SPAWN_POSITION.y,
            state.SPAWN_POSITION.z
        )
        
        // Reset velocity to prevent falling immediately after respawn
        state.boardVelocity.x = 0
        state.boardVelocity.y = 0
        state.boardVelocity.z = 0
        
        // Reset angular velocity
        state.angularVelocity.x = 0
        state.angularVelocity.z = 0
        
        // Reset rotation to default (flat on ground)
        state.sceneObjects.boardMesh.rotation.x = Math.PI / 2
        state.sceneObjects.boardMesh.rotation.y = 0
        state.sceneObjects.boardMesh.rotation.z = 0
        
        // Update target rotation to match
        state.boardTargetRotation.x = Math.PI / 2
        state.boardTargetRotation.y = 0
        state.boardTargetRotation.z = 0
        
        // Exit any active states
        state.physics.isGrinding = false
        state.physics.isInManual = false
        state.physics.isOnFloor = true
    }
}

/**
 * Check if player is too far from center and teleport back to center
 */
function handleBoundaryTeleport() {
    if (!state.sceneObjects.boardMesh) return
    
    const MAX_DISTANCE = 25  // Maximum distance from center (0, 0, 0)
    const CENTER_Y = FLOOR_Y + BOARD_HALF_HEIGHT  // Center Y position (on floor)
    
    const pos = state.sceneObjects.boardMesh.position
    const distanceFromCenter = Math.sqrt(pos.x * pos.x + pos.z * pos.z)  // Only check X and Z distance
    
    // Check if player is further than MAX_DISTANCE from center
    if (distanceFromCenter > MAX_DISTANCE) {
        // Teleport back to center of map
        state.sceneObjects.boardMesh.position.set(0, CENTER_Y, 0)
        
        // Reset velocity to prevent immediate re-teleportation
        state.boardVelocity.x = 0
        state.boardVelocity.y = 0
        state.boardVelocity.z = 0
        
        // Reset angular velocity
        state.angularVelocity.x = 0
        state.angularVelocity.z = 0
        
        // Reset rotation to default (flat on ground)
        state.sceneObjects.boardMesh.rotation.x = Math.PI / 2
        state.sceneObjects.boardMesh.rotation.y = 0
        state.sceneObjects.boardMesh.rotation.z = 0
        
        // Update target rotation to match
        state.boardTargetRotation.x = Math.PI / 2
        state.boardTargetRotation.y = 0
        state.boardTargetRotation.z = 0
        
        // Exit any active states
        state.physics.isGrinding = false
        state.physics.isInManual = false
        state.physics.isOnFloor = true
    }
}

export function updateBoardTransform() {
    if (!state.sceneObjects.boardMesh) return
    state.boardTransform.position.x = state.sceneObjects.boardMesh.position.x
    state.boardTransform.position.y = state.sceneObjects.boardMesh.position.y
    state.boardTransform.position.z = state.sceneObjects.boardMesh.position.z
    // Use target rotation for transform (physics always accurate)
    state.boardTransform.rotation.x = state.boardTargetRotation.x
    state.boardTransform.rotation.y = state.boardTargetRotation.y
    state.boardTransform.rotation.z = state.boardTargetRotation.z
}

/**
 * Updates board visual rotation at throttled rate (BOARD_REFRESH_RATE)
 * Physics continues at full speed, but visual updates are limited
 * Camera turning (Y rotation from mouse) updates smoothly, shuvs and flips/rolls are choppy
 * @param {number} deltaTime - Time since last frame in seconds
 */
export function updateBoardVisualRotation(deltaTime) {
    if (!state.sceneObjects.boardMesh) return
    
    const BOARD_REFRESH_DELTA = 1 / BOARD_REFRESH_RATE
    
    // Check if shuv is happening (right-click held or A/D keys pressed)
    const isShuvActive = state.input.isRightMouseHeld || state.keys['KeyA'] || state.keys['KeyD']
    
    // Accumulate time for choppy rotations (X, Z, and Y when shuv is active)
    state.boardVisualTiming.accumulatedTime += deltaTime
    
    // Update choppy rotations only when enough time has passed
    while (state.boardVisualTiming.accumulatedTime >= BOARD_REFRESH_DELTA) {
        // X and Z rotations are always choppy
        state.sceneObjects.boardMesh.rotation.x = state.boardTargetRotation.x
        state.sceneObjects.boardMesh.rotation.z = state.boardTargetRotation.z
        
        // Y rotation is choppy only when shuv is active, otherwise smooth (camera turning)
        if (isShuvActive) {
            state.sceneObjects.boardMesh.rotation.y = state.boardTargetRotation.y
        }
        
        state.boardVisualTiming.accumulatedTime -= BOARD_REFRESH_DELTA
    }
    
    // Y rotation updates smoothly every frame when NOT doing shuvs (camera turning)
    if (!isShuvActive) {
        state.sceneObjects.boardMesh.rotation.y = state.boardTargetRotation.y
    }
}

export function handleJump() {
    // Can jump from floor or while grinding
    if (state.physics.isOnFloor || state.physics.isGrinding) {
        state.boardVelocity.y = JUMP_IMPULSE
        
        // Reset manual pitch when jumping
        state.physics.manualPitch = 0
        state.physics.targetManualPitch = 0
        
        // Reset board rotation.x to upright position (0, same as floor alignment)
        state.boardTargetRotation.x = 0
        
        // Stop grinding if jumping from rail
        if (state.physics.isGrinding) {
            stopGrinding()
        }
        
        // Detect if jumping while going backward (fakie)
        // Improved detection: check both key press and velocity direction
        if (state.sceneObjects.boardMesh) {
            const forwardX = Math.sin(state.boardTargetRotation.y)
            const forwardZ = Math.cos(state.boardTargetRotation.y)
            
            // Calculate velocity dot product with forward direction
            const velocityDotForward = state.boardVelocity.x * forwardX + state.boardVelocity.z * forwardZ
            const speed = Math.sqrt(state.boardVelocity.x ** 2 + state.boardVelocity.z ** 2)
            
            // Fakie if: S key is pressed OR (moving backward with significant speed)
            const isMovingBackward = state.keys['KeyS'] || 
                (speed > 0.01 && velocityDotForward < -0.1)  // Moving backward with minimum speed
            
            state.trickStats.wasFakie = isMovingBackward
        }
        
        // Play random pop sound
        if (state.audio.popSounds && state.audio.popSounds.length > 0) {
            const randomPop = state.audio.popSounds[Math.floor(Math.random() * state.audio.popSounds.length)]
            randomPop.currentTime = 0  // Reset to start
            randomPop.play().catch(err => {
                // Ignore AbortError and NotAllowedError (expected in some cases)
                if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
                    error('Error playing pop sound:', err)
                }
            })
        }
    }
}

function updateRailGlow() {
    if (!state.sceneObjects.railMesh || !state.sceneObjects.boardMesh || !state.sceneObjects.railMaterials) return
    
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
    const boardPos = state.sceneObjects.boardMesh.position
    const distance = getDistanceToRail(boardPos)
    
    // Glow when within threshold
    if (distance < RAIL_GLOW_DISTANCE) {
        // Calculate glow intensity based on proximity (closer = brighter)
        const glowIntensity = RAIL_GLOW_MAX_INTENSITY * (1 - distance / RAIL_GLOW_DISTANCE)
        
        // Apply red glow to rail materials
        state.sceneObjects.railMaterials.forEach(({ mesh }) => {
            if (mesh.material) {
                if (!mesh.material.emissive) {
                    mesh.material.emissive = new THREE.Color(0x000000)
                }
                mesh.material.emissive.setRGB(glowIntensity, 0, 0)  // Red glow
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
    if (!state.sceneObjects.railMesh || !state.sceneObjects.boardMesh) return false
    
    // Only start grinding if airborne, close to rail, and left mouse is held
    if (state.physics.isOnFloor) return false
    if (!state.input.isLeftMouseHeld) return false
    
    // Cannot grind while right-click is held
    if (state.input.isRightMouseHeld) return false
    
    // Cannot grind while A/D keys are held
    if (state.keys['KeyA'] || state.keys['KeyD']) return false
    
    // Cannot grind if board is upside down (use target rotation for physics accuracy)
    const { isUpsideDown } = checkUpsideDown(state.boardTargetRotation.z)
    if (isUpsideDown) return false
    
    const boardPos = state.sceneObjects.boardMesh.position
    const distance = getDistanceToRail(boardPos)
    
    // Must be within threshold to start grinding
    if (distance > RAIL_GRIND_DISTANCE_THRESHOLD) return false
    
    // Snap board position to rail
    const railPos = state.sceneObjects.railMesh.position
    const railDirX = Math.sin(RAIL_ANGLE)
    const railDirZ = Math.cos(RAIL_ANGLE)
    
    // Project current position onto rail
    const toRailX = boardPos.x - railPos.x
    const toRailZ = boardPos.z - railPos.z
    const projection = toRailX * railDirX + toRailZ * railDirZ
    
    // Set position on rail
    state.sceneObjects.boardMesh.position.x = railPos.x + railDirX * projection
    state.sceneObjects.boardMesh.position.z = railPos.z + railDirZ * projection
    state.sceneObjects.boardMesh.position.y = railPos.y + BOARD_HALF_HEIGHT
    
    // Calculate grind direction from momentum
    const momentumDotRail = state.boardVelocity.x * railDirX + state.boardVelocity.z * railDirZ
    state.physics.railGrindDirection = Math.abs(momentumDotRail) > MIN_MOMENTUM_DOT_RAIL 
        ? (momentumDotRail > 0 ? 1 : -1) 
        : 1
    
    // Start grinding
    state.physics.isGrinding = true
    
    // Trigger screen shake on grind start
    triggerScreenShake(0.15)
    
    // Detect trick done before entering grind and add to combo
    // This will also reset trick stats and restart tracking for tricks after leaving grind
    addGrindToCombo()
    
    // Play rail sound if available (only start if not already playing)
    if (state.audio.railSound && state.audio.railSound.paused) {
        state.audio.railSound.currentTime = 0
        state.audio.railSound.play().catch(err => {
            // Ignore errors if sound is already playing or interrupted
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
                error('Error playing rail sound:', err)
            }
        })
    }
    
    return true
}

export function alignBoardToCamera() {
    if (!state.sceneObjects.boardMesh) return
    
    // Calculate camera's angle
    const dx = state.sceneObjects.camera.position.x - state.boardTransform.position.x
    const dz = state.sceneObjects.camera.position.z - state.boardTransform.position.z
    
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
    
    // Get current board rotation before snap (use target rotation for physics accuracy)
    let currentRotation = state.boardTargetRotation.y
    
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
        targetRotation = normalizeAngle(option2 + PI, ANGLE_NORMALIZATION_MAX_ATTEMPTS)
    }
    
    // Calculate rotation direction for shuv (positive = clockwise, negative = counterclockwise)
    const rotationDelta = shortestAngleDiff(currentRotationNormalized, targetRotation)
    
    // If airborne, store snap rotation for shuv tracker
    // The shuv tracker will handle counting when right-click is released
    if (!state.physics.isOnFloor) {
        // Store snap start rotation if not already stored (use target rotation for physics accuracy)
        if (state.snap.shuvSnapStartRotationY === null) {
            state.snap.shuvSnapStartRotationY = state.boardTargetRotation.y
        }
        
        // Store the exact snap rotation amount
        // This will be applied to the shuv tracker when right-click is released
        state.snap.shuvSnapRotationAccumulator = isFinite(rotationDelta) ? rotationDelta : 0
    }
    
    // Apply the snap
    state.boardTargetRotation.y = targetRotation
    
    // Update transform to reflect the change
    updateBoardTransform()
}

