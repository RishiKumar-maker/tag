export class Minimap {
  /** bounds: the map's { shape: 'circle' | 'rect', ... } (see maps.js).
   * colliders: box colliders are drawn so a map's lanes are readable at a glance. */
  constructor(canvas, bounds, colliders = []) {
    this.ctx = canvas.getContext('2d')
    this.size = canvas.width
    this.bounds = bounds
    this.boxes = colliders.filter((c) => c.hx !== undefined)
    const room = this.size / 2 - 10
    this.scale = bounds.shape === 'circle' ? room / bounds.radius : room / Math.max(bounds.halfX, bounds.halfZ)
  }

  render(players, localId) {
    const ctx = this.ctx
    const s = this.size
    const scale = this.scale
    ctx.clearRect(0, 0, s, s)

    ctx.fillStyle = 'rgba(0,0,0,0.15)'
    ctx.beginPath()
    if (this.bounds.shape === 'circle') {
      ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2)
    } else {
      const w = this.bounds.halfX * scale * 2 + 8
      const h = this.bounds.halfZ * scale * 2 + 8
      ctx.roundRect(s / 2 - w / 2, s / 2 - h / 2, w, h, 8)
    }
    ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.32)'
    for (const b of this.boxes) {
      ctx.fillRect(s / 2 + (b.x - b.hx) * scale, s / 2 + (b.z - b.hz) * scale, b.hx * 2 * scale, b.hz * 2 * scale)
    }

    for (const p of players) {
      const x = s / 2 + p.x * scale
      const y = s / 2 + p.z * scale

      if (p.isChaser) {
        ctx.beginPath()
        ctx.arc(x, y, 7, 0, Math.PI * 2)
        ctx.strokeStyle = '#ff8c69'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      ctx.beginPath()
      ctx.arc(x, y, p.id === localId ? 5 : 4, 0, Math.PI * 2)
      ctx.fillStyle = p.color
      ctx.fill()

      if (p.id === localId) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
  }
}
