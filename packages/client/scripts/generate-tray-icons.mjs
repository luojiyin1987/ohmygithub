import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '../../../assets/badge.svg') // repo-root assets/badge.svg
const outDir = resolve(here, '../resources/tray')

// A macOS template image must be a solid monochrome (black) glyph on transparency;
// Electron inverts it automatically for light/dark menu bars. badge.svg is a single
// purple mark, so we render it, then force every pixel's RGB to black while keeping
// the rendered alpha as the glyph mask.
async function renderTemplate(size, outFile) {
  const { data, info } = await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += info.channels) {
    data[i] = 0
    data[i + 1] = 0
    data[i + 2] = 0
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toFile(outFile)
}

async function renderColored(size, outFile) {
  await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outFile)
}

await mkdir(outDir, { recursive: true })
await renderTemplate(16, resolve(outDir, 'trayTemplate.png'))
await renderTemplate(32, resolve(outDir, 'trayTemplate@2x.png'))
await renderColored(16, resolve(outDir, 'tray.png'))
await renderColored(32, resolve(outDir, 'tray@2x.png'))
console.log('Generated tray icons in', outDir)
