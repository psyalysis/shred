import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass'
import { Vector2 } from "three"
import RenderPixelatedPass from "../postprocessing/RenderPixelatedPass.js"
import PixelatePass from "../postprocessing/PixelatePass.js"

let bloomPassInstance = null

export function createPixelRenderer(renderer, scene, camera, pixelationLevel = 6) {
    let screenResolution = new Vector2(window.innerWidth, window.innerHeight)
    let renderResolution = screenResolution.clone().divideScalar(pixelationLevel)
    renderResolution.x |= 0
    renderResolution.y |= 0

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPixelatedPass(renderResolution, scene, camera))
    // Pixelated bloom: base strength reduced to 1/3rd of original (0.5 / 3 = 0.1667)
    // Higher threshold (0.85) so only bright objects bloom, not darker surfaces like floor
    // Radius 0.2
    bloomPassInstance = new UnrealBloomPass(screenResolution, 0.3, 0.3, 0.95)
    composer.addPass(bloomPassInstance)
    composer.addPass(new PixelatePass(renderResolution))

    return composer
}

export function updateBloomIntensity(intensity) {
    if (bloomPassInstance) {
        // Bloom maximum is hardcoded to 1/3rd of original (0.1667 base strength)
        // Slider directly controls strength: 0% = 0, 100% = 0.1667
        bloomPassInstance.strength = intensity * 0.12
    }
}

export function updatePixelRenderer(composer) {
    let screenResolution = new Vector2(window.innerWidth, window.innerHeight)
    composer.setSize(screenResolution.x, screenResolution.y)
}

let rendererInstance = null
let sceneInstance = null
let cameraInstance = null

export function recreatePixelRenderer(pixelationLevel) {
    if (!rendererInstance || !sceneInstance || !cameraInstance) return null
    
    // Recreate composer with new pixelation level
    const newComposer = createPixelRenderer(rendererInstance, sceneInstance, cameraInstance, pixelationLevel)
    return newComposer
}

export function setRendererReferences(renderer, scene, camera) {
    rendererInstance = renderer
    sceneInstance = scene
    cameraInstance = camera
}

