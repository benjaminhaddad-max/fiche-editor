/**
 * Ce qui s'affiche pendant qu'une page se charge.
 *
 * Sans cet écran, un clic sur une rubrique ne produisait rien de visible
 * jusqu'à ce que le serveur réponde : on croyait que le clic n'avait pas
 * été pris. La silhouette du bandeau apparaît immédiatement, le contenu se
 * glisse dedans quand il arrive.
 */
export default function Chargement() {
  return (
    <div className="animate-pulse">
      <div className="ds-panel-header-slot -mx-8 -mt-8 mb-7">
        <div className="ds-panel-header">
          <div className="ds-panel-header__body px-8 pb-6 pt-9">
            <div className="h-[38px] w-64 rounded bg-white/15" />
            <div className="mt-2.5 h-4 w-96 max-w-full rounded bg-white/10" />
          </div>
          <div className="ds-panel-header__tabs px-8 pt-1">
            <div className="flex gap-6 border-b border-white/10 pb-3 pt-2.5">
              {[72, 120, 96].map((w) => (
                <div key={w} className="h-4 rounded bg-white/10" style={{ width: w }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-line bg-white p-5">
            <div className="h-3 w-24 rounded bg-cream-deep" />
            <div className="mt-3 h-7 w-32 rounded bg-cream-deep" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="h-10 border-b border-line bg-cream-muted" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line/60 px-4 py-4 last:border-0">
            <div className="h-4 flex-1 rounded bg-cream-deep" />
            <div className="h-4 w-24 rounded bg-cream-deep" />
            <div className="h-4 w-20 rounded bg-cream-deep" />
          </div>
        ))}
      </div>
    </div>
  )
}
