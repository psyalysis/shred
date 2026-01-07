import * as THREE from "three"
import * as state from "../core/state.js"
import { RAIL_ANGLE } from "../config/constants.js"

// ============================================================================
// PARTICLE SYSTEM FOR GRIND SPARKS
// ============================================================================

const SPARK_COLOR = 0xff0000  // Red
const SPARK_SIZE = 1.5  // Larger size for better visibility
const SPARK_LIFETIME = 0.2  // Seconds (longer lifetime)
const SPARK_EMIT_RATE = 30  // Particles per second while grinding (doubled)
const SPARK_SPEED = 3  // Initial velocity magnitude

let sparkParticles = null
let sparkGeometry = null
let sparkMaterial = null
let activeSparks = []
let lastEmitTime = 0

/**
 * Initialize the particle system for grind sparks
 */
export function initGrindSparks() {
    // Create geometry for particles (using Points for chunky pixelated look)
    sparkGeometry = new THREE.BufferGeometry()
    const maxParticles = 1000
    const positions = new Float32Array(maxParticles * 3)
    const colors = new Float32Array(maxParticles * 3)
    const lifetimes = new Float32Array(maxParticles)
    
    // Initialize all positions to off-screen
    for (let i = 0; i < maxParticles; i++) {
        positions[i * 3] = 0
        positions[i * 3 + 1] = -1000
        positions[i * 3 + 2] = 0
        colors[i * 3] = 0
        colors[i * 3 + 1] = 0
        colors[i * 3 + 2] = 0
    }
    
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    sparkGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    sparkGeometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1))
    
    // Set draw range to 0 initially (will be updated as particles are added)
    sparkGeometry.setDrawRange(0, 0)
    
    // Create material with emissive yellow glow
    sparkMaterial = new THREE.PointsMaterial({
        color: 0xffffff,  // White base color (vertex colors will override)
        size: SPARK_SIZE,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
        sizeAttenuation: false,  // Keep size constant for pixelated look
        depthWrite: false,  // Prevent depth issues with additive blending
        fog: false,  // Disable fog for particles
        emissive: 0xff0000,  // Emissive red glow
        emissiveIntensity: 5.0  // Bright emissive glow
    })
    
    sparkParticles = new THREE.Points(sparkGeometry, sparkMaterial)
    sparkParticles.visible = false
    sparkParticles.renderOrder = 999  // Render on top
    state.sceneObjects.scene.add(sparkParticles)
}

/**
 * Emit a spark particle at the given position
 */
function emitSpark(position, velocity) {
    // Find an inactive particle slot
    let slotIndex = -1
    for (let i = 0; i < activeSparks.length; i++) {
        if (activeSparks[i].lifetime <= 0) {
            slotIndex = i
            break
        }
    }
    
    // If no inactive slot, add new one (up to max)
    if (slotIndex === -1 && activeSparks.length < 1000) {
        slotIndex = activeSparks.length
    }
    
    if (slotIndex === -1) return  // Max particles reached
    
    // Initialize or reset particle
    if (!activeSparks[slotIndex]) {
        activeSparks[slotIndex] = {
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            lifetime: 0,
            maxLifetime: SPARK_LIFETIME
        }
    }
    
    const spark = activeSparks[slotIndex]
    spark.position.copy(position)
    spark.velocity.copy(velocity)
    spark.lifetime = SPARK_LIFETIME
    spark.maxLifetime = SPARK_LIFETIME
    
    // Initialize buffer data for this particle
    const idx = slotIndex * 3
    const positions = sparkGeometry.attributes.position.array
    const colors = sparkGeometry.attributes.color.array
    const lifetimes = sparkGeometry.attributes.lifetime.array
    
    positions[idx] = position.x
    positions[idx + 1] = position.y
    positions[idx + 2] = position.z
    colors[idx] = 1.0  // R - full brightness for red
    colors[idx + 1] = 0.0  // G - no green
    colors[idx + 2] = 0.0  // B - no blue
    lifetimes[slotIndex] = SPARK_LIFETIME
}

/**
 * Update particle system - emit and update particles
 */
export function updateGrindSparks(deltaTime) {
    if (!sparkParticles || !sparkGeometry) return
    
    const now = performance.now() / 1000
    
    // Emit sparks while grinding
    if (state.physics.isGrinding && state.sceneObjects.boardMesh && state.physics.railGrindDirection !== 0) {
        const timeSinceLastEmit = now - lastEmitTime
        const emitInterval = 1.0 / SPARK_EMIT_RATE
        
        if (timeSinceLastEmit >= emitInterval) {
            // Get board position and rail position
            const boardPos = state.sceneObjects.boardMesh.position.clone()
            const railPos = state.sceneObjects.railMesh ? state.sceneObjects.railMesh.position : new THREE.Vector3(0, 0.55, 0)
            
            // Rail is rotated 45 degrees, multiply by grind direction
            const railDirX = Math.sin(RAIL_ANGLE) * state.physics.railGrindDirection
            const railDirZ = Math.cos(RAIL_ANGLE) * state.physics.railGrindDirection
            
            // Calculate the contact point on the rail (where board touches rail)
            // Project board position onto rail to get contact point
            const toRailX = boardPos.x - railPos.x
            const toRailZ = boardPos.z - railPos.z
            const projection = toRailX * railDirX + toRailZ * railDirZ
            const contactX = railPos.x + railDirX * projection
            const contactZ = railPos.z + railDirZ * projection
            const contactY = railPos.y  // Rail height (where board contacts rail)
            
            // Emit spark at the contact point, slightly offset behind the board along the rail
            // This makes sparks appear to come from where the board touches the rail
            const sparkPos = new THREE.Vector3(
                contactX - railDirX * 0.15,  // Behind board along rail direction
                contactY + 0.01,  // Slightly above rail surface (at contact point)
                contactZ - railDirZ * 0.15
            )
            
            // Random velocity away from rail, flying upward
            const angle = Math.random() * Math.PI * 2
            const speed = SPARK_SPEED * (0.5 + Math.random() * 0.5)
            const velocity = new THREE.Vector3(
                Math.cos(angle) * speed * 0.8,  // Horizontal spread
                speed * (0.5 + Math.random() * 0.5),  // Upward bias - particles fly up
                Math.sin(angle) * speed * 0.8  // Horizontal spread
            )
            
            emitSpark(sparkPos, velocity)
            lastEmitTime = now
        }
    }
    
    // Update all particles
    const positions = sparkGeometry.attributes.position.array
    const colors = sparkGeometry.attributes.color.array
    const lifetimes = sparkGeometry.attributes.lifetime.array
    
    let activeCount = 0
    
    for (let i = 0; i < activeSparks.length; i++) {
        const spark = activeSparks[i]
        
        if (spark.lifetime > 0) {
            // Update position
            const velocityDelta = spark.velocity.clone().multiplyScalar(deltaTime)
            spark.position.add(velocityDelta)
            
            // Apply lighter gravity so particles stay in air longer
            spark.velocity.y -= 0.005 * deltaTime * 60  // Reduced gravity for air particles
            
            // Update lifetime
            spark.lifetime -= deltaTime
            
            // Update buffer
            const idx = i * 3
            positions[idx] = spark.position.x
            positions[idx + 1] = spark.position.y
            positions[idx + 2] = spark.position.z
            
            // Fade out color (size is uniform, controlled by material)
            const lifeRatio = spark.lifetime / spark.maxLifetime
            // Keep colors bright even as they fade
            const brightness = Math.pow(lifeRatio, 0.7)  // Slower fade (gamma correction)
            colors[idx] = brightness  // R - red
            colors[idx + 1] = 0.0  // G - no green
            colors[idx + 2] = 0.0  // B - no blue
            
            lifetimes[i] = spark.lifetime
            
            activeCount++
        } else {
            // Hide inactive particles
            const idx = i * 3
            positions[idx] = 0
            positions[idx + 1] = -1000  // Move off screen
            positions[idx + 2] = 0
        }
    }
    
    // Update geometry
    sparkGeometry.attributes.position.needsUpdate = true
    sparkGeometry.attributes.color.needsUpdate = true
    sparkGeometry.attributes.lifetime.needsUpdate = true
    
    // Update draw range to include all active particles
    if (activeCount > 0) {
        sparkGeometry.setDrawRange(0, activeSparks.length)
    } else {
        sparkGeometry.setDrawRange(0, 0)
    }
    
    // Show/hide particle system
    sparkParticles.visible = activeCount > 0
}

/**
 * Emit sparks for other players (networked)
 */
export function emitSparksForOtherPlayer(playerId, position, grindDirection) {
    if (!sparkParticles || !sparkGeometry) return
    
    const railDirX = Math.sin(RAIL_ANGLE) * grindDirection
    const railDirZ = Math.cos(RAIL_ANGLE) * grindDirection
    
    // Emit a few sparks
    for (let i = 0; i < 3; i++) {
        const sparkPos = new THREE.Vector3(
            position.x - railDirX * 0.2,
            position.y - 0.05,
            position.z - railDirZ * 0.2
        )
        
        const angle = Math.random() * Math.PI * 2
        const speed = SPARK_SPEED * (0.5 + Math.random() * 0.5)
        const velocity = new THREE.Vector3(
            Math.cos(angle) * speed * 0.8,  // Horizontal spread
            speed * (0.5 + Math.random() * 0.5),  // Upward bias - particles fly up
            Math.sin(angle) * speed * 0.8  // Horizontal spread
        )
        
        emitSpark(sparkPos, velocity)
    }
}

