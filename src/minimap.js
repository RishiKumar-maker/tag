export class Minimap {
  constructor(canvas, arenaRadius) {
    this.ctx = canvas.getContext('2d')
    this.size = canvas.width
    this.arenaRadius = arenaRadius
  }

  render(players, localId) {
    const ctx = this.ctx
    const s = this.size
    ctx.clearRect(0, 0, s, s)

    ctx.fillStyle = 'rgba(0,0,0,0.15)'
    ctx.beginPath()
    ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2)
    ctx.fill()

    const scale = (s / 2 - 10) / this.arenaRadius

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
