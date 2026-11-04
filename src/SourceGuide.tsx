import { kommuneByNumber } from './kommuner';
import { KILDER } from './kilder';
import { vaKartUrl } from './vaKart';

interface SourceGuideProps {
  municipality: string;
  municipalityNumber: string;
}

const CHECK_LABELS: Record<string, string> = {
  va: 'Avstand til vann- og avløpsledninger',
  hoyspent: 'Avstand til høyspentkabler',
  avkjoring: 'Ny avkjøring',
  frisikt: 'Frisiktslinjer fra avkjøringen',
  parkering: 'Parkeringsplasser',
  snuplass: 'Snuplass for bil',
  uteopphold: 'Uteoppholdsareal',
  stottemur: 'Støttemurer og terrengendringer',
};

const labelFor = (tema: (typeof KILDER)[number]) =>
  CHECK_LABELS[tema.id] ?? tema.tittel;

const collator = new Intl.Collator('nb');
const SORTED_KILDER = [...KILDER].sort((a, b) =>
  collator.compare(labelFor(a), labelFor(b)),
);

export default function SourceGuide({
  municipality,
  municipalityNumber,
}: SourceGuideProps) {
  const kommune = kommuneByNumber(municipalityNumber);
  const name = kommune?.navn || municipality || 'valgt kommune';
  const directVaKart = vaKartUrl(municipalityNumber);

  return (
    <div className="source-panel">
      <h3>Når det er aktuelt</h3>
      <p className="hint">
        Utvid temaene som gjelder tiltaket. Hvert tema viser krav, nasjonale
        kilder og kommunens side for opplysningene.
      </p>

      <ul className="source-checks">
        {SORTED_KILDER.map((tema) => (
          <li key={tema.id}>
            <details className="source-check">
              <summary>
                <span>{labelFor(tema)}</span>
                <span className="source-question" aria-hidden="true">
                  ?
                </span>
              </summary>
              <div className="source-check-body">
                <p>{tema.kort}</p>
                {!(tema.id === 'va' && directVaKart) && (
                  <p className="source-local">{tema.kommunal}</p>
                )}
                {kommune && (
                  <p className="source-municipal">
                    <span>Kommunen:</span>{' '}
                    <a href={kommune.nettside} target="_blank" rel="noreferrer">
                      {name} kommune ↗
                    </a>
                  </p>
                )}
                {tema.id === 'va' && directVaKart && (
                  <a
                    className="source-direct"
                    href={directVaKart}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Direkte til VA-kart / ledningskart ↗
                  </a>
                )}
                <div className="source-links">
                  {tema.nasjonale.map((kilde) => (
                    <a
                      key={kilde.url}
                      href={kilde.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {kilde.label} ↗
                    </a>
                  ))}
                </div>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
