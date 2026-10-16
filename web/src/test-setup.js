// Web tests (#100): DOM matchers like toBeInTheDocument, and a clean page
// after each test.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

// jsdom has <dialog> but not showModal() or close(): enough of them for
// tests of the app's dialogs (#23).
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
}

// jsdom has no matchMedia (#114). Pages ask it for screen widths and reduced
// motion: report narrow screens and reduced motion, so numbers show their
// final value straight away instead of counting up.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: query.includes('prefers-reduced-motion: reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })
}
