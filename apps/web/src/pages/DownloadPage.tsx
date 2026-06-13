import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Smartphone, ShieldCheck, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '../components/ui/button'

const GITHUB_REPO = 'guillermoscript/calistenia-app'
const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases`

interface ApkRelease {
  name: string
  tag: string
  version: string
  notes: string
  publishedAt: string
  downloadUrl: string
  sizeMb: string
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return iso
  }
}

export default function DownloadPage() {
  const navigate = useNavigate()
  const [release, setRelease] = useState<ApkRelease | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=15`,
          { signal: controller.signal, headers: { Accept: 'application/vnd.github+json' } },
        )
        if (!res.ok) throw new Error(`GitHub API ${res.status}`)
        const releases: Array<{
          name: string
          tag_name: string
          body: string
          published_at: string
          draft: boolean
          assets: Array<{ name: string; browser_download_url: string; size: number }>
        }> = await res.json()

        // First non-draft release that ships an .apk asset.
        for (const rel of releases) {
          if (rel.draft) continue
          const apk = rel.assets.find((a) => a.name.toLowerCase().endsWith('.apk'))
          if (apk) {
            setRelease({
              name: rel.name || rel.tag_name,
              tag: rel.tag_name,
              version: rel.tag_name.replace(/^mobile-v/, '').replace(/^v/, ''),
              notes: rel.body || '',
              publishedAt: rel.published_at,
              downloadUrl: apk.browser_download_url,
              sizeMb: (apk.size / (1024 * 1024)).toFixed(1),
            })
            setStatus('ready')
            return
          }
        }
        setStatus('error')
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setStatus('error')
      }
    }
    load()
    return () => controller.abort()
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <button
          onClick={() => navigate('/')}
          className="mb-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Volver
        </button>

        <div className="flex flex-col items-center text-center">
          <img src="/logo.png" alt="" className="w-20 h-20 rounded-2xl mb-6" />
          <h1 className="text-3xl font-bold mb-2">Descarga Calistenia para Android</h1>
          <p className="text-muted-foreground max-w-md">
            Instala la app directamente en tu teléfono. Entrenamientos, nutrición y
            seguimiento de progreso, también sin conexión.
          </p>
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-card p-6">
          {status === 'loading' && (
            <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Buscando la última versión…</span>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
              <p className="text-muted-foreground">
                No pudimos cargar la última versión automáticamente.
              </p>
              <Button asChild variant="outline">
                <a href={RELEASES_PAGE} target="_blank" rel="noreferrer">
                  Ver todas las versiones en GitHub
                </a>
              </Button>
            </div>
          )}

          {status === 'ready' && release && (
            <div className="flex flex-col items-center gap-5 text-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="w-4 h-4" />
                <span>
                  Versión {release.version} · {release.sizeMb} MB · {formatDate(release.publishedAt)}
                </span>
              </div>

              <Button asChild size="lg" className="w-full sm:w-auto">
                <a href={release.downloadUrl}>
                  <Download className="w-5 h-5" />
                  Descargar APK
                </a>
              </Button>

              {release.notes && (
                <details className="w-full text-left mt-2">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Novedades de esta versión
                  </summary>
                  <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                    {release.notes}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Install instructions */}
        <div className="mt-10">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-muted-foreground" />
            Cómo instalar
          </h2>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="font-bold text-foreground">1.</span>
              Descarga el archivo APK con el botón de arriba.
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-foreground">2.</span>
              Abre el archivo descargado. Android te pedirá permitir la instalación
              desde esta fuente — activa <strong className="text-foreground">"Permitir de esta fuente"</strong>.
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-foreground">3.</span>
              Toca <strong className="text-foreground">Instalar</strong> y abre la app. ¡Listo!
            </li>
          </ol>
          <p className="mt-6 text-xs text-muted-foreground">
            La app no está en Google Play todavía, por eso se instala como APK. Es
            seguro: el archivo se publica desde nuestro repositorio oficial en GitHub.
          </p>
        </div>
      </div>
    </div>
  )
}
