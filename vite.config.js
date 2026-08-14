import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { signaturePaymentPdfPatch } from './build/signaturePaymentPdfPatch.js'
import { signaturePaymentPdfExactPreviewPatch } from './build/signaturePaymentPdfExactPreviewPatch.js'
import { sidebarGroupsDefaultOpenPatch } from './build/sidebarGroupsDefaultOpenPatch.js'

export default defineConfig({
  plugins: [signaturePaymentPdfPatch(), signaturePaymentPdfExactPreviewPatch(), sidebarGroupsDefaultOpenPatch(), react()],
})
