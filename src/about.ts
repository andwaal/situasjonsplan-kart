export interface Disclaimer {
  title: string;
  body: string;
}

export const ABOUT_INTRO =`Denne nettsiden er en teknisk demonstrasjon på hva som er mulig å lage på toppen av norske offentlige data.
\nSom et ikke kommersielt gratisverktøy, så tar vi intet ansvar eller gir noen garantier.   
\n\nNettsiden ble laget som en protest til at norske kommuner i praksis låser våre offentlige dataer bak betalingsmurer i form av kommersielle tilbydere knyttet til offentlige søknader.
`;

export const ABOUT_REPOSITORY_URL =
  'https://github.com/andwaal/situasjonsplan-kart';

export const ABOUT_DISCLAIMERS: Disclaimer[] = [
  {
    title: 'Ikke juridisk rådgivning',
    body:
      'Innholdet er veiledning, ikke juridisk rådgivning. Det som står her, er ikke bindende for kommunen eller andre myndigheter.',
  },
  {
    title: 'Kommunen bestemmer',
    body:
      'Krav i plan- og bygningsloven, kommuneplan, reguleringsplan og kommunens egne retningslinjer gjelder foran det som vises i verktøyet. Kontroller alltid kravene med kommunen før du sender søknad.',
  },
  {
    title: 'Kart og eiendomsdata',
    body:
      'Kart, eiendomsgrenser og adresser hentes fra Kartverket, Geonorge og Matrikkelen. Data kan være forsinket, ufullstendige eller unøyaktige. Kontroller opplysningene mot originaldokumenter og forholdene på stedet.',
  },
  {
    title: 'Mål og avstander',
    body:
      'Avstander og arealer beregnes fra kartgrunnlaget og er ikke landmåling. Der nøyaktigheten er viktig, må forholdene måles på stedet av fagperson.',
  },
  {
    title: 'Ingen godkjenning',
    body:
      'Verktøyet gir ingen garanti for at søknaden eller situasjonsplanen godkjennes. Du er ansvarlig for at vedlegg, mål og opplysninger er riktige og fullstendige.',
  },
  {
    title: 'Kommunale kilder og lenker',
    body:
      'Lenker til kommunale sider og andre tjenester er veiledende. Innholdet kan endres uten varsel, og kommunen kan ha nye krav, skjemaer eller søknadsrutiner.',
  },
  {
    title: 'Lagring i nettleseren',
    body:
      'Prosjekter lagres bare lokalt i nettleseren. Tømming av nettleserdata eller bruk av privat modus kan slette dem. Last ned PDF-en før du avslutter.',
  },
  {
    title: 'Personvern',
    body:
      'Verktøyet har ingen konto eller egen serverlagring. Adresse og opplysninger du skriver inn, blir i nettleseren og sendes bare til oppslagstjenestene som brukes for kart og eiendomsdata.',
  },
  {
    title: 'Ansvar',
    body:
      'Verktøyet leveres som det er. Så langt loven tillater det, tas det ikke ansvar for tap eller skader som følger av bruk, feil i kartgrunnlag eller feil i generert PDF.',
  },
];
