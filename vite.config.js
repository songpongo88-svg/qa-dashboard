import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { signaturePaymentPdfPatch } from './build/signaturePaymentPdfPatch.js'

export default defineConfig({
  plugins: [signaturePaymentPdfPatch(), react()],
})
