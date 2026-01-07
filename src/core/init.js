import * as THREE from "three"
import { Vector2 } from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { createPixelRenderer, updatePixelRenderer, recreatePixelRenderer, setRendererReferences } from "../systems/render.js"
import { initWindSound } from "../systems/sound.js"
import { PIXELATION_LEVEL, FLOOR_Y, SFX_VOLUME, MANUAL_BALANCE_BAR_WIDTH, MANUAL_BALANCE_BAR_HEIGHT, MANUAL_BALANCE_LINE_WIDTH, FLOOR_COLOR } from "../config/constants.js"
import * as state from "./state.js"
import { updateBoardTransform } from "../systems/physics.js"
import {
    handleKeyDown, handleKeyUp, handleMouseMove, handleMouseClick,
    handleRightClick, handleMouseDown, handleMouseUp, handleWheel, initPointerLock
} from "../systems/input.js"
import { connect, createRoom, joinRoom, startGame, leaveRoom, setRoomCallbacks } from "../systems/network.js"
import { error, info } from "../utils/logger.js"
import { initGrindSparks } from "../systems/particles.js"
import { initSettingsMenu, openSettings, toggleSettings } from "../config/settings.js"

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Loads custom fonts and applies them to the game
 */
function initFonts() {
    // Create style element for @font-face declarations
    const style = document.createElement('style')
    style.textContent = `
        @font-face {
            font-family: 'Ari';
            src: url('../../assets/ari-w9500.ttf') format('truetype');
            font-weight: normal;
            font-style: normal;
        }
        @font-face {
            font-family: 'Ari';
            src: url('../../assets/ari-w9500-bold.ttf') format('truetype');
            font-weight: bold;
            font-style: normal;
        }
    `
    document.head.appendChild(style)
}

export async function init() {
    try {
        initFonts()
        initScene()
        initCamera()
        initLights()
        initFloor()
        initBoard()
        initRail()
        initManualPad()
        initKickerRamp()
        initAudio()
        initWindSound()
        initEventListeners()
        initTrickDisplay()
        initTrickNameDisplay()
        initManualBalanceUI()
        await loadTricksData()
        initGrindSparks()
        initSettingsMenu()
        initMenuUI()
        
        // Connect to multiplayer server (but don't join a room yet)
        connect()
        
        // Set up room callbacks
        setRoomCallbacks({
            onRoomCreated: (code) => {
                state.ui.menuState = 'hosting'
                updateMenuUI()
            },
            onRoomJoined: (code) => {
                // Set joining state - will be updated by onRoomStateUpdate if game already started
                state.ui.menuState = 'joining'
                updateMenuUI()
            },
            onGameStarted: () => {
                state.ui.menuState = 'inGame'
                updateMenuUI()
            },
            onRoomDisbanded: (reason) => {
                state.ui.menuState = 'menu'
                // Clear join input
                const codeInput = document.getElementById('join-code-input')
                if (codeInput) codeInput.value = ''
                updateMenuUI()
                showError(`Room disbanded: ${reason}`)
            },
            onRoomError: (message) => {
                showError(message)
                // If error during join, go back to menu
                if (state.ui.menuState === 'joining' && !state.room.code) {
                    state.ui.menuState = 'menu'
                    const codeInput = document.getElementById('join-code-input')
                    if (codeInput) codeInput.value = ''
                    updateMenuUI()
                }
            },
            onRoomStateUpdate: () => {
                // If game started while joining, transition to inGame
                // Also handle case where joining an already-started game
                if (state.ui.menuState === 'joining' && state.room.gameStarted) {
                    state.ui.menuState = 'inGame'
                }
                updateMenuUI()
            }
        })
    } catch (err) {
        error('Error during initialization:', err)
        throw err
    }
}

function initScene() {
    // Check if WebGL is available
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) {
        const errorMsg = document.createElement('div')
        errorMsg.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            z-index: 10000;
            text-align: center;
        `
        errorMsg.innerHTML = `
            <h2>WebGL Not Available</h2>
            <p>Your browser does not support WebGL or it is disabled.</p>
            <p>Please enable WebGL in your browser settings or try a different browser.</p>
        `
        document.body.appendChild(errorMsg)
        throw new Error('WebGL is not supported or disabled in this browser')
    }
    
    state.sceneObjects.scene = new THREE.Scene()
    state.sceneObjects.scene.background = new THREE.Color(0x000000)  // Black

    const screenResolution = new Vector2(window.innerWidth, window.innerHeight)
    
    try {
        state.sceneObjects.renderer = new THREE.WebGLRenderer({ 
            antialias: false,
            powerPreference: "high-performance",
            failIfMajorPerformanceCaveat: false
        })
        
        if (!state.sceneObjects.renderer.getContext()) {
            throw new Error('WebGL context is null')
        }
        
        state.sceneObjects.renderer.shadowMap.enabled = true
        state.sceneObjects.renderer.setSize(screenResolution.x, screenResolution.y)
        document.body.appendChild(state.sceneObjects.renderer.domElement)
    } catch (err) {
        error('Failed to create WebGL renderer:', err)
        // Try to provide helpful error message
        const errorMsg = document.createElement('div')
        errorMsg.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            z-index: 10000;
            text-align: center;
        `
        errorMsg.innerHTML = `
            <h2>WebGL Error</h2>
            <p>Unable to initialize WebGL. Please ensure:</p>
            <ul style="text-align: left; display: inline-block;">
                <li>Your browser supports WebGL</li>
                <li>WebGL is enabled in your browser settings</li>
                <li>Your graphics drivers are up to date</li>
            </ul>
            <p style="margin-top: 20px; color: #ff0000;">Error: ${err.message}</p>
        `
        document.body.appendChild(errorMsg)
        throw err
    }
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
    
    // Store references for pixelation level changes
    setRendererReferences(state.sceneObjects.renderer, state.sceneObjects.scene, state.sceneObjects.camera)
    
    state.sceneObjects.composer = createPixelRenderer(state.sceneObjects.renderer, state.sceneObjects.scene, state.sceneObjects.camera, PIXELATION_LEVEL)
}

function initLights() {
    // White ambient light
    state.sceneObjects.scene.add(new THREE.AmbientLight(0xffffff, 1.2))
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7)
    directionalLight.position.set(40, 100, 200)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.set(2048/2, 2048/2)
    state.sceneObjects.scene.add(directionalLight)
}

function createCheckerTexture(size = 16, checkSize = 8) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    
    // Base dark grey color
    const baseColor = '#404040'
    // Slightly lighter grey for checker pattern (faint)
    const checkColor = '#505050'
    
    const tileSize = size / checkSize
    
    for (let x = 0; x < checkSize; x++) {
        for (let y = 0; y < checkSize; y++) {
            const isEven = (x + y) % 2 === 0
            ctx.fillStyle = isEven ? baseColor : checkColor
            ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize)
        }
    }
    
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(2, 2)  // Repeat pattern across floor
    texture.magFilter = THREE.NearestFilter  // Pixelated look
    texture.minFilter = THREE.NearestFilter
    
    return texture
}

function initFloor() {
    const floorGeometry = new THREE.PlaneGeometry(10, 10)
    const checkerTexture = createCheckerTexture(256, 8)
    const floorMaterial = new THREE.MeshPhongMaterial({ 
        color: FLOOR_COLOR,
        map: checkerTexture,
        transparent: false
    })
    const floor = new THREE.Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = FLOOR_Y
    floor.receiveShadow = true
    state.sceneObjects.scene.add(floor)
}

function initBoard() {
    const loader = new GLTFLoader()
    loader.load(
        '../../assets/skateboard.glb',
        (gltf) => {
            state.sceneObjects.boardMesh = gltf.scene
            
            // Calculate bounding box to scale model to match original board size
            const box = new THREE.Box3().setFromObject(state.sceneObjects.boardMesh)
            const size = box.getSize(new THREE.Vector3())
            const targetHeight = 0.1  // Original board height
            const scale = (targetHeight / size.y) * 1.5
            state.sceneObjects.boardMesh.scale.set(scale, scale, scale)
            
            // Rotate 90 degrees on Y axis so default forward direction is correct
            state.sceneObjects.boardMesh.rotation.x = Math.PI / 2
            
            // Set rotation order to YXZ so that Y (yaw) is applied first, then X (pitch) around local X axis
            state.sceneObjects.boardMesh.rotation.order = 'YXZ'
            
            state.sceneObjects.boardMesh.castShadow = true
            state.sceneObjects.boardMesh.receiveShadow = true
            
            // Enable shadows for all meshes in the model and store original materials
            state.sceneObjects.boardMesh.traverse((child) => {
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
            
            state.sceneObjects.scene.add(state.sceneObjects.boardMesh)
            // Initialize target rotation to match initial board rotation
            state.boardTargetRotation.x = state.sceneObjects.boardMesh.rotation.x
            state.boardTargetRotation.y = state.sceneObjects.boardMesh.rotation.y
            state.boardTargetRotation.z = state.sceneObjects.boardMesh.rotation.z
            updateBoardTransform()
        },
        undefined,
        (err) => {
            error('Error loading skateboard model:', err)
        }
    )
}

function initRail() {
    const loader = new GLTFLoader()
    loader.load(
        '../../assets/rail.glb',
        (gltf) => {
            const railMesh = gltf.scene
            
            // Position rail in the middle of the map (raised higher)
            railMesh.position.set(0, FLOOR_Y + 0.57, 0)
            
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
        (err) => {
            error('Error loading rail model:', err)
        }
    )
}

function initManualPad() {
    // Create a flat raised platform for manual tricks
    const padWidth = 2
    const padLength = 1.5
    const padHeight = 0.25
    const padElevation = 0  // Height above floor
    
    const padGeometry = new THREE.BoxGeometry(padWidth, padHeight, padLength)
    const padMaterial = new THREE.MeshPhongMaterial({ color: FLOOR_COLOR })
    const manualPad = new THREE.Mesh(padGeometry, padMaterial)
    
    // Position pad to the side of the map
    manualPad.position.set(-3, FLOOR_Y + padElevation + padHeight / 2, 2)
    
    // Rotate pad by -30 degrees on Y axis
    manualPad.rotation.y = -Math.PI / 6  // -30 degrees
    
    manualPad.castShadow = true
    manualPad.receiveShadow = true
    
    state.sceneObjects.scene.add(manualPad)
    state.sceneObjects.manualPad = manualPad
}

function initKickerRamp() {
    // Create an angled kicker ramp
    const rampWidth = 1.5
    const rampLength = 2  // Longer ramp
    const rampHeight = 0.1
    const rampAngle = Math.PI / 9  // Less steep: ~20 degrees (was 30 degrees)
    
    const rampGeometry = new THREE.BoxGeometry(rampWidth, rampHeight, rampLength)
    const rampMaterial = new THREE.MeshPhongMaterial({ color: FLOOR_COLOR })
    const kickerRamp = new THREE.Mesh(rampGeometry, rampMaterial)
    
    // Position ramp on the opposite side, moved down a bit
    kickerRamp.position.set(3, FLOOR_Y + rampLength * Math.sin(rampAngle) / 2 + rampHeight / 2 - 0.2, -2)
    
    // Rotate ramp to create the kicker angle
    kickerRamp.rotation.x = -rampAngle
    
    kickerRamp.castShadow = true
    kickerRamp.receiveShadow = true
    
    state.sceneObjects.scene.add(kickerRamp)
    state.sceneObjects.kickerRamp = kickerRamp
}

function initAudio() {
    try {
        state.audio.failAudio = new Audio('../../sfx/Death.mp3')
        state.audio.failAudio.volume = SFX_VOLUME
        
        // Load all pop sound effects (using arrays for now, can be converted to pools later)
        for (let i = 1; i <= 6; i++) {
            const popSound = new Audio(`../../sfx/Pop_${i}.wav`)
            popSound.volume = SFX_VOLUME
            popSound.preload = 'auto'
            state.audio.popSounds.push(popSound)
        }
        
        // Load all land sound effects
        for (let i = 1; i <= 5; i++) {
            const landSound = new Audio(`../../sfx/Land_${i}.wav`)
            landSound.volume = SFX_VOLUME
            landSound.preload = 'auto'
            state.audio.landSounds.push(landSound)
        }
        
        // Load all catch sound effects
        for (let i = 1; i <= 3; i++) {
            const catchSound = new Audio(`../../sfx/Catch_${i}.mp3`)
            catchSound.volume = SFX_VOLUME
            catchSound.preload = 'auto'
            state.audio.catchSounds.push(catchSound)
        }
        
        // Load rail grinding sound
        state.audio.railSound = new Audio('../../sfx/Rail.wav')
        state.audio.railSound.volume = SFX_VOLUME
        state.audio.railSound.loop = true
        state.audio.railSound.preload = 'auto'
    } catch (err) {
        error('Error initializing audio:', err)
    }
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
    window.addEventListener('wheel', handleWheel, { passive: false })
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
        font-family: 'Ari', monospace;
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
        font-family: 'Ari', monospace;
        font-size: 32px;
        font-weight: bold;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
        pointer-events: none;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s ease-in-out;
    `
    document.body.appendChild(state.ui.trickNameDisplayElement)
    
    // Initialize combo display
    state.ui.trickComboDisplayElement = document.createElement('div')
    state.ui.trickComboDisplayElement.id = 'trick-combo-display'
    state.ui.trickComboDisplayElement.style.cssText = `
        position: fixed;
        bottom: 180px;
        left: 50%;
        transform: translateX(-50%);
        color: #ff0000;  // Red accent
        font-family: 'Ari', monospace;
        font-size: 28px;
        font-weight: bold;
        text-shadow: 0 0 10px rgba(255, 0, 0, 0.8), 2px 2px 4px rgba(0, 0, 0, 0.9);
        pointer-events: none;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s ease-in-out, transform 0.2s ease-out;
        text-align: center;
        white-space: nowrap;
    `
    document.body.appendChild(state.ui.trickComboDisplayElement)
}

function initManualBalanceUI() {
    // Create balance bar container
    state.ui.manualBalanceBar = document.createElement('div')
    state.ui.manualBalanceBar.id = 'manual-balance-bar'
    state.ui.manualBalanceBar.style.cssText = `
        position: fixed;
        left: 50%;
        margin-left: 100px;
        top: 50%;
        transform: translateY(-50%);
        width: ${MANUAL_BALANCE_BAR_WIDTH}px;
        height: ${MANUAL_BALANCE_BAR_HEIGHT}px;
        background: #000000;
        border: 2px solid #ffffff;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
        pointer-events: none;
        z-index: 1000;
        display: none;
    `
    document.body.appendChild(state.ui.manualBalanceBar)
    
    // Create balance line indicator
    state.ui.manualBalanceLine = document.createElement('div')
    state.ui.manualBalanceLine.id = 'manual-balance-line'
    const barHeight = MANUAL_BALANCE_BAR_HEIGHT
    const lineHeight = MANUAL_BALANCE_LINE_WIDTH
    const maxTop = barHeight - lineHeight
    const initialTop = (1 - 0.5) * maxTop  // Start at center (balance = 0.5)
    state.ui.manualBalanceLine.style.cssText = `
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        top: ${initialTop}px;
        width: ${MANUAL_BALANCE_LINE_WIDTH}px;
        height: ${MANUAL_BALANCE_LINE_WIDTH}px;
        background: #ff0000;  // Red accent
        image-rendering: pixelated;
        image-rendering: crisp-edges;
    `
    state.ui.manualBalanceBar.appendChild(state.ui.manualBalanceLine)
}

async function loadTricksData() {
    try {
        const response = await fetch('../../tricks.json')
        state.ui.tricksData = await response.json()
    } catch (err) {
        error('Error loading tricks.json:', err)
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

// ============================================================================
// MENU UI
// ============================================================================

let mainMenuElement = null
let mainMenuPanel = null
let hostUIElement = null
let hostUIPanel = null
let joinUIElement = null
let joinUIPanel = null
let inGameUIElement = null
let errorMessageElement = null
let isMenuOpen = false
let menuAnimationFrame = 0
let menuAnimationTimer = 0

// Helper function to create pixelated button matching settings style
function createMenuButton(text, onClick, isPrimary = false) {
    const button = document.createElement('button')
    button.textContent = text
    button.style.cssText = `
        background: #404040;
        border: 3px solid #fff;
        box-shadow: 
            inset -3px -3px 0 #000,
            inset 3px 3px 0 #666,
            0 0 0 2px #000;
        color: #fff;
        font-family: 'Ari', monospace;
        font-size: 16px;
        font-weight: bold;
        padding: 12px 24px;
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 1px;
        image-rendering: pixelated;
        transition: none;
        width: 100%;
        margin: 10px 0;
    `
    
    if (isPrimary) {
        button.style.background = '#00aa00'
        button.style.borderColor = '#00ff00'
    }
    
    // Pixelated hover/press effects
    button.addEventListener('mouseenter', () => {
        button.style.background = isPrimary ? '#00cc00' : '#505050'
        button.style.transform = 'translate(1px, 1px)'
        button.style.boxShadow = `
            inset -2px -2px 0 #000,
            inset 2px 2px 0 #666,
            0 0 0 2px #000
        `
    })
    
    button.addEventListener('mouseleave', () => {
        button.style.background = isPrimary ? '#00aa00' : '#404040'
        button.style.transform = 'translate(0, 0)'
        button.style.boxShadow = `
            inset -3px -3px 0 #000,
            inset 3px 3px 0 #666,
            0 0 0 2px #000
        `
    })
    
    button.addEventListener('mousedown', () => {
        button.style.background = isPrimary ? '#008800' : '#303030'
        button.style.transform = 'translate(2px, 2px)'
        button.style.boxShadow = `
            inset -1px -1px 0 #000,
            inset 1px 1px 0 #666,
            0 0 0 2px #000
        `
    })
    
    button.addEventListener('mouseup', () => {
        button.style.background = isPrimary ? '#00cc00' : '#505050'
        button.style.transform = 'translate(1px, 1px)'
    })
    
    button.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
    })
    
    // Prevent pointer lock when clicking button
    button.addEventListener('mousedown', (e) => {
        e.stopPropagation()
    })
    
    return button
}

// Exit pointer lock helper
function exitPointerLock() {
    if (state.input.isPointerLocked) {
        document.exitPointerLock = document.exitPointerLock || 
                                  document.mozExitPointerLock || 
                                  document.webkitExitPointerLock
        if (document.exitPointerLock) {
            document.exitPointerLock()
        }
    }
}

function initMenuUI() {
    // Main menu - full screen overlay
    mainMenuElement = document.createElement('div')
    mainMenuElement.id = 'main-menu'
    mainMenuElement.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        font-family: 'Ari', monospace;
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
    `
    
    // Prevent pointer lock when clicking in menu
    mainMenuElement.addEventListener('mousedown', (e) => {
        e.stopPropagation()
        exitPointerLock()
    })
    mainMenuElement.addEventListener('click', (e) => {
        e.stopPropagation()
    })
    
    // Main menu panel
    mainMenuPanel = document.createElement('div')
    mainMenuPanel.id = 'main-menu-panel'
    mainMenuPanel.style.cssText = `
        background: #404040;
        border: 4px solid #fff;
        box-shadow: 
            inset -4px -4px 0 #000,
            inset 4px 4px 0 #666,
            0 0 0 2px #000;
        padding: 30px;
        min-width: 400px;
        max-width: 500px;
        color: #fff;
        position: relative;
        image-rendering: pixelated;
        transform: scale(0);
        transform-origin: center center;
    `
    
    const title = document.createElement('h1')
    title.textContent = 'Shred!'
    title.style.cssText = `
        margin: 0 0 30px 0;
        font-size: 42px;
        font-weight: bold;
        text-align: center;
        text-shadow: 3px 3px 0 #000;
        letter-spacing: 2px;
    `
    mainMenuPanel.appendChild(title)
    
    const singleplayerButton = createMenuButton('SINGLEPLAYER', () => {
        exitPointerLock()
        // Start game in singleplayer mode
        state.room.gameStarted = true
        state.ui.menuState = 'inGame'
        closeMenu()
        updateMenuUI()
    })
    mainMenuPanel.appendChild(singleplayerButton)
    
    const hostButton = createMenuButton('HOST GAME', () => {
        exitPointerLock()
        createRoom()
    })
    mainMenuPanel.appendChild(hostButton)
    
    const joinButton = createMenuButton('JOIN GAME', () => {
        exitPointerLock()
        state.ui.menuState = 'joining'
        updateMenuUI()
    })
    mainMenuPanel.appendChild(joinButton)
    
    const settingsButton = createMenuButton('SETTINGS', () => {
        exitPointerLock()
        closeMenu()
        openSettings()
    })
    mainMenuPanel.appendChild(settingsButton)
    
    mainMenuElement.appendChild(mainMenuPanel)
    document.body.appendChild(mainMenuElement)
    
    // Handle ESC key to close menu
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isMenuOpen) {
            closeMenu()
        }
    })
    
    // Host UI - full screen overlay
    hostUIElement = document.createElement('div')
    hostUIElement.id = 'host-ui'
    hostUIElement.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        font-family: 'Ari', monospace;
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
    `
    
    // Prevent pointer lock when clicking in menu
    hostUIElement.addEventListener('mousedown', (e) => {
        e.stopPropagation()
        exitPointerLock()
    })
    hostUIElement.addEventListener('click', (e) => {
        e.stopPropagation()
    })
    
    // Host UI panel
    hostUIPanel = document.createElement('div')
    hostUIPanel.id = 'host-ui-panel'
    hostUIPanel.style.cssText = `
        background: #404040;
        border: 4px solid #fff;
        box-shadow: 
            inset -4px -4px 0 #000,
            inset 4px 4px 0 #666,
            0 0 0 2px #000;
        padding: 30px;
        min-width: 500px;
        max-width: 600px;
        color: #fff;
        position: relative;
        image-rendering: pixelated;
    `
    
    const hostTitle = document.createElement('h1')
    hostTitle.textContent = 'HOSTING GAME'
    hostTitle.style.cssText = `
        margin: 0 0 30px 0;
        font-size: 32px;
        font-weight: bold;
        text-align: center;
        text-shadow: 3px 3px 0 #000;
        letter-spacing: 2px;
    `
    hostUIPanel.appendChild(hostTitle)
    
    const codeLabel = document.createElement('div')
    codeLabel.textContent = 'GAME CODE'
    codeLabel.style.cssText = 'margin: 20px 0 10px 0; font-size: 14px; opacity: 0.7; text-align: center;'
    hostUIPanel.appendChild(codeLabel)
    
    const codeDisplay = document.createElement('div')
    codeDisplay.id = 'host-code-display'
    codeDisplay.style.cssText = `
        font-size: 48px;
        font-weight: bold;
        letter-spacing: 8px;
        margin: 10px 0 30px 0;
        color: #00ff00;
        text-align: center;
        text-shadow: 2px 2px 0 #000;
    `
    hostUIPanel.appendChild(codeDisplay)
    
    const playersLabel = document.createElement('div')
    playersLabel.id = 'host-players-label'
    playersLabel.textContent = 'PLAYERS: 1/4'
    playersLabel.style.cssText = 'margin: 20px 0; font-size: 18px; text-align: center;'
    hostUIPanel.appendChild(playersLabel)
    
    const startButton = createMenuButton('START GAME', () => {
        exitPointerLock()
        startGame()
    }, true)
    startButton.id = 'host-start-button'
    hostUIPanel.appendChild(startButton)
    
    const cancelButton = createMenuButton('CANCEL', () => {
        exitPointerLock()
        leaveRoom()
        state.ui.menuState = 'menu'
        updateMenuUI()
    })
    hostUIPanel.appendChild(cancelButton)
    
    hostUIElement.appendChild(hostUIPanel)
    document.body.appendChild(hostUIElement)
    
    // Join UI - full screen overlay
    joinUIElement = document.createElement('div')
    joinUIElement.id = 'join-ui'
    joinUIElement.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        font-family: 'Ari', monospace;
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
    `
    
    // Prevent pointer lock when clicking in menu
    joinUIElement.addEventListener('mousedown', (e) => {
        e.stopPropagation()
        exitPointerLock()
    })
    joinUIElement.addEventListener('click', (e) => {
        e.stopPropagation()
    })
    
    // Join UI panel
    joinUIPanel = document.createElement('div')
    joinUIPanel.id = 'join-ui-panel'
    joinUIPanel.style.cssText = `
        background: #404040;
        border: 4px solid #fff;
        box-shadow: 
            inset -4px -4px 0 #000,
            inset 4px 4px 0 #666,
            0 0 0 2px #000;
        padding: 30px;
        min-width: 500px;
        max-width: 600px;
        color: #fff;
        position: relative;
        image-rendering: pixelated;
    `
    
    const joinTitle = document.createElement('h1')
    joinTitle.textContent = 'JOIN GAME'
    joinTitle.style.cssText = `
        margin: 0 0 30px 0;
        font-size: 32px;
        font-weight: bold;
        text-align: center;
        text-shadow: 3px 3px 0 #000;
        letter-spacing: 2px;
    `
    joinUIPanel.appendChild(joinTitle)
    
    const codeInputLabel = document.createElement('div')
    codeInputLabel.textContent = 'ENTER GAME CODE'
    codeInputLabel.style.cssText = 'margin: 20px 0 10px 0; font-size: 14px; opacity: 0.7; text-align: center;'
    joinUIPanel.appendChild(codeInputLabel)
    
    const codeInput = document.createElement('input')
    codeInput.id = 'join-code-input'
    codeInput.type = 'text'
    codeInput.maxLength = 6
    codeInput.style.cssText = `
        width: calc(100% - 30px);
        padding: 15px;
        margin: 10px 0;
        font-family: 'Ari', monospace;
        font-size: 32px;
        text-align: center;
        letter-spacing: 8px;
        text-transform: uppercase;
        background: #222;
        color: white;
        border: 3px solid #fff;
        box-shadow: 
            inset -2px -2px 0 #000,
            inset 2px 2px 0 #666,
            0 0 0 2px #000;
        image-rendering: pixelated;
    `
    codeInput.oninput = (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    }
    codeInput.onkeypress = (e) => {
        if (e.key === 'Enter' && codeInput.value.length === 6) {
            exitPointerLock()
            joinRoom(codeInput.value)
        }
    }
    codeInput.addEventListener('mousedown', (e) => {
        e.stopPropagation()
        exitPointerLock()
    })
    joinUIPanel.appendChild(codeInput)
    
    const joinButton2 = createMenuButton('JOIN', () => {
        exitPointerLock()
        if (codeInput.value.length === 6) {
            joinRoom(codeInput.value)
        }
    })
    joinUIPanel.appendChild(joinButton2)
    
    const statusLabel = document.createElement('div')
    statusLabel.id = 'join-status-label'
    statusLabel.textContent = ''
    statusLabel.style.cssText = 'margin: 20px 0; font-size: 16px; min-height: 24px; text-align: center;'
    joinUIPanel.appendChild(statusLabel)
    
    const playersLabel2 = document.createElement('div')
    playersLabel2.id = 'join-players-label'
    playersLabel2.textContent = ''
    playersLabel2.style.cssText = 'margin: 10px 0; font-size: 18px; text-align: center;'
    joinUIPanel.appendChild(playersLabel2)
    
    const leaveButton = createMenuButton('LEAVE', () => {
        exitPointerLock()
        leaveRoom()
        state.ui.menuState = 'menu'
        updateMenuUI()
    })
    joinUIPanel.appendChild(leaveButton)
    
    joinUIElement.appendChild(joinUIPanel)
    document.body.appendChild(joinUIElement)
    
    // In-game UI (small overlay)
    inGameUIElement = document.createElement('div')
    inGameUIElement.id = 'ingame-ui'
    inGameUIElement.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 15px;
        border-radius: 8px;
        font-family: 'Ari', monospace;
        z-index: 1000;
        display: none;
        font-size: 14px;
    `
    
    const ingameCodeLabel = document.createElement('div')
    ingameCodeLabel.id = 'ingame-code-label'
    ingameCodeLabel.style.cssText = 'margin-bottom: 5px;'
    inGameUIElement.appendChild(ingameCodeLabel)
    
    const ingamePlayersLabel = document.createElement('div')
    ingamePlayersLabel.id = 'ingame-players-label'
    inGameUIElement.appendChild(ingamePlayersLabel)
    
    document.body.appendChild(inGameUIElement)
    
    // Error message element
    errorMessageElement = document.createElement('div')
    errorMessageElement.id = 'error-message'
    errorMessageElement.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(200, 0, 0, 0.9);
        color: white;
        padding: 15px 30px;
        border-radius: 8px;
        font-family: 'Ari', monospace;
        z-index: 10001;
        display: none;
        font-size: 16px;
    `
    document.body.appendChild(errorMessageElement)
    
    // Initially hide menu (it will be shown when TAB is pressed)
    if (mainMenuElement) mainMenuElement.style.display = 'none'
    updateMenuUI()
}

/**
 * Open main menu with pixelated animation
 */
export function openMenu() {
    if (!mainMenuElement) return
    
    // Unlock pointer when opening menu
    exitPointerLock()
    
    // Only show main menu if not in a specific state (hosting/joining)
    if (state.ui.menuState === 'menu' || state.ui.menuState === 'inGame') {
        isMenuOpen = true
        mainMenuElement.style.display = 'flex'
        
        menuAnimationFrame = 0
        menuAnimationTimer = 0
        
        // Pixelated scale animation (frame-based, not smooth)
        function animate() {
            if (!isMenuOpen) return
            
            menuAnimationTimer++
            // Update every 2 frames for chunky animation
            if (menuAnimationTimer % 2 === 0) {
                menuAnimationFrame++
                const frames = 8  // 8 frames for animation
                const progress = Math.min(menuAnimationFrame / frames, 1)
                
                // Ease-out function (chunky steps)
                const eased = 1 - Math.pow(1 - progress, 3)
                const scale = eased * 0.8  // Scale to 0.8x
                
                mainMenuPanel.style.transform = `scale(${scale})`
                
                if (progress < 1) {
                    requestAnimationFrame(animate)
                } else {
                    mainMenuPanel.style.transform = 'scale(0.8)'
                }
            } else {
                requestAnimationFrame(animate)
            }
        }
        
        animate()
    }
}

/**
 * Close main menu with pixelated animation
 */
export function closeMenu() {
    if (!mainMenuElement || !isMenuOpen) return
    
    menuAnimationFrame = 8
    menuAnimationTimer = 0
    
    // Reverse animation
    function animate() {
        menuAnimationTimer++
        if (menuAnimationTimer % 2 === 0) {
            menuAnimationFrame--
            const frames = 8
            const progress = Math.max(menuAnimationFrame / frames, 0)
            const eased = 1 - Math.pow(1 - progress, 3)
            const scale = eased * 0.8
            
            mainMenuPanel.style.transform = `scale(${scale})`
            
            if (progress > 0) {
                requestAnimationFrame(animate)
            } else {
                mainMenuPanel.style.transform = 'scale(0)'
                mainMenuElement.style.display = 'none'
                isMenuOpen = false
            }
        } else {
            requestAnimationFrame(animate)
        }
    }
    
    animate()
}

/**
 * Toggle main menu
 */
export function toggleMenu() {
    if (isMenuOpen) {
        closeMenu()
    } else {
        openMenu()
    }
}

function updateMenuUI() {
    // Exit pointer lock when showing menus
    if (state.ui.menuState !== 'inGame') {
        exitPointerLock()
    }
    
    // Hide all menus
    if (mainMenuElement) mainMenuElement.style.display = 'none'
    if (hostUIElement) hostUIElement.style.display = 'none'
    if (joinUIElement) joinUIElement.style.display = 'none'
    if (inGameUIElement) inGameUIElement.style.display = 'none'
    
    // Show appropriate menu based on state
    // Note: main menu visibility is controlled by openMenu/closeMenu, not here
    switch (state.ui.menuState) {
        case 'menu':
            // Main menu visibility controlled by isMenuOpen state
            break
        case 'hosting':
            if (hostUIElement) {
                hostUIElement.style.display = 'flex'
                const codeDisplay = document.getElementById('host-code-display')
                if (codeDisplay) codeDisplay.textContent = state.room.code || '...'
                const playersLabel = document.getElementById('host-players-label')
                if (playersLabel) {
                    playersLabel.textContent = `PLAYERS: ${state.room.players.length}/${state.room.maxPlayers}`
                }
                const startButton = document.getElementById('host-start-button')
                if (startButton) {
                    startButton.disabled = state.room.players.length < 1
                    startButton.style.opacity = startButton.disabled ? '0.5' : '1'
                    startButton.style.cursor = startButton.disabled ? 'not-allowed' : 'pointer'
                }
            }
            break
        case 'joining':
            if (joinUIElement) {
                joinUIElement.style.display = 'flex'
                const codeInput = document.getElementById('join-code-input')
                const statusLabel = document.getElementById('join-status-label')
                const playersLabel = document.getElementById('join-players-label')
                
                if (state.room.code) {
                    // Successfully joined - hide input, show status
                    if (codeInput) codeInput.style.display = 'none'
                    if (statusLabel) {
                        statusLabel.textContent = state.room.gameStarted 
                            ? 'GAME IN PROGRESS' 
                            : 'WAITING FOR HOST TO START...'
                        statusLabel.style.display = 'block'
                    }
                    if (playersLabel) {
                        playersLabel.textContent = `PLAYERS: ${state.room.players.length}/${state.room.maxPlayers}`
                        playersLabel.style.display = 'block'
                    }
                } else {
                    // Not joined yet - show input
                    if (codeInput) {
                        codeInput.style.display = 'block'
                        codeInput.focus()
                    }
                    if (statusLabel) {
                        statusLabel.textContent = ''
                        statusLabel.style.display = 'none'
                    }
                    if (playersLabel) {
                        playersLabel.textContent = ''
                        playersLabel.style.display = 'none'
                    }
                }
            }
            break
        case 'inGame':
            if (inGameUIElement) {
                // Only show in-game UI if in a multiplayer room
                if (state.room.code) {
                    inGameUIElement.style.display = 'block'
                    const codeLabel = document.getElementById('ingame-code-label')
                    const playersLabel = document.getElementById('ingame-players-label')
                    if (codeLabel) codeLabel.textContent = `ROOM: ${state.room.code}`
                    if (playersLabel) playersLabel.textContent = `PLAYERS: ${state.room.players.length}/${state.room.maxPlayers}`
                } else {
                    // Singleplayer mode - hide the UI
                    inGameUIElement.style.display = 'none'
                }
            }
            break
    }
}

function showError(message) {
    if (errorMessageElement) {
        errorMessageElement.textContent = message
        errorMessageElement.style.display = 'block'
        setTimeout(() => {
            errorMessageElement.style.display = 'none'
        }, 3000)
    }
}
