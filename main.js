import { init } from "./init.js"
import { updatePhysics } from "./physics.js"
import { sceneObjects, timing } from "./state.js"
import { PHYSICS_DELTA_TIME } from "./constants.js"
import { updateNetwork } from "./network.js"

// ============================================================================
// RENDERING
// ============================================================================

function animate() {
    requestAnimationFrame(animate)
    
    updatePhysicsTimestep()
    
    // Update orbit controls if enabled (camera is updated in physics loop when disabled)
    if (sceneObjects.controls && sceneObjects.controls.enabled) {
        sceneObjects.controls.update()
    }
    
    if (sceneObjects.composer) {
        sceneObjects.composer.render()
    }
}

function updatePhysicsTimestep() {
    const currentTime = performance.now()
    const frameTime = (currentTime - timing.lastTime) / 1000
    timing.lastTime = currentTime
    
    timing.accumulatedTime += frameTime
    
    while (timing.accumulatedTime >= PHYSICS_DELTA_TIME) {
        updatePhysics()
        timing.accumulatedTime -= PHYSICS_DELTA_TIME
    }
    
    // Update network (interpolate other players, send updates)
    updateNetwork(frameTime)
}

// ============================================================================
// ENTRY POINT
// ============================================================================

init().then(() => {
    animate()
})
