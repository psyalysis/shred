import * as THREE from "three"
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass"

export default class RenderPixelatedPass extends Pass {

    constructor(resolution, scene, camera) {
        super()
        this.resolution = resolution
        // Pre-calculate pixel size for performance
        this.pixelSize = new THREE.Vector2(1 / resolution.x, 1 / resolution.y)
        this.fsQuad = new FullScreenQuad(this.material())
        this.scene = scene
        this.camera = camera

        this.rgbRenderTarget = pixelRenderTarget(resolution, THREE.RGBAFormat, true)
        this.normalRenderTarget = pixelRenderTarget(resolution, THREE.RGBFormat, false)

        this.normalMaterial = new THREE.MeshNormalMaterial()
    }

    render(renderer, writeBuffer) {
        renderer.setRenderTarget(this.rgbRenderTarget)
        renderer.render(this.scene, this.camera)

        const overrideMaterial_old = this.scene.overrideMaterial
        renderer.setRenderTarget(this.normalRenderTarget)
        this.scene.overrideMaterial = this.normalMaterial
        renderer.render(this.scene, this.camera)
        this.scene.overrideMaterial = overrideMaterial_old

        this.fsQuad.material.uniforms.tDiffuse.value = this.rgbRenderTarget.texture
        this.fsQuad.material.uniforms.tDepth.value = this.rgbRenderTarget.depthTexture
        this.fsQuad.material.uniforms.tNormal.value = this.normalRenderTarget.texture

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
                tDepth: { value: null },
                tNormal: { value: null },
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
                uniform sampler2D tDepth;
                uniform sampler2D tNormal;
                uniform vec4 resolution;
                varying vec2 vUv;

                float getDepth(int x, int y) {
                    return texture2D(tDepth, vUv + vec2(x, y) * resolution.zw).r;
                }

                vec3 getNormal(int x, int y) {
                    return texture2D(tNormal, vUv + vec2(x, y) * resolution.zw).rgb * 2.0 - 1.0;
                }

                float neighborNormalEdgeIndicator(int x, int y, float depth, vec3 normal) {
                    float depthDiff = getDepth(x, y) - depth;
                    vec3 neighborNormal = getNormal(x, y);
                    
                    // Sharp normal comparison using dot product
                    float normalDot = dot(normal, neighborNormal);
                    float normalDiff = 1.0 - normalDot;
                    
                    // Use step for sharp edge detection (binary on/off)
                    float normalIndicator = step(0.05, normalDiff);
                    
                    // Sharp depth indicator with step function
                    float depthIndicator = step(0.005, abs(depthDiff));
                    
                    // Combine normal distance and indicators for sharp edges
                    float normalDistance = distance(normal, neighborNormal);
                    return normalDistance * depthIndicator * normalIndicator;
                }

                float depthEdgeIndicator() {
                    float depth = getDepth(0, 0);
                    float maxDiff = 0.0;
                    
                    // Sample cardinal neighbors for sharp edge detection
                    maxDiff = max(maxDiff, abs(getDepth(1, 0) - depth));
                    maxDiff = max(maxDiff, abs(getDepth(-1, 0) - depth));
                    maxDiff = max(maxDiff, abs(getDepth(0, 1) - depth));
                    maxDiff = max(maxDiff, abs(getDepth(0, -1) - depth));
                    
                    // Use step for sharp binary edge detection (no fading)
                    return step(0.005, maxDiff);
                }

                float normalEdgeIndicator() {
                    float depth = getDepth(0, 0);
                    vec3 normal = getNormal(0, 0);
                    
                    float maxIndicator = 0.0;

                    // Use max instead of sum for sharper edge detection
                    maxIndicator = max(maxIndicator, neighborNormalEdgeIndicator(0, -1, depth, normal));
                    maxIndicator = max(maxIndicator, neighborNormalEdgeIndicator(0, 1, depth, normal));
                    maxIndicator = max(maxIndicator, neighborNormalEdgeIndicator(-1, 0, depth, normal));
                    maxIndicator = max(maxIndicator, neighborNormalEdgeIndicator(1, 0, depth, normal));

                    // Sharp binary edge detection
                    return step(0.05, maxIndicator);
                }

                void main() {
                    vec4 texel = texture2D(tDiffuse, vUv);

                    // Sharp edges: pass through original color without darkening/fading
                    gl_FragColor = texel;
                }
            `
        })
    }
}

function pixelRenderTarget(resolution, pixelFormat, depthTexture) {
    const renderTarget = new THREE.WebGLRenderTarget(
        resolution.x, resolution.y,
        !depthTexture ?
            undefined
            : {
                depthTexture: new THREE.DepthTexture(
                    resolution.x,
                    resolution.y
                ),
                depthBuffer: true
            }
    )
    renderTarget.texture.format = pixelFormat
    renderTarget.texture.minFilter = THREE.NearestFilter
    renderTarget.texture.magFilter = THREE.NearestFilter
    renderTarget.texture.generateMipmaps = false
    renderTarget.stencilBuffer = false
    return renderTarget
}

