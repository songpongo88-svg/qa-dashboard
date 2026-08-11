import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { signaturePaymentPdfPatch } from './build/signaturePaymentPdfPatch.js'
import { signaturePaymentPdfLayoutPatch } from './build/signaturePaymentPdfLayoutPatch.js'

export default defineConfig({
  plugins: [signaturePaymentPdfPatch(), signaturePaymentPdfLayoutPatch(), react()],
})
