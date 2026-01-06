import * as state from "./state.js"
import { playRandomCatchSound } from "./sound.js"
import { handleJump, alignBoardToCamera, stopGrinding } from "./physics.js"

// ============================================================================
// INPUT HANDLING
// ============================================================================

export function handleKeyDown(event) {
    state.keys[event.code] = true
    if (!state.previousKeys.hasOwnProperty(event.code)) {
        state.previousKeys[event.code] = false
    }
    
    if (event.key.toLowerCase() === 'o') {
        state.sceneObjects.controls.enabled = !state.sceneObjects.controls.enabled
        
        // Unlock pointer when switching to orbit mode
        if (state.sceneObjects.controls.enabled && state.input.isPointerLocked) {
            document.exitPointerLock = document.exitPointerLock || 
                                      document.mozExitPointerLock || 
                                      document.webkitExitPointerLock
            if (document.exitPointerLock) {
                document.exitPointerLock()
            }
        }
    }
    
    if (event.code === 'Space') {
        event.preventDefault()
        handleJump()
    }
}

export function handleKeyUp(event) {
    state.keys[event.code] = false
    if (!state.previousKeys.hasOwnProperty(event.code)) {
        state.previousKeys[event.code] = false
    }
}

export function handleMouseMove(event) {
    // Only track mouse movement when in attached mode and pointer is locked
    if (!state.sceneObjects.controls.enabled && state.input.isPointerLocked) {
        const movement = event.movementX || event.mozMovementX || event.webkitMovementX || 0
        state.input.mouseDeltaX += movement
    }
}

export function handleMouseClick(event) {
    // Lock pointer when clicking in attached mode (left click only)
    if (!state.sceneObjects.controls.enabled && event.button === 0) {
        const canvas = state.sceneObjects.renderer.domElement
        canvas.requestPointerLock = canvas.requestPointerLock || 
                                    canvas.mozRequestPointerLock || 
                                    canvas.webkitRequestPointerLock
        
        if (canvas.requestPointerLock) {
            canvas.requestPointerLock()
        }
    }
}

export function handleMouseDown(event) {
    if (!state.sceneObjects.controls.enabled) {
        // Handle left-click
        if (event.button === 0) {
            state.input.isLeftMouseHeld = true
        }
        
        // Handle right-click even when pointer is locked
        if (event.button === 2) {
            // Cannot right-click while grinding
            if (state.physics.isGrinding) {
                event.preventDefault()
                return
            }
            
            event.preventDefault()
            state.input.isRightMouseHeld = true

            if (!state.physics.isOnFloor) {
                playRandomCatchSound(state.audio.catchSounds)
                // Store initial board rotation when right-click starts in air
                if (state.sceneObjects.cubeMesh) {
                    state.tricks.boardRotationOnRightClickStart = state.sceneObjects.cubeMesh.rotation.y
                    state.tricks.previousBoardYRightClick = state.sceneObjects.cubeMesh.rotation.y
                    state.tricks.cumulativeBoardRotationRightClick = 0
                    state.tricks.boardRotationDirectionRightClick = 0
                }
            }
            // Store current camera angle when right mouse is pressed
            const dx = state.sceneObjects.camera.position.x - state.cubeTransform.position.x
            const dz = state.sceneObjects.camera.position.z - state.cubeTransform.position.z
            state.input.fixedCameraAngle = Math.atan2(dx, dz)
        }
    }
}

export function handleMouseUp(event) {
    if (!state.sceneObjects.controls.enabled) {
        // Release left mouse button
        if (event.button === 0) {
            // If grinding, jump when releasing left click
            // handleJump will stop grinding if needed
            if (state.physics.isGrinding) {
                handleJump()
            }
            state.input.isLeftMouseHeld = false
        }
        
        // Release right mouse button
        if (event.button === 2) {
            event.preventDefault()
            state.input.isRightMouseHeld = false
            
            // Play catch sound if in air
            if (!state.physics.isOnFloor) {
                playRandomCatchSound(state.audio.catchSounds)
            }
            
            // Align board to face camera, snapped to nearest 180-degree orientation
            alignBoardToCamera()
        }
    }
}

export function handleRightClick(event) {
    // Prevent context menu in attached mode
    if (!state.sceneObjects.controls.enabled) {
        event.preventDefault()
    }
}


// Handle pointer lock changes
export function initPointerLock() {
    document.addEventListener('pointerlockchange', onPointerLockChange)
    document.addEventListener('mozpointerlockchange', onPointerLockChange)
    document.addEventListener('webkitpointerlockchange', onPointerLockChange)
}

function onPointerLockChange() {
    state.input.isPointerLocked = document.pointerLockElement === state.sceneObjects.renderer.domElement ||
                     document.mozPointerLockElement === state.sceneObjects.renderer.domElement ||
                     document.webkitPointerLockElement === state.sceneObjects.renderer.domElement
}

