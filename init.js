import * as THREE from "three"
import { Vector2 } from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { createPixelRenderer, updatePixelRenderer } from "./render.js"
import { initWindSound } from "./sound.js"
import { PIXELATION_LEVEL, FLOOR_Y, SFX_VOLUME } from "./constants.js"
import * as state from "./state.js"
import { updateCubeTransform } from "./physics.js"
import {
    handleKeyDown, handleKeyUp, handleMouseMove, handleMouseClick,
    handleRightClick, handleMouseDown, handleMouseUp, initPointerLock
} from "./input.js"
import { connect } from "./network.js"

// ============================================================================
// INITIALIZATION
// ============================================================================

export async function init() {
    initScene()
    initCamera()
    initLights()
    initFloor()
    initCube()
    initRail()
    initAudio()
    initWindSound()
    initEventListeners()
    initTrickDisplay()
    initTrickNameDisplay()
    await loadTricksData()
    
    // Connect to multiplayer server
    connect()
}

function initScene() {
    state.sceneObjects.scene = new THREE.Scene()
    state.sceneObjects.scene.background = new THREE.Color(0x151729)

    const screenResolution = new Vector2(window.innerWidth, window.innerHeight)
    
    state.sceneObjects.renderer = new THREE.WebGLRenderer({ antialias: false })
    state.sceneObjects.renderer.shadowMap.enabled = true
    state.sceneObjects.renderer.setSize(screenResolution.x, screenResolution.y)
    document.body.appendChild(state.sceneObjects.renderer.domElement)
}

function initCamera() {
    const screenResolution = new Vector2(window.innerWidth, window.innerHeight)
    const aspectRatio = screenResolution.x / screenResolution.y

    state.sceneObjects.camera = new THREE.PerspectiveCamera(65, aspectRatio, 0.1, 1000)
    state.sceneObjects.camera.position.z = 2
    state.sceneObjects.camera.position.y = 2 * Math.tan(Math.PI / 6)

    state.sceneObjects.controls = new OrbitControls(state.sceneObjects.camera, state.sceneObjects.renderer.domElement)
    state.sceneObjects.controls.enabled = false  // Start in attachment mode by default
    state.sceneObjects.controls.target.set(0, 0, 0)
    state.sceneObjects.controls.update()
    
    state.sceneObjects.composer = createPixelRenderer(state.sceneObjects.renderer, state.sceneObjects.scene, state.sceneObjects.camera, PIXELATION_LEVEL)
}

function initLights() {
    state.sceneObjects.scene.add(new THREE.AmbientLight(0x2d3645, 1.5))
    
    const directionalLight = new THREE.DirectionalLight(0xfffc9c, 0.5)
    directionalLight.position.set(100, 100, 100)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.set(2048, 2048)
    state.sceneObjects.scene.add(directionalLight)
}

function initFloor() {
    const floorGeometry = new THREE.PlaneGeometry(10, 10)
    const floorMaterial = new THREE.MeshPhongMaterial({ color: 0x959595 })
    const floor = new THREE.Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = FLOOR_Y
    floor.receiveShadow = true
    state.sceneObjects.scene.add(floor)
}

function initCube() {
    const loader = new GLTFLoader()
    loader.load(
        './skateboard.glb',
        (gltf) => {
            state.sceneObjects.cubeMesh = gltf.scene
            
            // Calculate bounding box to scale model to match original cube size
            const box = new THREE.Box3().setFromObject(state.sceneObjects.cubeMesh)
            const size = box.getSize(new THREE.Vector3())
            const targetHeight = 0.1  // Original cube height
            const scale = (targetHeight / size.y) * 1.5
            state.sceneObjects.cubeMesh.scale.set(scale, scale, scale)
            
            // Rotate 90 degrees on Y axis so default forward direction is correct
            state.sceneObjects.cubeMesh.rotation.x = Math.PI / 2
            
            state.sceneObjects.cubeMesh.castShadow = true
            state.sceneObjects.cubeMesh.receiveShadow = true
            
            // Enable shadows for all meshes in the model and store original materials
            state.sceneObjects.cubeMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true
                    child.receiveShadow = true
                    // Store original material for color restoration
                    if (child.material) {
                        state.audio.originalMaterials.push({
                            mesh: child,
                            originalColor: child.material.color ? child.material.color.clone() : null,
                            material: child.material
                        })
                    }
                }
            })
            
            state.sceneObjects.scene.add(state.sceneObjects.cubeMesh)
            updateCubeTransform()
        },
        undefined,
        (error) => {
            console.error('Error loading skateboard model:', error)
        }
    )
}

function initRail() {
    const loader = new GLTFLoader()
    loader.load(
        './rail.glb',
        (gltf) => {
            const railMesh = gltf.scene
            
            // Position rail in the middle of the map (raised higher)
            railMesh.position.set(0, FLOOR_Y + 0.55, 0)
            
            // Rotate 45 degrees diagonally (around Y axis)
            railMesh.rotation.y = Math.PI / 4
            
            // Scale rail by factor of 1.75
            railMesh.scale.set(1.75, 1.75, 1.75)
            
            railMesh.castShadow = true
            railMesh.receiveShadow = true
            
            // Store original materials for glow effect
            const railMaterials = []
            
            // Enable shadows for all meshes in the rail model
            railMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true
                    child.receiveShadow = true
                    // Store original material and enable emissive
                    if (child.material) {
                        // Ensure material has emissive property
                        if (!child.material.emissive) {
                            child.material.emissive = new THREE.Color(0x000000)
                        }
                        // Enable emissive if it's a standard material
                        if (child.material.emissiveIntensity !== undefined) {
                            child.material.emissiveIntensity = 1.0
                        }
                        
                        railMaterials.push({
                            mesh: child,
                            originalMaterial: child.material,
                            originalEmissive: child.material.emissive ? child.material.emissive.clone() : new THREE.Color(0x000000)
                        })
                    }
                }
            })
            
            // Store rail mesh and materials in state
            state.sceneObjects.railMesh = railMesh
            state.sceneObjects.railMaterials = railMaterials
            
            state.sceneObjects.scene.add(railMesh)
        },
        undefined,
        (error) => {
            console.error('Error loading rail model:', error)
        }
    )
}

function initAudio() {
    state.audio.failAudio = new Audio('./sfx/Death.mp3')
    state.audio.failAudio.volume = SFX_VOLUME
    
    // Load all pop sound effects
    for (let i = 1; i <= 6; i++) {
        const popSound = new Audio(`./sfx/Pop_${i}.wav`)
        popSound.volume = SFX_VOLUME
        state.audio.popSounds.push(popSound)
    }
    
    // Load all land sound effects
    for (let i = 1; i <= 5; i++) {
        const landSound = new Audio(`./sfx/Land_${i}.wav`)
        landSound.volume = SFX_VOLUME
        state.audio.landSounds.push(landSound)
    }
    
    // Load all catch sound effects
    for (let i = 1; i <= 3; i++) {
        const catchSound = new Audio(`./sfx/Catch_${i}.mp3`)
        catchSound.volume = SFX_VOLUME
        state.audio.catchSounds.push(catchSound)
    }
    
    // Load rail grinding sound
    state.audio.railSound = new Audio('./sfx/Rail.wav')
    state.audio.railSound.volume = SFX_VOLUME
    state.audio.railSound.loop = true
}

export function initEventListeners() {
    window.addEventListener('resize', onWindowResize)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('click', handleMouseClick)
    window.addEventListener('contextmenu', handleRightClick)
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    initPointerLock()
}

function initTrickDisplay() {
    state.ui.trickDisplayElement = document.createElement('div')
    state.ui.trickDisplayElement.id = 'trick-display'
    state.ui.trickDisplayElement.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        color: white;
        font-family: monospace;
        font-size: 18px;
        background: rgba(0, 0, 0, 0.5);
        padding: 15px;
        border-radius: 8px;
        pointer-events: none;
        z-index: 1000;
        display: none;
    `
    document.body.appendChild(state.ui.trickDisplayElement)
}

function initTrickNameDisplay() {
    state.ui.trickNameDisplayElement = document.createElement('div')
    state.ui.trickNameDisplayElement.id = 'trick-name-display'
    state.ui.trickNameDisplayElement.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        color: white;
        font-family: monospace;
        font-size: 32px;
        font-weight: bold;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
        pointer-events: none;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s ease-in-out;
    `
    document.body.appendChild(state.ui.trickNameDisplayElement)
}

async function loadTricksData() {
    try {
        const response = await fetch('./tricks.json')
        state.ui.tricksData = await response.json()
    } catch (error) {
        console.error('Error loading tricks.json:', error)
        state.ui.tricksData = {}
    }
}

function onWindowResize() {
    const screenResolution = new Vector2(window.innerWidth, window.innerHeight)
    const aspectRatio = screenResolution.x / screenResolution.y

    state.sceneObjects.camera.aspect = aspectRatio
    state.sceneObjects.camera.updateProjectionMatrix()

    state.sceneObjects.renderer.setSize(screenResolution.x, screenResolution.y)
    updatePixelRenderer(state.sceneObjects.composer)
}

