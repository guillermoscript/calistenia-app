import i18n from './i18n'

export interface Quote {
  q: string
  a: string
}

export function getLocalQuotes(): Quote[] {
  return Array.from({ length: 20 }, (_, i) => ({
    q: i18n.t(`motivation.quote${i}`),
    a: i18n.t(`motivation.author${i}`),
  }))
}

export function getLocalQuote(): Quote {
  const quotes = getLocalQuotes()
  return quotes[Math.floor(Math.random() * quotes.length)]
}
