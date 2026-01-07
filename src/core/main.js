import { init } from "./init.js"
import { updatePhysics, updateBoardVisualRotation } from "../systems/physics.js"
import { sceneObjects, timing } from "./state.js"
import { PHYSICS_DELTA_TIME, FRUSTUM_CULLING_ENABLED, BOARD_REFRESH_RATE } from "../config/constants.js"
import { updateNetwork } from "../systems/network.js"
import { PerformanceMonitor, FrustumCuller } from "../utils/performance.js"
import { updateGrindSparks } from "../systems/particles.js"

// ============================================================================
// RENDERING
// ============================================================================

// Initialize performance monitoring
const performanceMonitor = new PerformanceMonitor()
let frustumCuller = null

function animate() {
    requestAnimationFrame(animate)
    
    // Update performance monitor
    performanceMonitor.update()
    
    updatePhysicsTimestep()
    
    // Update orbit controls if enabled (camera is updated in physics loop when disabled)
    if (sceneObjects.controls && sceneObjects.controls.enabled) {
        sceneObjects.controls.update()
    }
    
    // Update frustum culler if enabled
    if (FRUSTUM_CULLING_ENABLED && frustumCuller && sceneObjects.camera) {
        frustumCuller.update()
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
    
    // Update board visual rotation at throttled rate (does not affect physics)
    updateBoardVisualRotation(frameTime)
    
    // Update network (interpolate other players, send updates)
    updateNetwork(frameTime)
    
    // Update particle system
    updateGrindSparks(frameTime)
}

// Initialize frustum culler after scene is ready
function initPerformanceTools() {
    if (FRUSTUM_CULLING_ENABLED && sceneObjects.camera) {
        frustumCuller = new FrustumCuller(sceneObjects.camera)
    }
}

// Export performance monitor for debugging
export function getPerformanceStats() {
    return {
        fps: performanceMonitor.getFPS(),
        averageFPS: performanceMonitor.getAverageFPS(),
        frameTime: performanceMonitor.getFrameTime(),
        averageFrameTime: performanceMonitor.getAverageFrameTime()
    }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

// Wait for DOM to be ready before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startGame)
} else {
    startGame()
}

function startGame() {
init().then(() => {
    initPerformanceTools()
    animate()
    
    // Log performance stats periodically (for debugging)
    if (import.meta.env.DEV) {
        setInterval(() => {
            const stats = getPerformanceStats()
            if (stats.fps < 50) {
                console.warn(`Low FPS: ${stats.fps.toFixed(1)} (avg: ${stats.averageFPS.toFixed(1)})`)
            }
        }, 5000)
    }
    }).catch((err) => {
        console.error('Failed to initialize game:', err)
})
}
