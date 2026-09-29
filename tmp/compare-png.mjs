import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

function decode(path) {
  const bytes = readFileSync(path)
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  const bitDepth = bytes[24], colorType = bytes[25], channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0
  if (bitDepth !== 8 || !channels) throw new Error(`unsupported PNG ${path}: depth=${bitDepth} type=${colorType}`)
  const chunks = []
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length))
    offset += 12 + length
    if (type === 'IEND') break
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels, pixels = Buffer.alloc(stride * height)
  let input = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[input++]
    for (let x = 0; x < stride; x++) {
      const value = raw[input++], left = x >= channels ? pixels[y * stride + x - channels] : 0
      const above = y ? pixels[(y - 1) * stride + x] : 0, upperLeft = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0
      let predictor = 0
      if (filter === 1) predictor = left
      else if (filter === 2) predictor = above
      else if (filter === 3) predictor = Math.floor((left + above) / 2)
      else if (filter === 4) {
        const p = left + above - upperLeft, a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - upperLeft)
        predictor = a <= b && a <= c ? left : b <= c ? above : upperLeft
      } else if (filter !== 0) throw new Error(`unknown PNG filter ${filter}`)
      pixels[y * stride + x] = (value + predictor) & 255
    }
  }
  return { width, height, channels, pixels }
}

for (const [leftPath, rightPath] of JSON.parse(process.argv[2])) {
  const a = decode(leftPath), b = decode(rightPath)
  if (a.width !== b.width || a.height !== b.height) throw new Error(`size mismatch ${leftPath} vs ${rightPath}`)
  let changed = 0, channelDelta = 0
  for (let i = 0; i < a.pixels.length; i++) {
    if (a.pixels[i] !== b.pixels[i]) { changed++; channelDelta += Math.abs(a.pixels[i] - b.pixels[i]) }
  }
  const pixelCount = a.width * a.height
  console.log(JSON.stringify({ leftPath, rightPath, changedPixels: changed / a.channels, totalPixels: pixelCount, changedChannels: changed, meanChannelDelta: channelDelta / changed || 0 }))
}
