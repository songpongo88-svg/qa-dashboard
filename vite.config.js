import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { signaturePaymentPdfPatch } from './build/signaturePaymentPdfPatch.js'
import { signaturePaymentPdfExactPreviewPatch } from './build/signaturePaymentPdfExactPreviewPatch.js'
import { signaturePaymentPdfLargeFontPatch } from './build/signaturePaymentPdfLargeFontPatch.js'
import { signatureDocumentRefMatchWebPatch } from './build/signatureDocumentRefMatchWebPatch.js'
import { sidebarGroupsDefaultOpenPatch } from './build/sidebarGroupsDefaultOpenPatch.js'
import { signaturePaymentTopicFinalOverridePatch } from './build/signaturePaymentTopicFinalOverridePatch.js'
import { appealReviewHtmlCleanupPatch } from './build/appealReviewHtmlCleanupPatch.js'
import { appealRequestsOriginalCommentCleanupPatch } from './build/appealRequestsOriginalCommentCleanupPatch.js'
import { evaluationAgentFocusPopupPatch } from './build/evaluationAgentFocusPopupPatch.js'
import { qaTypingChallengeFeaturePatch } from './build/qaTypingChallengeFeaturePatch.js'
import { qaAccessCheckPermissionPatch } from './build/qaAccessCheckPermissionPatch.js'

export default defineConfig({
  plugins: [signaturePaymentPdfPatch(), signaturePaymentPdfExactPreviewPatch(), signaturePaymentPdfLargeFontPatch(), signatureDocumentRefMatchWebPatch(), sidebarGroupsDefaultOpenPatch(), signaturePaymentTopicFinalOverridePatch(), appealReviewHtmlCleanupPatch(), appealRequestsOriginalCommentCleanupPatch(), evaluationAgentFocusPopupPatch(), qaTypingChallengeFeaturePatch(), qaAccessCheckPermissionPatch(), react()],
})
