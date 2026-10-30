import { Link } from 'react-router-dom'

function EmptyState({ title = 'Nothing to show yet', message = 'There is nothing here right now. Check back soon.', actionLabel = 'Explore trips', actionTo = '/trips', showAction = true }) {
  return <section className="mx-auto flex w-full max-w-xl flex-col items-center rounded-3xl border border-forest/10 bg-white px-6 py-12 text-center shadow-sm sm:px-10">
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ivory text-3xl text-forest" aria-hidden="true">✦</div>
    <h2 className="mt-5 font-heading text-2xl font-semibold text-forest">{title}</h2>
    <p className="mt-3 max-w-md text-sm leading-6 text-muted">{message}</p>
    {showAction && actionTo && <Link to={actionTo} className="button-primary mt-6">{actionLabel}</Link>}
  </section>
}

export default EmptyState
