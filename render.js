import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass'
import { Vector2 } from "three"
import RenderPixelatedPass from "./RenderPixelatedPass.js"
import PixelatePass from "./PixelatePass.js"

export function createPixelRenderer(renderer, scene, camera, pixelationLevel = 6) {
    let screenResolution = new Vector2(window.innerWidth, window.innerHeight)
    let renderResolution = screenResolution.clone().divideScalar(pixelationLevel)
    renderResolution.x |= 0
    renderResolution.y |= 0

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPixelatedPass(renderResolution, scene, camera))
    let bloomPass = new UnrealBloomPass(screenResolution, .4, .1, .9)
    composer.addPass(bloomPass)
    composer.addPass(new PixelatePass(renderResolution))

    return composer
}

export function updatePixelRenderer(composer) {
    let screenResolution = new Vector2(window.innerWidth, window.innerHeight)
    composer.setSize(screenResolution.x, screenResolution.y)
}

