import { palette } from './palette.js';

export class MiniMap {
  constructor(canvas, map) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = map;
  }

  draw(player) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    const mapWidth = this.map.bounds.maxX - this.map.bounds.minX;
    const mapHeight = this.map.bounds.maxY - this.map.bounds.minY;
    const mx = (x) => (x - this.map.bounds.minX) * width / mapWidth;
    const my = (z) => height - (z - this.map.bounds.minY) * height / mapHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = palette.groundShadow;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(86, 144, 111, .34)';
    for (const zone of this.map.zones) ctx.fillRect(mx(zone.minX), 0, mx(zone.maxX) - mx(zone.minX), height);
    ctx.strokeStyle = 'rgba(188, 230, 205, .24)';
    ctx.lineWidth = 0.6;
    for (const zone of this.map.zones.slice(1)) {
      ctx.beginPath(); ctx.moveTo(mx(zone.minX), 0); ctx.lineTo(mx(zone.minX), height); ctx.stroke();
    }
    ctx.beginPath();
    this.map.river.centerline.forEach(([x, y], index) => index ? ctx.lineTo(mx(x), my(y)) : ctx.moveTo(mx(x), my(y)));
    ctx.strokeStyle = '#1faeac';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.strokeStyle = '#5ef5eb';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const nodes = new Map(this.map.paths.nodes.map((node) => [node.id, node]));
    ctx.strokeStyle = '#b1b9a8';
    ctx.lineWidth = 1.15;
    ctx.lineCap = 'round';
    for (const [from, to] of this.map.paths.edges) {
      const a = nodes.get(from); const b = nodes.get(to);
      ctx.beginPath(); ctx.moveTo(mx(a.x), my(a.y)); ctx.lineTo(mx(b.x), my(b.y)); ctx.stroke();
    }
    for (const crossing of this.map.river.crossings) {
      ctx.beginPath(); ctx.arc(mx(crossing.x), my(crossing.y), 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#c6fff0'; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(mx(player.x), my(player.y), 2.9, 0, Math.PI * 2);
    ctx.fillStyle = '#effff4'; ctx.fill();
    ctx.strokeStyle = '#54e8d4'; ctx.lineWidth = 1;
    ctx.stroke();
  }
}
