import * as THREE from "three"
import { Vector2 } from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import { createPixelRenderer, updatePixelRenderer } from "./render.js"

let camera, scene, renderer, composer
let controls
let cubeMesh
let cubeTransform = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 }
}
let cubeVelocity = { x: 0, y: 0, z: 0 }
let angularVelocity = { z: 0 }
const gravity = -0.0005
const jumpImpulse = 0.02
const rotationSpeed = 0.02
const angularDamping = 0.95
const alignmentTorque = 0.001
const floorY = -0.5
const cubeHalfHeight = 0.1
const keys = {}

init()
animate()

function init() {
    let screenResolution = new Vector2(window.innerWidth, window.innerHeight)
    let aspectRatio = screenResolution.x / screenResolution.y

    camera = new THREE.OrthographicCamera(-aspectRatio, aspectRatio, 1, -1, 0.1, 10)
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x151729)

    renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.shadowMap.enabled = true
    renderer.setSize(screenResolution.x, screenResolution.y)
    document.body.appendChild(renderer.domElement)

    composer = createPixelRenderer(renderer, scene, camera)

    controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    camera.position.z = 2
    camera.position.y = 2 * Math.tan(Math.PI / 6)
    controls.update()

    // Brick floor
    const floorGeometry = new THREE.PlaneGeometry(10, 10)
    const floorMaterial = new THREE.MeshPhongMaterial({
        color: 0x959595
    })
    const floor = new THREE.Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.5
    floor.receiveShadow = true
    scene.add(floor)

    // White cube
    const geometry = new THREE.BoxGeometry(0.3, 0.2, 0.6)
    const material = new THREE.MeshPhongMaterial({
        color: 0xffffff
    })
    cubeMesh = new THREE.Mesh(geometry, material)
    cubeMesh.castShadow = true
    cubeMesh.receiveShadow = true
    scene.add(cubeMesh)
    
    // Initialize cube transform data
    updateCubeTransform()

    // Lights
    scene.add(new THREE.AmbientLight(0x2d3645, 1.5))
    {
        let directionalLight = new THREE.DirectionalLight(0xfffc9c, .5)
        directionalLight.position.set(100, 100, 100)
        directionalLight.castShadow = true
        directionalLight.shadow.mapSize.set(2048, 2048)
        scene.add(directionalLight)
    }
    /*{
        let spotLight = new THREE.SpotLight(0xff8800, 1, 10, Math.PI / 16, .02, 2)
        spotLight.position.set(2, 2, 0)
        let target = spotLight.target
        scene.add(target)
        target.position.set(0, 0, 0)
        spotLight.castShadow = true
        scene.add(spotLight)
    }*/

    window.addEventListener('resize', onWindowResize)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
}

function onKeyDown(event) {
    keys[event.code] = true
    if (event.key.toLowerCase() === 'o') {
        controls.enabled = !controls.enabled
    }
    if (event.code === 'Space') {
        event.preventDefault()
        const cubeBottom = cubeMesh.position.y - cubeHalfHeight
        if (Math.abs(cubeBottom - floorY) < 0.01) {
            cubeVelocity.y = jumpImpulse
        }
    }
}

function onKeyUp(event) {
    keys[event.code] = false
}

function onWindowResize() {
    let screenResolution = new Vector2(window.innerWidth, window.innerHeight)
    let aspectRatio = screenResolution.x / screenResolution.y

    camera.left = -aspectRatio
    camera.right = aspectRatio
    camera.updateProjectionMatrix()

    renderer.setSize(screenResolution.x, screenResolution.y)
    updatePixelRenderer(composer)
}

function updateCubeTransform() {
    cubeTransform.position.x = cubeMesh.position.x
    cubeTransform.position.y = cubeMesh.position.y
    cubeTransform.position.z = cubeMesh.position.z
    cubeTransform.rotation.x = cubeMesh.rotation.x
    cubeTransform.rotation.y = cubeMesh.rotation.y
    cubeTransform.rotation.z = cubeMesh.rotation.z
}

function animate() {
    requestAnimationFrame(animate)
    
    // Lock x rotation to 0
    cubeMesh.rotation.x = 0
    
    // Check if cube is on floor
    const cubeBottom = cubeMesh.position.y - cubeHalfHeight
    const isOnFloor = Math.abs(cubeBottom - floorY) < 0.01
    
    // Handle z-axis rotation with A and D keys (only when in air)
    if (!isOnFloor) {
        if (keys['KeyA']) {
            angularVelocity.z += rotationSpeed
        }
        if (keys['KeyD']) {
            angularVelocity.z -= rotationSpeed
        }
    }
    
    // Apply gravity
    cubeVelocity.y += gravity
    
    // Update position
    cubeMesh.position.y += cubeVelocity.y
    
    // Floor collision
    if (cubeBottom <= floorY) {
        cubeMesh.position.y = floorY + cubeHalfHeight
        cubeVelocity.y = 0
        
        // Apply alignment torque to make cube fall flat
        const targetRotation = 0
        const rotationDiff = targetRotation - cubeMesh.rotation.z
        // Normalize rotation difference to shortest path
        let normalizedDiff = rotationDiff
        while (normalizedDiff > Math.PI) normalizedDiff -= 2 * Math.PI
        while (normalizedDiff < -Math.PI) normalizedDiff += 2 * Math.PI
        
        angularVelocity.z += normalizedDiff * alignmentTorque
        angularVelocity.z *= angularDamping
        
        // Lock rotation if very close to flat and velocity is low
        if (Math.abs(cubeMesh.rotation.z) < 0.01 && Math.abs(angularVelocity.z) < 0.0001) {
            cubeMesh.rotation.z = 0
            angularVelocity.z = 0
        }
    } else {
        // Apply angular damping in air
        angularVelocity.z *= angularDamping
    }
    
    // Apply angular velocity
    cubeMesh.rotation.z += angularVelocity.z
    
    updateCubeTransform()
    controls.update()
    composer.render()
}

