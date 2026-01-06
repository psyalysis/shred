import * as state from "./state.js"
import { CAMERA_FOLLOW_DISTANCE, CAMERA_FOLLOW_HEIGHT } from "./constants.js"

// ============================================================================
// CAMERA
// ============================================================================

export function updateCameraFollow() {
    if (!state.sceneObjects.cubeMesh) return
    
    let behindX, behindZ
    
    if (state.input.isRightMouseHeld) {
        // Camera retains its current angle while right mouse is held (cube can rotate independently)
        // In air: continue rotating at locked velocity
        if (!state.physics.isOnFloor) {
            state.input.fixedCameraAngle += state.input.airborneCameraRotationVelocity
        }
        behindX = Math.sin(state.input.fixedCameraAngle) * CAMERA_FOLLOW_DISTANCE
        behindZ = Math.cos(state.input.fixedCameraAngle) * CAMERA_FOLLOW_DISTANCE
    } else {
        // Camera stays behind cube based on its rotation
        behindX = -Math.sin(state.cubeTransform.rotation.y) * CAMERA_FOLLOW_DISTANCE
        behindZ = -Math.cos(state.cubeTransform.rotation.y) * CAMERA_FOLLOW_DISTANCE
    }
    
    // Position camera at fixed offset - moves directly with cube
    state.sceneObjects.camera.position.x = state.cubeTransform.position.x + behindX
    state.sceneObjects.camera.position.y = state.cubeTransform.position.y + CAMERA_FOLLOW_HEIGHT
    state.sceneObjects.camera.position.z = state.cubeTransform.position.z + behindZ
    
    // Make camera look at the cube
    state.sceneObjects.controls.target.set(
        state.cubeTransform.position.x,
        state.cubeTransform.position.y,
        state.cubeTransform.position.z
    )
    state.sceneObjects.controls.update()
}

