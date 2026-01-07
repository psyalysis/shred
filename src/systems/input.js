import * as state from "../core/state.js"
import { playRandomCatchSound } from "./sound.js"
import { handleJump, alignBoardToCamera, stopGrinding, snapRotationToNearest180 } from "./physics.js"
import { toggleSettings, isSwapShuvFlipEnabled } from "../config/settings.js"
import { toggleMenu } from "../core/init.js"

// ============================================================================
// INPUT HANDLING
// ============================================================================

export function handleKeyDown(event) {
    state.keys[event.code] = true
    if (!state.previousKeys.hasOwnProperty(event.code)) {
        state.previousKeys[event.code] = false
    }
    
    // Handle camera detachment when swap is enabled and A/D keys are pressed
    const swapEnabled = isSwapShuvFlipEnabled()
    if (swapEnabled && (event.code === 'KeyD' || event.code === 'KeyA')) {
        if (!state.previousKeys[event.code]) {
            // Key was just pressed - store current camera angle for detachment
            const dx = state.sceneObjects.camera.position.x - state.boardTransform.position.x
            const dz = state.sceneObjects.camera.position.z - state.boardTransform.position.z
            state.input.fixedCameraAngle = Math.atan2(dx, dz)
        }
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
    
    if (event.key === 'Escape') {
        // Don't prevent default - let settings menu handle it
        return
    }
    
    if (event.code === 'Space') {
        event.preventDefault()
        handleJump()
    }
    
    // Open menu with Tab key
    if (event.key === 'Tab') {
        event.preventDefault()
        toggleMenu()
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
    // Don't lock pointer if clicking on settings menu
    const settingsMenu = document.getElementById('settings-menu')
    if (settingsMenu && (settingsMenu.contains(event.target) || settingsMenu.style.display === 'flex')) {
        return
    }
    
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
                if (state.sceneObjects.boardMesh) {
                    state.tricks.boardRotationOnRightClickStart = state.sceneObjects.boardMesh.rotation.y
                    state.tricks.previousBoardYRightClick = state.sceneObjects.boardMesh.rotation.y
                    state.tricks.cumulativeBoardRotationRightClick = 0
                    state.tricks.boardRotationDirectionRightClick = 0
                }
            }
            // Store current camera angle when right mouse is pressed
            const dx = state.sceneObjects.camera.position.x - state.boardTransform.position.x
            const dz = state.sceneObjects.camera.position.z - state.boardTransform.position.z
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
            
            // Snap rotation based on swap setting
            if (isSwapShuvFlipEnabled()) {
                // Swapped: Right-click was controlling barrel roll, snap Z rotation
                snapRotationToNearest180()
            } else {
                // Normal: Right-click was controlling shuv, snap Y rotation
                alignBoardToCamera()
            }
        }
    }
}

export function handleRightClick(event) {
    // Prevent context menu in attached mode
    if (!state.sceneObjects.controls.enabled) {
        event.preventDefault()
    }
}

export function handleWheel(event) {
    // Only handle scrollwheel when in attached mode
    if (!state.sceneObjects.controls.enabled) {
        event.preventDefault()
        // Store scroll delta (positive = scroll up, negative = scroll down)
        state.input.scrollDelta += event.deltaY
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

