import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lemma — Terminology Extraction',
  description: 'AI-powered live glossary with RAG grounding',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
