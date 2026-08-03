import * as THREE from '../lib/three.module.min.js'
import { buildCar } from './carLibrary.js'

export class CarPreview {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20)
    this.camera.position.set(2.7, 1.7, 3.1)
    this.camera.lookAt(0, 0.4, 0)

    const hemi = new THREE.HemisphereLight(0xfff1dd, 0x7fa98c, 1.2)
    this.scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffe3b8, 1.1)
    sun.position.set(3, 5, 2)
    this.scene.add(sun)

    this.currentGroup = null
    this.spinY = 0
    this._requestId = 0

    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)
    this._onResize()
  }

  /** Swap the displayed car. Safe to call again before a previous swap
   * finishes loading -- only the most recent request wins. */
  async setCar(carTypeId, colorHex) {
    const requestId = ++this._requestId
    const { vehicle } = await buildCar(carTypeId, colorHex)
    if (requestId !== this._requestId) return // a newer selection arrived first

    if (this.currentGroup) this.scene.remove(this.currentGroup)
    this.currentGroup = vehicle
    this.scene.add(vehicle)
  }

  render(dt) {
    if (this.currentGroup) {
      this.spinY += dt * 0.5
      this.currentGroup.rotation.y = this.spinY
    }
    this.renderer.render(this.scene, this.camera)
  }

  _onResize() {
    const w = this.canvas.clientWidth || 240
    const h = this.canvas.clientHeight || 160
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }
}
