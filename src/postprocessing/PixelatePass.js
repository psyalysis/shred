import * as THREE from "three"
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass"

export default class PixelatePass extends Pass {

    constructor(resolution) {
        super()
        this.resolution = resolution
        // Pre-calculate pixel size for performance
        this.pixelSize = new THREE.Vector2(1 / resolution.x, 1 / resolution.y)
        this.fsQuad = new FullScreenQuad(this.material())
    }

    render(renderer, writeBuffer, readBuffer) {
        this.fsQuad.material.uniforms.tDiffuse.value = readBuffer.texture
        if (this.renderToScreen) {
            renderer.setRenderTarget(null)
        } else {
            renderer.setRenderTarget(writeBuffer)
            if (this.clear) renderer.clear()
        }
        this.fsQuad.render(renderer)
    }

    material() {
        return new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                resolution: {
                    value: new THREE.Vector4(
                        this.resolution.x,
                        this.resolution.y,
                        1 / this.resolution.x,
                        1 / this.resolution.y,
                    )
                }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec4 resolution;
                varying vec2 vUv;
                
                void main() {
                    // Improved pixelation sampling using pixel center for cleaner pixels
                    vec2 pixelSize = resolution.zw;
                    vec2 pixelCoord = floor(vUv * resolution.xy);
                    vec2 pixelCenter = (pixelCoord + 0.5) * pixelSize;
                    
                    // Sample at pixel center for optimal quality
                    vec4 texel = texture2D(tDiffuse, pixelCenter);
                    
                    gl_FragColor = texel;
                }
            `
        })
    }
}

