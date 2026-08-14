import { describe, it, expect } from 'vitest'
import { getChallengeLayout, getGoalProgress } from './challenge-layout'

describe('getChallengeLayout', () => {
  it('manda a la rama de meta cuando hay meta', () => {
    expect(getChallengeLayout({ goal: 100 })).toBe('goal')
  })

  it('manda a la rama de ranking cuando la meta es 0', () => {
    expect(getChallengeLayout({ goal: 0 })).toBe('ranking')
  })

  it('manda a la rama de ranking cuando no hay campo goal', () => {
    expect(getChallengeLayout({})).toBe('ranking')
  })

  it('un reto express se queda en su propio layout aunque traiga meta', () => {
    expect(getChallengeLayout({ goal: 100, type: 'express' })).toBe('express')
  })

  it('un reto standard con meta sigue siendo de meta', () => {
    expect(getChallengeLayout({ goal: 12, type: 'standard' })).toBe('goal')
  })

  it('sin reto cargado no revienta y cae en ranking', () => {
    expect(getChallengeLayout(null)).toBe('ranking')
    expect(getChallengeLayout(undefined)).toBe('ranking')
  })
})

describe('getGoalProgress', () => {
  it('calcula porcentaje y lo que falta', () => {
    expect(getGoalProgress(30, 100)).toEqual({ pct: 30, remaining: 70, reached: false })
  })

  it('marca la meta alcanzada justo al llegar', () => {
    expect(getGoalProgress(100, 100)).toEqual({ pct: 100, remaining: 0, reached: true })
  })

  it('no desborda ni deja pendientes negativos al pasarse de la meta', () => {
    expect(getGoalProgress(180, 100)).toEqual({ pct: 100, remaining: 0, reached: true })
  })

  it('sin meta válida devuelve cero en vez de NaN', () => {
    expect(getGoalProgress(10, 0)).toEqual({ pct: 0, remaining: 0, reached: false })
    expect(getGoalProgress(10, undefined)).toEqual({ pct: 0, remaining: 0, reached: false })
  })

  it('trata un valor ausente o absurdo como 0', () => {
    expect(getGoalProgress(NaN, 50)).toEqual({ pct: 0, remaining: 50, reached: false })
    expect(getGoalProgress(-5, 50)).toEqual({ pct: 0, remaining: 50, reached: false })
  })

  it('redondea el porcentaje', () => {
    expect(getGoalProgress(1, 3).pct).toBe(33)
  })
})
