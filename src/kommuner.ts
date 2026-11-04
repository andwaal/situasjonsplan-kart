import data from './kommuner.json';

export interface Kommune {
  nummer: string;
  navn: string;
  nettside: string;
}

export const KOMMUNER: readonly Kommune[] = data;

const BY_NUMBER = new Map(KOMMUNER.map((kommune) => [kommune.nummer, kommune]));

export function kommuneByNumber(
  number: string | null | undefined,
): Kommune | undefined {
  if (!number) return undefined;
  return BY_NUMBER.get(number.padStart(4, '0'));
}
