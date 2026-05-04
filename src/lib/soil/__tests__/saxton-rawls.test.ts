import { describe, test, expect } from 'vitest'
import { calculateSoilProperties, classifyTexture } from '../saxton-rawls'

describe('classifyTexture', () => {
  test('Argila pesada', () => {
    expect(classifyTexture(10.9, 28.2, 60.9)).toBe('Argiloso')
  })
  test('Argila-Arenosa', () => {
    expect(classifyTexture(50, 5, 45)).toBe('Argila-Arenosa')
  })
  test('Arenoso', () => {
    expect(classifyTexture(85, 10, 5)).toBe('Arenoso')
  })
  test('Franco', () => {
    expect(classifyTexture(40, 40, 20)).toBe('Franco')
  })
  test('Franco-Argiloso', () => {
    // 35% clay ≥ 27, silt < 40 → Franco-Argiloso
    expect(classifyTexture(35, 30, 35)).toBe('Franco-Argiloso')
  })
  test('Siltoso', () => {
    expect(classifyTexture(5, 88, 7)).toBe('Siltoso')
  })
})

describe('calculateSoilProperties', () => {
  test('Solo argiloso pesado — caso de validação principal', () => {
    // Saxton & Rawls para argila pesada: CC ~0.47, PMP ~0.29, Ds ~1.25
    // (valores PTF diferem de FAO-56 tabelado — PTF é específico para a granulometria)
    const result = calculateSoilProperties({
      sand: 10.9, silt: 28.2, clay: 60.9, organicMatter: 2.5,
    })
    expect(result.textureClass).toBe('Argiloso')
    expect(result.fieldCapacity).toBeGreaterThan(0.35)
    expect(result.fieldCapacity).toBeLessThan(0.55)
    expect(result.wiltingPoint).toBeGreaterThan(0.20)
    expect(result.wiltingPoint).toBeLessThan(0.38)
    expect(result.bulkDensity).toBeGreaterThan(1.0)
    expect(result.bulkDensity).toBeLessThan(1.7)
    expect(result.availableWater).toBeGreaterThan(0.05)
  })

  test('Solo arenoso — baixa retenção', () => {
    const result = calculateSoilProperties({
      sand: 85, silt: 10, clay: 5, organicMatter: 1.5,
    })
    expect(result.textureClass).toBe('Arenoso')
    expect(result.fieldCapacity).toBeLessThan(0.20)
    expect(result.wiltingPoint).toBeLessThan(result.fieldCapacity)
  })

  test('Solo Franco — valores médios', () => {
    const result = calculateSoilProperties({
      sand: 40, silt: 40, clay: 20, organicMatter: 2.5,
    })
    expect(result.fieldCapacity).toBeGreaterThan(0.20)
    expect(result.fieldCapacity).toBeLessThan(0.40)
    expect(result.bulkDensity).toBeGreaterThan(1.0)
    expect(result.bulkDensity).toBeLessThan(1.7)
  })

  test('MO padrão 2.5% quando não informada', () => {
    const comMO = calculateSoilProperties({ sand: 30, silt: 40, clay: 30, organicMatter: 2.5 })
    const semMO = calculateSoilProperties({ sand: 30, silt: 40, clay: 30 })
    expect(comMO.fieldCapacity).toBeCloseTo(semMO.fieldCapacity, 3)
  })

  test('fieldCapacityPct = fieldCapacity × 100', () => {
    const result = calculateSoilProperties({ sand: 30, silt: 40, clay: 30 })
    expect(result.fieldCapacityPct).toBeCloseTo(result.fieldCapacity * 100, 0)
  })

  test('Soma inválida lança erro', () => {
    expect(() =>
      calculateSoilProperties({ sand: 50, silt: 30, clay: 30 })
    ).toThrow(/100%/)
  })

  test('Soma 99% (tolerância) — não lança erro', () => {
    expect(() =>
      calculateSoilProperties({ sand: 34, silt: 33, clay: 32 })
    ).not.toThrow()
  })

  test('availableWater = fieldCapacity − wiltingPoint', () => {
    const r = calculateSoilProperties({ sand: 20, silt: 40, clay: 40 })
    expect(r.availableWater).toBeCloseTo(r.fieldCapacity - r.wiltingPoint, 2)
  })
})
