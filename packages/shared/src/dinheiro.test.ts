import { describe, expect, it } from 'vitest';
import { formatarCentavos, parseReais } from './dinheiro';
import { competenciaDe, proximaCompetencia } from './competencia';

describe('parseReais', () => {
  it.each([
    ['R$ 1.234,56', 123456],
    ['30,00', 3000],
    ['30', 3000],
    ['12.5', 1250],
    ['R$ 0,99', 99],
  ])('%s -> %i', (texto, esperado) => {
    expect(parseReais(texto)).toBe(esperado);
  });

  it('recusa texto inválido', () => {
    expect(parseReais('abc')).toBeNull();
    expect(parseReais('1,234')).toBeNull();
  });
});

describe('formatarCentavos', () => {
  it('formata em reais', () => {
    expect(formatarCentavos(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  });
});

describe('competencia', () => {
  it('usa o fuso de São Paulo', () => {
    // 01/11 às 01h UTC ainda é 31/10 em São Paulo
    expect(competenciaDe(new Date('2026-11-01T01:00:00Z'))).toBe('2026-10');
  });

  it('vira o ano', () => {
    expect(proximaCompetencia('2026-12')).toBe('2027-01');
    expect(proximaCompetencia('2026-09')).toBe('2026-10');
  });
});
