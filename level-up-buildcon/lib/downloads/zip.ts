import { ZipArchive } from 'archiver'
import { Writable } from 'stream'

/** A ZIP of the given files. A name may include folders, e.g. "Demand Notes/Basement slab/x.pdf". */
export function zipFiles(files: { name: string; buffer: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk)
        callback()
      },
    })
    const archive = new ZipArchive({ zlib: { level: 9 } })
    archive.on('error', reject)
    stream.on('finish', () => resolve(Buffer.concat(chunks)))
    archive.pipe(stream)
    for (const file of files) archive.append(file.buffer, { name: file.name })
    archive.finalize()
  })
}
