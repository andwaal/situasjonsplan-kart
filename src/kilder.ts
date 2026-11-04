export interface Kilde {
  label: string;
  url: string;
}

export interface Tema {
  id: string;
  nummer: string;
  tittel: string;
  kort: string;
  kommunal: string;
  nasjonale: Kilde[];
}

export const KILDER: readonly Tema[] = [
  {
    id: 'va',
    nummer: '01',
    tittel: 'Avstand til vann- og avløpsledninger',
    kort: 'Det finnes ikke ett nasjonalt åpent VA-kart. Kommunen eier som regel ledningskartet, og mange krever BankID.',
    kommunal:
      'Søk på kommunens nettsted etter «VA-kart», «ledningskart» eller «gravemelding». Mange kommuner gir ledningskart bare til huseier, rørlegger eller entreprenør.',
    nasjonale: [
      {
        label: 'Gravemelding – ledningspåvisning',
        url: 'https://gravemelding.no/',
      },
      { label: 'VA-norm – kommunale VA-krav', url: 'https://va-norm.no/' },
      {
        label: 'TEK17 § 15-7 – utvendig vannforsyning',
        url: 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/15/iii/15-7',
      },
      {
        label: 'TEK17 § 15-8 – utvendig avløp',
        url: 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/15/iii/15-8',
      },
    ],
  },
  {
    id: 'hoyspent',
    nummer: '02',
    tittel: 'Avstand til høyspentkabler',
    kort: 'NVE viser overførings- og regionalnett, men kraftsensitive anlegg og lokale fordelingskabler er ikke alltid offentlige.',
    kommunal:
      'Finn nettleverandøren på strømregningen eller i Elhub. Kontakt nettselskapet for kabelpåvisning før graving; NVE-kartet er ikke komplett.',
    nasjonale: [
      {
        label: 'NVE Temakart – nettanlegg',
        url: 'https://temakart.nve.no/tema/nettanlegg',
      },
      { label: 'NVE Atlas', url: 'https://atlas.nve.no/' },
      { label: 'Elhub – Min side', url: 'https://elhub.no/stromkunde' },
      {
        label: 'NVE – NettKart og kraftsensitiv data',
        url: 'https://www.nve.no/energi/energisystem/nett/kraftsystemdata/nettkart',
      },
      {
        label: 'Geomatikk – kabelpåvisning',
        url: 'https://geomatikk.no/jeg-skal-grave/',
      },
    ],
  },
  {
    id: 'avkjoring',
    nummer: '03',
    tittel: 'Ny avkjøring',
    kort: 'Avkjøring fra offentlig veg krever tillatelse etter vegloven § 40. Vegmyndigheten avhenger av om det er kommunal veg, fylkesveg eller riksveg.',
    kommunal:
      'Søk etter «avkjøring» eller «avkjøringstillatelse». Kommunen er vegmyndighet for kommunal veg, fylkeskommunen for fylkesveg og Statens vegvesen for riksveg.',
    nasjonale: [
      {
        label: 'Vegloven',
        url: 'https://lovdata.no/dokument/NL/lov/1963-06-21-23',
      },
      {
        label: 'N100 – veg- og gateutforming',
        url: 'https://www.vegvesen.no/fag/publikasjoner/handboker/vegnormalene/n100',
      },
      {
        label: 'Vegkart – vegnett og vegmyndighet',
        url: 'https://vegkart.atlas.vegvesen.no/',
      },
      {
        label: 'SAK10 § 4-1 – unntak og frisikt',
        url: 'https://www.dibk.no/regelverk/sak/2/4/4-1',
      },
    ],
  },
  {
    id: 'frisikt',
    nummer: '04',
    tittel: 'Frisiktslinjer fra avkjøringen',
    kort: 'Frisikt er siktkrav i avkjørsel og kryss. N100 og kommunens veinorm angir frisiktsoner; reguleringsplanen kan ha egne soner.',
    kommunal:
      'Søk etter «veinormal» og «frisikt» på kommunens nettsted. Sjekk også reguleringsplanens frisiktsoner og byggegrenser.',
    nasjonale: [
      {
        label: 'N100 – krav til kryss og avkjørsler',
        url: 'https://www.vegvesen.no/fag/publikasjoner/handboker/vegnormalene/n100',
      },
      {
        label: 'SAK10 § 4-1 – frisiktsone mot veg',
        url: 'https://www.dibk.no/regelverk/sak/2/4/4-1',
      },
      {
        label: 'Vegloven',
        url: 'https://lovdata.no/dokument/NL/lov/1963-06-21-23',
      },
    ],
  },
  {
    id: 'parkering',
    nummer: '05',
    tittel: 'Parkeringsplasser',
    kort: 'Antall plasser følger kommunens parkeringsnorm eller plan, ikke en nasjonal norm. TEK17 stiller krav til tilgjengelige plasser og lading.',
    kommunal:
      'Søk etter «parkeringsnorm» i kommuneplanens arealdel og reguleringsplanen. Sjekk også om planen krever besøksparkering eller sykkelparkering.',
    nasjonale: [
      {
        label: 'TEK17 § 8-8 – parkering og kjøreatkomst',
        url: 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/8/8-8',
      },
      {
        label: 'TEK17 § 5-7 – parkeringsareal',
        url: 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/5/5-7',
      },
      {
        label: 'Plan- og bygningsloven § 28-7',
        url: 'https://lovdata.no/dokument/NL/lov/2008-06-27-71/KAPITTEL_4-9',
      },
    ],
  },
  {
    id: 'snuplass',
    nummer: '06',
    tittel: 'Snuplass for bil',
    kort: 'Krav til snuplass og dimensjoner ligger i N100 og kommunens veinorm. Brannvesenets adkomst kan også kreve snuplass.',
    kommunal:
      'Søk etter «snuplass» og «veinormal» på kommunens nettsted. Sjekk også brannvesenets adkomstkrav.',
    nasjonale: [
      {
        label: 'N100 – snuplasser',
        url: 'https://www.vegvesen.no/fag/publikasjoner/handboker/vegnormalene/n100',
      },
      {
        label: 'TEK17 § 11-17 – rednings- og slokkemannskap',
        url: 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/11/v/11-17',
      },
      {
        label: 'Vegkart – vegnett',
        url: 'https://vegkart.atlas.vegvesen.no/',
      },
    ],
  },
  {
    id: 'uteopphold',
    nummer: '07',
    tittel: 'Uteoppholdsareal',
    kort: 'Kommunen fastsetter minste uteoppholdsareal (MUA) i planen. TEK17 § 5-6 og § 8-3 stiller kvalitetskrav til arealet.',
    kommunal:
      'Søk i planregisteret etter «MUA», «uteoppholdsareal», «solsone» og «lekeareal». Arealet må vises på situasjonsplan eller utomhusplan.',
    nasjonale: [
      {
        label: 'TEK17 § 5-6 – minste uteoppholdsareal',
        url: 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/5/5-6',
      },
      {
        label: 'TEK17 § 8-3 – utforming av uteoppholdsareal',
        url: 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/8/8-3',
      },
      {
        label: 'Plan- og bygningsloven § 28-7',
        url: 'https://lovdata.no/dokument/NL/lov/2008-06-27-71/KAPITTEL_4-9',
      },
    ],
  },
  {
    id: 'stottemur',
    nummer: '08',
    tittel: 'Støttemurer og terrengendringer',
    kort: 'Små støttemurer og planeringer kan være unntatt søknad. Grensene avhenger av høyde, avstand til nabogrense og terreng.',
    kommunal:
      'Søk etter «støttemur», «terrengendring» og «byggesak». Sjekk plan, nabogrense og fare for kvikkleire eller skred.',
    nasjonale: [
      {
        label: 'SAK10 § 4-1 – unntak for støttemur og planering',
        url: 'https://www.dibk.no/regelverk/sak/2/4/4-1',
      },
      {
        label: 'TEK17 § 7-1 – sikkerhet mot naturpåkjenninger',
        url: 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/7/7-1',
      },
      {
        label: 'TEK17 § 7-3 – sikkerhet mot skred',
        url: 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/7/7-3',
      },
      {
        label: 'NVE Temakart – kvikkleire',
        url: 'https://temakart.nve.no/tema/kvikkleire',
      },
    ],
  },
];
