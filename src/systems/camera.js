import * as state from "../core/state.js"
import { CAMERA_FOLLOW_DISTANCE, CAMERA_FOLLOW_HEIGHT } from "../config/constants.js"
import { isSwapShuvFlipEnabled } from "../config/settings.js"

// ============================================================================
// CAMERA
// ============================================================================

// Screen shake state
let shakeOffset = { x: 0, y: 0, z: 0 }
let shakeIntensity = 0
let shakeDecay = 0.9  // How quickly shake fades

export function triggerScreenShake(intensity = 0.15) {
    shakeIntensity = Math.max(shakeIntensity, intensity)
}

function updateScreenShake() {
    if (shakeIntensity > 0.01) {
        // Generate random shake offset
        shakeOffset.x = (Math.random() - 0.5) * shakeIntensity
        shakeOffset.y = (Math.random() - 0.5) * shakeIntensity
        shakeOffset.z = (Math.random() - 0.5) * shakeIntensity
        
        // Decay shake intensity
        shakeIntensity *= shakeDecay
    } else {
        shakeOffset.x = 0
        shakeOffset.y = 0
        shakeOffset.z = 0
        shakeIntensity = 0
    }
}

export function updateCameraFollow() {
    if (!state.sceneObjects.boardMesh) return
    
    // Update screen shake
    updateScreenShake()
    
    let behindX, behindZ
    
    const swapEnabled = isSwapShuvFlipEnabled()
    const shouldDetachCamera = swapEnabled 
        ? (state.keys['KeyA'] || state.keys['KeyD']) 
        : state.input.isRightMouseHeld
    
    if (shouldDetachCamera) {
        // Camera retains its current angle while detached (board can rotate independently)
        // In air: continue rotating at locked velocity
        if (!state.physics.isOnFloor) {
            state.input.fixedCameraAngle += state.input.airborneCameraRotationVelocity
        }
        behindX = Math.sin(state.input.fixedCameraAngle) * CAMERA_FOLLOW_DISTANCE
        behindZ = Math.cos(state.input.fixedCameraAngle) * CAMERA_FOLLOW_DISTANCE
    } else {
        // Camera stays behind board based on its rotation
        behindX = -Math.sin(state.boardTransform.rotation.y) * CAMERA_FOLLOW_DISTANCE
        behindZ = -Math.cos(state.boardTransform.rotation.y) * CAMERA_FOLLOW_DISTANCE
    }
    
    // Position camera at fixed offset - moves directly with board, add shake
    state.sceneObjects.camera.position.x = state.boardTransform.position.x + behindX + shakeOffset.x
    state.sceneObjects.camera.position.y = state.boardTransform.position.y + CAMERA_FOLLOW_HEIGHT + shakeOffset.y
    state.sceneObjects.camera.position.z = state.boardTransform.position.z + behindZ + shakeOffset.z
    
    // Make camera look at the board
    state.sceneObjects.controls.target.set(
        state.boardTransform.position.x,
        state.boardTransform.position.y,
        state.boardTransform.position.z
    )
    state.sceneObjects.controls.update()
}

