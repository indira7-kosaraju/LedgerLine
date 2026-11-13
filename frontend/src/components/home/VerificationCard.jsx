import Logo from '../Logo'
import { CheckIcon } from './homeIcons'

// The floating card on the hero illustration. It explains what LedgerLine guarantees – it is NOT a live
// verification result (the live checks are in the System status panel and on the auditor's dashboard).
const POINTS = ['Traceable', 'Tamper-evident', 'Audited']

export default function VerificationCard({ className }) {
  return (
    <div className={className}>
      <div className="rounded-2xl border border-gold-line/80 bg-[linear-gradient(150deg,rgb(40_31_14/0.96),rgb(14_12_8/0.97))] px-6 py-5 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.9),0_0_40px_-8px_rgb(212_166_58/0.45)] ring-1 ring-inset ring-gold-bright/10 backdrop-blur-sm [transform:perspective(900px)_rotateY(-16deg)_rotateZ(-4deg)]">
        <Logo className="[&>span]:text-base [&>svg]:size-6" />
        <ul className="mt-4 space-y-3" aria-label="What LedgerLine guarantees">
          {POINTS.map((p) => (
            <li key={p} className="flex items-center gap-3 text-sm font-medium italic text-ink">
              <CheckIcon className="size-5 text-gold-soft" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
