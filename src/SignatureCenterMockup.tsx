import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import PageHero from "./PageHero";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import { renderFinalSignedPdf } from "./finalSignedPdfRenderer";
// final-signed-shared-renderer-v12
import { type UsageLogEvent } from "./usageLog";
import { fetchAppealEvents } from "./appealStore";
import { buildAppealRequests } from "./AppealRequestsMockup";
import { fetchStoredEvaluations, excludeTestEvaluations, type StoredEvaluation } from "./evaluationStore";
import { getIncentiveByGrade, scoreToGrade } from "./lib/scoreIncentivePolicy";
import { canonicalAgentIdentityKey, canonicalizeAgentName } from "./lib/agentIdentity";
import {
  clearStoredSignatureConfirm,
  deleteStoredSignatureLibraryEntry,
  fetchStoredSignatureDocuments,
  fetchStoredSignatureLibraryEntry,
  saveStoredSignatureConfirm,
  saveStoredSignatureDocument,
  saveStoredSignatureLibraryEntry,
} from "./signatureStore";

type CurrentUser = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
  email?: string;
};

type UserAccountSnapshot = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
  email?: string;
  teamLead?: string;
  teamName?: string;
  status?: string;
  suspendReason?: string;
  suspendEffectiveDate?: string;
  suspendDate?: string;
  suspend_date?: string;
};

type SignRole = "QA" | "Supervisor" | "Senior" | "Agent";
type SignStatus = "Signed" | "Pending" | "Waived";
type SignatureStepStatus = "Signed" | "Pending" | "Waiting" | "Locked" | "Expired" | "Waived";
type WorkspaceStatus = "pending" | "signed" | "in-progress" | "expired";
type WorkspaceQuickFilter = "all" | WorkspaceStatus;

type SignatureEntry = {
  role: SignRole;
  signerName: string;
  signedBy: string;
  signedAt: string;
  status: SignStatus;
  note?: string;
  signatureDataUrl?: string;
  resetBy?: string;
  resetAt?: string;
  waiverReason?: string;
  waivedBy?: string;
  waivedAt?: string;
  resignationDate?: string;
};

type SignatureCaseDetail = {
  caseId: string;
  auditDate: string;
  inquiry: string;
  finalScore: number;
  grade: string;
  comment: string;
  topics?: Array<{
    code: string;
    title: string;
    max: number;
    score: number;
  }>;
};

type SignatureDocument = {
  id: string;
  monthKey: string;
  monthLabel: string;
  agentName: string;
  seniorName: string;
  supervisorName: string;
  qaName: string;
  teamName: string;
  caseCount: number;
  averageScore: number;
  grade: string;
  eligibleByScore: boolean;
  documentHash: string;
  cases: SignatureCaseDetail[];
};

type SignatureWindow = {
  openAt: Date;
  dueAt: Date;
  appealCloseAt: Date;
};

type PendingAppealCase = {
  caseId: string;
  agent: string;
  status: string;
  submittedAt: string;
};

type SignatureApprovedAppeal = {
  caseId: string;
  finalScore: number;
  previousScore: number;
  reviewedAt: string;
  topics?: SignatureCaseDetail["topics"];
};

const RAW_DATA_FILES = [
  "/QA_RawData_January-February2026.xlsx",
  "/QA_RawData_March-May2026.xlsx",
];

const SIGNATURE_STORAGE_KEY = "qa-monthly-signature-center-v4";
const SIGNATURE_CONFIRM_KEY = "qa-monthly-signature-confirmed-v1";
const SIGNATURE_LIBRARY_KEY = "qa-monthly-signature-library-v1";
const SIGNATURE_FLOW: SignRole[] = ["QA", "Supervisor", "Senior", "Agent"];
const HISTORICAL_PAID_LAST_MONTH = "2026-04";
const CASE_TARGET = 10;
const AUTO_RESIGNED_WAIVER_NOTE = "Signature waived automatically from resigned User profile";
const AUTO_RESIGNED_WAIVER_SIGNER = "System â€“ User Sync";
const EMPLOYMENT_END_REASON_KEYWORDS = [
  "à¸¥à¸²à¸­à¸­à¸",
  "à¸ªà¸´à¹‰à¸™à¸ªà¸¸à¸”à¸‡à¸²à¸™",
  "à¸ªà¸´à¹‰à¸™à¸ªà¸¸à¸”à¸à¸²à¸£à¸—à¸³à¸‡à¸²à¸™",
  "à¸ªà¸´à¹‰à¸™à¸ªà¸¸à¸”à¸à¸²à¸£à¸›à¸à¸´à¸šà¸±à¸•à¸´à¸‡à¸²à¸™",
  "à¸ªà¸´à¹‰à¸™à¸ªà¸¸à¸”à¸ªà¸±à¸à¸à¸²à¸ˆà¹‰à¸²à¸‡",
  "à¸¢à¸¸à¸•à¸´à¸à¸²à¸£à¸ˆà¹‰à¸²à¸‡",
  "à¸¢à¸¸à¸•à¸´à¸à¸²à¸£à¸ˆà¹‰à¸²à¸‡à¸‡à¸²à¸™",
  "à¸¢à¸¸à¸•à¸´à¸ªà¸±à¸à¸à¸²à¸ˆà¹‰à¸²à¸‡",
  "à¹€à¸¥à¸´à¸à¸ˆà¹‰à¸²à¸‡",
  "à¸à¹‰à¸™à¸ªà¸ à¸²à¸",
  "à¸à¹‰à¸™à¸ªà¸ à¸²à¸à¸à¸™à¸±à¸à¸‡à¸²à¸™",
  "resign",
  "resigned",
  "resignation",
  "termination",
  "terminated",
  "employment end",
  "employment ended",
  "contract end",
  "contract ended",
  "contract expired",
  "offboard",
  "offboarded",
  "offboarding",
] as const;
const SIGNATURE_DEADLINE_RESET_NOTE = "Deadline reset by QA";
const SIGNATURE_RESET_WINDOW_DAYS = 3;
const SIGNATURE_RESET_WINDOW_MS = SIGNATURE_RESET_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const DEFAULT_SUPERVISOR_SIGNER = "Phrommarin Thaithorn";
const SIGNATURE_ROWS_PER_PAGE_OPTIONS = [10, 20, 50];
const SIGNATURE_NEW_POLICY_START_MONTH_KEY = "2026-04";
const SIGNATURE_JUNE_POLICY_START_MONTH_KEY = "2026-06";
const SIGNATURE_TOPIC_MISSING = "__signature_topic_missing__";

type SignatureTopicMasterItem = { code: string; label: string; max: number };

const SIGNATURE_JAN_FEB_2026_TOPIC_MASTER = [
  { code: "1", label: "à¹€à¸›à¸´à¸”-à¸›à¸´à¸”à¸à¸²à¸£à¸ªà¸™à¸—à¸™à¸²", max: 10 },
  { code: "2", label: "à¸§à¸´à¹€à¸„à¸£à¸²à¸°à¸«à¹Œ/à¹à¸à¹‰à¹„à¸‚", max: 30 },
  { code: "3", label: "à¸›à¸à¸´à¸šà¸±à¸•à¸´à¸•à¸²à¸¡à¸‚à¸±à¹‰à¸™à¸•à¸­à¸™", max: 20 },
  { code: "4", label: "à¸„à¸§à¸²à¸¡à¸ªà¸¸à¸ à¸²à¸", max: 10 },
  { code: "5", label: "à¸ à¸²à¸©à¸²", max: 20 },
  { code: "6", label: "à¸£à¸°à¸¢à¸°à¹€à¸§à¸¥à¸²", max: 10 },
] as const;

const SIGNATURE_LEGACY_TOPIC_MASTER = [
  { code: "1.1", label: "Greeting & Closing Standard", max: 10 },
  { code: "1.2", label: "Accuracy of Information", max: 5 },
  { code: "1.3", label: "PDPA & Policy", max: 5 },
  { code: "2.1", label: "Case Accuracy", max: 5 },
  { code: "2.2", label: "Completeness", max: 5 },
  { code: "2.3", label: "Clear Actionable Guidance", max: 5 },
  { code: "2.4", label: "Official Sources", max: 5 },
  { code: "3.1", label: "Root Cause & Resolution", max: 10 },
  { code: "3.2", label: "Case Ownership", max: 5 },
  { code: "3.3", label: "Clear Next Step Guidance", max: 5 },
  { code: "4.1", label: "Message Structure", max: 5 },
  { code: "4.2", label: "Language Quality", max: m«ëŒ+Š×®º+º$zzb¥ãRÒÀ¢²6öFS¢#Bã2"ÂÆ&VÃ¢%FöæRbV×F‡’"ÂÖƒ¢RÒÀ¢²6öFS¢#BãB"ÂÆ&VÃ¢$FFF–öâFò6öçFW‡B"ÂÖƒ¢RÒÀ¢²6öFS¢#Rã"ÂÆ&VÃ¢%v÷&²&ö6W726ö×Æ–æ6R"ÂÖƒ¢ÒÀ¢²6öFS¢#Rã""ÂÆ&VÃ¢%4Ä6ö×Æ–æ6R"ÂÖƒ¢RÒÀ¢²6öFS¢#Rã2"ÂÆ&VÃ¢$66RÆövv–ærò7FGW267W&7’"ÂÖƒ¢RÒÀ¥Ò26öç7C° ¦6öç7B4”täEU$Uô$”Åó##eõDõ”5ôÔ5DU"Ò°¢²6öFS¢#ã"ÂÆ&VÃ¢.Š‹.‰^Š>‰‹.‰ˆ‹.Š>‰~‹ˆ‰~‹.Š.˜Š^‹‰¾‹N‰Nˆ‹.Š>Š®‰‰~‰‹""ÂÖƒ¢ÒÀ¢²6öFS¢#ã""ÂÆ&VÃ¢.ˆ‹.Š>‰¾ˆş‹N‰®‹‰^‹N‰^‹.ŠEòöÆ–7’òˆ.˜ŠŞˆ‹>Š¾‰‰B"ÂÖƒ¢ÒÀ¢²6öFS¢#ã2"ÂÆ&VÃ¢.ˆ‹.Š>‰¾ˆş‹N‰®‹‰^‹N‰^‹.ŠˆŠ>‹‰®Š~‰ˆ‹.Š>˜Š^‹4Ä"ÂÖƒ¢ÒÀ¢²6öFS¢#"ã"ÂÆ&VÃ¢.ˆNŠ~‹.Š‰n‹ˆ‰^˜ŠŞˆ~ˆ.ŠŞˆ~ˆN‹>‰^ŠŞ‰¢"ÂÖƒ¢ÒÀ¢²6öFS¢#"ã""ÂÆ&VÃ¢.ˆNŠ~‹.ŠˆNŠ>‰®‰n˜Š~‰ˆ.ŠŞˆ~ˆN‹>‰^ŠŞ‰¢"ÂÖƒ¢ÒÀ¢²6öFS¢#"ã2"ÂÆ&VÃ¢.ˆNŠ~‹.Šˆ®‹‰N˜ˆ‰ˆ.ŠŞˆ~ˆ.‹˜‰‰^ŠŞ‰˜Š^‹˜Š¾Š^˜ˆ~ŠŞ˜‹.ˆ~ŠŞ‹Nˆr"ÂÖƒ¢RÒÀ¢²6öFS¢#2ã"ÂÆ&VÃ¢.ˆ‹.Š>Š~‹N˜ˆNŠ>‹.‹Š¾˜Î˜Š^‹˜ˆ˜˜Nˆ.‰¾‹ˆŞŠ¾‹.˜N‰N˜‰^Š>ˆ~ˆ‹‰B"ÂÖƒ¢RÒÀ¢²6öFS¢#2ã""ÂÆ&VÃ¢$÷væW'6†—˜Š^‹ˆ‹.Š>˜ˆ˜ˆræW‡B7FW"ÂÖƒ¢ÒÀ¢²6öFS¢#Bã"ÂÆ&VÃ¢.˜.ˆNŠ>ˆ~Š®Š>˜‹.ˆ~ˆ.˜ŠŞˆNŠ~‹.Š˜Š^‹ˆNŠ~‹.ŠŠŞ˜‹.‰ˆ~˜‹.Š""ÂÖƒ¢RÒÀ¢²6öFS¢#Bã""ÂÆ&VÃ¢.ˆNŠ~‹.ŠˆŠ>‹ˆ®‹‰®˜Š^‹ˆNŠ~‹.Š‰n‹ˆ‰^˜ŠŞˆ~ˆ.ŠŞˆ~Š‹.Š‹""ÂÖƒ¢RÒÀ¢²6öFS¢#Bã2"ÂÆ&VÃ¢.‰˜‹>˜Š®‹^Š.ˆ~˜Š^‹ˆNŠ~‹.Š˜Š¾Š‹.‹Š®Š‰^‹.ŠŠ®‰n‹.‰ˆ‹.Š>‰>˜Â"ÂÖƒ¢ÒÀ¥Ò26öç7C° ¦6öç7B4”täEU$Uô¥TäUó##eõDõ”5ôÔ5DU"Ò°¢²6öFS¢#"ÂÆ&VÃ¢%&ö6W72böÆ–7’6ö×Æ–æ6R"ÂÖƒ¢3ÒÀ¢²6öFS¢#""ÂÆ&VÃ¢$ç7vW"VÆ—G’b&ö&ÆVÒæÇ—6—2"ÂÖƒ¢#ÒÀ¢²6öFS¢#2"ÂÆ&VÃ¢$66R†æFÆ–ærbföÆÆ÷r×W"ÂÖƒ¢#RÒÀ¢²6öFS¢#B"ÂÆ&VÃ¢$6öÖ×Væ–6F–öâ6¶–ÆÇ2"ÂÖƒ¢#RÒÀ¥Ò26öç7C° ¦gVæ7F–öâæ÷&ÖÆ—¦UFW‡B‡fÇVS¢Væ¶æ÷vâ’°¢&WGW&â7G&–ær‡fÇVRóò""¢ç&WÆ6R‚õÇSörÂ""¢ç&WÆ6R‚õÇ2²örÂ""¢çG&–Ò‚“°§Ğ ¦gVæ7F–öâ7Æ—E6–væGW&T–çFVçB‡fÇVS¢Væ¶æ÷vâ’°¢6öç7BgVÆÅFW‡BÒæ÷&ÖÆ—¦UFW‡B‡fÇVR“°¢–b‚gVÆÅFW‡BÇÂgVÆÅFW‡BæVæG5v—F‚‚"’"’’°¢&WGW&â²&–Ö'“¢gVÆÅFW‡BÂ6V6öæF'“¢""Ó°¢Ğ ¢ÆWBFWF‚Ò°¢ÆWB÷Væ–æt–æFW‚ÒÓ°¢f÷"†ÆWB–æFW‚ÒgVÆÅFW‡BæÆVæwF‚Ò²–æFW‚ãÒ²–æFW‚ÓÒ’°¢6öç7B6†"ÒgVÆÅFW‡E¶–æFW…Ó°¢–b†6†"ÓÓÒ"’"’FWF‚³Ò°¢–b†6†"ÓÓÒ"‚"’°¢FWF‚ÓÒ°¢–b†FWF‚ÓÓÒ’°¢÷Væ–æt–æFW‚Ò–æFWƒ°¢'&V³°¢Ğ¢Ğ¢Ğ ¢–b†÷Væ–æt–æFW‚ÃÒ’°¢&WGW&â²&–Ö'“¢gVÆÅFW‡BÂ6V6öæF'“¢""Ó°¢Ğ ¢6öç7B&–Ö'’ÒgVÆÅFW‡Bç6Æ–6RƒÂ÷Væ–æt–æFW‚’çG&–Ò‚“°¢6öç7B6V6öæF'’ÒgVÆÅFW‡Bç6Æ–6R†÷Væ–æt–æFW‚’çG&–Ò‚“°¢&WGW&â&–Ö'’ò²&–Ö'’Â6V6öæF'’Ò¢²&–Ö'“¢gVÆÅFW‡BÂ6V6öæF'“¢""Ó°§Ğ ¦6öç7B4”täEU$UõDõ”5ôTätÄ•4…ôÄ$TÅ3¢&V6÷&CÇ7G&–ærÂ&V6÷&CÇ7G&–ærÂ7G&–æsãâÒ°¢###bÓ#¢°¢##¢$w&VWF–ærb6Æ÷6–ær"À¢#"#¢$æÇ—6—2b&W6öÇWF–öâ"À¢#2#¢%&ö6W726ö×Æ–æ6R"À¢#B#¢$6÷W'FW7’"À¢#R#¢$ÆæwVvRVÆ—G’"À¢#b#¢%4Äb&W7öç6RF–ÖR"À¢ÒÀ¢###bÓ"#¢°¢##¢$w&VWF–ærb6Æ÷6–ær"À¢#"#¢$æÇ—6—2b&W6öÇWF–öâ"À¢#2#¢%&ö6W726ö×Æ–æ6R"À¢#B#¢$6÷W'FW7’"À¢#R#¢$ÆæwVvRVÆ—G’"À¢#b#¢%4Äb&W7öç6RF–ÖR"À¢ÒÀ¢###bÓB#¢°¢#ã#¢$w&VWF–ærb6Æ÷6–ær7FæF&B"À¢#ã"#¢%EböÆ–7’6ö×Æ–æ6R"À¢#ã2#¢%&ö6W72b4Ä6ö×Æ–æ6R"À¢#"ã#¢$ç7vW"67W&7’"À¢#"ã"#¢$ç7vW"6ö×ÆWFVæW72"À¢#"ã2#¢$6ÆV"wV–Fæ6Rb&VfW&Væ6W2"À¢#2ã#¢%&ö÷B6W6Rb&W6öÇWF–öâ"À¢#2ã"#¢$÷væW'6†—bæW‡B7FW2"À¢#Bã#¢$ÖW76vR7G'V7GW&Rb&VF&–Æ—G’"À¢#Bã"#¢$6öæ6—6VæW72bÆæwVvR67W&7’"À¢#Bã2#¢%FöæRb6öçFW‡B&÷&–FVæW72"À¢ÒÀ¢###bÓb#¢°¢##¢%&ö6W726ö×Æ–æ6R"À¢#"#¢$ç7vW"67W&7’bfW&–f–6F–öâ"À¢#2#¢$66R†æFÆ–ærbföÆÆ÷r×W"À¢#B#¢$6öÖ×Væ–6F–öâ6¶–ÆÇ2"À¢ÒÀ¢###bÓr#¢°¢##¢%&ö6W726ö×Æ–æ6R"À¢#"#¢$ç7vW"67W&7’bfW&–f–6F–öâ"À¢#2#¢$66R†æFÆ–ærbföÆÆ÷r×W"À¢#B#¢$6öÖ×Væ–6F–öâ6¶–ÆÇ2"À¢ÒÀ§Ó° ¦gVæ7F–öâvWE6–væGW&UF÷–4VævÆ—6„Æ&VÂ€¢F÷–3¢²6öFSó¢Væ¶æ÷vã²F—FÆSó¢Væ¶æ÷vâÒÀ¢ÖöçF„¶W“¢7G&–æp¢’°¢6öç7B6öFRÒæ÷&ÖÆ—¦UFW‡B‡F÷–2æ6öFR“°¢6öç7BF—FÆRÒæ÷&ÖÆ—¦UFW‡B‡F÷–2çF—FÆR“°¢6öç7BÖVBÒ4”täEU$UõDõ”5ôTätÄ•4…ôÄ$TÅ5¶ÖöçF„¶W•Óòå¶6öFUÓ°¢–b†ÖVB’&WGW&âÖVC°¢–b‚õ´Õ¦×¥ÒòçFW7B‡F—FÆR’bbõ¾ˆŞ™•ÒòçFW7B‡F—FÆR’’&WGW&âF—FÆS°¢&WGW&â6öFRòF÷–2G¶6öFWÖ¢%F÷–266÷&R#°§Ğ ¦gVæ7F–öâæ÷&ÖÆ—¦T¶W’‡fÇVS¢Væ¶æ÷vâ’°¢&WGW&âæ÷&ÖÆ—¦UFW‡B‡fÇVR’çFôÆ÷vW$66R‚“°§Ğ ¦gVæ7F–öâ6ö×7EW'6öâ‡fÇVS¢Væ¶æ÷vâ’°¢&WGW&âæ÷&ÖÆ—¦UFW‡B‡fÇVR’çFôÆ÷vW$66R‚’ç&WÆ6R‚õµæ×£ÓˆŞ™•ÒörÂ""“°§Ğ ¦gVæ7F–öâ—56ÖUW'6öâ†¢Væ¶æ÷vâÂ#¢Væ¶æ÷vâ’°¢6öç7BÆVgBÒ6æöæ–6ÄvVçD–FVçF—G”¶W’†“°¢6öç7B&–v‡BÒ6æöæ–6ÄvVçD–FVçF—G”¶W’†"“°¢&WGW&â&ööÆVâ†ÆVgBbb&–v‡Bbb†ÆVgBÓÓÒ&–v‡BÇÂÆVgBæ–æ6ÇVFW2‡&–v‡B’ÇÂ&–v‡Bæ–æ6ÇVFW2†ÆVgB’’“°§Ğ ¦gVæ7F–öâ7W'&VçEW6W$ÖF6†W4æÖR†7W'&VçEW6W#¢7W'&VçEW6W"ÂæÖS¢Væ¶æ÷vâ’°¢&WGW&â€¢—56ÖUW'6öâ†7W'&VçEW6W"æF—7Æ”æÖRÂæÖR’ÇÀ¢—56ÖUW'6öâ†7W'&VçEW6W"ævVçDæÖRÂæÖR’ÇÀ¢—56ÖUW'6öâ†7W'&VçEW6W"çW6W&æÖRÂæÖR’ÇÀ¢—56ÖUW'6öâ†7W'&VçEW6W"æVÖ–ÂÂæÖR¢“°§Ğ ¦gVæ7F–öâ7W'&VçEW6W$†5&öÆR†7W'&VçEW6W#¢7W'&VçEW6W"Â&öÆS¢6–vå&öÆR’°¢6öç7B&öÆUFW‡BÒæ÷&ÖÆ—¦UFW‡B†7W'&VçEW6W"ç&öÆR’çFôÆ÷vW$66R‚“°¢6öç7B6ö×7E&öÆRÒ6ö×7EW'6öâ†7W'&VçEW6W"ç&öÆR“° ¢–b‡&öÆRÓÓÒ%"’°¢&WGW&â€¢&öÆUFW‡BÓÓÒ'VÆ—G’77W&æ6R"ÇÀ¢&öÆUFW‡BÓÓÒ&FÖ–â"ÇÀ¢6ö×7E&öÆRÓÓÒ'"ÇÀ¢6ö×7E&öÆRÓÓÒ'VÆ—G–77W&æ6R ¢“°¢Ğ ¢–b‡&öÆRÓÓÒ%7WW'f—6÷""’°¢&WGW&â&öÆUFW‡Bæ–æ6ÇVFW2‚'7WW'f—6÷""’ÇÂ6ö×7E&öÆRæ–æ6ÇVFW2‚'7WW'f—6÷""“°¢Ğ ¢–b‡&öÆRÓÓÒ%6Væ–÷""’°¢&WGW&â€¢&öÆUFW‡BÓÓÒ'6Væ–÷""ÇÀ¢&öÆUFW‡Bæ–æ6ÇVFW2‚'6Væ–÷""’ÇÀ¢&öÆUFW‡Bæ–æ6ÇVFW2‚'FVÒÆVB"’ÇÀ¢&öÆUFW‡Bæ–æ6ÇVFW2‚'FVÖÆVB"’ÇÀ¢&öÆUFW‡Bæ–æ6ÇVFW2‚&ÆVB"’ÇÀ¢6ö×7E&öÆRæ–æ6ÇVFW2‚'6Væ–÷""’ÇÀ¢6ö×7E&öÆRæ–æ6ÇVFW2‚'FÚ±î¸Â¸­yêë¢°k¢G§¦*^eamlead") ||
      compactRole.includes("lead")
    );
  }

  return true;
}

function parseExcelDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0);
  }

  const text = normalizeText(value);
  if (!text) return null;

  const thaiDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (thaiDate) {
    const day = Number(thaiDate[1]);
    const month = Number(thaiDate[2]) - 1;
    let year = Number(thaiDate[3]);
    if (year < 100) year += 2500;
    if (year > 2400) year -= 543;
    const hour = Number(thaiDate[4] || 0);
    const minute = Number(thaiDate[5] || 0);
    return new Date(year, month, day, hour, minute, 0);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getSignatureCaseAuditSortTime(item: SignatureCaseDetail) {
  const date = parseExcelDate(item.auditDate);
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
}

function sortSignatureCasesByAuditDate(cases: SignatureCaseDetail[]) {
  return cases
    .map((item, index) => ({ item, index, time: getSignatureCaseAuditSortTime(item) }))
    .sort((a, b) => {
      const timeDiff = a.time - b.time;
      if (timeDiff) return timeDiff;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

function sortSignatureDocumentCases(doc: SignatureDocument): SignatureDocument {
  return { ...doc, cases: sortSignatureCasesByAuditDate(doc.cases) };
}

function parseMonthValueToDate(value: unknown): Date | null {
  const directDate = parseExcelDate(value);
  if (directDate) return new Date(directDate.getFullYear(), directDate.getMonth(), 1);

  const text = normalizeText(value);
  if (!text) return null;

  const monthNameMatch = text.match(/(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i);
  if (monthNameMatch) {
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIndex = monthNames.findIndex((name) => monthNameMatch[1].toLowerCase().startsWith(name));
    return new Date(Number(monthNameMatch[2]), Math.max(monthIndex, 0), 1);
  }

  const yearMonthMatch = text.match(/^(20\d{2})[-/](\d{1,2})$/);
  if (yearMonthMatch) return new Date(Number(yearMonthMatch[1]), Number(yearMonthMatch[2]) - 1, 1);

  const thaiMonthMatch = text.match(/(à¸¡\.à¸„\.|à¸¡à¸à¸£à¸²à¸„à¸¡|à¸\.à¸\.|à¸à¸¸à¸¡à¹€à¸˜Â à¸²à¸à¸±à¸™à¸˜à¹Œ|à¸¡à¸µ\.à¸„\.|à¸¡à¸µà¸™à¸²à¸„à¸¡|à¹€à¸¡\.à¸¢\.|à¹€à¸¡à¸©à¸²à¸¢à¸™|à¸\.à¸„\.|à¸à¸¤à¸©à¹€à¸˜Â à¸²à¸„à¸¡|à¸¡à¸´\.à¸¢\.|à¸¡à¸´à¸–à¸¸à¸™à¸²à¸¢à¸™|à¸\.à¸„\.|à¸à¸£à¸à¸à¸²à¸„à¸¡|à¸ª\.à¸„\.|à¸ªà¸´à¸‡à¸«à¸²à¸„à¸¡|à¸\.à¸¢\.|à¸à¸±à¸™à¸¢à¸²à¸¢à¸™|à¸•\.à¸„\.|à¸•à¸¸à¸¥à¸²à¸„à¸¡|à¸\.à¸¢\.|à¸à¸¤à¸¨à¸ˆà¸´à¸à¸²à¸¢à¸™|à¸˜\.à¸„\.|à¸˜à¸±à¸™à¸§à¸²à¸„à¸¡)\s*(\d{2,4})/);
  if (thaiMonthMatch) {
    const map: Record<string, number> = {
      "à¸¡.à¸„.": 0, "à¸¡à¸à¸£à¸²à¸„à¸¡": 0,
      "à¸.à¸.": 1, "à¸à¸¸à¸¡à¹€à¸˜Â à¸²à¸à¸±à¸™à¸˜à¹Œ": 1,
      "à¸¡à¸µ.à¸„.": 2, "à¸¡à¸µà¸™à¸²à¸„à¸¡": 2,
      "à¹€à¸¡.à¸¢.": 3, "à¹€à¸¡à¸©à¸²à¸¢à¸™": 3,
      "à¸.à¸„.": 4, "à¸à¸¤à¸©à¹€à¸˜Â à¸²à¸„à¸¡": 4,
      "à¸¡à¸´.à¸¢.": 5, "à¸¡à¸´à¸–à¸¸à¸™à¸²à¸¢à¸™": 5,
      "à¸.à¸„.": 6, "à¸à¸£à¸à¸à¸²à¸„à¸¡": 6,
      "à¸ª.à¸„.": 7, "à¸ªà¸´à¸‡à¸«à¸²à¸„à¸¡": 7,
      "à¸.à¸¢.": 8, "à¸à¸±à¸™à¸¢à¸²à¸¢à¸™": 8,
      "à¸•.à¸„.": 9, "à¸•à¸¸à¸¥à¸²à¸„à¸¡": 9,
      "à¸.à¸¢.": 10, "à¸à¸¤à¸¨à¸ˆà¸´à¸à¸²à¸¢à¸™": 10,
      "à¸˜.à¸„.": 11, "à¸˜à¸±à¸™à¸§à¸²à¸„à¸¡": 11,
    };
    let year = Number(thaiMonthMatch[2]);
    if (year < 100) year += 2500;
    if (year > 2400) year -= 543;
    return new Date(year, map[thaiMonthMatch[1]] ?? 0, 1);
  }

  return null;
}

function getMonthKey(date: Date | null) {
  if (!date) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || "-";
  const date = new Date(`${monthKey}-01T00:00:00`);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

function buildHeaderMap(headerRow: unknown[]) {
  const map = new Map<string, number[]>();
  headerRow.forEach((header, index) => {
    const key = normalizeKey(header);
    if (!key) return;
    const current = map.get(key) || [];
    current.push(index);
    map.set(key, current);
  });

  const get = (row: unknown[], candidates: string[], fallback = "") => {
    for (const name of candidates) {
      const indexes = map.get(normalizeKey(name));
      if (!indexes?.length) continue;
      for (const index of indexes) {
        const value = row[index];
        if (value !== null && value !== undefined && normalizeText(value) !== "") return value;
      }
    }
    return fallback;
  };

  return { get };
}

function getSignatureTopicMasterByMonth(monthKey: string): readonly SignatureTopicMasterItem[] {
  if (monthKey !== "unknown" && monthKey >= SIGNATURE_JUNE_POLICY_START_MONTH_KEY) {
    return SIGNATURE_JUNE_2026_TOPIC_MASTER;
  }

  if (monthKey === "2026-01" || monthKey === "2026-02") {
    return SIGNATURE_JAN_FEB_2026_TOPIC_MASTER;
  }

  return monthKey !== "unknown" && monthKey >= SIGNATURE_NEW_POLICY_START_MONTH_KEY
    ? SIGNATURE_APRIL_2026_TOPIC_MASTER
    : SIGNATURE_LEGACY_TOPIC_MASTER;
}

function extractSignatureTopicsFromRow(
  row: unknown[],
  helper: ReturnType<typeof buildHeaderMap>,
  monthKey: string
): SignatureCaseDetail["topics"] {
  const topicsWithPresence = getSignatureTopicMasterByMonth(monthKey).map((master) => {
    const rawScore = helper.get(
      row,
      [`${master.code} Revised Score`, `${master.code} Score`, `${master.code} Final Score`, master.code],
      SIGNATURE_TOPIC_MISSING
    );
    const hasScore = rawScore !== SIGNATURE_TOPIC_MISSING;
    const scorm«ëŒ+Š×®º+º$zzb¥æRÒ†566÷&RbbçVÖ&W"æ—4æâ„çVÖ&W"‡&u66÷&R’’òçVÖ&W"‡&u66÷&R’¢°¢&WGW&â°¢†566÷&RÀ¢F÷–3¢°¢6öFS¢Ö7FW"æ6öFRÀ¢F—FÆS¢Ö7FW"æÆ&VÂÀ¢Öƒ¢Ö7FW"æÖ‚À¢66÷&RÀ¢ÒÀ¢Ó°¢Ò“° ¢–b‚F÷–75v—F…&W6Væ6Rç6öÖR‚†—FVÒ’Óâ—FVÒæ†566÷&R’’&WGW&âµÓ°¢&WGW&âF÷–75v—F…&W6Væ6RæÖ‚†—FVÒ’Óâ—FVÒçF÷–2“°§Ğ ¦gVæ7F–öâvWDÖöçF„¶W”g&öÕ&÷r‡&÷s¢Væ¶æ÷våµÒÂ†VÇW#¢&WGW&åG—SÇG—Vöb'V–ÆD†VFW$Öâ’°¢6öç7BW‡Æ–6—DÖöçF„¶W’Òæ÷&ÖÆ—¦UFW‡B€¢†VÇW"ævWB‡&÷rÂ²$ÖöçF‚¶W’"Â$ÖöçF„¶W’"Â$ÖöçF…ô¶W’"Â%&W÷'F–ærÖöçF‚¶W’"Â%6VÆV7FVBÖöçF‚¶W’%ÒÂ""¢“°¢6öç7BÖöçF„¶W”ÖF6‚ÒW‡Æ–6—DÖöçF„¶W’æÖF6‚‚òƒ#ÆG³'Ò•²ÒõÒ…ÆG³Ã'Ò’ò“°¢–b†ÖöçF„¶W”ÖF6‚’&WGW&âG¶ÖöçF„¶W”ÖF6…³×ÒÒGµ7G&–ær„çVÖ&W"†ÖöçF„¶W”ÖF6…³%Ò’’çE7F'Bƒ"Â#"—Ö°¢6öç7B6ö×7DÖöçF„¶W”ÖF6‚ÒW‡Æ–6—DÖöçF„¶W’æÖF6‚‚òƒ#ÆG³'Ò’…ÆG³'Ò•ÆG³'Òò“°¢–b†6ö×7DÖöçF„¶W”ÖF6‚’&WGW&âG¶6ö×7DÖöçF„¶W”ÖF6…³×ÒÒG¶6ö×7DÖöçF„¶W”ÖF6…³%×Ö° ¢6öç7BÖöçF„FFRĞ¢'6TÖöçF…fÇVUFôFFR††VÇW"ævWB‡&÷rÂ²$ÖöçF‚Æ&VÂ"Â$ÖöçF‚"Â%&W÷'F–ærÖöçF‚"Â%6VÆV7FVBÖöçF‚"Â%&W÷'BÖöçF‚%ÒÂ""’’ÇÀ¢'6TÖöçF…fÇVUFôFFR††VÇW"ævWB‡&÷rÂ²$ÖöçF‚7F'B"Â$ÖöçF‚7F'BFFR"Â$ÖöçF…7F'B%ÒÂ""’’ÇÀ¢'6TÖöçF…fÇVUFôFFR††VÇW"ævWB‡&÷rÂ²$VF—BFFR"Â$66RFFR"Â%F–ÖW7F×"Â$FFR%ÒÂ""’“° ¢&WGW&âvWDÖöçF„¶W’†ÖöçF„FFR“°§Ğ ¦gVæ7F–öâ—4F6†&ö&E&W÷'F–ætÖöçF‚†ÖöçF„¶W“¢7G&–ær’°¢&WGW&âõã##bÒƒ³Ó•×Ã³Ó%Ò’BòçFW7B†ÖöçF„¶W’“°§Ğ ¦gVæ7F–öâ—4†—7F÷&–6Å–EW&–öB†ÖöçF„¶W“¢7G&–ær’°¢&WGW&â—4F6†&ö&E&W÷'F–ætÖöçF‚†ÖöçF„¶W’’bbÖöçF„¶W’ÃÒ„•5Dõ$”4Åõ”EôÄ5EôÔôåDƒ°§Ğ ¦gVæ7F–öâvWE6–væGW&Uv–æF÷r†ÖöçF„¶W“¢7G&–ær“¢6–væGW&Uv–æF÷r°¢6öç7B·–V%FW‡BÂÖöçF…FW‡EÒÒÖöçF„¶W’ç7Æ—B‚"Ò"“°¢6öç7B–V"ÒçVÖ&W"‡–V%FW‡B“°¢6öç7BÖöçF„–æFW‚ÒçVÖ&W"†ÖöçF…FW‡B’Ò°¢&WGW&â°¢VÄ6Æ÷6TC¢æWrFFR‡–V"ÂÖöçF„–æFW‚²ÂÂ#2ÂS’ÂS’’À¢÷VäC¢æWrFFR‡–V"ÂÖöçF„–æFW‚²ÂÂÂÂ’À¢GVTC¢æWrFFR‡–V"ÂÖöçF„–æFW‚²ÂRÂ#2ÂS’ÂS’’À¢Ó°§Ğ ¦gVæ7F–öâvWEF–ÖVÆ–æU7FGW2†ÖöçF„¶W“¢7G&–ærÂæ÷rÒæWrFFR‚’’°¢–b†—4†—7F÷&–6Å–EW&–öB†ÖöçF„¶W’’’&WGW&â$†—7F÷&–6Â–B#°¢6öç7Bv–æF÷rÒvWE6–væGW&Uv–æF÷r†ÖöçF„¶W’“°¢–b†æ÷rÃÒv–æF÷ræVÄ6Æ÷6TB’&WGW&â$VÂW&–öB÷Vâ#°¢–b†æ÷rãÒv–æF÷ræ÷VäBbbæ÷rÃÒv–æF÷ræGVTB’&WGW&â%6–væGW&R÷Vâ#°¢–b†æ÷râv–æF÷ræGVTB’&WGW&â%6–væGW&RFVFÆ–æR76VB#°¢&WGW&â%v—F–ær6–væGW&Rv–æF÷r#°§Ğ ¦gVæ7F–öâ—56–væ–ætÆÆ÷vVD'”FFR†ÖöçF„¶W“¢7G&–ærÂæ÷rÒæWrFFR‚’’°¢–b†—4†—7F÷&–6Å–EW&–öB†ÖöçF„¶W’’’&WGW&âfÇ6S°¢6öç7Bv–æF÷rÒvWE6–væGW&Uv–æF÷r†ÖöçF„¶W’“°¢òò˜‰¾‹N‰N˜>Š¾˜Š^ˆ~‰‹.Š˜N‰N˜Š¾Š^‹ˆ~‰¾‹N‰NŠ>ŠŞ‰¢VÂ˜‰¾˜~‰‰^˜‰˜N‰°¢òò‰n˜‹.˜ˆ¾˜~‰Š¾Š^‹ˆrGVRFFRˆ‹‰n‹~ŠŞ˜‰¾˜~‰’ÆFR6–væGW&R˜Š^‹˜NŠ˜˜ˆ.˜‹.Š>ŠŞ‰®ˆ˜‹.Š.˜‰N‹~ŠŞ‰‰¾‹ˆˆ‹‰®‹‰¢&WGW&âæ÷rãÒv–æF÷ræ÷VäC°§Ğ ¦gVæ7F–öâ—56–væVEv—F†–ä7W'&VçE–ÖVçD7–6ÆR‡6–væVDC¢7G&–ærÂÖöçF„¶W“¢7G&–ær’°¢6öç7B6–væVEF–ÖRÒæWrFFR‡6–væVDBÇÂ""’ævWEF–ÖR‚“°¢6öç7BGVUF–ÖRÒvWE6–væGW&Uv–æF÷r†ÖöçF„¶W’’æGVTBævWEF–ÖR‚“°¢&WGW&âçVÖ&W"æ—4æâ‡6–væVEF–ÖR’bb6–væVEF–ÖRÃÒGVUF–ÖS°§Ğ ¦gVæ7F–öâ—4gFW$VÅW&–öB†ÖöçF„¶W“¢7G&–ærÂæ÷rÒæWrFFR‚’’°¢–b†—4†—7F÷&–6Å–EW&–öB†ÖöçF„¶W’’’&WGW&âG'VS°¢6öç7Bv–æF÷rÒvWE6–væGW&Uv–æF÷r†ÖöçF„¶W’“°¢&WGW&âæ÷râv–æF÷ræVÄ6Æ÷6TC°§Ğ ¦gVæ7F–öâ6fTæÖR‡fÇVS¢Væ¶æ÷vâÂfÆÆ&6²Ò"Ò"’°¢6öç7BFW‡BÒæ÷&ÖÆ—¦UFW‡B‡fÇVR“°¢&WGW&âFW‡BÇÂfÆÆ&6³°§Ğ ¦gVæ7F–öâ6æöæ–6ÄvVçDæÖR‡fÇVS¢Væ¶æ÷vâ’°¢6öç7BæÖRÒ6æöæ–6Æ—¦TvVçDæÖR‡6fTæÖR‡fÇVRÂ""’“°¢–b†—56ÖUW'6öâ†æÖRÂ$&—6–V×&—B"’’&WGW&â$&—6–V×&—B#°¢–b†—56ÖUW'6öâ†æÖRÂ$çV6†Ö·VæF–â"’’&WGW&â$çV6†Ö·VæF–â#°¢&WGW&âæÖS°§Ğ ¦gVæ7F–öâf–æD66÷VçDf÷$vVçB†66÷VçG3¢W6W$66÷VçE6æ6†÷EµÒÂvVçDæÖS¢7G&–ær’°¢&WGW&â66÷VçG2æf–æB‚†66÷VçB’Óà¢¶66÷VçBævVçDæÖRÂ66÷VçBæF—7Æ”æÖRÂ66÷VçBçW6W&æÖUÒç6öÖR‚†–FVçF—G’’Óâ—56ÖUW'6öâ†–FVçF—G’ÂvVçDæÖR’¢“°§Ğ ¦gVæ7F–öâ—57W7VæFVD66÷VçB†66÷VçCó¢W6W$66÷VçE6æ6†÷BÂçVÆÂ’°¢6öç7B7FGW2Òæ÷&ÖÆ—¦UFW‡B†66÷VçCòç7FGW2’çFôÆ÷vW$66R‚“°¢&WGW&â7FGW2æ–æ6ÇVFW2‚'7W7VæFVB"’ÇÂ7FGW2æ–æ6ÇVFW2‚'&W6–væVB"’ÇÂ7FGW2æ–æ6ÇVFW2‚.Š^‹.ŠŞŠŞˆ"“°§Ğ ¦gVæ7F–öâvWD66÷VçE7W7Vç6–öäFFR†66÷VçCó¢W6W$66÷VçE6æ6†÷BÂçVÆÂ’°¢6öç7BfÇVRÒæ÷&ÖÆ—¦UFW‡B€¢66÷VçCòç7W7VæDVffV7F—fTFFRÇÂ66÷VçCòç7W7VæDFFRÇÂ66÷VçCòç7W7VæEöFFP¢“°¢–b‚fÇVR’&WGW&â"#°¢6öç7B—6ôÖF6‚ÒfÇVRæÖF6‚‚õâ…ÆG³GÒ’Ò…ÆG³'Ò’Ò…ÆG³'Ò’ò“°¢–b†—6ôÖF6‚’&WGW&âG¶—6ôÖF6…³×ÒÒG¶—6ôÖF6…³%×ÒÒG¶—6ôÖF6…³5×Ö°¢6öç7B6Æ6„ÖF6‚ÒfÇVRæÖF6‚‚õâ…ÆG³Ã'Ò•Âò…ÆG³Ã'Ò•Âò…ÆG³GÒ’ò“°¢–b‚6Æ6„ÖF6‚’&WGW&â"#°¢&WGW&âG·6Æ6„ÖF6…³5×ÒÒG·6Æ6„ÖF6…³%ÒçE7F'Bƒ"Â#"—ÒÒG·6Æ6„ÖF6…³ÒçE7F'Bƒ"Â#"—Ö°§Ğ ¦gVæ7F–öâ—4V×Æ÷–ÖVçDVæE&V6öâ‡fÇVS¢Væ¶æ÷vâ’°¢6öç7B&V6öâÒæ÷&ÖÆ—¦UFW‡B‡fÇVR’çFôÆ÷vW$66R‚“°¢–b‚&V6öâ’&WGW&âfÇ6S° ¢&WGW&âTÕÄõ”ÔTåEôTäEõ$T4ôåô´U•tõ$E2ç6öÖR‚†¶W—v÷&B’Óâ&V6öâæ–æ6ÇVFW2†¶W—v÷&B’“°§Ğ ¦gVæ7F–öâ—5&W6–væVD66÷VçDf÷$WFõv—fW"†66÷VçCó¢W6W$66÷VçE6æ6†÷BÂçVÆÂ’°¢–b‚—57W7VæFVD66÷VçB†66÷VçB’ÇÂvWD66÷VçE7W7Vç6–öäFFR†66÷VçB’’&WGW&âfÇ6S°¢&WGW&â—4V×Æ÷–ÖVçDVæE&V6öâ†G¶66÷VçCòç7FGW2ÇÂ"'ÒG¶66÷VçCòç7W7VæE&V6öâÇÂ"'Ö“°§Ğ ¦gVæ7F–öâvWDWFöÖF–5v—fW$VffV7F—fTB†66÷VçC¢W6W$66÷VçE6æ6†÷BÂVçG&–W3¢6–væGW&TVçG'•µÒ’°¢6öç7B&W6–væF–öäFFRÒvWD66÷VçE7W7Vç6–öäFFR†66÷VçB“°¢6öç7B&W6–væF–öåF–ÖRÒæWrFFR†G·&W6–væF–öäFFWÕC££³s£’ævWEF–ÖR‚“°¢6öç7B&WV—&VE6–væVEF–ÖW2Ò…²%"Â%7WW'f—6÷""Â%6Væ–÷"%Ò26–vå&öÆUµÒ¢æÖ‚‡&öÆR’ÓâæWrFFR†vWE6–væVDVçG'’†VçG&–W2Â&öÆR“òç6–væVDBÇÂ""’ævWEF–ÖR‚’¢æf–ÇFW"‚‡F–ÖR’ÓâçVÖ&W"æ—4æâ‡F–ÖR’“°¢6öç7BVffV7F—fUF–ÖRÒÖF‚æÖ‚‡&W6–væF–öåF–ÖRÂââç&WV—&VE6–væVEF–ÖW2“°¢&WGW&âæWrFFR†VffV7F—fUF–ÖR’çFô•4õ7G&–ær‚“°§Ğ ¦gVæ7F–öâ—4vVæW&–5&öÆTæÖR‡fÇVS¢Væ¶æ÷vâ’°¢6öç7BFW‡BÒæ÷&ÖÆ—¦UFW‡B‡fÇVR’çFôÆ÷vW$66R‚“°¢&WGW&âFW‡BÇÀ¢FW‡BÓÓÒ"Ò"ÇÀ¢FW‡BÓÓÒ'7WW'f—6÷""ÇÀ¢FW‡BÓÓÒ'6Væ–÷""ÇÀ¢FW‡BÓÓÒ'6Væ–÷"òFVÒÆVB"ÇÀ¢FW‡BÓÓÒ'6Væ–÷"òÆVB"ÇÀ¢FW‡BÓÓÒ'FVÒÆVB"ÇÀ¢Ú±î¸Â¸­yêë¢°k¢G§¦*^  text === "quality assurance";
}

function resolveFallbackSignerName(value: unknown, fallback = "Phommarin Thaithom") {
  return isGenericRoleName(value) ? fallback : safeName(value, fallback);
}

function resolveSupervisorName(value: unknown) {
  const compact = compactPerson(value);
  const knownAliases = new Set([
    compactPerson("Phommarin Thaithom"),
    compactPerson("Phommarin Thaithorn"),
    compactPerson("Phrommarin Thaithom"),
    compactPerson(DEFAULT_SUPERVISOR_SIGNER),
  ]);
  if (isGenericRoleName(value) || knownAliases.has(compact)) return DEFAULT_SUPERVISOR_SIGNER;
  return resolveFallbackSignerName(value, DEFAULT_SUPERVISOR_SIGNER);
}

function resolveSeniorNameForAgent(account: UserAccountSnapshot | undefined, value: unknown) {
  const leadName = normalizeText(account?.teamLead || value);
  if (!isGenericRoleName(leadName)) return leadName;
  if (!account || isSuspendedAccount(account)) return DEFAULT_SUPERVISOR_SIGNER;
  return DEFAULT_SUPERVISOR_SIGNER;
}

function readSignatureStore(): Record<string, SignatureEntry[]> {
  try {
    return JSON.parse(window.localStorage.getItem(SIGNATURE_STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function compactSignatureStore(value: Record<string, SignatureEntry[]>) {
  return Object.fromEntries(
    Object.entries(value).map(([docId, entries]) => [
      docId,
      entries.map(({ signatureDataUrl, ...entry }) => entry),
    ])
  ) as Record<string, SignatureEntry[]>;
}

function writeSignatureStore(value: Record<string, SignatureEntry[]>) {
  try {
    window.localStorage.setItem(SIGNATURE_STORAGE_KEY, JSON.stringify(value));
    return;
  } catch (error) {
    console.warn("Signature local cache exceeded quota; retrying with compact signature metadata.", error);
  }

  try {
    window.localStorage.removeItem(SIGNATURE_STORAGE_KEY);
    window.localStorage.setItem(SIGNATURE_STORAGE_KEY, JSON.stringify(compactSignatureStore(value)));
    return;
  } catch (error) {
    console.warn("Signature compact local cache failed; continuing without local signature cache.", error);
  }

  try {
    window.localStorage.removeItem(SIGNATURE_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures so Signature Center can continue rendering.
  }
}

function readConfirmedStore(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(SIGNATURE_CONFIRM_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeConfirmedStore(value: Record<string, string>) {
  try {
    window.localStorage.setItem(SIGNATURE_CONFIRM_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn("Signature confirmed local cache failed; continuing with remote storage only.", error);
  }
}

function readSignatureLibraryStore(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(SIGNATURE_LIBRARY_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeSignatureLibraryStore(value: Record<string, string>) {
  try {
    window.localStorage.setItem(SIGNATURE_LIBRARY_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn("Saved signature local cache exceeded quota; clearing saved local signature library.", error);
    try {
      window.localStorage.removeItem(SIGNATURE_LIBRARY_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
  }
}

function createDocumentHash(doc: Omit<SignatureDocument, "documentHash">) {
  return btoa(
    unescape(
      encodeURIComponent(
        [doc.monthKey, doc.agentName, doc.caseCount, doc.averageScore.toFixed(2), doc.grade].join("|")
      )
    )
  ).slice(0, 18);
}

function getEvaluationAgentNameFromAccount(account: UserAccountSnapshot) {
  return canonicalAgentName(account.agentName || account.displayName || account.username);
}

function isEvaluationAccount(account: UserAccountSnapshot) {
  const name = getEvaluationAgentNameFromAccount(account);
  if (!name) return false;
  const role = normalizeText(account.role).toLowerCase();
  if (role.includes("quality assurance") || role === "qa") return false;
  if (role.includes("supervisor")) return false;
  if (role.includes("senior") || role.includes("team lead")) return false;
  return true;
}

function createZeroCaseDocument(monthKey: string, account: UserAccountSnapshot): SignatureDocument {
  const agentName = getEvaluationAgentNameFromAccount(account);
  const base = {
    id: `${monthKey}::${agentName}`,
    monthKey,
    monthLabel: getMonthLabel(monthKey),
    agentName,
    seniorName: resolveSeniorNameForAgent(account, account.teamLead || ""),
    supervisorName: resolveSupervisorName(""),
    qaName: getQaSignerNameByMonth(monthKey),
    teamName: safeName(account.teamName, "-"),
    caseCount: 0,
    averageScore: 0,
    grade: scoreToGrade(0, monthKey),
    eligibleByScore: false,
    cases: [],
  };
  return { ...base, documentHash: createDocumentHash(base) };
}

function isSignatureAppealTopicChanged(topic: {
  score?: number;
  revisedScore?: number | string;
  revisedComment?: string;
}) {
  const revisedScore =
    topic.revisedScore !== null &&
    topic.revisedScore !== "" &&
    !Number.isNaN(Number(topic.revisedScore))
      ? Number(topic.revisedScore)
      : undefined;
  const originalScore = Number(topic.score ?? 0);
  return (
    (revisedScore !== undefined && Math.abs(revisedScore - originalScore) > 0.0001) ||
    String(topic.revisedComment || "").trim() !== ""
  );
}

function buildSignatureApprovedAppealMap(logs: UsageLogEvent[]) {
  const map = new Map<string, SignatureApprovedAppeal>();
  buildAppealRequests(logs)
    .filter((item) => item.status === "Approved")
    .sort(
      (a, b) =>
        new Date(a.reviewedAt || a.submittedAt || "").getTime() -
        new Date(b.reviewedAt || b.submittedAt || "").getTime()
    )
    .forEach((request) => {
      const caseId = normalizeText(request.caseId);
      if (!caseId) return;
      const previousScore = Number(request.finalScore || 0);
      let scoreDelta = 0;
      const revisedTopics = request.topics
        .filter(isSignatureAppealTopicChanged)
        .map((topic) => {
          const originalScore = m«ëŒ+Š×®º+º$zzb¥äçVÖ&W"‡F÷–2ç66÷&RÇÂ“°¢6öç7B&Wf—6VE66÷&RĞ¢F÷–2ç&Wf—6VE66÷&RÓÒçVÆÂb`¢F÷–2ç&Wf—6VE66÷&RÓÒ""b`¢çVÖ&W"æ—4æâ„çVÖ&W"‡F÷–2ç&Wf—6VE66÷&R’¢òçVÖ&W"‡F÷–2ç&Wf—6VE66÷&R¢¢÷&–v–æÅ66÷&S°¢6öç7BÖ‚ÒçVÖ&W"‡F÷–2æÖ‚ÇÂ“°¢–b‚çVÖ&W"æ—4f–æ—FR†÷&–v–æÅ66÷&R’ÇÂçVÖ&W"æ—4f–æ—FR‡&Wf—6VE66÷&R’ÇÂçVÖ&W"æ—4f–æ—FR†Ö‚’ÇÂÖ‚ÃÒ’&WGW&âçVÆÃ°¢66÷&TFVÇF³Ò&Wf—6VE66÷&RÒ÷&–v–æÅ66÷&S°¢&WGW&â°¢6öFS¢æ÷&ÖÆ—¦UFW‡B‡F÷–2æ6öFR’À¢F—FÆS¢æ÷&ÖÆ—¦UFW‡B‚‡F÷–22ç’’çF—FÆRÇÂF÷–2æÆ&VÂ’À¢Ö‚À¢66÷&S¢&Wf—6VE66÷&RÀ¢Ó°¢Ò¢æf–ÇFW"„&ööÆVâ’26–væGW&T66TFWF–Å²'F÷–72%Ó°¢6öç7B&÷fVDVÂÒ°¢66T–BÀ¢&Wf–÷W566÷&RÀ¢f–æÅ66÷&S¢çVÖ&W"‚‡&Wf–÷W566÷&R²66÷&TFVÇF’çFôf—†VBƒ"’’À¢&Wf–WvVDC¢&WVW7Bç&Wf–WvVDBÇÂ&WVW7Bç7V&Ö—GFVDBÇÂ""À¢F÷–73¢&Wf—6VEF÷–72À¢Ó°¢Öç6WB†66T–BÂ&÷fVDVÂ“°¢6öç7BÖöçF„¶W’ÒvWDÖöçF„¶W’‡'6TW†6VÄFFR‡&WVW7BæVF—DFFR’ÇÂæWrFFR‡&WVW7Bç7V&Ö—GFVDBÇÂ&WVW7Bç&Wf–WvVDBÇÂ""’“°¢–b‚õã#ÆG³'ÒÕÆG³'ÒBòçFW7B†ÖöçF„¶W’’’°¢Öç6WB†G¶66T–GÓ£¢G¶ÖöçF„¶W—ÖÂ&÷fVDVÂ“°¢Ğ¢Ò“°¢&WGW&âÖ°§Ğ ¦gVæ7F–öâÇ•6–væGW&TVÅF÷–72€¢F÷–73¢6–væGW&T66TFWF–Å²'F÷–72%ÒÀ¢VÃó¢6–væGW&T&÷fVDVÀ¢“¢6–væGW&T66TFWF–Å²'F÷–72%Ò°¢6öç7B&Wf—6VEF÷–72ÒVÃòçF÷–72ÇÂµÓ°¢–b‚&Wf—6VEF÷–72æÆVæwF‚’&WGW&âF÷–72ÇÂµÓ° ¢6öç7B&Wf—6VD'”6öFRÒæWrÖ‡&Wf—6VEF÷–72æÖ‚‡F÷–2’Óâ¶æ÷&ÖÆ—¦UFW‡B‡F÷–2æ6öFR’ÂF÷–5Ò’“°¢–b‚F÷–73òæÆVæwF‚’&WGW&â&Wf—6VEF÷–73° ¢&WGW&âF÷–72æÖ‚‡F÷–2’Óâ°¢6öç7B&Wf—6VBÒ&Wf—6VD'”6öFRævWB†æ÷&ÖÆ—¦UFW‡B‡F÷–2æ6öFR’“°¢&WGW&â&Wf—6V@¢ò°¢ââçF÷–2À¢F—FÆS¢&Wf—6VBçF—FÆRÇÂF÷–2çF—FÆRÀ¢Öƒ¢çVÖ&W"‡&Wf—6VBæÖ‚ÇÂF÷–2æÖ‚ÇÂ’À¢66÷&S¢çVÖ&W"‡&Wf—6VBç66÷&RÇÂ’À¢Ğ¢¢F÷–3°¢Ò“°§Ğ ¦gVæ7F–öâvWDÆ7E6–væGW&T†VFW%fÇVR€¢†VFW%&÷s¢Væ¶æ÷våµÒÀ¢&÷s¢Væ¶æ÷våµÒÀ¢†VFW$æÖS¢7G&–ærÀ¢fÆÆ&6³¢Væ¶æ÷vâÒ" ¢’°¢6öç7BF&vWBÒæ÷&ÖÆ—¦T¶W’††VFW$æÖR“°¢f÷"†ÆWB–æFW‚Ò†VFW%&÷ræÆVæwF‚Ò²–æFW‚ãÒ²–æFW‚ÓÒ’°¢–b†æ÷&ÖÆ—¦T¶W’††VFW%&÷u¶–æFW…Ò’ÓÒF&vWB’6öçF–çVS°¢6öç7BfÇVRÒ&÷u¶–æFW…Ó°¢–b‡fÇVRÓÒçVÆÂbbfÇVRÓÒVæFVf–æVBbbæ÷&ÖÆ—¦UFW‡B‡fÇVR’ÓÒ""’&WGW&âfÇVS°¢Ğ¢&WGW&âfÆÆ&6³°§Ğ ¦gVæ7F–öâ'V–ÆE6–væGW&U&tVÄÖ‡&÷w3¢Væ¶æ÷våµÕµÒ’°¢6öç7B†VFW$–æFW‚Ò&÷w2æf–æD–æFW‚‚‡&÷r’Óâ&÷ræÖ‚†—FVÒ’Óâæ÷&ÖÆ—¦T¶W’†—FVÒ’’æ–æ6ÇVFW2‚&66R–B"’“°¢6öç7BÖÒæWrÖÇ7G&–ærÂ6–væGW&T&÷fVDVÃâ‚“°¢–b††VFW$–æFW‚Â’&WGW&âÖ° ¢6öç7B†VFW%&÷rÒ&÷w5¶†VFW$–æFW…ÒÇÂµÓ°¢6öç7B†VÇW"Ò'V–ÆD†VFW$Ö††VFW%&÷r“° ¢&÷w2ç6Æ–6R††VFW$–æFW‚²’æf÷$V6‚‚‡&÷r’Óâ°¢6öç7B66T–BÒ6fTæÖR††VÇW"ævWB‡&÷rÂ²$66R”B"Â$66T–B"Â$66R%ÒÂ""’Â""“°¢–b‚66T–B’&WGW&ã° ¢6öç7BÖöçF„¶W’ÒvWDÖöçF„¶W”g&öÕ&÷r‡&÷rÂ†VÇW"“°¢6öç7B&tf–æÅ66÷&RÒçVÖ&W"†vWDÆ7E6–væGW&T†VFW%fÇVR††VFW%&÷rÂ&÷rÂ$f–æÂ66÷&R"Â""’“°¢–b‚çVÖ&W"æ—4f–æ—FR‡&tf–æÅ66÷&R’’&WGW&ã° ¢6öç7B&u&Wf–÷W566÷&RÒçVÖ&W"††VÇW"ævWB‡&÷rÂ²%&Wf–÷W266÷&R"Â$÷&–v–æÂ66÷&R%ÒÂ&tf–æÅ66÷&R’“°¢6öç7B—FVÓ¢6–væGW&T&÷fVDVÂÒ°¢66T–BÀ¢&Wf–÷W566÷&S¢çVÖ&W"æ—4f–æ—FR‡&u&Wf–÷W566÷&R’ò&u&Wf–÷W566÷&R¢&tf–æÅ66÷&RÀ¢f–æÅ66÷&S¢çVÖ&W"‡&tf–æÅ66÷&RçFôf—†VBƒ"’’À¢&Wf–WvVDC¢æ÷&ÖÆ—¦UFW‡B††VÇW"ævWB‡&÷rÂ²%&Wf–WvVBB"Â%&Wf–WrFFR"Â$VF—BFFR"Â%F–ÖW7F×%ÒÂ""’’À¢Ó° ¢Öç6WB†66T–BÂ—FVÒ“°¢–b‚õã#ÆG³'ÒÕÆG³'ÒBòçFW7B†ÖöçF„¶W’’’°¢Öç6WB†G¶66T–GÓ£¢G¶ÖöçF„¶W—ÖÂ—FVÒ“°¢Ğ¢Ò“° ¢&WGW&âÖ°§Ğ ¦7–æ2gVæ7F–öâfWF6…6–væGW&U&tVÄÖ‚’°¢6öç7BVÄf–ÆW2Ò°¢"ôÆVÂ$õtDDç†Ç7‚"À¢"ôVÂ$õtDDç†Ç7‚"À¢"ôVÅõ$õtDDç†Ç7‚"À¢Ó° ¢f÷"†6öç7Bf–ÆTæÖRöbVÄf–ÆW2’°¢G'’°¢6öç7B&W7öç6RÒv—BfWF6‚†f–ÆTæÖRÂ²66†S¢&æò×7F÷&R"Ò“°¢–b‚&W7öç6Ræö²’6öçF–çVS°¢6öç7B'VffW"Òv—B&W7öç6Ræ'&”'VffW"‚“°¢6öç7Bv÷&¶&öö²Ò„Å5‚ç&VB†'VffW"Â²G—S¢&'&’"Â6VÆÄFFW3¢G'VRÒ“°¢6öç7B6†VWBÒv÷&¶&öö²å6†VWG5²$VÅôFF%ÒÇÂv÷&¶&öö²å6†VWG5·v÷&¶&öö²å6†VWDæÖW5³ÕÓ°¢6öç7B&÷w2Ò„Å5‚çWF–Ç2ç6†VWE÷Fõö§6öãÇVæ¶æ÷våµÓâ‡6†VWBÂ²†VFW#¢ÂFVgfÃ¢çVÆÂÂ&s¢G'VRÒ“°¢6öç7BÖÒ'V–ÆE6–væGW&U&tVÄÖ‡&÷w2“°¢–b†Öç6—¦R’&WGW&âÖ°¢Ò6F6‚†W'&÷"’°¢6öç6öÆRçv&â†6–væGW&R&rVÂf–ÆR6¶—VC¢G¶f–ÆTæÖWÖÂW'&÷"“°¢Ğ¢Ğ ¢&WGW&âæWrÖÇ7G&–ærÂ6–væGW&T&÷fVDVÃâ‚“°§Ğ  ¦gVæ7F–öâ'V–ÆDFö7VÖVçG2€¢&÷w3¢Væ¶æ÷våµÕµÒÀ¢66÷VçG3¢W6W$66÷VçE6æ6†÷EµÒÀ¢&÷fVDVÄÖ¢ÖÇ7G&–ærÂ6–væGW&T&÷fVDVÃâÒæWrÖ‚¢’°¢6öç7B†VFW$–æFW‚Ò&÷w2æf–æD–æFW‚‚‡&÷r’Óâ°¢6öç7B¶W—2Ò&÷ræÖ‚†—FVÒ’Óâæ÷&ÖÆ—¦T¶W’†—FVÒ’“°¢&WGW&â¶W—2æ–æ6ÇVFW2‚&vVçBæÖR"’bb†¶W—2æ–æ6ÇVFW2‚&66R–B"’ÇÂ¶W—2æ–æ6ÇVFW2‚&f–æÂ66÷&R"’“°¢Ò“°¢–b††VFW$–æFW‚Â’&WGW&âµÓ° ¢6öç7B†VÇW"Ò'V–ÆD†VFW$Ö‡&÷w5¶†VFW$–æFW…ÒÇÂµÒ“°¢6öç7Bw&÷WVBÒæWrÖÇ7G&–ærÂ°¢ÖöçF„¶W“¢7G&–æs°¢vVçDæÖS¢7G&–æs°¢6Væ–÷$æÖS¢7G&–æs°¢7WW'f—6÷$æÖS¢7G&–æs°¢æÖS¢7G&–æs°¢FVÔæÖS¢7G&–æs°¢66÷&W3¢çVÖ&W%µÓ°¢66W3¢6–væGW&T66TFWF–ÅµÓ°¢66T–G3¢6WCÇ7G&–æsã°¢Óâ‚“° ¢&÷w2ç6Æ–6R††VFW$–æFW‚²’æf÷$V6‚‚‡&÷r’Óâ°¢6öç7BvVçDæÖRÒ6æöæ–6ÄvVçDæÖR††VÇW"ævWB‡&÷rÂ²$vVçBæÖR"Â$vVçB"Â$V×Æ÷–VRæÖR"Â%W6W"%ÒÂ""’“°¢–b‚vVçDæÖRÇÂvVçDæÖRÓÓÒ"Ò"’&WGW&ã° ¢6öç7BÖöçF„¶W’ÒvWDÖöçF„¶W”g&öÕ&÷r‡&÷rÂ†VÇW"“°¢–b‚—4F6†&ö&E&W÷'F–ætÖöçF‚†ÖöçF„¶W’’’&WGW&ã° ¢6öç7B66÷VçBÒf–æD66÷VçDf÷$vVçB†66÷VçG2ÂvVçDæÖR“°¢6öç7B66T–BÒ6fTæÖR††VÇW"ævWB‡&÷rÂ²$66R”B"Â$66T–B"Â$66R%ÒÂ""’“°¢6öç7BVF—DFFRÒ'6TW†6VÄFFR††VÇW"ævWB‡&÷rÂ²$VF—BFFR"Â$66RFFR"Â%F–ÖW7F×"Â$FFR%ÒÂ""’“°¢6öç7B&tf–æÅ66÷&RÒçVÖ&W"††VÇW"ævWB‡&÷rÂ²$f–æÂ66÷&R"Â%F÷FÂ66÷&R"Â%66÷&R"Â%66÷&R%ÒÂ""’“°¢6öç7B&÷fVDVÂÒ&÷fVDVÄÖævWB†G¶66T–GÓ£¢G¶ÖöæÚ±î¸Â¸­yêë¢°k¢G§¦*^thKey}`) || approvedAppealMap.get(caseId);
    const appealScore = approvedAppeal?.finalScore;
    const finalScore = Number.isFinite(Number(appealScore)) ? Number(appealScore) : rawFinalScore;
    const score = Number.isFinite(finalScore) ? finalScore : 0;
    const topics = applySignatureAppealTopics(extractSignatureTopicsFromRow(row, helper, monthKey), approvedAppeal);

    const seniorName = resolveSeniorNameForAgent(account, helper.get(row, ["Senior", "Team Lead", "Team Leader", "Leader"], ""));
    const supervisorName = resolveSupervisorName(helper.get(row, ["Supervisor", "Sup"], ""));
    const qaName = safeName(helper.get(row, ["QA", "QA Name", "Auditor", "Evaluator", "Audit By"], ""), "Quality Assurance");
    const teamName = safeName(account?.teamName || helper.get(row, ["Team", "Team Name"], ""), "-");
    const inquiry = safeName(helper.get(row, ["Customer Inquiry", "Intent", "Inquiry", "à¸«à¸±à¸§à¸‚à¹‰à¸­"], ""), "-");
    const comment = safeName(helper.get(row, ["Final Comment", "Comment", "QA Comment", "Case Description"], ""), "-");

    const key = `${monthKey}::${agentName}`;
    const current = grouped.get(key) || {
      monthKey,
      agentName,
      seniorName,
      supervisorName,
      qaName,
      teamName,
      scores: [],
      cases: [],
      caseIds: new Set<string>(),
    };

    current.seniorName = isGenericRoleName(current.seniorName) ? seniorName : current.seniorName;
    current.supervisorName = isGenericRoleName(current.supervisorName) ? supervisorName : current.supervisorName;
    current.qaName = current.qaName === "Quality Assurance" ? qaName : current.qaName;
    current.teamName = current.teamName === "-" ? teamName : current.teamName;

    if (caseId && caseId !== "-" && !current.caseIds.has(caseId)) {
      current.caseIds.add(caseId);
      if (Number.isFinite(finalScore)) current.scores.push(score);
      current.cases.push({
        caseId,
        auditDate: auditDate ? auditDate.toLocaleDateString("th-TH") : "-",
        inquiry,
        finalScore: score,
        grade: scoreToGrade(score, monthKey),
        comment,
        topics,
      });
    } else if ((!caseId || caseId === "-") && Number.isFinite(finalScore)) {
      current.scores.push(score);
    }

    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .map((item): SignatureDocument => {
      const averageScore = item.scores.length
        ? item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length
        : 0;
      const caseCount = item.caseIds.size || item.scores.length;
      const base = {
        id: `${item.monthKey}::${item.agentName}`,
        monthKey: item.monthKey,
        monthLabel: getMonthLabel(item.monthKey),
        agentName: item.agentName,
        seniorName: item.seniorName,
        supervisorName: item.supervisorName,
        qaName: item.qaName,
        teamName: item.teamName,
        caseCount,
        averageScore,
        grade: scoreToGrade(averageScore, item.monthKey),
        eligibleByScore: caseCount >= CASE_TARGET && averageScore >= 80,
        cases: sortSignatureCasesByAuditDate(item.cases),
      };
      return { ...base, documentHash: createDocumentHash(base) };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey) || a.agentName.localeCompare(b.agentName));
}

function buildDocumentsFromStoredEvaluations(
  records: StoredEvaluation[],
  accounts: UserAccountSnapshot[],
  approvedAppealMap: Map<string, SignatureApprovedAppeal> = new Map()
) {
  const grouped = new Map<string, {
    monthKey: string;
    agentName: string;
    seniorName: string;
    supervisorName: string;
    qaName: string;
    teamName: string;
    scores: number[];
    cases: SignatureCaseDetail[];
    caseIds: Set<string>;
  }>();

  excludeTestEvaluations(records).forEach((record) => {
    const rawPreview = record.rawDataPreview || {};
    const agentName = canonicalAgentName(record.agentName || record.targetDisplayName || rawPreview["Agent Name"]);
    if (!agentName || agentName === "-") return;

    const auditDate = parseExcelDate(
      record.auditDate ||
        rawPreview["Audit Date"] ||
        rawPreview["Case Date"] ||
        record.auditTimestamp ||
        record.submittedAt
    );
    const monthKey = getMonthKey(auditDate);
    if (!isDashboardReportingMonth(monthKey)) return;

    const caseId = safeName(record.caseId || rawPreview["Case ID"], "");
    const rawFinalScore = Number(record.finalScore || rawPreview["Final Score"] || 0);
    const approvedAppeal = approvedAppealMap.get(`${caseId}::${monthKey}`) || approvedAppealMap.get(caseId);
    const appealScore = approvedAppeal?.finalScore;
    const finalScore = Number.isFinite(Number(appealScore)) ? Number(appealScore) : rawFinalScore;
    if (!Number.isFinite(finalScore)) return;

    const account = findAccountForAgent(accounts, agentName);
    const seniorName = resolveSeniorNameForAgent(account, rawPreview["Senior"] || rawPreview["Team Lead"] || rawPreview["Team Leader"]);
    const supervisorName = resolveSupervisorName(rawPreview["Supervisor"] || rawPreview["Sup"]);
    const qaName = safeName(
      record.evaluatorName || rawPreview["QA"] || rawPreview["QA Name"] || rawPreview["Auditor"] || rawPreview["Evaluator"],
      getQaSignerNameByMonth(monthKey)
    );
    const teamName = safeName(account?.teamName || rawPreview["Team"] || rawPreview["Team Name"], "-");
    const inquiry = safeName(record.inquiry || rawPreview["Customer Inquiry"] || rawPreview["Inquiry"] || rawPreview["à¸«à¸±à¸§à¸‚à¹‰à¸­"], "-");
    const comment = safeName(record.caseDescription || rawPreview["Final Comment"] || rawPreview["Comment"] || rawPreview["QA Comment"], "-");

    const key = `${monthKey}::${agentName}`;
    const current = grouped.get(key) || {
      monthKey,
      agentName,
      seniorName,
      supervisorName,
      qaName,
      teamName,
      scores: [],
      cases: [],
      caseIds: new Set<string>(),
    };

    current.seniorName = isGenericRoleName(current.seniorName) ? seniorName : current.seniorName;
    current.supervisorName = isGenericRoleName(current.supervisorNam«ëŒ+Š×®º+º$zzb¥æÖR’ò7WW'f—6÷$æÖR¢7W'&VçBç7WW'f—6÷$æÖS°¢7W'&VçBçæÖRÒ7W'&VçBçæÖRÓÓÒ%VÆ—G’77W&æ6R"òæÖR¢7W'&VçBçæÖS°¢7W'&VçBçFVÔæÖRÒ7W'&VçBçFVÔæÖRÓÓÒ"Ò"òFVÔæÖR¢7W'&VçBçFVÔæÖS° ¢–b†66T–Bbb7W'&VçBæ66T–G2æ†2†66T–B’’°¢7W'&VçBæ66T–G2æFB†66T–B“°¢7W'&VçBç66÷&W2çW6‚†f–æÅ66÷&R“°¢7W'&VçBæ66W2çW6‚‡°¢66T–BÀ¢VF—DFFS¢VF—DFFRòVF—DFFRçFôÆö6ÆTFFU7G&–ær‚'F‚ÕD‚"’¢"Ò"À¢–çV—'’À¢f–æÅ66÷&RÀ¢w&FS¢66÷&UFôw&FR†f–æÅ66÷&RÂÖöçF„¶W’’À¢6öÖÖVçBÀ¢F÷–73¢Ç•6–væGW&TVÅF÷–72‡&V6÷&BçF÷–72ÇÂµÒÂ&÷fVDVÂ’À¢Ò“°¢Ğ ¢w&÷WVBç6WB†¶W’Â7W'&VçB“°¢Ò“° ¢&WGW&â'&’æg&öÒ†w&÷WVBçfÇVW2‚’¢æÖ‚†—FVÒ“¢6–væGW&TFö7VÖVçBÓâ°¢6öç7BfW&vU66÷&RÒ—FVÒç66÷&W2æÆVæwF€¢ò—FVÒç66÷&W2ç&VGV6R‚‡7VÒÂ66÷&R’Óâ7VÒ²66÷&RÂ’ò—FVÒç66÷&W2æÆVæwF€¢¢°¢6öç7B66T6÷VçBÒ—FVÒæ66T–G2ç6—¦RÇÂ—FVÒç66÷&W2æÆVæwFƒ°¢6öç7B&6RÒ°¢–C¢G¶—FVÒæÖöçF„¶W—Ó£¢G¶—FVÒævVçDæÖWÖÀ¢ÖöçF„¶W“¢—FVÒæÖöçF„¶W’À¢ÖöçF„Æ&VÃ¢vWDÖöçF„Æ&VÂ†—FVÒæÖöçF„¶W’’À¢vVçDæÖS¢—FVÒævVçDæÖRÀ¢6Væ–÷$æÖS¢—FVÒç6Væ–÷$æÖRÀ¢7WW'f—6÷$æÖS¢—FVÒç7WW'f—6÷$æÖRÀ¢æÖS¢—FVÒçæÖRÀ¢FVÔæÖS¢—FVÒçFVÔæÖRÀ¢66T6÷VçBÀ¢fW&vU66÷&RÀ¢w&FS¢66÷&UFôw&FR†fW&vU66÷&RÂ—FVÒæÖöçF„¶W’’À¢VÆ–v–&ÆT'•66÷&S¢66T6÷VçBãÒ44UõD$tUBbbfW&vU66÷&RãÒƒÀ¢66W3¢6÷'E6–væGW&T66W4'”VF—DFFR†—FVÒæ66W2’À¢Ó°¢&WGW&â²ââæ&6RÂFö7VÖVçD†6ƒ¢7&VFTFö7VÖVçD†6‚†&6R’Ó°¢Ò¢ç6÷'B‚†Â"’Óâ"æÖöçF„¶W’æÆö6ÆT6ö×&R†æÖöçF„¶W’’ÇÂævVçDæÖRæÆö6ÆT6ö×&R†"ævVçDæÖRÂ'F‚"’“°§Ğ ¦gVæ7F–öâÖW&vU6–væGW&TFö7VÖVçG2†W†—7F–æs¢6–væGW&TFö7VÖVçBÂ–æ6öÖ–æs¢6–væGW&TFö7VÖVçB“¢6–væGW&TFö7VÖVçB°¢6öç7B66TÖÒæWrÖÇ7G&–ærÂ6–væGW&T66TFWF–Ãâ‚“°¢W†—7F–æræ66W2æf÷$V6‚‚†—FVÒ’Óâ66TÖç6WB†—FVÒæ66T–BÂ—FVÒ’“°¢–æ6öÖ–æræ66W2æf÷$V6‚‚†—FVÒ’Óâ°¢6öç7B&Wf–÷W2Ò66TÖævWB†—FVÒæ66T–B“°¢–b‡&Wf–÷W3òçF÷–73òæÆVæwF‚bb‚—FVÒçF÷–73òæÆVæwF‚ÇÂ&Wf–÷W2çF÷–72æÆVæwF‚â—FVÒçF÷–72æÆVæwF‚’’°¢66TÖç6WB†—FVÒæ66T–BÂ²ââæ—FVÒÂF÷–73¢&Wf–÷W2çF÷–72Ò“°¢&WGW&ã°¢Ğ¢66TÖç6WB†—FVÒæ66T–BÂ—FVÒ“°¢Ò“°¢6öç7B66W2Ò6÷'E6–væGW&T66W4'”VF—DFFR„'&’æg&öÒ†66TÖçfÇVW2‚’’“°¢6öç7B66T6÷VçBÒ66W2æÆVæwF‚ÇÂÖF‚æÖ‚†W†—7F–æræ66T6÷VçBÂ–æ6öÖ–æræ66T6÷VçB“°¢6öç7BfW&vU66÷&RÒ66W2æÆVæwF€¢ò66W2ç&VGV6R‚‡7VÒÂ—FVÒ’Óâ7VÒ²çVÖ&W"†—FVÒæf–æÅ66÷&RÇÂ’Â’ò66W2æÆVæwF€¢¢‚‚’Óâ°¢6öç7BW†—7F–æt66W2ÒÖF‚æÖ‚„çVÖ&W"†W†—7F–æræ66T6÷VçB’ÇÂÂ“°¢6öç7B–æ6öÖ–æt66W2ÒÖF‚æÖ‚„çVÖ&W"†–æ6öÖ–æræ66T6÷VçB’ÇÂÂ“°¢6öç7BF÷FÄ66W2ÒW†—7F–æt66W2²–æ6öÖ–æt66W3°¢–b‚F÷FÄ66W2’&WGW&â°¢&WGW&â‚„çVÖ&W"†W†—7F–æræfW&vU66÷&R’ÇÂ’¢W†—7F–æt66W2²„çVÖ&W"†–æ6öÖ–æræfW&vU66÷&R’ÇÂ’¢–æ6öÖ–æt66W2’òF÷FÄ66W3°¢Ò’‚“°¢6öç7BÖöçF„¶W’Ò–æ6öÖ–æræÖöçF„¶W’ÇÂW†—7F–æræÖöçF„¶W“°¢6öç7B&6RÒ°¢ââæW†—7F–ærÀ¢ââæ–æ6öÖ–ærÀ¢–C¢–æ6öÖ–æræ–BÇÂW†—7F–æræ–BÀ¢ÖöçF„¶W’À¢ÖöçF„Æ&VÃ¢vWDÖöçF„Æ&VÂ†ÖöçF„¶W’’À¢66T6÷VçBÀ¢fW&vU66÷&RÀ¢w&FS¢66÷&UFôw&FR†fW&vU66÷&RÂÖöçF„¶W’’À¢VÆ–v–&ÆT'•66÷&S¢66T6÷VçBãÒ44UõD$tUBbbfW&vU66÷&RãÒƒÀ¢66W2À¢Ó°¢&WGW&â²ââæ&6RÂFö7VÖVçD†6ƒ¢7&VFTFö7VÖVçD†6‚†&6R’Ó°§Ğ ¦gVæ7F–öâvWE6–væW$æÖT'”ÖöçF‚†ÖöçF„¶W“¢7G&–ærÂfÆÆ&6²Ò%VÆ—G’77W&æ6R"’°¢–b†ÖöçF„¶W’ãÒ###bÓ2"’&WGW&â%6öæwöâ†÷F†öær#°¢–b†ÖöçF„¶W’ÓÓÒ###bÓ"ÇÂÖöçF„¶W’ÓÓÒ###bÓ""’&WGW&â%†öÖÖ&–âF†—F†öÒ#°¢&WGW&âfÆÆ&6²ÇÂ%VÆ—G’77W&æ6R#°§Ğ ¦gVæ7F–öâvWE&öÆU6–væW"†Fö3¢6–væGW&TFö7VÖVçBÂ&öÆS¢6–vå&öÆR’°¢–b‡&öÆRÓÓÒ%"’&WGW&âvWE6–væW$æÖT'”ÖöçF‚†Fö2æÖöçF„¶W’ÂFö2çæÖR“°¢–b‡&öÆRÓÓÒ%7WW'f—6÷""’&WGW&â&W6öÇfU7WW'f—6÷$æÖR†Fö2ç7WW'f—6÷$æÖR“°¢–b‡&öÆRÓÓÒ%6Væ–÷""’&WGW&â&W6öÇfTfÆÆ&6µ6–væW$æÖR†Fö2ç6Væ–÷$æÖRÂDTdTÅEõ5UU%d•4õ%õ4”täU"“°¢&WGW&âFö2ævVçDæÖS°§Ğ ¦gVæ7F–öâvWE6–væVDVçG'’†VçG&–W3¢6–væGW&TVçG'•µÒÂ&öÆS¢6–vå&öÆR’°¢&WGW&âVçG&–W2æf–æB‚†VçG'’’ÓâVçG'’ç&öÆRÓÓÒ&öÆRbbVçG'’ç7FGW2ÓÓÒ%6–væVB"“°§Ğ ¦gVæ7F–öâvWEv—fVDVçG'’†VçG&–W3¢6–væGW&TVçG'•µÒÂ&öÆS¢6–vå&öÆR’°¢&WGW&âVçG&–W2æf–æB‚†VçG'’’ÓâVçG'’ç&öÆRÓÓÒ&öÆRbbVçG'’ç7FGW2ÓÓÒ%v—fVB"“°§Ğ ¦gVæ7F–öâvWD6ö×ÆWFVDVçG'’†VçG&–W3¢6–væGW&TVçG'•µÒÂ&öÆS¢6–vå&öÆR’°¢&WGW&âvWE6–væVDVçG'’†VçG&–W2Â&öÆR’ÇÂvWEv—fVDVçG'’†VçG&–W2Â&öÆR“°§Ğ ¦gVæ7F–öâvWDFVFÆ–æU&W6WDVçG'’†VçG&–W3¢6–væGW&TVçG'•µÒÂ&öÆS¢6–vå&öÆR’°¢&WGW&âVçG&–W2æf–æB‚†VçG'’’ÓâVçG'’ç&öÆRÓÓÒ&öÆRbbVçG'’ç7FGW2ÓÓÒ%VæF–ær"bbVçG'’ææ÷FRÓÓÒ4”täEU$UôDTDÄ”äUõ$U4UEôäõDR“°§Ğ ¦gVæ7F–öâvWDFVFÆ–æU&W6WDW‡—&W4B†VçG'“ó¢6–væGW&TVçG'’’°¢6öç7B&W6WEF–ÖRÒæWrFFR†VçG'“òç&W6WDBÇÂ""’ævWEF–ÖR‚“°¢–b„çVÖ&W"æ—4æâ‡&W6WEF–ÖR’’&WGW&âçVÆÃ°¢&WGW&âæWrFFR‡&W6WEF–ÖR²4”täEU$Uõ$U4UEõt”äDõuôÕ2“°§Ğ ¦gVæ7F–öâ—4FVFÆ–æU&W6WD7F—fR†VçG'“ó¢6–væGW&TVçG'’Âæ÷rÒæWrFFR‚’’°¢6öç7BW‡—&W4BÒvWDFVFÆ–æU&W6WDW‡—&W4B†VçG'’“°¢&WGW&â&ööÆVâ†W‡—&W4Bbbæ÷rævWEF–ÖR‚’ÃÒW‡—&W4BævWEF–ÖR‚’“°§Ğ ¦gVæ7F–öâvWD7F—fTFVFÆ–æU&W6WDVçG'’†VçG&–W3¢6–væGW&TVçG'•µÒÂ&öÆS¢6–vå&öÆRÂæ÷rÒæWrFFR‚’’°¢6öç7BVçG'’ÒvWDFVFÆ–æU&W6WDVçG'’†VçG&–W2Â&öÆR“°¢&WGW&â—4FVFÆ–æU&W6WD7F—fR†VçG'’Âæ÷r’òVçG'’¢VæFVf–æVC°§Ğ ¦gVæ7F–öâvWEVæF–æu&öÆW2†VçG&–W3¢6–væGW&TVçG'•µÒ’°¢&WGW&â4”täEU$UôdÄõræf–ÇFW"‚‡&öÆR’ÓâvWD6ö×ÆWFVDVçG'’†VçG&–W2Â&öÆR’“°§Ğ  ¦gVæ7F–öâvWEVæF–æu&öÆUFW‡B…öFö3¢6–væGW&TFö7VÖVçBÂVçG&–W3¢6–væGW&TVçG'•µÒ’°¢6öç7BVæF–æu&öÆW2ÒvWEVæF–æu&öÆW2†VçG&–W2“°¢&WGW&âVæF–æu&öÆW2æÆVæwF€¢òVæF–æu&öÆW2æÖ‡&öÆUF†”Æ&VÂ’æ¦ö–â‚"Â"¢¢.˜ˆ¾˜~‰ˆNŠ>‰®˜Š^˜Šr#°§Ğ ¦gVæ7F–öâ&öÆUF†”Æ&VÂ‡&öÆS¢6–vå&öÆR’°¢–b‡&öÆRÓÓÒ%"’&WGW&â%‰Î‹˜‰^Š>Š~ˆŠ®ŠŞ‰¢#°¢–b‡&öÆRÓÓÒ%7WW'f—6÷""’&WGW&â%7WW'f—6÷"#°¢–b‡&öÆRÓÓÒ%6Væ–÷""’&WGW&â%6Væ–÷"òFVÒÆVB#°¢&WGW&â$vVçB‰Î‹˜‰n‹ˆ‰¾Š>‹˜Š‹N‰’#°§Ğ ¦gVæ7F–öâ6å6–vä–FVçF—G’†7W'&VçEW6W#¢7W'&VçEW6W"ÂFö3¢6–væGW&TFö7VÖVçBÂ&öÆS¢6–vå&öÆR’°¢6öç7B6–væW$æÚ±î¸Â¸­yêë¢°k¢G§¦*^ame = getRoleSigner(doc, role);

  if (role === "Agent") {
    return currentUserMatchesName(currentUser, doc.agentName);
  }

  if (role === "QA" && compactPerson(signerName) === compactPerson("Quality Assurance")) {
    return currentUserHasRole(currentUser, role);
  }

  const isAssignedSigner = currentUserMatchesName(currentUser, signerName);
  if (isAssignedSigner) return true;

  return currentUserHasRole(currentUser, role) && currentUserMatchesName(currentUser, signerName);
}

function autoHistoricalEntries(doc: SignatureDocument): SignatureEntry[] {
  if (!isHistoricalPaidPeriod(doc.monthKey)) return [];
  const window = getSignatureWindow(doc.monthKey);
  const paidAt = window.dueAt.toISOString();
  return SIGNATURE_FLOW.map((role) => ({
    role,
    signerName: getRoleSigner(doc, role),
    status: "Signed",
    signedBy: "System Historical Paid",
    signedAt: paidAt,
    note: "Historical paid period Jan-Apr 2026",
  }));
}

function effectiveEntriesForDoc(doc: SignatureDocument, signatures: Record<string, SignatureEntry[]>) {
  if (isHistoricalPaidPeriod(doc.monthKey)) {
    const storedEntries = signatures[doc.id] || [];
    return autoHistoricalEntries(doc).map((entry) => {
      const stored = storedEntries.find((item) => item.role === entry.role);
      return stored?.signatureDataUrl
        ? {
            ...entry,
            signatureDataUrl: stored.signatureDataUrl,
            signedBy: stored.signedBy || entry.signedBy,
            signedAt: stored.signedAt || entry.signedAt,
            signerName: stored.signerName || entry.signerName,
          }
        : entry;
    });
  }
  return signatures[doc.id] || [];
}

function canViewDocument(currentUser: CurrentUser, doc: SignatureDocument, entries: SignatureEntry[]) {
  const pendingRoles = getPendingRoles(entries);
  if (!pendingRoles.length) return false;
  if (!isAfterAppealPeriod(doc.monthKey)) return false;

  return pendingRoles.some((role) => canSignIdentity(currentUser, doc, role));
}

function canMonitorDocument(currentUser: CurrentUser, doc: SignatureDocument) {
  if (currentUser.role === "Quality Assurance" || currentUser.role === "Admin") return true;
  if (currentUser.role === "Supervisor") return canSignIdentity(currentUser, doc, "Supervisor");
  if (currentUser.role === "Senior") return canSignIdentity(currentUser, doc, "Senior");
  return canSignIdentity(currentUser, doc, "Agent");
}

function statusForRole(entries: SignatureEntry[], role: SignRole, monthKey: string, now = new Date()): SignatureStepStatus {
  if (getWaivedEntry(entries, role)) return "Waived";
  if (getSignedEntry(entries, role)) return "Signed";
  if (isHistoricalPaidPeriod(monthKey)) return "Signed";
  const timeline = getTimelineStatus(monthKey, now);
  if (timeline === "Appeal Period Open" || timeline === "Waiting Signature Window") return "Locked";
  if (timeline === "Signature Deadline Passed" && getActiveDeadlineResetEntry(entries, role, now)) return "Pending";
  if (timeline === "Signature Deadline Passed") return "Expired";
  return "Pending";
}

function canSignRoleByDate(monthKey: string, entries: SignatureEntry[], role: SignRole, now = new Date()) {
  if (!isSigningAllowedByDate(monthKey, now)) return false;
  if (getTimelineStatus(monthKey, now) === "Signature Deadline Passed") {
    return Boolean(getActiveDeadlineResetEntry(entries, role, now));
  }
  return true;
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

function formatDateOnly(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getSignatureDueDate(monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 15, 23, 59, 59);
}

function getSignatureCreatedDate(doc: SignatureDocument) {
  const caseDates = doc.cases
    .map((item) => parseExcelDate(item.auditDate))
    .filter((date): date is Date => Boolean(date));
  if (caseDates.length) return new Date(Math.max(...caseDates.map((date) => date.getTime())));
  if (/^\d{4}-\d{2}$/.test(doc.monthKey)) return new Date(`${doc.monthKey}-01T00:00:00`);
  return null;
}

function getDocumentPrimaryCaseId(doc: SignatureDocument) {
  return doc.documentHash || doc.cases[0]?.caseId || doc.id;
}

function getDocumentAuditSortTime(doc: SignatureDocument) {
  const caseTimes = doc.cases
    .map((item) => parseExcelDate(item.auditDate)?.getTime() || 0)
    .filter((time) => time > 0);
  if (caseTimes.length) return Math.max(...caseTimes);
  return getSignatureCreatedDate(doc)?.getTime() || 0;
}

function getMonthlyDocumentRef(doc: SignatureDocument, allDocuments: SignatureDocument[]) {
  const monthMatch = doc.monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!monthMatch) return doc.documentHash || doc.id;

  const [, year, month] = monthMatch;
  const sortedDocuments = allDocuments
    .slice()
    .sort((a, b) => {
      const monthDiff = a.monthKey.localeCompare(b.monthKey);
      if (monthDiff !== 0) return monthDiff;
      const auditDiff = getDocumentAuditSortTime(a) - getDocumentAuditSortTime(b);
      if (auditDiff !== 0) return auditDiff;
      const nameDiff = a.agentName.localeCompare(b.agentName, "th");
      if (nameDiff !== 0) return nameDiff;
      return a.id.localeCompare(b.id);
    });

  const index = sortedDocuments.findIndex((item) => item.id === doc.id);
  const sequence = String(Math.max(0, index) + 1).padStart(5, "0");
  return `${month}${year}${sequence}`;
}

async function normalizeSignatureDataUrl(dataUrl: string) {
  if (!dataUrl || typeof window === "undefined") return dataUrl;

  return new Promise<string>((resolve) => {
    let resolved = false;
    let timeoutId = 0;
    const finish = (value: m«ëŒ+Š×®º+º$zzb¥ç7G&–ær’Óâ°¢–b‡&W6öÇfVB’&WGW&ã°¢&W6öÇfVBÒG'VS°¢v–æF÷ræ6ÆV%F–ÖV÷WB‡F–ÖV÷WD–B“°¢&W6öÇfR‡fÇVR“°¢Ó°¢F–ÖV÷WD–BÒv–æF÷rç6WEF–ÖV÷WB‚‚’Óâf–æ—6‚†FFW&Â’Â#S“°¢6öç7B–ÖvRÒæWr–ÖvR‚“°¢–ÖvRæöæÆöBÒ‚’Óâ°¢G'’°¢6öç7B6÷W&6T6çf2ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&6çf2"“°¢6÷W&6T6çf2çv–GF‚Ò–ÖvRææGW&Åv–GF‚ÇÂ–ÖvRçv–GFƒ°¢6÷W&6T6çf2æ†V–v‡BÒ–ÖvRææGW&Ä†V–v‡BÇÂ–ÖvRæ†V–v‡C°¢6öç7B6÷W&6T6öçFW‡BÒ6÷W&6T6çf2ævWD6öçFW‡B‚#&B"“°¢–b‚6÷W&6T6öçFW‡BÇÂ6÷W&6T6çf2çv–GF‚ÇÂ6÷W&6T6çf2æ†V–v‡B’°¢f–æ—6‚†FFW&Â“°¢&WGW&ã°¢Ğ ¢6÷W&6T6öçFW‡BæG&t–ÖvR†–ÖvRÂÂ“°¢6öç7B–ÖvTFFÒ6÷W&6T6öçFW‡BævWD–ÖvTFFƒÂÂ6÷W&6T6çf2çv–GF‚Â6÷W&6T6çf2æ†V–v‡B“°¢ÆWBÖ–å‚Ò6÷W&6T6çf2çv–GFƒ°¢ÆWBÖ–å’Ò6÷W&6T6çf2æ†V–v‡C°¢ÆWBÖ…‚Ò°¢ÆWBÖ…’Ò°¢ÆWB†4–æ²ÒfÇ6S° ¢f÷"†ÆWB’Ò²’Â6÷W&6T6çf2æ†V–v‡C²’³Ò’°¢f÷"†ÆWB‚Ò²‚Â6÷W&6T6çf2çv–GFƒ²‚³Ò’°¢6öç7B–æFW‚Ò‡’¢6÷W&6T6çf2çv–GF‚²‚’¢C°¢6öç7BÇ†Ò–ÖvTFFæFF¶–æFW‚²5Ó°¢6öç7B&VBÒ–ÖvTFFæFF¶–æFW…Ó°¢6öç7Bw&VVâÒ–ÖvTFFæFF¶–æFW‚²Ó°¢6öç7B&ÇVRÒ–ÖvTFFæFF¶–æFW‚²%Ó°¢6öç7B—4–æ²ÒÇ†â#Bbb‡&VBÂ#CBÇÂw&VVâÂ#CBÇÂ&ÇVRÂ#CB“°¢–b‚—4–æ²’6öçF–çVS°¢†4–æ²ÒG'VS°¢Ö–å‚ÒÖF‚æÖ–â†Ö–å‚Â‚“°¢Ö–å’ÒÖF‚æÖ–â†Ö–å’Â’“°¢Ö…‚ÒÖF‚æÖ‚†Ö…‚Â‚“°¢Ö…’ÒÖF‚æÖ‚†Ö…’Â’“°¢Ğ¢Ğ ¢–b‚†4–æ²’°¢f–æ—6‚†FFW&Â“°¢&WGW&ã°¢Ğ ¢6öç7BFF–ærÒƒ°¢6öç7B7&÷‚ÒÖF‚æÖ‚ƒÂÖ–å‚ÒFF–ær“°¢6öç7B7&÷’ÒÖF‚æÖ‚ƒÂÖ–å’ÒFF–ær“°¢6öç7B7&÷rÒÖF‚æÖ–â‡6÷W&6T6çf2çv–GF‚Ò7&÷‚ÂÖ…‚ÒÖ–å‚²²FF–ær¢"“°¢6öç7B7&÷‚ÒÖF‚æÖ–â‡6÷W&6T6çf2æ†V–v‡BÒ7&÷’ÂÖ…’ÒÖ–å’²²FF–ær¢"“°¢6öç7B÷WGWD6çf2ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&6çf2"“°¢÷WGWD6çf2çv–GF‚Ò7&÷s°¢÷WGWD6çf2æ†V–v‡BÒ7&÷ƒ°¢6öç7B÷WGWD6öçFW‡BÒ÷WGWD6çf2ævWD6öçFW‡B‚#&B"“°¢–b‚÷WGWD6öçFW‡B’°¢f–æ—6‚†FFW&Â“°¢&WGW&ã°¢Ğ ¢÷WGWD6öçFW‡BæG&t–ÖvR‡6÷W&6T6çf2Â7&÷‚Â7&÷’Â7&÷rÂ7&÷‚ÂÂÂ7&÷rÂ7&÷‚“°¢f–æ—6‚†÷WGWD6çf2çFôFFU$Â‚&–ÖvR÷ær"’“°¢Ò6F6‚†W'&÷"’°¢6öç6öÆRçv&â‚%6–væGW&R–ÖvRæ÷&ÖÆ—¦F–öâf–ÆVB"ÂW'&÷"“°¢f–æ—6‚†FFW&Â“°¢Ğ¢Ó°¢–ÖvRæöæW'&÷"Ò‚’Óâf–æ—6‚†FFW&Â“°¢–ÖvRç7&2ÒFFW&Ã°¢Ò“°§Ğ ¦gVæ7F–öâvWDFö7VÖVçEG—TÆ&VÂ†Fö3¢6–væGW&TFö7VÖVçB’°¢&WGW&âFö2æVÆ–v–&ÆT'•66÷&P¢ò$ÖöçF†Ç’–æ6VçF—fR–ÖVçBFö7VÖVçB ¢¢$ÖöçF†Ç’6¶æ÷vÆVFvVÖVçBFö7VÖVçB#°§Ğ ¦gVæ7F–öâvWEv÷&·76U7FGW2†Fö3¢6–væGW&TFö7VÖVçBÂVçG&–W3¢6–væGW&TVçG'•µÒ’°¢6öç7B6–væVD6ö×ÆWFRÒ4”täEU$UôdÄõræWfW'’‚‡&öÆR’Óâ&ööÆVâ†vWD6ö×ÆWFVDVçG'’†VçG&–W2Â&öÆR’’“°¢–b‡6–væVD6ö×ÆWFR’&WGW&â'6–væVB"26öç7C°¢–b†vWEF–ÖVÆ–æU7FGW2†Fö2æÖöçF„¶W’’ÓÓÒ%6–væGW&RFVFÆ–æR76VB"’&WGW&â&W‡—&VB"26öç7C°¢–b†vWEVæF–æu&öÆW2†VçG&–W2’æÆVæwF‚’&WGW&â'VæF–ær"26öç7C°¢&WGW&â&–â×&öw&W72"26öç7C°§Ğ ¦gVæ7F–öâvWEv÷&·76U7FGW4Æ&VÂ‡7FGW3¢v÷&·76U7FGW2’°¢–b‡7FGW2ÓÓÒ'6–væVB"’&WGW&â%6–væVB#°¢–b‡7FGW2ÓÓÒ&W‡—&VB"’&WGW&â$W‡—&VB#°¢–b‡7FGW2ÓÓÒ&–â×&öw&W72"’&WGW&â$–â&öw&W72#°¢&WGW&â%VæF–ær#°§Ğ ¦gVæ7F–öâvWEv÷&·76U7FGW46Æ72‡7FGW3¢v÷&·76U7FGW2’°¢–b‡7FGW2ÓÓÒ'6–væVB"’&WGW&â&&÷&FW"ÖVÖW&ÆBÓ#&rÖVÖW&ÆBÓSFW‡BÖVÖW&ÆBÓs#°¢–b‡7FGW2ÓÓÒ&W‡—&VB"’&WGW&â&&÷&FW"×&÷6RÓ#&r×&÷6RÓSFW‡B×&÷6RÓs#°¢–b‡7FGW2ÓÓÒ&–â×&öw&W72"’&WGW&â&&÷&FW"×6·’Ó#&r×6·’ÓSFW‡B×6·’Ós#°¢&WGW&â&&÷&FW"ÖÖ&W"Ó#&rÖÖ&W"ÓSFW‡BÖÖ&W"Ós#°§Ğ ¦gVæ7F–öâv÷&·76U7FGW4&FvR‡²7FGW2Ó¢²7FGW3¢v÷&·76U7FGW2Ò’°¢&WGW&â€¢Ç7â6Æ74æÖS×¶–æÆ–æRÖfÆW‚&÷VæFVBÖgVÆÂ&÷&FW"‚Ó2’ÓFW‡B×‡2föçBÖ&Æ6²G¶vWEv÷&·76U7FGW46Æ72‡7FGW2—ÖÓà¢¶vWEv÷&·76U7FGW4Æ&VÂ‡7FGW2—Ğ¢Â÷7ãà¢“°§Ğ ¦gVæ7F–öâF÷væÆöD&Æö"†&Æö#¢&Æö"Âf–ÆTæÖS¢7G&–ær’°¢6öç7BW&ÂÒU$Âæ7&VFTö&¦V7EU$Â†&Æö"“°¢6öç7BÆ–æ²ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&"“°¢Æ–æ²æ‡&VbÒW&Ã°¢Æ–æ²æF÷væÆöBÒf–ÆTæÖS°¢Æ–æ²ç7G–ÆRæF—7Æ’Ò&æöæR#°¢Fö7VÖVçBæ&öG’æVæD6†–ÆB†Æ–æ²“°¢Æ–æ²æ6Æ–6²‚“°¢Æ–æ²ç&VÖ÷fR‚“°¢v–æF÷rç6WEF–ÖV÷WB‚‚’ÓâU$Âç&Wfö¶Tö&¦V7EU$Â‡W&Â’ÂS“°§Ğ ¦gVæ7F–öâ6fUFdf–ÆR‡Fc¢§5DbÂf–ÆTæÖS¢7G&–ær’°¢G'’°¢Fbç6fR†f–ÆTæÖR“°¢&WGW&ã°¢Ò6F6‚†W'&÷"’°¢6öç6öÆRçv&â‚&§5Db6fRf–ÆVBÂfÆÆ–ær&6²Fò&Æö"F÷væÆöB"ÂW'&÷"“°¢Ğ¢F÷væÆöD&Æö"‡Fbæ÷WGWB‚&&Æö""’Âf–ÆTæÖR“°§Ğ ¦gVæ7F–öâ—5–ÖVçE&VG”Fö7VÖVçB€¢Fö3¢6–væGW&TFö7VÖVçBÀ¢VçG&–W3¢6–væGW&TVçG'•µÒÀ¢VæF–ætVÄ66TÖ¢ÖÇ7G&–ærÂVæF–ætVÄ66Sà¢’°¢6öç7B6–væVD6ö×ÆWFRÒ4”täEU$UôdÄõræWfW'’‚‡&öÆR’Óâ&ööÆVâ†vWD6ö×ÆWFVDVçG'’†VçG&–W2Â&öÆR’’“°¢6öç7B†5VæF–ærÒ—4†—7F÷&–6Å–EW&–öB†Fö2æÖöçF„¶W’’bbFö2æ66W2ç6öÖR‚†—FVÒ’ÓâVæF–ætVÄ66TÖæ†2†—FVÒæ66T–B’“°¢6öç7B6–væVEv—F†–ä7–6ÆRÒ4”täEU$UôdÄõræWfW'’‚‡&öÆR’Óâ°¢6öç7Bv—fVBÒvWEv—fVDVçG'’†VçG&–W2Â&öÆR“°¢–b‡v—fVB’°¢&WGW&â&öÆRÓÓÒ$vVçB"bb—56–væVEv—F†–ä7W'&VçE–ÖVçD7–6ÆR‡v—fVBçv—fVDBÇÂ""ÂFö2æÖöçF„¶W’“°¢Ğ¢6öç7B6–væVBÒvWE6–væVDVçG'’†VçG&–W2Â&öÆR“°¢&WGW&â&ööÆVâ‡6–væVB’bb—56–væVEv—F†–ä7W'&VçE–ÖVçD7–6ÆR‡6–væVCòç6–væVDBÇÂ""ÂFö2æÖöçF„¶W’“°¢Ò“°¢&WGW&â6–væVD6ö×ÆWFRbb6–væVEv—F†–ä7–6ÆRbb†5VæF–æs°§Ğ ¦gVæ7F–öâ—4ÆFU6–væVDFö7VÖVçB€¢Fö3¢6–væGW&TFö7VÖVçBÀ¢VçG&–W3¢6–væGW&TVçG'•µÒÀ¢VæF–ætVÄ66TÖ¢ÖÇ7G&–ærÂVæF–ætVÄ66Sà¢’°¢6öç7B6–væVD6ö×ÆWFRÒ4”täEU$UôdÄõræWfW'’‚‡&öÆR’Óâ&ööÆVâ†vWD6ö×ÆWFVDVçG'’†VçG&–W2Â&öÆR’’“°¢6öç7B†5VæF–ærÒ—4†—7F÷&–6Å–EW&–öB†Fö2æÖöçF„¶W’’bbFö2æ66W2ç6öÖR‚†—FVÒ’ÓâVæF–ætVÄ66TÖæ†2†—FVÒæ66T–B’“°¢6öç7B†4ÆFT6ö×ÆWF–öâÒ4”täEU$UôdÄõrç6öÖR‚‡&öÆR’Óâ°¢6öç7Bv—fVBÒvWEv—fVDVçG'’†VçG&–W2Â&öÆR“°¢–b‡v—fVB’°¢&WGW&â—56–væVEv—F†–ä7W'&VçE–ÖVçD7–6ÆR‡v—fVBçv—fVDBÚ±î¸Â¸­yêë¢°k¢G§¦*^|| "", doc.monthKey);
    }
    const signed = getSignedEntry(entries, role);
    return Boolean(signed) && !isSignedWithinCurrentPaymentCycle(signed?.signedAt || "", doc.monthKey);
  });
  return signedComplete && hasLateCompletion && !hasPending;
}

function getSignatureValidationRoleText(
  doc: SignatureDocument,
  entries: SignatureEntry[],
  role: SignRole,
  now = new Date()
) {
  const waived = getWaivedEntry(entries, role);
  if (waived) {
    const date = waived.resignationDate ? ` (${waived.resignationDate})` : "";
    return `Signature Waived - Resigned${date}`;
  }
  const signed = getSignedEntry(entries, role);
  if (signed) return signed.signerName || getRoleSigner(doc, role);

  const resetEntry = getActiveDeadlineResetEntry(entries, role, now);
  if (resetEntry) return resetEntry.signerName || getRoleSigner(doc, role);

  const status = statusForRole(entries, role, doc.monthKey, now);
  if (status === "Pending") return getRoleSigner(doc, role);

  return "-";
}

function getSignatureValidationStatus(
  doc: SignatureDocument,
  entries: SignatureEntry[],
  now = new Date()
) {
  const pendingRoles = SIGNATURE_FLOW.filter((role) => {
    if (getCompletedEntry(entries, role)) return false;
    return statusForRole(entries, role, doc.monthKey, now) === "Pending";
  });

  if (pendingRoles.length) {
    return `Pending ${pendingRoles.map(roleThaiLabel).join(", ")}`;
  }

  const hasResignedWaiver = Boolean(getWaivedEntry(entries, "Agent"));
  if (hasResignedWaiver) return "3 Signed + 1 Waived - Resigned";
  return "4 Signed - Completed";
}


function getOverallPdfGradeLabel(avgScore: number) {
  if (!Number.isFinite(avgScore)) return "-";
  if (avgScore >= 90) return "A";
  if (avgScore >= 85) return "B";
  if (avgScore >= 80) return "C";
  if (avgScore >= 75) return "D";
  return "F";
}


function makePaymentFileName(monthKey: string) {
  const label = getMonthLabel(monthKey).replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_à¸-à¹™]+/g, "");
  return `Incentive_QA_Monthly_${label || monthKey}.xlsx`;
}

function getDocumentIncentive(doc: SignatureDocument) {
  if ((Number(doc.caseCount) || 0) < CASE_TARGET) {
    return {
      total: 0,
      cash: 0,
      promo: 0,
      label: "0 THB / No Incentive",
      remark: "à¸¢à¸±à¸‡à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¹„à¸¡à¹ˆà¸„à¸£à¸š 10 à¹€à¸„à¸ª",
    };
  }
  return getIncentiveByGrade(doc.grade as any, doc.monthKey);
}

function formatBahtAmount(value: number) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function getDashboardMonthSummaryForExport(
  monthKey: string,
  allMonthDocs: SignatureDocument[],
  fallbackDocs: SignatureDocument[]
) {
  const sourceDocs = allMonthDocs.length ? allMonthDocs : fallbackDocs;
  const totalCases = sourceDocs.reduce((sum, doc) => sum + Math.max(Number(doc.caseCount) || 0, 0), 0);
  const weightedScore = sourceDocs.reduce(
    (sum, doc) => sum + (Number(doc.averageScore) || 0) * Math.max(Number(doc.caseCount) || 0, 0),
    0
  );
  const avgScore = totalCases > 0 ? weightedScore / totalCases : 0;

  return {
    totalCases,
    avgScore: Number(avgScore.toFixed(2)),
  };
}

function generatePaymentExcelFile(
  monthKey: string,
  readyDocs: SignatureDocument[],
  signatures: Record<string, SignatureEntry[]>,
  allMonthDocs: SignatureDocument[] = readyDocs
) {
  const sortedDocs = [...readyDocs].sort((a, b) => a.agentName.localeCompare(b.agentName, "th"));
  const dashboardSummary = getDashboardMonthSummaryForExport(monthKey, allMonthDocs, sortedDocs);
  const exportRuleText = "Include only 4 Signed or 3 Signed + 1 Agent Waived (Resigned) completed by day 15";
  const totalCases = dashboardSummary.totalCases;
  const avgScore = dashboardSummary.avgScore;
  const criticalCases = 0;
  const totalCashAmount = sortedDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).cash, 0);
  const totalPromoAmount = sortedDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).promo, 0);
  const year = /^\d{4}-\d{2}$/.test(monthKey) ? monthKey.slice(0, 4) : "";

  const aoa: unknown[][] = [
    ["Monthly Team Summary"],
    ["Selected month overview for incentive payment. Only agents with 4 Signed or approved 3 Signed + 1 Waived status are included."],
    [],
    ["Current View"],
    [],
    ["Month", getMonthLabel(monthKey), null, "Year", year, null, "Team Cases", totalCases],
    [],
    ["Avg Score", Number(avgScore.toFixed(2)), null, "Critical Cases", criticalCases, null, "Payment Status", sortedDocs.length > 0 ? "Ready to Export" : "Hold"],
    [null, null, null, null, null, null, "Export Rule", exportRuleText],
    [],
    ["Agent Monthly Ranking"],
    [],
    ...(totalPromoAmount > 0
      ? [["Seq", "Name", "Cases", "Avg Score", "Grade", "Incentive Amount (THB)", "RBH Promo (THB)", "Incentive Detail", "QA Signer", "Supervisor Signer", "Senior / Team Lead Signer", "Agent Signer", "Sign Complete At", "Critical", "Status"]]
      : [["Seq", "Name", "Cases", "Avg Score", "Grade", "Incentive Amount (THB)", "Incentive Detail", "QA Signer", "Supervisor Signer", "Senior / Team Lead Signer", "Agent Signer", "Sign Complete At", "Critical", "Status"]]),
  ];

  sortedDocs.forEach((doc, index) => {
    const entries = effectiveEntriesForDoc(doc, signatures);
    const incentive = getDocumentIncentive(doc);
    const qaSigner = getSignatureValidationRoleText(doc, entries, "QA");
    const supervisorSigner = getSignatureValidationRoleText(doc, entries, "Supervisor");
    const seniorSigner = getSignatureValidationRoleText(doc, entries, "Senior");
    const agentSigner = getSignatureValidationRoleText(doc, entries, "Agent");
    const rowStatus = getSignatureValidationStatus(doc, entries);
    const lastSignedAt =
      SIGNATURE_FLOW.map((role) => {
        const completed = getCompletedEntry(entries, role);
        return completed?.signedAt || completed?.waivedAt || "";
      })
        .filter(Boolean)
        .sort()
        .pop() || "";
    const rankingRow = totalPromoAmount > 0
      ? [
          index + 1,
          doc.agentName,
          doc.m«ëŒ+Š×®º+º$zzb¥æ66T6÷VçBÀ¢çVÖ&W"†Fö2æfW&vU66÷&RçFôf—†VBƒ"’’À¢Fö2æw&FRÀ¢–æ6VçF—fRæ66‚À¢–æ6VçF—fRç&öÖòÀ¢–æ6VçF—fRæÆ&VÂÀ¢6–væW"À¢7WW'f—6÷%6–væW"À¢6Væ–÷%6–væW"À¢vVçE6–væW"À¢Æ7E6–væVDBòf÷&ÖDFFUF–ÖR†Æ7E6–væVDB’¢"Ò"À¢$æò"À¢&÷u7FGW2À¢Ğ¢¢°¢–æFW‚²À¢Fö2ævVçDæÖRÀ¢Fö2æ66T6÷VçBÀ¢çVÖ&W"†Fö2æfW&vU66÷&RçFôf—†VBƒ"’’À¢Fö2æw&FRÀ¢–æ6VçF—fRæ66‚À¢–æ6VçF—fRæÆ&VÂÀ¢6–væW"À¢7WW'f—6÷%6–væW"À¢6Væ–÷%6–væW"À¢vVçE6–væW"À¢Æ7E6–væVDBòf÷&ÖDFFUF–ÖR†Æ7E6–væVDB’¢"Ò"À¢$æò"À¢&÷u7FGW2À¢Ó°¢öçW6‚‡&æ¶–æu&÷r“°¢Ò“° ¢6öç7B7VÖÖ'•7F'E&÷rÒöæÆVæwF‚²3°¢öçW6‚€¢µÒÀ¢²%–ÖVçBW‡÷'B7VÖÖ'’%ÒÀ¢²%F÷FÂ–BvVçG2–âF†—27–6ÆR"Â6÷'FVDFö72æÆVæwF…ÒÀ¢²%F÷FÂ66‚Ö÷VçB…D„"’"ÂF÷FÄ66„Ö÷VçEÒÀ¢âââ‡F÷FÅ&öÖôÖ÷VçBâòµ²%F÷FÂ$$‚&öÖò…D„"’"ÂF÷FÅ&öÖôÖ÷VçEÕÒ¢µÒ’À¢²%–ÖVçB7WFöfb"Âf÷&ÖDFFUF–ÖR†vWE6–væGW&Uv–æF÷r†ÖöçF„¶W’’æGVTBçFô•4õ7G&–ær‚’•ÒÀ¢²$vVæW&FVBB"ÂæWrFFR‚’çFôÆö6ÆU7G&–ær‚'F‚ÕD‚"•ÒÀ¢²$Fö7VÖVçB'VÆR"Â$–æ6ÇVFRöæÇ’B6–væVB÷"&÷fVB26–væVB²vVçBv—fVB…&W6–væVB’6ö×ÆWFVB'’F’Rv—F‚æòVæF–ærVÂâÆFR6ö×ÆWF–öâÖ÷fW2FòF†RæW‡B–ÖVçB7–6ÆRâ%ÒÀ¢µÒÀ¢²%6–væGW&RfÆ–FF–öâ%ÒÀ¢²%6W"Â$vVçB"Â%"Â%7WW'f—6÷""Â%6Væ–÷"òFVÒÆVB"Â$vVçB6–væGW&R"Â$Fö7VÖVçB&Vbâ"Â%7FGW2%ÒÀ¢“° ¢6÷'FVDFö72æf÷$V6‚‚†Fö2Â–æFW‚’Óâ°¢6öç7BVçG&–W2ÒVffV7F—fTVçG&–W4f÷$Fö2†Fö2Â6–væGW&W2“°¢öçW6‚…°¢–æFW‚²À¢Fö2ævVçDæÖRÀ¢vWE6–væGW&UfÆ–FF–öå&öÆUFW‡B†Fö2ÂVçG&–W2Â%"’À¢vWE6–væGW&UfÆ–FF–öå&öÆUFW‡B†Fö2ÂVçG&–W2Â%7WW'f—6÷""’À¢vWE6–væGW&UfÆ–FF–öå&öÆUFW‡B†Fö2ÂVçG&–W2Â%6Væ–÷""’À¢vWE6–væGW&UfÆ–FF–öå&öÆUFW‡B†Fö2ÂVçG&–W2Â$vVçB"’À¢vWDÖöçF†Ç”Fö7VÖVçE&Vb†Fö2ÂÆÄÖöçF„Fö72æÆVæwF‚òÆÄÖöçF„Fö72¢6÷'FVDFö72’À¢vWE6–væGW&UfÆ–FF–öå7FGW2†Fö2ÂVçG&–W2’À¢Ò“°¢Ò“° ¢6öç7Bv÷&¶&öö²Ò„Å5‚çWF–Ç2æ&ööµöæWr‚“°¢6öç7B6†VWBÒ„Å5‚çWF–Ç2æö÷Fõ÷6†VWB†ö“°¢6†VWE²"6öÇ2%ÒÒ°¢²v6ƒ¢‚ÒÀ¢²v6ƒ¢3ÒÀ¢²v6ƒ¢"ÒÀ¢²v6ƒ¢BÒÀ¢²v6ƒ¢BÒÀ¢²v6ƒ¢#"ÒÀ¢²v6ƒ¢‚ÒÀ¢²v6ƒ¢3BÒÀ¢²v6ƒ¢#BÒÀ¢²v6ƒ¢#BÒÀ¢²v6ƒ¢#‚ÒÀ¢²v6ƒ¢#BÒÀ¢²v6ƒ¢#"ÒÀ¢²v6ƒ¢bÒÀ¢²v6ƒ¢3‚ÒÀ¢Ó°¢6†VWE²"ÖW&vW2%ÒÒ°¢²3¢²#¢Â3¢ÒÂS¢²#¢Â3¢BÒÒÀ¢²3¢²#¢Â3¢ÒÂS¢²#¢Â3¢BÒÒÀ¢²3¢²#¢2Â3¢ÒÂS¢²#¢2Â3¢BÒÒÀ¢²3¢²#¢Â3¢ÒÂS¢²#¢Â3¢BÒÒÀ¢²3¢²#¢7VÖÖ'•7F'E&÷rÒÂ3¢ÒÂS¢²#¢7VÖÖ'•7F'E&÷rÒÂ3¢BÒÒÀ¢Ó°¢„Å5‚çWF–Ç2æ&ööµöVæE÷6†VWB‡v÷&¶&öö²Â6†VWBÂ$ÖöçF†Ç•õFVÕõ7VÖÖ'’"“°¢„Å5‚çw&—FTf–ÆR‡v÷&¶&öö²ÂÖ¶U–ÖVçDf–ÆTæÖR†ÖöçF„¶W’’“°§Ğ ¦gVæ7F–öâÖ¶U–ÖVçEFdf–ÆTæÖR†ÖöçF„¶W“¢7G&–ær’°¢6öç7BÆ&VÂÒvWDÖöçF„Æ&VÂ†ÖöçF„¶W’’ç&WÆ6R‚õÇ2²örÂ%ò"’ç&WÆ6R‚õµæ×¤Õ£Ó•şˆŞ™•Ò²örÂ""“°¢&WGW&â–æ6VçF—fUõôÖöçF†Ç•òG¶Æ&VÂÇÂÖöçF„¶W—ÒçFf°§Ğ ¦gVæ7F–öâvVæW&FU–ÖVçEFdf–ÆR€¢ÖöçF„¶W“¢7G&–ærÀ¢&VG”Fö73¢6–væGW&TFö7VÖVçEµÒÀ¢6–væGW&W3¢&V6÷&CÇ7G&–ærÂ6–væGW&TVçG'•µÓâÀ¢ÆÄÖöçF„Fö73¢6–væGW&TFö7VÖVçEµÒÒ&VG”Fö70¢’°¢6öç7B6÷'FVDFö72Ò²ââç&VG”Fö75Òç6÷'B‚†Â"’ÓâævVçDæÖRæÆö6ÆT6ö×&R†"ævVçDæÖRÂ'F‚"’“°¢6öç7BF6†&ö&E7VÖÖ'’ÒvWDF6†&ö&DÖöçF…7VÖÖ'”f÷$W‡÷'B†ÖöçF„¶W’ÂÆÄÖöçF„Fö72Â6÷'FVDFö72“°¢6öç7BW‡÷'E'VÆUFW‡BÒ#B6–væVB÷"26–væVB²vVçBv—fVB…&W6–væVB’'’F’R#°¢6öç7BF÷FÄ66W2ÒF6†&ö&E7VÖÖ'’çF÷FÄ66W3°¢6öç7Bfu66÷&RÒF6†&ö&E7VÖÖ'’æfu66÷&S°¢6öç7BF÷FÄ66„Ö÷VçBÒ6÷'FVDFö72ç&VGV6R‚‡7VÒÂFö2’Óâ7VÒ²vWDFö7VÖVçD–æ6VçF—fR†Fö2’æ66‚Â“°¢6öç7BF÷FÅ&öÖôÖ÷VçBÒ6÷'FVDFö72ç&VGV6R‚‡7VÒÂFö2’Óâ7VÒ²vWDFö7VÖVçD–æ6VçF—fR†Fö2’ç&öÖòÂ“°¢6öç7B–V"ÒõåÆG³GÒÕÆG³'ÒBòçFW7B†ÖöçF„¶W’’òÖöçF„¶W’ç6Æ–6RƒÂB’¢"#°¢6öç7B–ÖVçD7WFöfbÒf÷&ÖDFFUF–ÖR†vWE6–væGW&Uv–æF÷r†ÖöçF„¶W’’æGVTBçFô•4õ7G&–ær‚’“° ¢6öç7BFbÒæWr§5Db‡²Væ—C¢&ÖÒ"Âf÷&ÖC¢&B"Â÷&–VçFF–öã¢'÷'G&—B"Ò“° ¢G'’°¢&Vv—7FW%D…6&'VäæWr‡Fb“°¢Fbç6WDföçB‚%D…6&'VäæWr"Â&æ÷&ÖÂ"“°¢Ò6F6‚·Ğ ¢6öç7BvUrÒ#°¢6öç7BvT‚Ò#“s°¢6öç7BÆVgBÒ°¢6öç7B&–v‡BÒ#°¢6öç7B&÷GFöÒÒ#ƒ#°¢ÆWB’Ò#°¢ÆWBvTæòÒ° ¢6öç7B6WDföçBÒ‡6—¦S¢çVÖ&W"Â&öÆBÒfÇ6RÂ6öÆ÷#¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³3ÂCÂSUÒ’Óâ°¢G'’°¢Fbç6WDföçB‚%D…6&'VäæWr"Â&öÆBò&&öÆB"¢&æ÷&ÖÂ"“°¢Ò6F6‚·Ğ¢Fbç6WDföçE6—¦R‡6—¦R“°¢Fbç6WEFW‡D6öÆ÷"†6öÆ÷%³ÒÂ6öÆ÷%³ÒÂ6öÆ÷%³%Ò“°¢Ó° ¢6öç7BG&uFW‡BÒ€¢fÇVS¢7G&–ærÂçVÖ&W"À¢ƒ¢çVÖ&W"À¢—“¢çVÖ&W"À¢6—¦RÒÀ¢&öÆBÒfÇ6RÀ¢6öÆ÷#¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³3ÂCÂSUÒÀ¢÷F–öç3ó¢²Æ–vãó¢&ÆVgB"Â&6VçFW""Â'&–v‡B"Ğ¢’Óâ°¢6WDföçB‡6—¦RÂ&öÆBÂ6öÆ÷"“°¢FbçFW‡B…7G&–ær‡fÇVRóò""’Â‚Â—’Â÷F–öç2“°¢Ó° ¢6öç7BG&uw&Ò€¢fÇVS¢7G&–ærÂçVÖ&W"À¢ƒ¢çVÖ&W"À¢—“¢çVÖ&W"À¢v–GFƒ¢çVÖ&W"À¢6—¦RÒ‚ã"À¢&öÆBÒfÇ6RÀ¢6öÆ÷#¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³3ÂCÂSUÒÀ¢Æ–æT†V–v‡BÒ2ã"À¢Ö„Æ–æW2Ò ¢’Óâ°¢6WDföçB‡6—¦RÂ&öÆBÂ6öÆ÷"“°¢6öç7BÆ–æW2ÒFbç7Æ—EFW‡EFõ6—¦R…7G&–ær‡fÇVRóò""’Âv–GF‚’ç6Æ–6RƒÂÖ„Æ–æW2“°¢Æ–æW2æf÷$V6‚‚†Æ–æS¢7G&–ærÂ–æFWƒ¢çVÖ&W"’ÓâFbçFW‡B†Æ–æRÂ‚Â—’²–æFW‚¢Æ–æT†V–v‡B’“°¢Ó° ¢6öç7Bfö÷FW"Ò‚’Óâ°¢G&uFW‡B†vRG·vTæ÷ÖÂ&–v‡BÂvT‚ÒrÂrãRÂfÇ6RÂ³C‚Âc2ÂƒEÒÂ²Æ–vã¢'&–v‡B"Ò“°¢Ó° ¢6öç7BFEvRÒ‡F—FÆSó¢7G&–ær’Óâ°¢fö÷FW"‚“°¢FbæFEvR‚&B"Â'÷'G&—B"“°¢vTæò³Ò°¢’Ò#°¢–b‡F—FÆR’6V7F–öâ‡F—FÆR“°¢Ó° ¢6öç7BVç7W&U76RÒ††V–v‡C¢çVÖ&W"Â6öçF–çVVEF—FÆSó¢7G&–ær’Óâ°¢–b‡’²†V–v‡Bâ&÷GFöÒ’°¢FEvR†6öçF–çVVEF—FÆR“°¢Ğ¢Ó° ¢6öç7B6V7F–öâÒ‡F—FÆS¢7G&–ær’Óâ°¢Vç7W&U76RƒB“°¢Fbç6WDf–ÆÄ6öÆ÷"ƒ’ÂCÂ#r“°¢Fbç&÷VæFVE&V7B†ÆVgBÂ’Â&–v‡BÒÆVgBÂ‚Â"Â"Â$b"“°¢G&uFW‡B‡F—FÆRÂÆVgB²BÂ’²RãrÂãRÂG'VRÂ³#SRÂ#SRÂ#SUÒ“°¢’³Ò#°¢Ó° ¢6öç7B6VÆÂÒ†Æ&VÃ¢7G&–ærÂfÇVS¢6Ú±î¸Â¸­yêë¢°k¢G§¦*^tring | number, x: number, yy: number, width: number, height = 15) => {
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(x, yy, width, height, 2, 2, "FD");
    drawText(label, x + 3, yy + 5, 7.5, true, [100, 116, 139]);
    drawWrap(value, x + 3, yy + 11, width - 6, 9.5, true, [15, 23, 42], 3.2, 1);
  };

  const drawTableHeader = (headers: Array<[string, number]>) => {
    pdf.setFillColor(237, 233, 254);
    pdf.setDrawColor(221, 214, 254);
    pdf.rect(left, y, right - left, 8, "FD");
    let cx = left;
    headers.forEach(([label, width]) => {
      const align = label === "Seq" || label === "Cases" || label === "Avg" || label === "Grade" ? "center" : "left";
      drawColText(label, cx, y + 5.6, width, 7.6, true, [88, 28, 135], align);
      cx += width;
    });
    y += 8;
  };

  const drawColText = (
    value: string | number,
    x: number,
    yy: number,
    width: number,
    size = 7.6,
    bold = false,
    color: [number, number, number] = [31, 41, 55],
    align: "left" | "center" | "right" = "left"
  ) => {
    setFont(size, bold, color);
    const safeValue = String(value ?? "");
    const lines = pdf.splitTextToSize(safeValue, width - 2);
    const firstLine = Array.isArray(lines) ? String(lines[0] ?? "") : safeValue;
    if (align === "center") {
      pdf.text(firstLine, x + width / 2, yy, { align: "center" });
    } else if (align === "right") {
      pdf.text(firstLine, x + width - 1, yy, { align: "right" });
    } else {
      pdf.text(firstLine, x + 1, yy);
    }
  };

  pdf.setFillColor(95, 39, 159);
  pdf.rect(0, 0, pageW, 22, "F");
  drawText("Monthly Team Summary", left, 9, 16, true, [255, 255, 255]);
  drawText("Incentive QA Monthly Payment Export", left, 16, 9.5, false, [255, 255, 255]);
  drawText(getMonthLabel(monthKey), right, 16, 9.5, true, [255, 255, 255], { align: "right" });

  y = 28;
  section("Current View");
  const overallGrade = getOverallPdfGradeLabel(avgScore);
  const colW = (right - left - 8) / 3;
  cell("Month", getMonthLabel(monthKey), left, y, colW);
  cell("Year", year || "-", left + colW + 4, y, colW);
  cell("Team Cases", totalCases, left + (colW + 4) * 2, y, colW);
  y += 18;
  cell("Avg Score", avgScore.toFixed(2), left, y, colW);
  cell("Overall Grade", overallGrade, left + colW + 4, y, colW);
  cell("Payment Status", sortedDocs.length > 0 ? "Ready to Export" : "Hold", left + (colW + 4) * 2, y, colW);
  y += 18;
  cell("Total Cash (THB)", formatBahtAmount(totalCashAmount), left, y, colW);
  cell("Total Promo (THB)", formatBahtAmount(totalPromoAmount), left + colW + 4, y, colW);
  cell("Payment Cutoff", paymentCutoff, left + (colW + 4) * 2, y, colW);
  y += 20;
  pdf.setDrawColor(226, 232, 240);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(left, y, right - left, 17, 2, 2, "FD");
  drawText("Export Rule", left + 3, y + 5, 7.5, true, [100, 116, 139]);
  drawWrap(exportRuleText, left + 3, y + 11, right - left - 6, 8.5, false, [31, 41, 55], 3.2, 2);
  y += 24;

  section("Agent Monthly Ranking");
  const rankingHeaders: Array<[string, number]> = [
    ["Seq", 10],
    ["Agent", 47],
    ["Cases", 16],
    ["Avg", 18],
    ["Grade", 13],
    ["Incentive", 26],
    ["Critical", 16],
    ["Status", 44],
  ];

  drawTableHeader(rankingHeaders);
  if (!sortedDocs.length) {
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(248, 250, 252);
    pdf.rect(left, y, right - left, 12, "FD");
    drawText("No payment-ready agents for this cycle.", left + 4, y + 7.5, 9.5, true, [180, 83, 9]);
    y += 14;
  }

  sortedDocs.forEach((doc, index) => {
    ensureSpace(9, "Agent Monthly Ranking (continued)");
    if (y === 24) drawTableHeader(rankingHeaders);

    const entries = effectiveEntriesForDoc(doc, signatures);
    const statusText = getSignatureValidationStatus(doc, entries);
    const incentive = getDocumentIncentive(doc);
    const incentiveText = totalPromoAmount > 0
      ? `${formatBahtAmount(incentive.cash)} + ${formatBahtAmount(incentive.promo)}`
      : formatBahtAmount(incentive.cash);
    const row = [
      String(index + 1),
      doc.agentName,
      String(doc.caseCount),
      doc.averageScore.toFixed(2),
      doc.grade,
      incentiveText,
      "0",
      statusText,
    ];

    pdf.setDrawColor(226, 232, 240);
    const shade = index % 2 === 0 ? 255 : 248;
    pdf.setFillColor(shade, shade === 255 ? 255 : 250, shade === 255 ? 255 : 252);
    pdf.rect(left, y, right - left, 8, "FD");

    let cx = left;
    row.forEach((value, colIndex) => {
      const [label, width] = rankingHeaders[colIndex];
      const align = label === "Seq" || label === "Cases" || label === "Avg" || label === "Grade" ? "center" : "left";
      drawColText(value, cx, y + 5.4, width, label === "Status" ? 6.8 : 7.3, colIndex === 1 || label === "Incentive", [31, 41, 55], align);
      cx += width;
    });
    y += 8;
  });

  y += 6;
  section("Topic Performance % - Team Monthly");
  const topicMap = new Map<string, { code: string; title: string; max: number; total: number; count: number }>();
  allMonthDocs.forEach((doc) => {
    doc.cases.forEach((item) => {
      item.topics?.forEach((topic) => {
        if (!topic.code || topic.code === SIGNATURE_TOPIC_MISSING) return;
        const current = topicMap.get(topic.code) || {
          code: topic.code,
          title: topic.title || topic.code,
          max: Number(topic.max) || 0,
          total: 0,
          count: 0,
        };
        current.title = current.title || topic.title || topic.code;
        current.max = Math.max(current.max, Number(topic.max) || 0);
        current.total += Number(topic.score) || 0;
        current.count += 1;
        topicMap.set(topic.code, current);
      });
    });
  });

  const topicRows = Array.from(topicMap.values()).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const topicHeaders: Array<[string, number]> = [
    ["Topic", 18],
    ["Description", 86],
    ["Avg Score", 24],
    ["Max", 18],
    ["Avg %", 22],
    ["Status", 22],
  ];
  drawTableHeader(topicHeaders);

  if (!topicRows.length) {
    const fallbacm«ëŒ+Š×®º+º$zzb¥æµF÷–72Ò4”täEU$Uô¥TäUó##eõDõ”5ôÔ5DU#°¢fÆÆ&6µF÷–72æf÷$V6‚‚‡F÷–2Â–æFW‚’Óâ°¢Vç7W&U76Rƒ‚Â%F÷–2W&f÷&Öæ6RRÒFVÒÖöçF†Ç’†6öçF–çVVB’"“°¢6öç7B6†FRÒ–æFW‚R"ÓÓÒò#SR¢#Cƒ°¢Fbç6WDG&t6öÆ÷"ƒ##bÂ#3"Â#C“°¢Fbç6WDf–ÆÄ6öÆ÷"‡6†FRÂ6†FRÓÓÒ#SRò#SR¢#SÂ6†FRÓÓÒ#SRò#SR¢#S"“°¢Fbç&V7B†ÆVgBÂ’Â&–v‡BÒÆVgBÂ‚Â$dB"“°¢6öç7B&÷rÒ·F÷–2æ6öFRÂF÷–2æÆ&VÂÂ"Ò"Â7G&–ær‡F÷–2æÖ‚’Â"Ò"Â"Ò%Ó°¢ÆWB7‚ÒÆVgC°¢&÷ræf÷$V6‚‚‡fÇVRÂ6öÄ–æFW‚’Óâ°¢6öç7B¶Æ&VÂÂv–GF…ÒÒF÷–4†VFW'5¶6öÄ–æFW…Ó°¢6öç7BÆ–vâÒÆ&VÂÓÓÒ$FW67&—F–öâ"ò&ÆVgB"¢&6VçFW"#°¢G&t6öÅFW‡B‡fÇVRÂ7‚Â’²RãBÂv–GF‚Ârã"Â6öÄ–æFW‚ÓÓÒÂ³3ÂCÂSUÒÂÆ–vâ“°¢7‚³Òv–GFƒ°¢Ò“°¢’³Òƒ°¢Ò“°¢ÒVÇ6R°¢F÷–5&÷w2æf÷$V6‚‚‡F÷–2Â–æFW‚’Óâ°¢Vç7W&U76Rƒ‚Â%F÷–2W&f÷&Öæ6RRÒFVÒÖöçF†Ç’†6öçF–çVVB’"“°¢6öç7BfuF÷–566÷&RÒF÷–2æ6÷VçBòF÷–2çF÷FÂòF÷–2æ6÷VçB¢°¢6öç7Bfu7BÒF÷–2æÖ‚âò†fuF÷–566÷&RòF÷–2æÖ‚’¢¢°¢6öç7B7FGW2ÒF÷–2æÖ‚âò†fu7BãÒƒRò$vööB"¢fu7BãÒsRò%vF6‚"¢$–×&÷fR"’¢"Ò#°¢6öç7B6†FRÒ–æFW‚R"ÓÓÒò#SR¢#Cƒ°¢Fbç6WDG&t6öÆ÷"ƒ##bÂ#3"Â#C“°¢Fbç6WDf–ÆÄ6öÆ÷"‡6†FRÂ6†FRÓÓÒ#SRò#SR¢#SÂ6†FRÓÓÒ#SRò#SR¢#S"“°¢Fbç&V7B†ÆVgBÂ’Â&–v‡BÒÆVgBÂ‚Â$dB"“°¢6öç7B&÷rÒ°¢F÷–2æ6öFRÀ¢F÷–2çF—FÆRÀ¢fuF÷–566÷&RçFôf—†VBƒ"’À¢7G&–ær‡F÷–2æÖ‚ÇÂ"Ò"’À¢F÷–2æÖ‚âòG¶fu7BçFôf—†VBƒ—ÒV¢"Ò"À¢7FGW2À¢Ó°¢ÆWB7‚ÒÆVgC°¢&÷ræf÷$V6‚‚‡fÇVRÂ6öÄ–æFW‚’Óâ°¢6öç7B¶Æ&VÂÂv–GF…ÒÒF÷–4†VFW'5¶6öÄ–æFW…Ó°¢6öç7BÆ–vâÒÆ&VÂÓÓÒ$FW67&—F–öâ"ò&ÆVgB"¢&6VçFW"#°¢G&t6öÅFW‡B‡fÇVRÂ7‚Â’²RãBÂv–GF‚ÂÆ&VÂÓÓÒ$FW67&—F–öâ"òbã‚¢rãÂ6öÄ–æFW‚ÓÓÒÂ³3ÂCÂSUÒÂÆ–vâ“°¢7‚³Òv–GFƒ°¢Ò“°¢’³Òƒ°¢Ò“°¢Ğ ¢’³Òc°¢6V7F–öâ‚%–ÖVçBW‡÷'B7VÖÖ'’"“°¢6öç7B7VÖÖ'•&÷w2Ò°¢²%F÷FÂ–BvVçG2–âF†—27–6ÆR"Â7G&–ær‡6÷'FVDFö72æÆVæwF‚•ÒÀ¢²%F÷FÂ66‚Ö÷VçB…D„"’"Âf÷&ÖD&‡DÖ÷VçB‡F÷FÄ66„Ö÷VçB•ÒÀ¢âââ‡F÷FÅ&öÖôÖ÷VçBâòµ²%F÷FÂ$$‚&öÖò…D„"’"Âf÷&ÖD&‡DÖ÷VçB‡F÷FÅ&öÖôÖ÷VçB•ÕÒ¢µÒ’À¢²%–ÖVçB7WFöfb"Â–ÖVçD7WFöfeÒÀ¢²$vVæW&FVBB"ÂæWrFFR‚’çFôÆö6ÆU7G&–ær‚'F‚ÕD‚"•ÒÀ¢²$Fö7VÖVçB'VÆR"Â$–æ6ÇVFRöæÇ’B6–væVB÷"&÷fVB26–væVB²vVçBv—fVB…&W6–væVB’6ö×ÆWFVB'’F’Rv—F‚æòVæF–ærVÂâÆFR6ö×ÆWF–öâÖ÷fW2FòF†RæW‡B–ÖVçB7–6ÆRâ%ÒÀ¢Ó° ¢7VÖÖ'•&÷w2æf÷$V6‚‚‡&÷rÂ–æFW‚’Óâ°¢Vç7W&U76RƒÂ%–ÖVçBW‡÷'B7VÖÖ'’†6öçF–çVVB’"“°¢Fbç6WDG&t6öÆ÷"ƒ##bÂ#3"Â#C“°¢Fbç6WDf–ÆÄ6öÆ÷"†–æFW‚R"ÓÓÒò#SR¢#C‚Â–æFW‚R"ÓÓÒò#SR¢#SÂ–æFW‚R"ÓÓÒò#SR¢#S"“°¢Fbç&V7B†ÆVgBÂ’Â&–v‡BÒÆVgBÂ’Â$dB"“°¢G&uFW‡B‡&÷u³ÒÂÆVgB²2Â’²bÂ‚ÂG'VRÂ³sÂƒRÂUÒ“°¢G&uw&‡&÷u³ÒÂÆVgB²sÂ’²bÂ&–v‡BÒÆVgBÒsBÂ‚ÂfÇ6RÂ³3ÂCÂSUÒÂ2ã"Â“°¢’³Ò“°¢Ò“° ¢fö÷FW"‚“°¢6öç7Bf–ÆTæÖRÒÖ¶U–ÖVçEFdf–ÆTæÖR†ÖöçF„¶W’“°¢6fUFdf–ÆR‡FbÂf–ÆTæÖR“°¢&WGW&âf–ÆTæÖS°§Ğ ¦gVæ7F–öâ6–væGW&U–ÆÂ‡²7FGW2Ó¢²7FGW3¢6–væGW&U7FW7FGW2Ò’°¢6öç7BFöæRĞ¢7FGW2ÓÓÒ%v—fVB ¢ò&&÷&FW"×6·’Ó#&r×6·’ÓSFW‡B×6·’Ós ¢¢7FGW2ÓÓÒ%6–væVB ¢ò&&÷&FW"ÖVÖW&ÆBÓ#&rÖVÖW&ÆBÓSFW‡BÖVÖW&ÆBÓs ¢¢7FGW2ÓÓÒ%VæF–ær ¢ò&&÷&FW"ÖÖ&W"Ó#&rÖÖ&W"ÓSFW‡BÖÖ&W"Ós ¢¢7FGW2ÓÓÒ$W‡—&VB ¢ò&&÷&FW"×&÷6RÓ#&r×&÷6RÓSFW‡B×&÷6RÓs ¢¢7FGW2ÓÓÒ$Æö6¶VB ¢ò&&÷&FW"×6ÆFRÓ#&r×6ÆFRÓFW‡B×6ÆFRÓS ¢¢&&÷&FW"×6ÆFRÓ#&r×6ÆFRÓSFW‡B×6ÆFRÓS#°¢&WGW&âÇ7â6Æ74æÖS×¶–æÆ–æRÖfÆW‚&÷VæFVBÖgVÆÂ&÷&FW"‚Ó2’ÓFW‡B×‡2föçBÖ&Æ6²G·FöæWÖÓç·7FGW7ÓÂ÷7ãã°§Ğ ¦gVæ7F–öâ6–væGW&UDÖöFÂ‡°¢&öÆTÆ&VÂÀ¢6–væW$æÖRÀ¢6fVE6–væGW&TFFW&ÂÀ¢öä6æ6VÂÀ¢öäFVÆWFU6fVE6–væGW&RÀ¢öåW6U6fVE6–væGW&RÀ¢öå6fRÀ§Ó¢°¢&öÆTÆ&VÃ¢7G&–æs°¢6–væW$æÖS¢7G&–æs°¢6fVE6–væGW&TFFW&Ãó¢7G&–æs°¢öä6æ6VÃ¢‚’Óâfö–C°¢öäFVÆWFU6fVE6–væGW&Só¢‚’Óâfö–BÂ&öÖ—6SÇfö–Cã°¢öåW6U6fVE6–væGW&Só¢‚’Óâfö–BÂ&öÖ—6SÇfö–Cã°¢öå6fS¢†FFW&Ã¢7G&–ærÂ6fUFôÆ–'&'“¢&ööÆVâ’Óâfö–BÂ&öÖ—6SÇfö–Cã°§Ò’°¢6öç7B6çf5&VbÒW6U&VcÄ…DÔÄ6çf4VÆVÖVçBÂçVÆÃâ†çVÆÂ“°¢6öç7BG&v–æu&VbÒW6U&Vb†fÇ6R“°¢6öç7B†4G&vå&VbÒW6U&Vb†fÇ6R“°¢6öç7B·6fUFôÆ–'&'’Â6WE6fUFôÆ–'&'•ÒÒW6U7FFR‡G'VR“° ¢W6TVffV7B‚‚’Óâ°¢6öç7B6çf2Ò6çf5&Vbæ7W'&VçC°¢6öç7B6öçFW‡BÒ6çf3òævWD6öçFW‡B‚#&B"“°¢–b‚6çf2ÇÂ6öçFW‡B’&WGW&ã°¢6öçFW‡Bæ6ÆV%&V7BƒÂÂ6çf2çv–GF‚Â6çf2æ†V–v‡B“°¢6öçFW‡BæÆ–æUv–GF‚Ò3°¢6öçFW‡BæÆ–æT6Ò'&÷VæB#°¢6öçFW‡BæÆ–æT¦ö–âÒ'&÷VæB#°¢6öçFW‡Bç7G&ö¶U7G–ÆRÒ"3ƒ#r#°¢ÒÂµÒ“° ¢6öç7BvWEö–çBÒ†WfVçC¢&V7Båö–çFW$WfVçCÄ…DÔÄ6çf4VÆVÖVçCâ’Óâ°¢6öç7B6çf2Ò6çf5&Vbæ7W'&VçC°¢–b‚6çf2’&WGW&â²ƒ¢Â“¢Ó°¢6öç7B&V7BÒ6çf2ævWD&÷VæF–æt6Æ–VçE&V7B‚“°¢&WGW&â°¢ƒ¢‚†WfVçBæ6Æ–VçE‚Ò&V7BæÆVgB’ò&V7Bçv–GF‚’¢6çf2çv–GF‚À¢“¢‚†WfVçBæ6Æ–VçE’Ò&V7BçF÷’ò&V7Bæ†V–v‡B’¢6çf2æ†V–v‡BÀ¢Ó°¢Ó° ¢6öç7B7F'DG&v–ærÒ†WfVçC¢&V7Båö–çFW$WfVçCÄ…DÔÄ6çf4VÆVÖVçCâ’Óâ°¢6öç7B6çf2Ò6çf5&Vbæ7W'&VçC°¢6öç7B6öçFW‡BÒ6çf3òævWD6öçFW‡B‚#&B"“°¢–b‚6çf2ÇÂ6öçFW‡B’&WGW&ã°¢6çf2ç6WEö–çFW$6GW&R†WfVçBçö–çFW$–B“°¢6öç7Bö–çBÒvWEö–çB†WfVçB“°¢G&v–æu&Vbæ7W'&VçBÒG'VS°¢†4G&vå&Vbæ7W'&VçBÒG'VS°¢6öçFW‡Bæ&Vv–åF‚‚“°¢6öçFW‡BæÖ÷fUFò‡ö–çBç‚Âö–çBç’“°¢Ó° ¢6öç7BG&rÒ†WfVçC¢&V7Båö–çFW$WfVçCÄ…DÔÄ6çf4VÆVÖVçCâ’Óâ°¢–b‚G&v–æu&Vbæ7W'&VçB’&WGW&ã°¢6öç7B6öçFW‡BÒ6çf5&Vbæ7W'&VçCòævWD6öçFW‡B‚#&B"“°¢–b‚6öçFW‡B’&WGW&ã°¢6öç7Bö–çBÒvWEö–çB†WfVçB“°¢6öçFW‡BæÆ–æUFò‡ö–çBç‚Âö–çBç’“°¢6öçFW‡Bç7G&ö¶R‚“°¢Ó° ¢6öç7B7F÷G&v–ærÒ‚’Óâ°¢G&v–æu&Vbæ7W'&VçBÒfÇ6S°¢Ó° ¢6öç7B6ÆV%6–væGW&RÒ‚’Óâ°¢6öç7B6çf2Ò6çf5&Vbæ7W'&VçC°¢6öç7B6öçFW‡BÒ6çf3òævWD6öçFW‡B‚#&B"“°¢–b‚6çf2ÇÂ6öçFW‡B’&WGW&ã°¢6öçFW‡Bæ6ÆV%&V7BƒÂÂ6çf2çv–GF‚Â6çf2æ†VÚ±î¸Â¸­yêë¢°k¢G§¦*^ight);
    hasDrawnRef.current = false;
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasDrawnRef.current) {
      window.alert("à¸à¸£à¸¸à¸“à¸²à¸§à¸²à¸”à¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™à¸à¹ˆà¸­à¸™à¸à¸”à¸¢à¸·à¸™à¸¢à¸±à¸™à¹€à¸‹à¹‡à¸™à¹ƒà¸«à¸¡à¹ˆ");
      return;
    }
    onSave(canvas.toDataURL("image/png"), saveToLibrary);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[30px] border border-violet-100 bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">Draw Signature</div>
            <div className="mt-1 text-xl font-black text-slate-950">{roleLabel}</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">{signerName}</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-50"
          >
            à¸›à¸´à¸”
          </button>
        </div>

        {savedSignatureDataUrl ? (
          <div className="mt-4 rounded-[22px] border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-sm font-black text-emerald-800">à¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™à¸—à¸µà¹ˆà¸šà¸±à¸™à¸—à¸¶à¸à¹„à¸§à¹‰</div>
            <div className="mt-1 text-xs font-bold text-emerald-700">
              à¹ƒà¸Šà¹‰à¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™à¸™à¸µà¹‰à¹„à¸”à¹‰à¸—à¸±à¸™à¸—à¸µ à¸«à¸£à¸·à¸­à¸§à¸²à¸”à¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™à¹ƒà¸«à¸¡à¹ˆà¹€à¸à¸·à¹ˆà¸­à¹à¸—à¸™à¸—à¸µà¹ˆà¸£à¸²à¸¢à¸à¸²à¸£à¸™à¸µà¹‰
            </div>
            <div className="mt-2 rounded-2xl border border-emerald-100 bg-white p-3">
              <img src={savedSignatureDataUrl} alt="Saved signature" className="h-16 max-w-full object-contain" />
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onUseSavedSignature}
                className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
              >
                à¹ƒà¸Šà¹‰à¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™à¸™à¸µà¹‰
              </button>
              <button
                type="button"
                onClick={onDeleteSavedSignature}
                className="rounded-2xl border border-rose-200 bg-white px-5 py-3 text-sm font-black text-rose-700 transition hover:bg-rose-50"
              >
                à¸¥à¸šà¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™à¸—à¸µà¹ˆà¸šà¸±à¸™à¸—à¸¶à¸
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">à¸«à¸£à¸·à¸­à¸§à¸²à¸”à¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™à¹ƒà¸«à¸¡à¹ˆ</div>
          <canvas
            ref={canvasRef}
            width={900}
            height={260}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={stopDrawing}
            className="h-[220px] w-full touch-none rounded-[18px] border border-slate-200 bg-white"
          />
        </div>

        <label className="mt-4 flex items-center gap-2 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">
          <input
            type="checkbox"
            checked={saveToLibrary}
            onChange={(event) => setSaveToLibrary(event.target.checked)}
            className="h-4 w-4 accent-violet-700"
          />
          à¸šà¸±à¸™à¸—à¸¶à¸à¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™à¸™à¸µà¹‰à¹„à¸§à¹‰à¹ƒà¸Šà¹‰à¸„à¸£à¸±à¹‰à¸‡à¸•à¹ˆà¸­à¹„à¸›
        </label>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={clearSignature}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-black text-rose-700 transition hover:bg-rose-100"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={saveSignature}
            className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-800"
          >
            à¸¢à¸·à¸™à¸¢à¸±à¸™à¹€à¸‹à¹‡à¸™à¹ƒà¸«à¸¡à¹ˆ
          </button>
        </div>
      </div>
    </div>
  );
}

const SIGNING_STAGE_OPTIONS = [
  {
    value: "all",
    label: "All Stages",
    description: "à¹à¸ªà¸”à¸‡à¹€à¸­à¸à¸ªà¸²à¸£à¸—à¸¸à¸à¸‚à¸±à¹‰à¸™à¸•à¸­à¸™à¹ƒà¸™à¸à¸£à¸°à¸šà¸§à¸™à¸à¸²à¸£à¸¥à¸‡à¸™à¸²à¸¡",
  },
  {
    value: "preview",
    label: "Awaiting Confirmation",
    description: "à¸£à¸­ Agent à¸œà¸¹à¹‰à¸–à¸¹à¸à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¸¢à¸·à¸™à¸¢à¸±à¸™à¸£à¸±à¸šà¸—à¸£à¸²à¸šà¸œà¸¥à¸à¹ˆà¸­à¸™à¹€à¸£à¸´à¹ˆà¸¡à¸¥à¸‡à¸™à¸²à¸¡",
  },
  {
    value: "my-turn",
    label: "My Turn to Sign",
    description: "à¹à¸ªà¸”à¸‡à¹€à¸‰à¸à¸²à¸°à¹€à¸­à¸à¸ªà¸²à¸£à¸—à¸µà¹ˆà¸–à¸¶à¸‡à¸„à¸´à¸§à¸‚à¸­à¸‡à¸„à¸¸à¸“à¸¥à¸‡à¸™à¸²à¸¡à¹à¸¥à¹‰à¸§",
  },
  {
    value: "pending",
    label: "Awaiting Signatures",
    description: "à¹€à¸­à¸à¸ªà¸²à¸£à¸¢à¸±à¸‡à¸¡à¸µà¸­à¸¢à¹ˆà¸²à¸‡à¸™à¹‰à¸­à¸¢à¸«à¸™à¸¶à¹ˆà¸‡ Role à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸¥à¸‡à¸™à¸²à¸¡",
  },
  {
    value: "ready",
    label: "Ready for Payment",
    description: "à¹€à¸­à¸à¸ªà¸²à¸£à¸¥à¸‡à¸™à¸²à¸¡à¸„à¸£à¸šà¹à¸¥à¸°à¸œà¹ˆà¸²à¸™à¹€à¸‡à¸·à¹ˆà¸­à¸™à¹„à¸‚à¸à¸£à¹‰à¸­à¸¡à¸ˆà¹ˆà¸²à¸¢ Incentive",
  },
  {
    value: "appeal-pending",
    label: "Appeal Pending",
    description: "à¹€à¸­à¸à¸ªà¸²à¸£à¸¡à¸µà¹€à¸„à¸ª Appeal à¸—à¸µà¹ˆà¸¢à¸±à¸‡à¸£à¸­à¸œà¸¥à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¸«à¸£à¸·à¸­à¸›à¸à¸´à¹€à¸ªà¸˜",
  },
  {
    value: "expired",
    label: "Overdue",
    description: "à¹€à¸­à¸à¸ªà¸²à¸£à¹€à¸¥à¸¢à¸à¸³à¸«à¸™à¸”à¸¥à¸‡à¸™à¸²à¸¡à¹à¸¥à¸°à¸¢à¸±àm«ëŒ+Š×®º+º$zzb¥ëˆ~‰N‹>˜‰‹N‰ˆ‹.Š>˜NŠ˜ˆNŠ>‰¢"À¢ÒÀ¥Ò26öç7C° ¦gVæ7F–öâvWE6–væ–æu7FvT÷F–öâ‡fÇVS¢7G&–ær’°¢&WGW&â4”tä”äuõ5DtUôõD”ôå2æf–æB‚†÷F–öâ’Óâ÷F–öâçfÇVRÓÓÒfÇVR’ÇÂ4”tä”äuõ5DtUôõD”ôå5³Ó°§Ğ ¦gVæ7F–öâ6Æ÷6T÷F†W%6–væGW&Tf–ÇFW$G&÷F÷vç2†7W'&VçC¢…DÔÄFWF–Ç4VÆVÖVçB’°¢Fö7VÖVç@¢çVW'•6VÆV7F÷$ÆÃÄ…DÔÄFWF–Ç4VÆVÖVçCâ‚vFWF–Ç5¶FF×6–væGW&RÖf–ÇFW"ÖG&÷F÷vãÒ'G'VR%Õ¶÷VåÒr¢æf÷$V6‚‚†FWF–Â’Óâ°¢–b†FWF–ÂÓÒ7W'&VçB’FWF–Âç&VÖ÷fTGG&–'WFR‚&÷Vâ"“°¢Ò“°§Ğ ¦W‡÷'BFVfVÇBgVæ7F–öâ6–væGW&T6VçFW$Öö6·W‡°¢7W'&VçEW6W"À¢66÷VçG2ÒµÒÀ§Ó¢°¢7W'&VçEW6W#¢7W'&VçEW6W#°¢66÷VçG3ó¢W6W$66÷VçE6æ6†÷EµÓ°§Ò’°¢6öç7B¶Fö7VÖVçG2Â6WDFö7VÖVçG5ÒÒW6U7FFSÅ6–væGW&TFö7VÖVçEµÓâ…µÒ“°¢6öç7B¶VÄÆöw2Â6WDVÄÆöw5ÒÒW6U7FFSÅW6vTÆötWfVçEµÓâ…µÒ“°¢6öç7B·6–væGW&W2Â6WE6–væGW&W5ÒÒW6U7FFSÅ&V6÷&CÇ7G&–ærÂ6–væGW&TVçG'•µÓãâ‚‚’Óâ&VE6–væGW&U7F÷&R‚’“°¢6öç7B·6–væGW&TÆ–'&'’Â6WE6–væGW&TÆ–'&'•ÒÒW6U7FFSÅ&V6÷&CÇ7G&–ærÂ7G&–æsãâ‚‚’Óâ&VE6–væGW&TÆ–'&'•7F÷&R‚’“°¢6öç7B¶6öæf—&ÖVDFö72Â6WD6öæf—&ÖVDFö75ÒÒW6U7FFSÅ&V6÷&CÇ7G&–ærÂ7G&–æsãâ‚‚’Óâ&VD6öæf—&ÖVE7F÷&R‚’“°¢6öç7B·6VÆV7FVDFö7VÖVçD–BÂ6WE6VÆV7FVDFö7VÖVçD–EÒÒW6U7FFR‚""“°¢6öç7B·6VÆV7FVDÖöçF‚Â6WE6VÆV7FVDÖöçF…ÒÒW6U7FFR‚&ÆÂ"“°¢6öç7B·6VÆV7FVE–V"Â6WE6VÆV7FVE–V%ÒÒW6U7FFR‚&ÆÂ"“°¢6öç7B·7FGW4f–ÇFW"Â6WE7FGW4f–ÇFW%ÒÒW6U7FFR‚&ÆÂ"“°¢6öç7B·V–6´f–ÇFW"Â6WEV–6´f–ÇFW%ÒÒW6U7FFSÅv÷&·76UV–6´f–ÇFW#â‚&ÆÂ"“°¢6öç7B¶W‡æFVDÖöçF‡2Â6WDW‡æFVDÖöçF‡5ÒÒW6U7FFSÅ&V6÷&CÇ7G&–ærÂ&ööÆVããâ‡·Ò“°¢6öç7B¶7W'&VçEvRÂ6WD7W'&VçEvUÒÒW6U7FFRƒ“°¢6öç7B·&÷w5W%vRÂ6WE&÷w5W%vUÒÒW6U7FFRƒ“°¢6öç7B·v÷&·76TFWF–Ä÷VâÂ6WEv÷&·76TFWF–Ä÷VåÒÒW6U7FFR‡G'VR“°¢6öç7Bv÷&·76TFWF–Å&VbÒW6U&VcÄ…DÔÄF—dVÆVÖVçBÂçVÆÃâ†çVÆÂ“°¢6öç7B¶Fö7VÖVçEf–WrÂ6WDFö7VÖVçEf–WuÒÒW6U7FFSÂ'VWVR"Â&†—7F÷'’#â‚'VWVR"“°¢6öç7B·6V&6‚Â6WE6V&6…ÒÒW6U7FFR‚""“°¢6öç7B¶ÆöF–ærÂ6WDÆöF–æuÒÒW6U7FFR‡G'VR“°¢6öç7B¶ÆöDÖW76vRÂ6WDÆöDÖW76vUÒÒW6U7FFR‚""“°¢6öç7B·FdÖW76vRÂ6WEFdÖW76vUÒÒW6U7FFR‚""“°¢6öç7B·–ÖVçDÖW76vRÂ6WE–ÖVçDÖW76vUÒÒW6U7FFR‚""“°¢6öç7B·6†&TÖW76vRÂ6WE6†&TÖW76vUÒÒW6U7FFR‚""“°¢6öç7B·6–væ–æu&öÆRÂ6WE6–væ–æu&öÆUÒÒW6U7FFSÅ6–vå&öÆRÂçVÆÃâ†çVÆÂ“°¢6öç7B·&Wf–Wt66RÂ6WE&Wf–Wt66UÒÒW6U7FFSÅ6–væGW&T66TFWF–ÂÂçVÆÃâ†çVÆÂ“°¢6öç7B·VWVU&Wf–WtFö7VÖVçD–BÂ6WEVWVU&Wf–WtFö7VÖVçD–EÒÒW6U7FFR‚""“°¢6öç7B¶7F–öå6–FV&$ÖöFRÂ6WD7F–öå6–FV&$ÖöFUÒÒW6U7FFSÂ&W‡æFVB"Â&6öÆÆ6VB"Â&†–FFVâ#â‚‚’Óâ°¢–b‡G—Vöbv–æF÷rÓÓÒ'VæFVf–æVB"’&WGW&â&W‡æFVB#°¢6öç7B6fVBÒv–æF÷rç6W76–öå7F÷&vRævWD—FVÒ‚'6–væGW&RÖFö7VÖVçBÖ7F–öç2ÖÖöFR"“°¢&WGW&â6fVBÓÓÒ&6öÆÆ6VB"ÇÂ6fVBÓÓÒ&†–FFVâ"ò6fVB¢&W‡æFVB#°¢Ò“°¢6öç7B6†&TÆ–æ´Æ–VE&VbÒW6U&Vb†fÇ6R“° ¢W6TVffV7B‚‚’Óâ°¢–b‡G—Vöbv–æF÷rÓÒ'VæFVf–æVB"’°¢v–æF÷rç6W76–öå7F÷&vRç6WD—FVÒ‚'6–væGW&RÖFö7VÖVçBÖ7F–öç2ÖÖöFR"Â7F–öå6–FV&$ÖöFR“°¢Ğ¢ÒÂ¶7F–öå6–FV&$ÖöFUÒ“° ¢W6TVffV7B‚‚’Óâ°¢–b‚&Wf–Wt66R’&WGW&ã°¢6öç7B&Wf–÷W4÷fW&fÆ÷rÒFö7VÖVçBæ&öG’ç7G–ÆRæ÷fW&fÆ÷s°¢6öç7B6Æ÷6TöäW66RÒ†WfVçC¢¶W–&ö&DWfVçB’Óâ°¢–b†WfVçBæ¶W’ÓÓÒ$W66R"’6WE&Wf–Wt66R†çVÆÂ“°¢Ó°¢Fö7VÖVçBæ&öG’ç7G–ÆRæ÷fW&fÆ÷rÒ&†–FFVâ#°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚&¶W–F÷vâ"Â6Æ÷6TöäW66R“°¢&WGW&â‚’Óâ°¢Fö7VÖVçBæ&öG’ç7G–ÆRæ÷fW&fÆ÷rÒ&Wf–÷W4÷fW&fÆ÷s°¢v–æF÷rç&VÖ÷fTWfVçDÆ—7FVæW"‚&¶W–F÷vâ"Â6Æ÷6TöäW66R“°¢Ó°¢ÒÂ·&Wf–Wt66UÒ“° ¢W6TVffV7B‚‚’Óâ°¢ÆWBÆ—fRÒG'VS°¢6öç7BÆöDVÇ2Ò7–æ2‚’Óâ°¢G'’°¢6öç7BÆöw2Òv—BfWF6„VÄWfVçG2‚“°¢–b†Æ—fR’6WDVÄÆöw2†Æöw2“°¢Ò6F6‚†W'&÷"’°¢6öç6öÆRçv&â‚%6–væGW&R6VçFW"VÂÆöw2f–ÆVB"ÂW'&÷"“°¢–b†Æ—fR’6WDVÄÆöw2…µÒ“°¢Ğ¢Ó°¢fö–BÆöDVÇ2‚“°¢&WGW&â‚’Óâ°¢Æ—fRÒfÇ6S°¢Ó°¢ÒÂµÒ“° ¢W6TVffV7B‚‚’Óâ°¢ÆWBÆ—fRÒG'VS°¢6öç7BÆöBÒ7–æ2‚’Óâ°¢G'’°¢6WDÆöF–ær‡G'VR“°¢6WDÆöDÖW76vR‚""“°¢6öç7BÆöFVDFö73¢6–væGW&TFö7VÖVçEµÒÒµÓ°¢6öç7B&tVÄÖÒv—BfWF6…6–væGW&U&tVÄÖ‚’æ6F6‚‚†W'&÷"’Óâ°¢6öç6öÆRçv&â‚%6–væGW&R6VçFW"&rVÂÖW&vR6¶—VB"ÂW'&÷"“°¢&WGW&âæWrÖÇ7G&–ærÂ6–væGW&T&÷fVDVÃâ‚“°¢Ò“°¢ÆWB&÷fVDVÄÖÒ&tVÄÖ° ¢òòfÆÆ&6²öæÇ“¢–bæòWÆöFVBVÂ$õtDDW†—7G2ÂW6RvV"&÷fÂÆöw2à¢–b‚&÷fVDVÄÖç6—¦R’°¢6öç7B&÷fVDVÄÆöw2Òv—BfWF6„VÄWfVçG2€¢°¢&VÅ÷&WVW7E÷7V&Ö—GFVB"À¢&VÅ÷&WVW7E÷&Wf–WvVB"À¢&VÅ÷&WVW7E÷&W6WB"À¢ÒÀ¢²Æ–Ö—C¢#Âf÷&6U&Vg&W6ƒ¢G'VRĞ¢’æ6F6‚‚†W'&÷"’Óâ°¢6öç6öÆRçv&â‚%6–væGW&R6VçFW"&÷fVBVÂÖW&vR6¶—VB"ÂW'&÷"“°¢&WGW&âµÒ2W6vTÆötWfVçEµÓ°¢Ò“°¢&÷fVDVÄÖÒ'V–ÆE6–væGW&T&÷fVDVÄÖ†&÷fVDVÄÆöw22W6vTÆötWfVçEµÒ“°¢Ğ¢f÷"†6öç7Bf–ÆTæÖRöb$uôDDôd”ÄU2’°¢6öç7B&W7öç6RÒv—BfWF6‚†f–ÆTæÖRÂ²66†S¢&æò×7F÷&R"Ò“°¢–b‚&W7öç6Ræö²’6öçF–çVS°¢6öç7B'VffW"Òv—B&W7öç6Ræ'&”'VffW"‚“°¢6öç7Bv÷&¶&öö²Ò„Å5‚ç&VB†'VffW"Â²G—S¢&'&’"Â6VÆÄFFW3¢G'VRÒ“°¢6öç7B6†VWBÒv÷&¶&öö²å6†VWG5²%&uôFF%ÒÇÂv÷&¶&öö²å6†VWG5·v÷&¶&öö²å6†VWDæÖW5³ÕÓ°¢6öç7B&÷w2Ò„Å5‚çWF–Ç2ç6†VWE÷Fõö§6öãÇVæ¶æ÷våµÓâ‡6†VWBÂ²†VFW#¢ÂFVgfÃ¢çVÆÂÂ&s¢G'VRÒ“°¢ÆöFVDFö72çW6‚‚ââæ'V–ÆDFö7VÖVçG2‡&÷w2Â66÷VçG2Â&÷fVDVÄÖ’“°¢Ğ¢6öç7B7F÷&VDWfÇVF–öç2Òv—BfWF6…7F÷&VDWfÇVF–öç2ƒ’æ6F6‚‚†W'&÷"’Óâ°¢6öç6öÆRçv&â‚%6–væGW&R6VçFW"7F÷&VBWfÇVF–öç26¶—VB"ÂW'&÷"“°¢&WGW&âµÒ27F÷&VDWfÇVF–öåµÓ°¢Ò“°¢6öç7B&tÖöçF„¶W—2ÒæWr6WB†ÆöFVDFö72æÖ‚†Fö2’ÓâFö2æÖöçF„¶W’’æf–ÇFW"„&ööÆVâ’“°¢ÆöFVDFö72çW6‚€¢ââæ'V–ÆDFö7VÖVçG4g&öÕ7F÷&VDWfÇVF–öç2‡7F÷&VDWfÇVF–öç2Â66÷VçG2Â&÷fVDVÄÖ’æf–ÇFW"€¢†Fö2’Óâ&tÖöçF„¶W—2æ†2†Fö2æÖöçF„¶W’¢¢“°¢–b‚ÆöFVÚ±î¸Â¸­yêë¢°k¢G§¦*^dDocs.length) throw new Error("à¹„à¸¡à¹ˆà¸à¸šà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸ˆà¸²à¸à¹„à¸Ÿà¸¥à¹Œ QA Raw Data");
        const docMap = new Map<string, SignatureDocument>();
        loadedDocs.forEach((doc) => {
          const existing = docMap.get(doc.id);
          docMap.set(doc.id, existing ? mergeSignatureDocuments(existing, doc) : doc);
        });

        // Do not add every All Team user into monthly payment export.
        // Payment PDF / Excel must follow the names already shown in the monthly Dashboard.
        // Special Dashboard exception: March 2026 includes Anucha Makundin even with 0 evaluated cases.
        const marchAnuchaKey = "2026-03::Anucha Makundin";
        if (!docMap.has(marchAnuchaKey)) {
          const anuchaAccount = accounts.find((account) =>
            isSamePerson(account.agentName, "Anucha Makundin") ||
            isSamePerson(account.displayName, "Anucha Makundin") ||
            isSamePerson(account.username, "Anucha Makundin")
          );
          docMap.set(marchAnuchaKey, createZeroCaseDocument("2026-03", anuchaAccount || {
            username: "anucha",
            displayName: "Anucha Makundin",
            agentName: "Anucha Makundin",
            role: "Admin Live Chat",
            teamName: "-",
            teamLead: "",
            status: "Historical",
          }));
        }

        const canonicalDocMap = new Map<string, SignatureDocument>();
        Array.from(docMap.values()).forEach((doc) => {
          const canonicalName = canonicalAgentName(doc.agentName);
          const canonicalId = `${doc.monthKey}::${canonicalName}`;
          const normalizedDoc = sortSignatureDocumentCases({ ...doc, id: canonicalId, agentName: canonicalName });
          const existing = canonicalDocMap.get(canonicalId);
          if (!existing) {
            canonicalDocMap.set(canonicalId, normalizedDoc);
            return;
          }
          canonicalDocMap.set(canonicalId, mergeSignatureDocuments(existing, normalizedDoc));
        });

        const nextDocs = Array.from(canonicalDocMap.values()).map(sortSignatureDocumentCases).sort(
          (a, b) => b.monthKey.localeCompare(a.monthKey) || a.agentName.localeCompare(b.agentName, "th")
        );
        if (!alive) return;
        setDocuments(nextDocs);
        setSelectedDocumentId((current) =>
          current && nextDocs.some((document) => document.id === current) ? current : ""
        );
      } catch (error) {
        if (!alive) return;
        setLoadMessage(error instanceof Error ? error.message : "à¹‚à¸«à¸¥à¸”à¸‚à¹‰à¸­à¸¡à¸¹à¸¥ Signature à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [accounts]);

  useEffect(() => {
    let alive = true;
    const loadRemoteSignatures = async () => {
      try {
        const storedDocs = await fetchStoredSignatureDocuments();
        if (!alive || !storedDocs.length) return;

        setSignatures((previous) => {
          const next = { ...previous };
          storedDocs.forEach((doc) => {
            if (doc.entries.length) {
              next[doc.docId] = doc.entries as SignatureEntry[];
            } else {
              delete next[doc.docId];
            }
          });
          return next;
        });

        setConfirmedDocs((previous) => {
          const next = { ...previous };
          storedDocs.forEach((doc) => {
            if (doc.confirmedAt) {
              next[doc.docId] = doc.confirmedAt;
            } else {
              delete next[doc.docId];
            }
          });
          return next;
        });
      } catch (error) {
        console.warn("Load remote signatures failed", error);
      }
    };
    void loadRemoteSignatures();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    writeSignatureStore(signatures);
  }, [signatures]);

  useEffect(() => {
    writeConfirmedStore(confirmedDocs);
  }, [confirmedDocs]);

  useEffect(() => {
    writeSignatureLibraryStore(signatureLibrary);
  }, [signatureLibrary]);

  const monthOptions = useMemo(() => Array.from(new Set(documents.map((item) => item.monthKey))).sort().reverse(), [documents]);
  const yearOptions = useMemo(
    () => Array.from(new Set(monthOptions.map((month) => month.slice(0, 4)).filter(Boolean))).sort().reverse(),
    [monthOptions]
  );

  useEffect(() => {
    if (shareLinkAppliedRef.current || !documents.length) return;
    const params = new URLSearchParams(window.location.search);
    const monthParam = params.get("month");
    const docParam = params.get("doc");
    if (monthParam) setSelectedMonth(monthParam);
    if (docParam && documents.some((doc) => doc.id === docParam)) {
      setSelectedDocumentId(docParam);
      setQueuePreviewDocumentId(docParam);
      setStatusFilter("all");
    }
    if (monthParam || docParam) shareLinkAppliedRef.current = true;
  }, [documents]);

  const pendingAppealCaseMap = useMemo(() => {
    const map = new Map<string, PendingAppealCase>();
    buildAppealRequests(appealLogs)
      .filter((request) => request.status === "Pending")
      .forEach((request) => {
        const caseId = normalizeText(request.caseId);
        if (!caseId) return;
        map.set(caseId, {
          caseId,
          agent: request.agent,
          status: request.status,
          submittedAt: request.submittedAt,
        });
      });
    return map;
  }, [appealLogs]);

  const visibleDocuments = useMemo(() => {
    return documents.filter((doc) => canViewDocument(currentUser, doc, effectiveEntriesForDoc(doc, signatures)));
  }, [currentUser, documents, signatures]);

  const filteredDocuments = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return visibleDocuments.filter((doc) => {
      const entries = effectiveEntriesForDoc(doc, signatures);
      const signedCount = SIGNATURE_FLOW.filter((role) => Boolean(getCompletedEntry(entries, role))).length;
      const pendingRoles = getPendingRoles(entries);
      const isComplete = signedCount === SIGNATURE_FLOW.length;
      const timeline = getTimelm«ëŒ+Š×®º+º$zzb¥æ–æU7FGW2†Fö2æÖöçF„¶W’“°¢6öç7B7FGW4ÖF6‚Ğ¢7FGW4f–ÇFW"ÓÓÒ&ÆÂ"ÇÀ¢‡7FGW4f–ÇFW"ÓÓÒ&×’×GW&â"bbVæF–æu&öÆW2ç6öÖR‚‡&öÆR’Óâ6å6–vä–FVçF—G’†7W'&VçEW6W"ÂFö2Â&öÆR’bb6å6–vå&öÆT'”FFR†Fö2æÖöçF„¶W’ÂVçG&–W2Â&öÆR’’’ÇÀ¢‡7FGW4f–ÇFW"ÓÓÒ'&Wf–Wr"bb6öæf—&ÖVDFö75¶Fö2æ–EÒbb—4†—7F÷&–6Å–EW&–öB†Fö2æÖöçF„¶W’’’ÇÀ¢‡7FGW4f–ÇFW"ÓÓÒ'&VG’"bb—46ö×ÆWFRbbFö2æVÆ–v–&ÆT'•66÷&R’ÇÀ¢‡7FGW4f–ÇFW"ÓÓÒ'VæF–ær"bb—46ö×ÆWFR’ÇÀ¢‡7FGW4f–ÇFW"ÓÓÒ&W‡—&VB"bbF–ÖVÆ–æRÓÓÒ%6–væGW&RFVFÆ–æR76VB"bb—46ö×ÆWFR’ÇÀ¢‡7FGW4f–ÇFW"ÓÓÒ&VÂ×VæF–ær"bbFö2æ66W2ç6öÖR‚†—FVÒ’ÓâVæF–ætVÄ66TÖæ†2†—FVÒæ66T–B’’“°¢6öç7BÖöçF„ÖF6‚Ò6VÆV7FVDÖöçF‚ÓÓÒ&ÆÂ"ÇÂFö2æÖöçF„¶W’ÓÓÒ6VÆV7FVDÖöçFƒ°¢6öç7B¶W—v÷&DÖF6‚Ğ¢¶W—v÷&BÇÀ¢Fö2ævVçDæÖRçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢vWDÖöçF†Ç”Fö7VÖVçE&Vb†Fö2ÂFö7VÖVçG2’çFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢Fö2æFö7VÖVçD†6‚çFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢Fö2æÖöçF„¶W’çFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢Fö2æÖöçF„Æ&VÂçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢Fö2çFVÔæÖRçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢Fö2ç6Væ–÷$æÖRçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢Fö2ç7WW'f—6÷$æÖRçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢Fö2æ66W2ç6öÖR‚†—FVÒ’Óà¢—FVÒæ66T–BçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢—FVÒæ–çV—'’çFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢—FVÒæ6öÖÖVçBçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B¢“°¢&WGW&â7FGW4ÖF6‚bbÖöçF„ÖF6‚bb¶W—v÷&DÖF6ƒ°¢Ò’ç6÷'B‚†Â"’ÓâævVçDæÖRæÆö6ÆT6ö×&R†"ævVçDæÖRÂ'F‚"’“°¢ÒÂ¶6öæf—&ÖVDFö72Â7W'&VçEW6W"ÂFö7VÖVçG2ÂVæF–ætVÄ66TÖÂ6V&6‚Â6VÆV7FVDÖöçF‚Â6–væGW&W2Â7FGW4f–ÇFW"Âf—6–&ÆTFö7VÖVçG5Ò“° ¢6öç7B†—7F÷'”f–ÇFW&VDFö7VÖVçG2ÒW6TÖVÖò‚‚’Óâ°¢6öç7B¶W—v÷&BÒ6V&6‚çG&–Ò‚’çFôÆ÷vW$66R‚“°¢&WGW&âFö7VÖVçG2æf–ÇFW"‚†Fö2’Óâ°¢–b‚6äÖöæ—F÷$Fö7VÖVçB†7W'&VçEW6W"ÂFö2’’&WGW&âfÇ6S° ¢6öç7BÖöçF„ÖF6‚Ò6VÆV7FVDÖöçF‚ÓÓÒ&ÆÂ"ÇÂFö2æÖöçF„¶W’ÓÓÒ6VÆV7FVDÖöçFƒ°¢6öç7B¶W—v÷&DÖF6‚Ğ¢¶W—v÷&BÇÀ¢Fö2ævVçDæÖRçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢vWDÖöçF†Ç”Fö7VÖVçE&Vb†Fö2ÂFö7VÖVçG2’çFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢Fö2æFö7VÖVçD†6‚çFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢Fö2æÖöçF„¶W’çFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢Fö2æÖöçF„Æ&VÂçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢Fö2çFVÔæÖRçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢Fö2ç6Væ–÷$æÖRçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢Fö2ç7WW'f—6÷$æÖRçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢Fö2æ66W2ç6öÖR‚†—FVÒ’Óà¢—FVÒæ66T–BçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢—FVÒæ–çV—'’çFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B’ÇÀ¢—FVÒæ6öÖÖVçBçFôÆ÷vW$66R‚’æ–æ6ÇVFW2†¶W—v÷&B¢“° ¢&WGW&âÖöçF„ÖF6‚bb¶W—v÷&DÖF6ƒ°¢Ò’ç6÷'B‚†Â"’ÓâævVçDæÖRæÆö6ÆT6ö×&R†"ævVçDæÖRÂ'F‚"’“°¢ÒÂ¶7W'&VçEW6W"ÂFö7VÖVçG2Â6V&6‚Â6VÆV7FVDÖöçF…Ò“° ¢6öç7B7F—fTFö7VÖVçG2ÒFö7VÖVçEf–WrÓÓÒ&†—7F÷'’"ò†—7F÷'”f–ÇFW&VDFö7VÖVçG2¢f–ÇFW&VDFö7VÖVçG3°¢6öç7Bv÷&·76TFö7VÖVçG2ÒW6TÖVÖò‚‚’Óâ°¢&WGW&â7F—fTFö7VÖVçG2æf–ÇFW"‚†Fö2’Óâ°¢6öç7BVçG&–W2ÒVffV7F—fTVçG&–W4f÷$Fö2†Fö2Â6–væGW&W2“°¢6öç7BFö57FGW2ÒvWEv÷&·76U7FGW2†Fö2ÂVçG&–W2“°¢6öç7B–V$ÖF6‚Ò6VÆV7FVE–V"ÓÓÒ&ÆÂ"ÇÂFö2æÖöçF„¶W’ç7F'G5v—F‚†G·6VÆV7FVE–V'ÒÖ“°¢6öç7BV–6´ÖF6‚ÒV–6´f–ÇFW"ÓÓÒ&ÆÂ"ÇÂFö57FGW2ÓÓÒV–6´f–ÇFW#°¢&WGW&â–V$ÖF6‚bbV–6´ÖF6ƒ°¢Ò’ç6÷'B‚†Â"’Óâ°¢6öç7BFFTF–fbÒvWDFö7VÖVçDVF—E6÷'EF–ÖR†’ÒvWDFö7VÖVçDVF—E6÷'EF–ÖR†"“°¢–b†FFTF–fb’&WGW&âFFTF–fc°¢&WGW&âævVçDæÖRæÆö6ÆT6ö×&R†"ævVçDæÖRÂ'F‚"“°¢Ò“°¢ÒÂ¶7F—fTFö7VÖVçG2ÂV–6´f–ÇFW"Â6VÆV7FVE–V"Â6–væGW&W5Ò“° ¢6öç7Bv÷&·76U7VÖÖ'’ÒW6TÖVÖò‚‚’Óâ°¢6öç7B6÷VçG2Ò°¢F÷FÃ¢v÷&·76TFö7VÖVçG2æÆVæwF‚À¢VæF–æs¢À¢6–væVC¢À¢W‡—&VC¢À¢–å&öw&W73¢À¢Ó°¢v÷&·76TFö7VÖVçG2æf÷$V6‚‚†Fö2’Óâ°¢6öç7B7FGW2ÒvWEv÷&·76U7FGW2†Fö2ÂVffV7F—fTVçG&–W4f÷$Fö2†Fö2Â6–væGW&W2’“°¢–b‡7FGW2ÓÓÒ'VæF–ær"’6÷VçG2çVæF–ær³Ò°¢–b‡7FGW2ÓÓÒ'6–væVB"’6÷VçG2ç6–væVB³Ò°¢–b‡7FGW2ÓÓÒ&W‡—&VB"’6÷VçG2æW‡—&VB³Ò°¢–b‡7FGW2ÓÓÒ&–â×&öw&W72"’6÷VçG2æ–å&öw&W72³Ò°¢Ò“°¢&WGW&â6÷VçG3°¢ÒÂ·6–væGW&W2Âv÷&·76TFö7VÖVçG5Ò“° ¢W6TVffV7B‚‚’Óâ°¢6WD7W'&VçEvRƒ“°¢ÒÂ¶Fö7VÖVçEf–WrÂV–6´f–ÇFW"Â6V&6‚Â6VÆV7FVDÖöçF‚Â6VÆV7FVE–V"Â7FGW4f–ÇFW%Ò“° ¢6öç7BF÷FÅvW2ÒÖF‚æÖ‚ƒÂÖF‚æ6V–Â‡v÷&·76TFö7VÖVçG2æÆVæwF‚ò&÷w5W%vR’“°¢6öç7B6fT7W'&VçEvRÒÖF‚æÖ–â†7W'&VçEvRÂF÷FÅvW2“°¢6öç7BvVEv÷&·76TFö7VÖVçG2ÒW6TÖVÖò‚‚’Óâ°¢6öç7B7F'BÒ‡6fT7W'&VçEvRÒ’¢&÷w5W%vS°¢&WGW&âv÷&·76TFö7VÖVçG2ç6Æ–6R‡7F'BÂ7F'B²&÷w5W%vR“°¢ÒÂ·&÷w5W%vRÂ6fT7W'&VçEvRÂv÷&·76TFö7VÖVçG5Ò“° ¢6öç7Bw&÷WVEv÷&·76TFö7VÖVçG2ÒW6TÖVÖò‚‚’Óâ°¢6öç7Bw&÷W2ÒæWrÖÇ7G&–ærÂ6–væGW&TFö7VÖVçEµÓâ‚“°¢vVEv÷&·76TFö7VÖVçG2æf÷$V6‚‚†Fö2’Óâ°¢6öç7Bw&÷WÒw&÷W2ævWB†Fö2æÖöçF„¶W’’ÇÂµÓ°¢w&÷WçW6‚†Fö2“°¢w&÷W2ç6WB†Fö2æÖöçF„¶W’Âw&÷W“°¢Ò“°¢&WGW&â'&’æg&öÒ†w&÷W2æVçG&–W2‚’’æÖ‚…¶ÖöçF„¶W’Â—FV×5Ò’Óâ‡°¢ÖöçF„¶W’À¢ÖöçF„Æ&VÃ¢vWDÖöçF„Æ&VÂ†ÖöçF„¶W’’À¢—FV×2À¢Ò’“°¢ÒÂ·vVEv÷&·76TFö7VÖVçG5Ò“° ¢6öç7B6ÆV%v÷&·76Tf–ÇFW'2Ò‚’Óâ°¢6WE6V&6‚‚""“°¢6WE6VÆV7FVDÖöçF‚‚&ÆÂ"“°¢6WE6VÆV7FVE–V"‚&ÆÂ"“°¢6WE7FGW4f–ÇFW"‚&ÆÂ"“°¢6WEV–6´f–ÇFW"‚&ÆÂ"“°¢6WD7W'&VçEvRƒ“°¢Ó° ¢6öç7B÷Våv÷&·76TFWF–ÂÒ†Fö4–C¢7G&–ær’Óâ°¢6WE6VÆV7FVDFö7VÖVçD–B†Fö4–B“°¢–b†Fö7VÖVçEf–WrÓÓÒ'VWVR"’6WEVWVU&Wf–WtFö7VÖVçD–B†Fö4–B“°¢6WEv÷&·76TFWF–Ä÷Vâ‡G'VR“°¢v–æF÷rç6WEF–ÖV÷WB‚‚’Óâ°¢v÷&·76TFWF–Å&Vbæ7W'&VçCòç67&öÆÄ–çFõf–Wr‡²&V†f–÷#¢'6Öö÷F‚"Â&Æö6³¢'7F'B"Ò“°¢ÒÂƒ“°¢Ó° ¢6öç7B—5W6W"Ò7W'&VçEW6W"ç&öÆRÓÓÒ%VÆ—G’77W&æ6R#°¢6öç7BÖöæ—F÷%F—FÆRÒ—5W6W"ò%Ööæ—F÷""¢.‰¾Š>‹Š~‹‰^‹Nˆ.ŠŞˆ~ˆ‹‰’#°¢6öç7BÖöæ—F÷$FW67&—F–öâÒ—5W6W ¢ò.˜Š®‰Nˆ~˜ŠŞˆŠ®‹.Š>‰~‹^˜‚ˆN‰‰‹^˜Š6Ú±î¸Â¸­yêë¢°k¢G§¦*^à¸±à¸šà¸œà¸´à¸”à¸Šà¸­à¸š à¸à¸£à¹‰à¸­à¸¡à¸ªà¸–à¸²à¸™à¸°à¸§à¹ˆà¸²à¹ƒà¸„à¸£à¹€à¸‹à¹‡à¸™à¹à¸¥à¹‰à¸§à¹à¸¥à¸°à¹ƒà¸„à¸£à¸¢à¸±à¸‡à¹€à¸«à¸¥à¸·à¸­"
    : "à¹à¸ªà¸”à¸‡à¹€à¸‰à¸à¸²à¸°à¹€à¸­à¸à¸ªà¸²à¸£à¸—à¸µà¹ˆà¹€à¸à¸µà¹ˆà¸¢à¸§à¸‚à¹‰à¸­à¸‡à¸à¸±à¸šà¸ªà¸´à¸—à¸˜à¸´à¹Œà¸‚à¸­à¸‡à¸„à¸¸à¸“à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™";

  const selectedMonthAllDocs = useMemo(() => {
    if (selectedMonth === "all") return [];
    return documents.filter((doc) => doc.monthKey === selectedMonth);
  }, [documents, selectedMonth]);

  const selectedMonthPaymentDocs = useMemo(() => {
    if (selectedMonth === "all") return [];
    return documents
      .filter((doc) => doc.monthKey === selectedMonth)
      .filter((doc) => isPaymentReadyDocument(doc, effectiveEntriesForDoc(doc, signatures), pendingAppealCaseMap));
  }, [documents, pendingAppealCaseMap, selectedMonth, signatures]);

  const selectedMonthExportDocs = useMemo(() => {
    if (selectedMonth === "all") return [];
    return selectedMonthPaymentDocs;
  }, [selectedMonth, selectedMonthPaymentDocs]);

  const selectedMonthPaymentExportDocs = useMemo(() => {
    if (selectedMonth === "all") return [];
    return selectedMonthExportDocs;
  }, [selectedMonth, selectedMonthExportDocs]);

  const selectedMonthLateSignedDocs = useMemo(() => {
    if (selectedMonth === "all") return [];
    return documents
      .filter((doc) => doc.monthKey === selectedMonth)
      .filter((doc) => isLateSignedDocument(doc, effectiveEntriesForDoc(doc, signatures), pendingAppealCaseMap));
  }, [documents, pendingAppealCaseMap, selectedMonth, signatures]);

  const rolePendingCounts = useMemo(() => {
    const counts: Record<SignRole, number> = { QA: 0, Supervisor: 0, Senior: 0, Agent: 0 };
    const sourceDocs = documents
      .filter((doc) => selectedMonth === "all" || doc.monthKey === selectedMonth)
      .filter((doc) => canMonitorDocument(currentUser, doc));

    sourceDocs.forEach((doc) => {
      if (!isAfterAppealPeriod(doc.monthKey)) return;
      if (doc.cases.some((item) => pendingAppealCaseMap.has(item.caseId))) return;
      const entries = effectiveEntriesForDoc(doc, signatures);
      getPendingRoles(entries).forEach((role) => {
        if (currentUser.role !== "Quality Assurance" && !canSignIdentity(currentUser, doc, role)) return;
        counts[role] += 1;
      });
    });

    return counts;
  }, [currentUser, documents, pendingAppealCaseMap, selectedMonth, signatures]);

  useEffect(() => {
    if (!documents.length || !accounts.length) return;
    let alive = true;

    const syncResignedUserWaivers = async () => {
      const updates = new Map<string, SignatureEntry[]>();

      for (const document of documents) {
        if (isHistoricalPaidPeriod(document.monthKey) || !isAfterAppealPeriod(document.monthKey)) continue;
        if (document.cases.some((item) => pendingAppealCaseMap.has(item.caseId))) continue;

        const account = findAccountForAgent(accounts, document.agentName);
        if (!account || !isResignedAccountForAutoWaiver(account)) continue;

        const entries = effectiveEntriesForDoc(document, signatures);
        if (getSignedEntry(entries, "Agent")) continue;
        if (!( ["QA", "Supervisor", "Senior"] as SignRole[]).every((role) => Boolean(getSignedEntry(entries, role)))) continue;

        const resignationDate = getAccountSuspensionDate(account);
        const existingWaiver = getWaivedEntry(entries, "Agent");
        const waiverEntry: SignatureEntry = {
          role: "Agent",
          signerName: document.agentName,
          signedBy: "",
          signedAt: "",
          status: "Waived",
          note: AUTO_RESIGNED_WAIVER_NOTE,
          waiverReason: normalizeText(account.suspendReason) || "Resigned",
          waivedBy: AUTO_RESIGNED_WAIVER_SIGNER,
          waivedAt: getAutomaticWaiverEffectiveAt(account, entries),
          resignationDate,
        };

        if (
          existingWaiver &&
          existingWaiver.note === waiverEntry.note &&
          existingWaiver.waiverReason === waiverEntry.waiverReason &&
          existingWaiver.waivedAt === waiverEntry.waivedAt &&
          existingWaiver.resignationDate === waiverEntry.resignationDate
        ) continue;

        const nextEntries = [...entries.filter((entry) => entry.role !== "Agent"), waiverEntry];
        try {
          await persistDocumentSignatures(document.id, nextEntries, confirmedDocs[document.id] || "");
          updates.set(document.id, nextEntries);
        } catch (error) {
          console.warn(`Auto sync resigned waiver failed for ${document.agentName}`, error);
        }
      }

      if (!alive || !updates.size) return;
      setSignatures((previous) => {
        const next = { ...previous };
        updates.forEach((entries, documentId) => {
          next[documentId] = entries;
        });
        return next;
      });
    };

    void syncResignedUserWaivers();
    return () => {
      alive = false;
    };
  }, [accounts, confirmedDocs, documents, pendingAppealCaseMap, signatures]);

  const selectedMonthTotalDocs = selectedMonthAllDocs.length;

  const canGeneratePaymentExcel = selectedMonth !== "all";

  const selectedDocumentSource = selectedDocumentId
    ? documents.find((item) => item.id === selectedDocumentId) || null
    : null;
  const selectedDocument = selectedDocumentSource ? sortSignatureDocumentCases(selectedDocumentSource) : null;
  const selectedEntries = selectedDocument ? effectiveEntriesForDoc(selectedDocument, signatures) : [];
  const selectedAgentAccount = selectedDocument ? findAccountForAgent(accounts, selectedDocument.agentName) : undefined;
  const selectedAgentUsesAutoWaiver = isResignedAccountForAutoWaiver(selectedAgentAccount);
  const selectedDocumentRef = selectedDocument ? getMonthlyDocumentRef(selectedDocument, documents) : "";
  const mySignedRoles = selectedDocument
    ? SIGNATURE_FLOW.filter((role) => {
        const signed = getSignedEntry(selectedEntries, role);
        return Boolean(signed) && canSignIdentity(currentUser, selectedDocument, role);
      })
    : [];
  const selectedPendingAppeals = selectedDocument
    ? selectedDocument.m«ëŒ+Š×®º+º$zzb¥î‹‰®‰Î‹N‰Nˆ®ŠŞ‰¢‰îŠ>˜ŠŞŠŠ®‰n‹.‰‹Š~˜‹.˜>ˆNŠ>˜ˆ¾˜~‰˜Š^˜Š~˜Š^‹˜>ˆNŠ>Š.‹ˆ~˜Š¾Š^‹~ŠÒ ¢¢.˜Š®‰Nˆ~˜ˆ‰î‹.‹˜ŠŞˆŠ®‹.Š>‰~‹^˜˜ˆ‹^˜Š.Š~ˆ.˜ŠŞˆ~ˆ‹‰®Š®‹N‰~‰‹N˜Îˆ.ŠŞˆ~ˆN‹‰>˜‰~˜‹.‰‹˜‰’#° ¢6öç7B6VÆV7FVDÖöçF„ÆÄFö72ÒW6TÖVÖò‚‚’Óâ°¢–b‡6VÆV7FVDÖöçF‚ÓÓÒ&ÆÂ"’&WGW&âµÓ°¢&WGW&âFö7VÖVçG2æf–ÇFW"‚†Fö2’ÓâFö2æÖöçF„¶W’ÓÓÒ6VÆV7FVDÖöçF‚“°¢ÒÂ¶Fö7VÖVçG2Â6VÆV7FVDÖöçF…Ò“° ¢6öç7B6VÆV7FVDÖöçF…–ÖVçDFö72ÒW6TÖVÖò‚‚’Óâ°¢–b‡6VÆV7FVDÖöçF‚ÓÓÒ&ÆÂ"’&WGW&âµÓ°¢&WGW&âFö7VÖVçG0¢æf–ÇFW"‚†Fö2’ÓâFö2æÖöçF„¶W’ÓÓÒ6VÆV7FVDÖöçF‚¢æf–ÇFW"‚†Fö2’Óâ—5–ÖVçE&VG”Fö7VÖVçB†Fö2ÂVffV7F—fTVçG&–W4f÷$Fö2†Fö2Â6–væGW&W2’ÂVæF–ætVÄ66TÖ’“°¢ÒÂ¶Fö7VÖVçG2ÂVæF–ætVÄ66TÖÂ6VÆV7FVDÖöçF‚Â6–væGW&W5Ò“° ¢6öç7B6VÆV7FVDÖöçF„W‡÷'DFö72ÒW6TÖVÖò‚‚’Óâ°¢–b‡6VÆV7FVDÖöçF‚ÓÓÒ&ÆÂ"’&WGW&âµÓ°¢&WGW&â6VÆV7FVDÖöçF…–ÖVçDFö73°¢ÒÂ·6VÆV7FVDÖöçF‚Â6VÆV7FVDÖöçF…–ÖVçDFö75Ò“° ¢6öç7B6VÆV7FVDÖöçF…–ÖVçDW‡÷'DFö72ÒW6TÖVÖò‚‚’Óâ°¢–b‡6VÆV7FVDÖöçF‚ÓÓÒ&ÆÂ"’&WGW&âµÓ°¢&WGW&â6VÆV7FVDÖöçF„W‡÷'DFö73°¢ÒÂ·6VÆV7FVDÖöçF‚Â6VÆV7FVDÖöçF„W‡÷'DFö75Ò“° ¢6öç7B6VÆV7FVDÖöçF„ÆFU6–væVDFö72ÒW6TÖVÖò‚‚’Óâ°¢–b‡6VÆV7FVDÖöçF‚ÓÓÒ&ÆÂ"’&WGW&âµÓ°¢&WGW&âFö7VÖVçG0¢æf–ÇFW"‚†Fö2’ÓâFö2æÖöçF„¶W’ÓÓÒ6VÆV7FVDÖöçF‚¢æf–ÇFW"‚†Fö2’Óâ—4ÆFU6–væVDFö7VÖVçB†Fö2ÂVffV7F—fTVçG&–W4f÷$Fö2†Fö2Â6–væGW&W2’ÂVæF–ætVÄ66TÖ’“°¢ÒÂ¶Fö7VÖVçG2ÂVæF–ætVÄ66TÖÂ6VÆV7FVDÖöçF‚Â6–væGW&W5Ò“° ¢6öç7B&öÆUVæF–æt6÷VçG2ÒW6TÖVÖò‚‚’Óâ°¢6öç7B6÷VçG3¢&V6÷&CÅ6–vå&öÆRÂçVÖ&W#âÒ²¢Â7WW'f—6÷#¢Â6Væ–÷#¢ÂvVçC¢Ó°¢6öç7B6÷W&6TFö72ÒFö7VÖVçG0¢æf–ÇFW"‚†Fö2’Óâ6VÆV7FVDÖöçF‚ÓÓÒ&ÆÂ"ÇÂFö2æÖöçF„¶W’ÓÓÒ6VÆV7FVDÖöçF‚¢æf–ÇFW"‚†Fö2’Óâ6äÖöæ—F÷$Fö7VÖVçB†7W'&VçEW6W"ÂFö2’“° ¢6÷W&6TFö72æf÷$V6‚‚†Fö2’Óâ°¢–b‚—4gFW$VÅW&–öB†Fö2æÖöçF„¶W’’’&WGW&ã°¢–b†Fö2æ66W2ç6öÖR‚†—FVÒ’ÓâVæF–ætVÄ66TÖæ†2†—FVÒæ66T–B’’’&WGW&ã°¢6öç7BVçG&–W2ÒVffV7F—fTVçG&–W4f÷$Fö2†Fö2Â6–væGW&W2“°¢vWEVæF–æu&öÆW2†VçG&–W2’æf÷$V6‚‚‡&öÆR’Óâ°¢–b†7W'&VçEW6W"ç&öÆRÓÒ%VÆ—G’77W&æ6R"bb6å6–vä–FVçF—G’†7W'&VçEW6W"ÂFö2Â&öÆR’’&WGW&ã°¢6÷VçG5·&öÆUÒ³Ò°¢Ò“°¢Ò“° ¢&WGW&â6÷VçG3°¢ÒÂ¶7W'&VçEW6W"ÂFö7VÖVçG2ÂVæF–ætVÄ66TÖÂ6VÆV7FVDÖöçF‚Â6–væGW&W5Ò“° ¢W6TVffV7B‚‚’Óâ°¢–b‚Fö7VÖVçG2æÆVæwF‚ÇÂ66÷VçG2æÆVæwF‚’&WGW&ã°¢ÆWBÆ—fRÒG'VS° ¢6öç7B7–æ5&W6–væVEW6W%v—fW'2Ò7–æ2‚’Óâ°¢6öç7BWFFW2ÒæWrÖÇ7G&–ærÂ6–væGW&TVçG'•µÓâ‚“° ¢f÷"†6öç7BFö7VÖVçBöbFö7VÖVçG2’°¢–b†—4†—7F÷&–6Å–EW&–öB†Fö7VÖVçBæÖöçF„¶W’’ÇÂ—4gFW$VÅW&–öB†Fö7VÖVçBæÖöçF„¶W’’’6öçF–çVS°¢–b†Fö7VÖVçBæ66W2ç6öÖR‚†—FVÒ’ÓâVæF–ætVÄ66TÖæ†2†—FVÒæ66T–B’’’6öçF–çVS° ¢6öç7B66÷VçBÒf–æD66÷VçDf÷$vVçB†66÷VçG2ÂFö7VÖVçBævVçDæÖR“°¢–b‚66÷VçBÇÂ—5&W6–væVD66÷VçDf÷$WFõv—fW"†66÷VçB’’6öçF–çVS° ¢6öç7BVçG&–W2ÒVffV7F—fTVçG&–W4f÷$Fö2†Fö7VÖVçBÂ6–væGW&W2“°¢–b†vWE6–væVDVçG'’†VçG&–W2Â$vVçB"’’6öçF–çVS°¢–b‚‚²%"Â%7WW'f—6÷""Â%6Væ–÷"%Ò26–vå&öÆUµÒ’æWfW'’‚‡&öÆR’Óâ&ööÆVâ†vWE6–væVDVçG'’†VçG&–W2Â&öÆR’’’’6öçF–çVS° ¢6öç7B&W6–væF–öäFFRÒvWD66÷VçE7W7Vç6–öäFFR†66÷VçB“°¢6öç7BW†—7F–æuv—fW"ÒvWEv—fVDVçG'’†VçG&–W2Â$vVçB"“°¢6öç7Bv—fW$VçG'“¢6–væGW&TVçG'’Ò°¢&öÆS¢$vVçB"À¢6–væW$æÖS¢Fö7VÖVçBævVçDæÖRÀ¢6–væVD'“¢""À¢6–væVDC¢""À¢7FGW3¢%v—fVB"À¢æ÷FS¢UDõõ$U4”täTEõt•dU%ôäõDRÀ¢v—fW%&V6öã¢æ÷&ÖÆ—¦UFW‡B†66÷VçBç7W7VæE&V6öâ’ÇÂ%&W6–væVB"À¢v—fVD'“¢UDõõ$U4”täTEõt•dU%õ4”täU"À¢v—fVDC¢vWDWFöÖF–5v—fW$VffV7F—fTB†66÷VçBÂVçG&–W2’À¢&W6–væF–öäFFRÀ¢Ó° ¢–b€¢W†—7F–æuv—fW"b`¢W†—7F–æuv—fW"ææ÷FRÓÓÒv—fW$VçG'’ææ÷FRb`¢W†—7F–æuv—fW"çv—fW%&V6öâÓÓÒv—fW$VçG'’çv—fW%&V6öâb`¢W†—7F–æuv—fW"çv—fVDBÓÓÒv—fW$VçG'’çv—fVDBb`¢W†—7F–æuv—fW"ç&W6–væF–öäFFRÓÓÒv—fW$VçG'’ç&W6–væF–öäFFP¢’6öçF–çVS° ¢6öç7BæW‡DVçG&–W2Ò²ââæVçG&–W2æf–ÇFW"‚†VçG'’’ÓâVçG'’ç&öÆRÓÒ$vVçB"’Âv—fW$VçG'•Ó°¢G'’°¢v—BW'6—7DFö7VÖVçE6–væGW&W2†Fö7VÖVçBæ–BÂæW‡DVçG&–W2Â6öæf—&ÖVDFö75¶Fö7VÖVçBæ–EÒÇÂ""“°¢WFFW2ç6WB†Fö7VÖVçBæ–BÂæW‡DVçG&–W2“°¢Ò6F6‚†W'&÷"’°¢6öç6öÆRçv&â†WFò7–æ2&W6–væVBv—fW"f–ÆVBf÷"G¶Fö7VÖVçBævVçDæÖWÖÂW'&÷"“°¢Ğ¢Ğ ¢–b‚Æ—fRÇÂWFFW2ç6—¦R’&WGW&ã°¢6WE6–væGW&W2‚‡&Wf–÷W2’Óâ°¢6öç7BæW‡BÒ²ââç&Wf–÷W2Ó°¢WFFW2æf÷$V6‚‚†VçG&–W2ÂFö7VÖVçD–B’Óâ°¢æW‡E¶Fö7VÖVçD–EÒÒVçG&–W3°¢Ò“°¢&WGW&âæW‡C°¢Ò“°¢Ó° ¢fö–B7–æ5&W6–væVEW6W%v—fW'2‚“°¢&WGW&â‚’Óâ°¢Æ—fRÒfÇ6S°¢Ó°¢ÒÂ¶66÷VçG2Â6öæf—&ÖVDFö72ÂFö7VÖVçG2ÂVæF–ætVÄ66TÖÂ6–væGW&W5Ò“° ¢6öç7B6VÆV7FVDÖöçF…F÷FÄFö72Ò6VÆV7FVDÖöçF„ÆÄFö72æÆVæwFƒ° ¢6öç7B6ävVæW&FU–ÖVçDW†6VÂÒ6VÆV7FVDÖöçF‚ÓÒ&ÆÂ#° ¢6öç7B6VÆV7FVDFö7VÖVçE6÷W&6RÒ6VÆV7FVDFö7VÖVçD–@¢òFö7VÖVçG2æf–æB‚†—FVÒ’Óâ—FVÒæ–BÓÓÒ6VÆV7FVDFö7VÖVçD–B’ÇÂçVÆÀ¢¢çVÆÃ°¢6öç7B6VÆV7FVDFö7VÖVçBÒ6VÆV7FVDFö7VÖVçE6÷W&6Rò6÷'E6–væGW&TFö7VÖVçD66W2‡6VÆV7FVDFö7VÖVçE6÷W&6R’¢çVÆÃ°¢6öç7B6VÆV7FVDVçG&–W2Ò6VÆV7FVDFö7VÖVçBòVffV7F—fTVçG&–W4f÷$Fö2‡6VÆV7FVDFö7VÖVçBÂ6–væGW&W2’¢µÓ°¢6öç7B6VÆV7FVDvVçD66÷VçBÒ6VÆV7FVDFö7VÖVçBòf–æD66÷VçDf÷$vVçB†66÷VçG2Â6VÆV7FVDFö7VÖVçBævVçDæÖR’¢VæFVf–æVC°¢6öç7B6VÆV7FVDvVçEW6W4WFõv—fW"Ò—5&W6–væVD66÷VçDf÷$WFõv—fW"‡6VÆV7FVDvVçD66÷VçB“°¢6öç7B6VÆV7FVDFö7VÖVçE&VbÒ6VÆV7FVDFö7VÖVçBòvWDÖöçF†Ç”Fö7VÖVçE&Vb‡6VÆV7FVDFö7VÖVçBÂFö7VÖVçG2’¢"#°¢6öç7B×•6–væVE&öÆW2Ò6VÆV7FVDFö7VÖVç@¢ò4”täEU$UôdÄõræf–ÇFW"‚‡&öÆR’Óâ°¢6öç7B6–væVBÒvWE6–væVDVçG'’‡6VÆV7FVDVçG&–W2Â&öÆR“°¢&WGW&â&ööÆVâ‡6–væVB’bb6å6–vä–FVçF—G’†7W'&VçEW6W"Â6VÆV7FVDFö7VÖVçBÂ&öÆR“°¢Ò¢¢µÓ°¢6öç7B6VÆV7FVEVæF–ætVÇ2Ò6VÆV7FVDFö7VÖVç@¢ò6VÆV7FVDFö7VÖVçBæÚ±î¸Â¸­yêë¢°k¢G§¦*^electedDocument) return false;
    if (!canSignIdentity(currentUser, selectedDocument, role)) {
      window.alert("à¹€à¸‹à¹‡à¸™à¹à¸—à¸™à¸à¸±à¸™à¹„à¸¡à¹ˆà¹„à¸”à¹‰ à¸à¸£à¸¸à¸“à¸²à¹ƒà¸«à¹‰à¹€à¸ˆà¹‰à¸²à¸‚à¸­à¸‡à¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™à¸•à¸²à¸¡ Role à¹€à¸›à¹‡à¸™à¸œà¸¹à¹‰à¸¥à¸‡à¸™à¸²à¸¡à¹€à¸­à¸‡");
      return false;
    }
    const entries = effectiveEntriesForDoc(selectedDocument, signatures);
    const existingSigned = getSignedEntry(entries, role);
    const nextEntry: SignatureEntry = {
      role,
      signerName: existingSigned?.signerName || getRoleSigner(selectedDocument, role),
      status: "Signed",
      signedBy: existingSigned?.signedBy || currentUser.displayName || currentUser.username,
      signedAt: existingSigned?.signedAt || new Date().toISOString(),
      note: existingSigned?.note,
      signatureDataUrl,
    };

    const nextEntries = [...entries.filter((entry) => entry.role !== role), nextEntry];
    try {
      await persistDocumentSignatures(selectedDocument.id, nextEntries, confirmedDocs[selectedDocument.id] || "");
    } catch (error) {
      console.warn("Save remote signature failed", error);
      window.alert("à¸šà¸±à¸™à¸—à¸¶à¸à¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ à¸à¸£à¸¸à¸“à¸²à¸¥à¸­à¸‡à¹ƒà¸«à¸¡à¹ˆà¸­à¸µà¸à¸„à¸£à¸±à¹‰à¸‡");
      return false;
    }

    if (saveToSavedLibrary) {
      await saveSignatureToLibrary(role, signatureDataUrl);
    }

    setSignatures((previous) => {
      return {
        ...previous,
        [selectedDocument.id]: nextEntries,
      };
    });
    return true;
  };

  const signRole = async (role: SignRole, signatureDataUrl?: string, saveToSavedLibrary = false) => {
    if (!selectedDocument) return false;
    if (hasPendingAppeal) return false;
    if (!isAfterAppealPeriod(selectedDocument.monthKey)) return false;
    if (!canSignIdentity(currentUser, selectedDocument, role)) return false;
    const entries = effectiveEntriesForDoc(selectedDocument, signatures);
    if (!canSignRoleByDate(selectedDocument.monthKey, entries, role)) return false;
    if (getCompletedEntry(entries, role)) return false;
    if (role === "Agent" && !previewConfirmed) {
      window.alert("Agent à¸•à¹‰à¸­à¸‡à¸à¸”à¸¢à¸·à¸™à¸¢à¸±à¸™à¸£à¸±à¸šà¸—à¸£à¸²à¸šà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸à¹ˆà¸­à¸™ à¸ˆà¸¶à¸‡à¸ˆà¸°à¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸‡à¸™à¸²à¸¡à¹ƒà¸™à¹€à¸­à¸à¸ªà¸²à¸£à¸‚à¸­à¸‡à¸•à¸±à¸§à¹€à¸­à¸‡à¹„à¸”à¹‰");
      return false;
    }

    const signerName = getRoleSigner(selectedDocument, role);
    const nextEntry: SignatureEntry = {
      role,
      signerName,
      status: "Signed",
      signedBy: currentUser.displayName || currentUser.username,
      signedAt: new Date().toISOString(),
      signatureDataUrl,
    };

    const nextEntries = [...entries.filter((entry) => entry.role !== role), nextEntry];
    try {
      await persistDocumentSignatures(selectedDocument.id, nextEntries, confirmedDocs[selectedDocument.id] || "");
    } catch (error) {
      console.warn("Save remote signature failed", error);
      window.alert("à¸šà¸±à¸™à¸—à¸¶à¸à¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ à¸à¸£à¸¸à¸“à¸²à¸¥à¸­à¸‡à¹ƒà¸«à¸¡à¹ˆà¸­à¸µà¸à¸„à¸£à¸±à¹‰à¸‡");
      return false;
    }

    if (signatureDataUrl && saveToSavedLibrary) {
      await saveSignatureToLibrary(role, signatureDataUrl);
    }

    setSignatures((previous) => {
      return {
        ...previous,
        [selectedDocument.id]: nextEntries,
      };
    });
    return true;
  };

  const openSignaturePad = (role: SignRole) => {
    if (!selectedDocument) return;
    if (role === "Agent" && !previewConfirmed && !getSignedEntry(selectedEntries, "Agent")) {
      window.alert("à¸à¸£à¸¸à¸“à¸²à¸à¸”à¸¢à¸·à¸™à¸¢à¸±à¸™à¸£à¸±à¸šà¸—à¸£à¸²à¸šà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸à¹ˆà¸­à¸™ à¹à¸¥à¹‰à¸§à¸ˆà¸¶à¸‡à¸à¸”à¹€à¸‹à¹‡à¸™à¹ƒà¸™à¸Šà¹ˆà¸­à¸‡ Agent à¸œà¸¹à¹‰à¸–à¸¹à¸à¸›à¸£à¸°à¹€à¸¡à¸´à¸™");
      return;
    }
    setSigningRole(role);
  };

  const resetSignatureRole = async (role: SignRole) => {
    if (!selectedDocument || isHistoricalPaidPeriod(selectedDocument.monthKey)) return;
    if (getTimelineStatus(selectedDocument.monthKey) !== "Signature Deadline Passed") return;
    if (currentUser.role !== "Quality Assurance") return;
    const resetAt = new Date().toISOString();
    const resetEntry: SignatureEntry = {
      role,
      signerName: getRoleSigner(selectedDocument, role),
      signedBy: "",
      signedAt: "",
      status: "Pending",
      note: SIGNATURE_DEADLINE_RESET_NOTE,
      resetBy: currentUser.displayName || currentUser.username,
      resetAt,
    };
    const nextEntriesForRemote = [...selectedEntries.filter((entry) => entry.role !== role), resetEntry];

    try {
      if (role === "Agent") {
        await clearStoredSignatureConfirm(selectedDocument.id, nextEntriesForRemote);
      } else {
        await persistDocumentSignatures(selectedDocument.id, nextEntriesForRemote, confirmedDocs[selectedDocument.id] || "");
      }
    } catch (error) {
      console.warn("Reset role signature failed", error);
      window.alert("à¸£à¸µà¹€à¸‹à¹‡à¸•à¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ à¸à¸£à¸¸à¸“à¸²à¸¥à¸­à¸‡à¹ƒà¸«à¸¡à¹ˆà¸­à¸µà¸à¸„à¸£à¸±à¹‰à¸‡");
      return;
    }

    setSignatures((previous) => {
      return {
        ...previous,
        [selectedDocument.id]: nextEntriesForRemote,
      };
    });
    if (role === "Agent") {
      setConfirmedDocs((previous) => {
        const next = { ...previous };
        delete next[selectedDocument.id];
        return next;
      });
    }
  };

  const copySelectedDocumentShareLink = async () => {
    if (!selectedDocument) return;
    const link = createSignatureShareLink(selectedDocument, null);
    try {
      await navigator.clipboard.writeText(link);
      setShareMessage("à¸„à¸±à¸”à¸¥à¸­à¸ Share Link à¹à¸¥à¹‰à¸§");
    } catch {
      window.prompt("à¸„à¸±à¸”à¸¥à¸­à¸ Share Link à¸™à¸µà¹‰", link);
      setShareMessage("à¹à¸ªà¸”à¸‡ Share Link à¸ªà¸³à¸«à¸£à¸±à¸šà¸„à¸±à¸”à¸¥à¸­à¸à¹à¸¥à¹‰à¸§");
    }
    window.setTimeout(() => setShareMessage(""), 3000);
  };

  const copyNextSignerAlert = async () => {
    if (!selectedDocument) return;
    const entries m«ëŒ+Š×®º+º$zzb¥ãÒVffV7F—fTVçG&–W4f÷$Fö2‡6VÆV7FVDFö7VÖVçBÂ6–væGW&W2“°¢6öç7BVæF–æu&öÆW2ÒvWEVæF–æu&öÆW2†VçG&–W2“°¢6öç7BÆFW7E7FGW2ÒVæF–æu&öÆW2æÆVæwF€¢òGµ4”täEU$UôdÄõræÆVæwF‚ÒVæF–æu&öÆW2æÆVæwF‡ÒóB&öÆRŠ^ˆ~‰‹.Š˜Š^˜Šv ¢¢.˜ŠŞˆŠ®‹.Š>Š^ˆ~‰‹.ŠˆNŠ>‰®˜Š^˜Šr#° ¢6öç7BFW‡BÒVæF–æu&öÆW2æÆVæwF€¢ò°¢.˜ˆ˜ˆ~˜‰^‹~ŠŞ‰Š^ˆ~‰‹.Š˜ŠŞˆŠ®‹.Š2–æ6VçF—fR"À¢""À¢˜‰N‹~ŠŞ‰“¢G·6VÆV7FVDFö7VÖVçBæÖöçF„Æ&VÇÖÀ¢vVçC¢G·6VÆV7FVDFö7VÖVçBævVçDæÖWÖÀ¢""À¢Š®‰n‹.‰‹Š^˜‹.Š®‹‰C¢G¶ÆFW7E7FGW7ÖÀ¢.‰Î‹˜‰~‹^˜Š.‹ˆ~‰^˜ŠŞˆ~Š^ˆ~‰‹.Š¢"À¢ââçVæF–æu&öÆW2æÖ‚‡&öÆR’ÓâÒG·&öÆUF†”Æ&VÂ‡&öÆR—Ó¢G¶vWE&öÆU6–væW"‡6VÆV7FVDFö7VÖVçBÂ&öÆR—Ö’À¢""À¢.ˆ‰NŠ^‹Nˆ~ˆ˜Î‰‹^˜˜‰î‹~˜ŠŞ˜‰¾‹N‰N˜ŠŞˆŠ®‹.Š3¢"À¢7&VFU6–væGW&U6†&TÆ–æ²‡6VÆV7FVDFö7VÖVçBÂçVÆÂ’À¢""À¢.Š>‰®ˆŠ~‰˜ˆ.˜‹.Š>‹‰®‰¢6–væGW&R6VçFW"˜‰î‹~˜ŠŞŠ^ˆ~‰‹.ŠˆN˜‹şˆNŠ>‹‰¢"À¢Òæ¦ö–â‚%Æâ"¢¢°¢.˜ˆ˜ˆ~˜‰^‹~ŠŞ‰Š^ˆ~‰‹.Š˜ŠŞˆŠ®‹.Š2–æ6VçF—fR"À¢""À¢˜‰N‹~ŠŞ‰“¢G·6VÆV7FVDFö7VÖVçBæÖöçF„Æ&VÇÖÀ¢vVçC¢G·6VÆV7FVDFö7VÖVçBævVçDæÖWÖÀ¢""À¢.Š®‰n‹.‰‹Š^˜‹.Š®‹‰C¢˜ŠŞˆŠ®‹.Š>Š^ˆ~‰‹.ŠˆNŠ>‰®˜Š^˜Šr"À¢""À¢.ˆ‰NŠ^‹Nˆ~ˆ˜Î‰‹^˜˜‰î‹~˜ŠŞ˜‰¾‹N‰N˜ŠŞˆŠ®‹.Š3¢"À¢7&VFU6–væGW&U6†&TÆ–æ²‡6VÆV7FVDFö7VÖVçBÂçVÆÂ’À¢Òæ¦ö–â‚%Æâ"“° ¢G'’°¢v—Bæf–vF÷"æ6Æ—&ö&Bçw&—FUFW‡B‡FW‡B“°¢6WE6†&TÖW76vR‚$6÷’&VÖ–æFW"ÖW76v^˜Š^˜Šr"“°¢Ò6F6‚°¢v–æF÷rç&ö×B‚.ˆN‹‰NŠ^ŠŞˆˆ.˜ŠŞˆNŠ~‹.Š‰‹^˜˜‰î‹~˜ŠŞ˜ˆ˜ˆ~˜‰^‹~ŠŞ‰’"ÂFW‡B“°¢6WE6†&TÖW76vR‚.˜Š®‰Nˆ~ˆ.˜ŠŞˆNŠ~‹.Š˜ˆ˜ˆ~˜‰^‹~ŠŞ‰Š®‹>Š¾Š>‹‰®ˆN‹‰NŠ^ŠŞˆ˜Š^˜Šr"“°¢Ğ ¢v–æF÷rç6WEF–ÖV÷WB‚‚’Óâ6WE6†&TÖW76vR‚""’Â3“°¢Ó° ¢6öç7B6†&U6–væGW&U7FGW2Ò7–æ2‚’Óâ°¢–b‚6VÆV7FVDFö7VÖVçB’&WGW&ã°¢6öç7BVçG&–W2ÒVffV7F—fTVçG&–W4f÷$Fö2‡6VÆV7FVDFö7VÖVçBÂ6–væGW&W2“°¢6öç7BÆ–æW2Ò4”täEU$UôdÄõræÖ‚‡&öÆR’Óâ°¢6öç7B6–væVBÒvWE6–væVDVçG'’†VçG&–W2Â&öÆR“°¢6öç7Bv—fVBÒvWEv—fVDVçG'’†VçG&–W2Â&öÆR“°¢&WGW&âG·6–væVBÇÂv—fVBò.)É2"¢.)ØÂ'ÒG·&öÆUF†”Æ&VÂ‡&öÆR—Ó¢G·v—fVBò.Š.ˆ˜Š~˜‰Š^‹.Š.˜ˆ¾˜~‰’(	2Š^‹.ŠŞŠŞˆ"¢6–væVBò6–væVBç6–væW$æÖR¢.Š.‹ˆ~˜NŠ˜Š^ˆ~‰‹.Š'Ö°¢Ò“°¢6öç7BVæF–ætÆ–æW2Ò4”täEU$UôdÄõp¢æf–ÇFW"‚‡&öÆR’ÓâvWD6ö×ÆWFVDVçG'’†VçG&–W2Â&öÆR’¢æÖ‚‡&öÆR’ÓâÒG·&öÆUF†”Æ&VÂ‡&öÆR—Ó¢G¶vWE&öÆU6–væW"‡6VÆV7FVDFö7VÖVçBÂ&öÆR—Ö“° ¢6öç7BFW‡BÒ°¢˜ŠŞˆŠ®‹.Š26–væGW&R˜‰N‹~ŠŞ‰’G·6VÆV7FVDFö7VÖVçBæÖöçF„Æ&VÇÖÀ¢vVçC¢G·6VÆV7FVDFö7VÖVçBævVçDæÖWÖÀ¢""À¢.Š®‰n‹.‰‹ˆ‹.Š>Š^ˆ~‰‹.Š¢"À¢ââæÆ–æW2À¢""À¢VæF–ætÆ–æW2æÆVæwF‚ò.‰Î‹˜‰~‹^˜Š.‹ˆ~˜NŠ˜Š^ˆ~‰‹.Š¢"¢.Š®‰n‹.‰‹¢Š^ˆ~‰‹.ŠˆNŠ>‰®˜Š^˜Šr"À¢âââ‡VæF–ætÆ–æW2æÆVæwF‚òVæF–ætÆ–æW2¢µÒ’À¢""À¢VæF–ætÆ–æW2æÆVæwF€¢ò.Š>‰®ˆŠ~‰‰Î‹˜‰~‹^˜Š.‹ˆ~˜NŠ˜Š^ˆ~‰‹.Š˜ˆ.˜‹.Š>‹‰®‰®˜‰î‹~˜ŠŞ˜ˆ¾˜~‰˜ŠŞˆŠ®‹.Š>˜>Š¾˜˜Š>‹^Š.‰®Š>˜ŠŞŠ.ˆN˜‹şˆNŠ>‹‰¢ ¢¢.˜ŠŞˆŠ®‹.Š>‰‹^˜Š^ˆ~‰‹.ŠˆNŠ>‰®˜Š^˜Š~ˆN˜‹şˆNŠ>‹‰¢"À¢Òæ¦ö–â‚%Æâ"“° ¢G'’°¢v—Bæf–vF÷"æ6Æ—&ö&Bçw&—FUFW‡B‡FW‡B“°¢6WE6†&TÖW76vR‚.ˆN‹‰NŠ^ŠŞˆˆ.˜ŠŞˆNŠ~‹.Š˜ˆ®Š>˜Î˜Š^˜Šr"“°¢Ò6F6‚°¢v–æF÷rç&ö×B‚.ˆN‹‰NŠ^ŠŞˆˆ.˜ŠŞˆNŠ~‹.Š‰‹^˜˜‰î‹~˜ŠŞ˜ˆ®Š>˜Â"ÂFW‡B“°¢6WE6†&TÖW76vR‚.˜Š®‰Nˆ~ˆ.˜ŠŞˆNŠ~‹.ŠŠ®‹>Š¾Š>‹‰®ˆN‹‰NŠ^ŠŞˆ˜Š^˜Šr"“°¢Ğ ¢v–æF÷rç6WEF–ÖV÷WB‚‚’Óâ6WE6†&TÖW76vR‚""’Â3“°¢Ó° ¢6öç7B&W6WDFö7VÖVçBÒ‚’Óâ°¢–b‚6VÆV7FVDFö7VÖVçBÇÂ—4†—7F÷&–6Å–EW&–öB‡6VÆV7FVDFö7VÖVçBæÖöçF„¶W’’’&WGW&ã°¢6WE6–væGW&W2‚‡&Wf–÷W2’Óâ°¢6öç7BæW‡BÒ²ââç&Wf–÷W2Ó°¢FVÆWFRæW‡E·6VÆV7FVDFö7VÖVçBæ–EÓ°¢&WGW&âæW‡C°¢Ò“°¢6WD6öæf—&ÖVDFö72‚‡&Wf–÷W2’Óâ°¢6öç7BæW‡BÒ²ââç&Wf–÷W2Ó°¢FVÆWFRæW‡E·6VÆV7FVDFö7VÖVçBæ–EÓ°¢&WGW&âæW‡C°¢Ò“°¢fö–B6ÆV%7F÷&VE6–væGW&T6öæf—&Ò‡6VÆV7FVDFö7VÖVçBæ–BÂµÒ’æ6F6‚‚†W'&÷"’Óâ°¢6öç6öÆRçv&â‚%&W6WB&VÖ÷FR6–væGW&RFö7VÖVçBf–ÆVB"ÂW'&÷"“°¢Ò“°¢Ó° ¢6öç7BvVæW&FUFbÒ7–æ2‚’Óâ°¢–b‚6VÆV7FVDFö7VÖVçB’&WGW&ã°¢°¢òòF†R6–væGW&R6VçFW"'WGFöâW6W2F†—26†&VB&VæFW&W"2—G2öæÇ’7F—fP¢òòf–æÂ6–væVBDbF‚â¶VWF†RÆVv7’–æÆ–æR&VæFW&W"&VÆ÷rVç&V6†&ÆP¢òòVçF–Â—B6â&R&VÖ÷fVBv—F†÷WB6†æv–ærVç&VÆFVBvVæW&FVBDg2à¢6öç7B6†&VDVçG&–W2ÒVffV7F—fTVçG&–W4f÷$Fö2‡6VÆV7FVDFö7VÖVçBÂ6–væGW&W2“°¢6öç7B6†&VD–æ6VçF—fRÒvWDFö7VÖVçD–æ6VçF—fR‡6VÆV7FVDFö7VÖVçB“°¢6öç7B6†&VDFö7VÖVçE&VbÒvWDÖöçF†Ç”Fö7VÖVçE&Vb‡6VÆV7FVDFö7VÖVçBÂFö7VÖVçG2“°¢6öç7B6†&VE&W7VÇBÒv—B&VæFW$f–æÅ6–væVEFb‡°¢Fö7VÖVçC¢6VÆV7FVDFö7VÖVçBÀ¢VçG&–W3¢6†&VDVçG&–W2À¢–æ6VçF—fS¢6†&VD–æ6VçF—fRÀ¢Fö7VÖVçE&Vc¢6†&VDFö7VÖVçE&VbÀ¢&öÆU6–væW$æÖW3¢°¢¢vWE&öÆU6–væW"‡6VÆV7FVDFö7VÖVçBÂ%"’À¢7WW'f—6÷#¢vWE&öÆU6–væW"‡6VÆV7FVDFö7VÖVçBÂ%7WW'f—6÷""’À¢6Væ–÷#¢vWE&öÆU6–væW"‡6VÆV7FVDFö7VÖVçBÂ%6Væ–÷""’À¢vVçC¢vWE&öÆU6–væW"‡6VÆV7FVDFö7VÖVçBÂ$vVçB"’À¢ÒÀ¢Ò“°¢F÷væÆöD&Æö"‡6†&VE&W7VÇBçFbæ÷WGWB‚&&Æö""’Â6†&VE&W7VÇBæf–ÆTæÖR“°¢6WEFdÖW76vR†vVæW&FVBG·6†&VE&W7VÇBæf–ÆTæÖWÖ“°¢v–æF÷rç6WEF–ÖV÷WB‚‚’Óâ6WEFdÖW76vR‚""’Â3S“°¢&WGW&ã°¢Ğ¢6öç7BVçG&–W2ÒVffV7F—fTVçG&–W4f÷$Fö2‡6VÆV7FVDFö7VÖVçBÂ6–væGW&W2“°¢6öç7B–æF—f–GVÄ–æ6VçF—fRÒvWDFö7VÖVçD–æ6VçF—fR‡6VÆV7FVDFö7VÖVçB“°¢6öç7BæVVDÖ÷&UFõF&vWBÒÖF‚æÖ‚„44UõD$tUBÒ6VÆV7FVDFö7VÖVçBæ66T6÷VçBÂ“°¢Ú±î¸Â¸­yêë¢°k¢G§¦*^const pdf = new jsPDF({ unit: "mm", format: "a4" });

    try {
      registerTHSarabunNew(pdf);
      pdf.setFont("THSarabunNew", "normal");
    } catch {}

    {
      const pageW = 210;
      const pageH = 297;
      const left = 10;
      const tableW = 186;
      const bottom = 289;
      const purple: [number, number, number] = [112, 48, 160];
      const purpleDark: [number, number, number] = [91, 44, 131];
      const lightPurple: [number, number, number] = [204, 193, 218];
      const palePurple: [number, number, number] = [248, 242, 251];
      const border: [number, number, number] = [184, 184, 184];
      const black: [number, number, number] = [18, 24, 38];
      const muted: [number, number, number] = [71, 85, 105];
      const good: [number, number, number] = [5, 150, 105];
      const warn: [number, number, number] = [180, 83, 9];
      const templateWidths = [15.36, 35.36, 12.27, 34.73, 19.91, 24.09, 30.36, 8, 25.36, 25.91];
      const widthScale = tableW / templateWidths.reduce((sum, value) => sum + value, 0);
      const colX = templateWidths.reduce<number[]>((acc, width) => {
        acc.push(acc[acc.length - 1] + width * widthScale);
        return acc;
      }, [left]);
      let y = 10;

      const setTemplateFont = (
        size: number,
        bold = false,
        color: [number, number, number] = black
      ) => {
        try {
          pdf.setFont("THSarabunNew", bold ? "bold" : "normal");
        } catch {}
        pdf.setFontSize(size);
        pdf.setTextColor(color[0], color[1], color[2]);
      };

      const columnX = (startCol: number) => colX[Math.max(0, Math.min(startCol, colX.length - 1))];
      const columnW = (startCol: number, endColExclusive: number) =>
        colX[Math.max(0, Math.min(endColExclusive, colX.length - 1))] - columnX(startCol);

      const fitLines = (value: unknown, width: number, fontSize: number, maxLines: number) => {
        setTemplateFont(fontSize);
        const rawLines = pdf.splitTextToSize(String(value ?? "-"), Math.max(4, width - 3));
        if (rawLines.length <= maxLines) return rawLines;
        const lines = rawLines.slice(0, maxLines);
        const last = String(lines[lines.length - 1] || "");
        lines[lines.length - 1] = last.length > 2 ? `${last.slice(0, Math.max(1, last.length - 2))}...` : "...";
        return lines;
      };

      const drawCell = (
        x: number,
        cellY: number,
        w: number,
        h: number,
        value: unknown,
        fill: [number, number, number],
        options: {
          bold?: boolean;
          color?: [number, number, number];
          size?: number;
          align?: "left" | "center" | "right";
          valign?: "top" | "middle";
          maxLines?: number;
          lineHeight?: number;
        } = {}
      ) => {
        const size = options.size ?? 8;
        const align = options.align ?? "left";
        const color = options.color ?? black;
        const maxLines = options.maxLines ?? 2;
        const lineHeight = options.lineHeight ?? size * 0.42 + 1.35;
        pdf.setLineWidth(0.15);
        pdf.setDrawColor(border[0], border[1], border[2]);
        pdf.setFillColor(fill[0], fill[1], fill[2]);
        pdf.rect(x, cellY, w, h, "FD");
        const lines = fitLines(value, w, size, maxLines);
        setTemplateFont(size, options.bold ?? false, color);
        const textX = align === "center" ? x + w / 2 : align === "right" ? x + w - 2 : x + 2;
        const textY =
          options.valign === "top"
            ? cellY + 4.2
            : cellY + h / 2 - ((lines.length - 1) * lineHeight) / 2 + size * 0.22;
        lines.forEach((lineText: string, index: number) => {
          pdf.text(lineText, textX, textY + index * lineHeight, { align });
        });
      };

      const drawCellCols = (
        startCol: number,
        endColExclusive: number,
        cellY: number,
        h: number,
        value: unknown,
        fill: [number, number, number],
        options: Parameters<typeof drawCell>[6] = {}
      ) => drawCell(columnX(startCol), cellY, columnW(startCol, endColExclusive), h, value, fill, options);

      const drawCellsByWidth = (
        startX: number,
        cellY: number,
        h: number,
        cells: Array<{
          value: unknown;
          width: number;
          fill: [number, number, number];
          options?: Parameters<typeof drawCell>[6];
        }>
      ) => {
        let cursorX = startX;
        cells.forEach((cell) => {
          drawCell(cursorX, cellY, cell.width, h, cell.value, cell.fill, cell.options);
          cursorX += cell.width;
        });
      };

      const drawHeader = (title: string, subtitle: string) => {
        drawCell(left, y, tableW, 9.2, title, purple, {
          bold: true,
          color: [255, 255, 255],
          size: 15.6,
          align: "left",
          maxLines: 1,
        });
        y += 9.2;
        drawCell(left, y, tableW, 7.0, subtitle, purple, {
          bold: true,
          color: [255, 255, 255],
          size: 9.0,
          align: "left",
          maxLines: 1,
        });
        y += 8.2;
      };

      const drawSection = (title: string) => {
        if (y + 10 > bottom) {
          pdf.addPage();
          y = 10;
        }
        drawCell(left, y, tableW, 7.2, title, purple, {
          bold: true,
          color: [255, 255, 255],
          size: 10.0,
          align: "left",
          maxLines: 1,
        });
        y += 8.0;
      };

      const drawLabelValue = (
        labelStart: number,
        labelEnd: number,
        valueStart: number,
        valueEnd: number,
        label: string,
        value: unknown,
        rowY: number,
        h: number,
        valueOptions: Parameters<typeof drawCell>[6] = {}
      ) => {
        drawCellCols(labelStart, labelEnd, rowY, h, label, purple, {
          bold: true,
          color: [255, 255, 255],
          size: 8.4,
          align: "center",
          maxLines: 2,
        });
        drawCellCols(valueStart, valueEnd, rowY, h, value, lightPurple, {
          bold: true,
          size: 8.8,
          align: "center",m«ëŒ+Š×®º+º$zzb¥à¢Ö„Æ–æW3¢"À¢ââçfÇVT÷F–öç2À¢Ò“°¢Ó° ¢6öç7BF÷–4ÖÒæWrÖÀ¢7G&–ærÀ¢°¢6öFS¢7G&–æs°¢F—FÆS¢7G&–æs°¢66÷&U7VÓ¢çVÖ&W#°¢Ö…7VÓ¢çVÖ&W#°¢6÷VçC¢çVÖ&W#°¢Ö…fÇVW3¢6WCÆçVÖ&W#ã°¢Ğ¢â‚“° ¢6VÆV7FVDFö7VÖVçBæ66W2æf÷$V6‚‚†—FVÒ’Óâ°¢†—FVÒçF÷–72ÇÂµÒ’æf÷$V6‚‚‡F÷–2’Óâ°¢6öç7B6öFRÒæ÷&ÖÆ—¦UFW‡B‡F÷–2æ6öFR“°¢6öç7BF—FÆRÒæ÷&ÖÆ—¦UFW‡B‡F÷–2çF—FÆR“°¢6öç7B66÷&RÒçVÖ&W"‡F÷–2ç66÷&RÇÂ“°¢6öç7BÖ‚ÒçVÖ&W"‡F÷–2æÖ‚ÇÂ“°¢–b‚6öFRÇÂF—FÆRÇÂçVÖ&W"æ—4f–æ—FR‡66÷&R’ÇÂçVÖ&W"æ—4f–æ—FR†Ö‚’ÇÂÖ‚ÃÒ’&WGW&ã° ¢6öç7B¶W’Ò6öFRÇÂæ÷&ÖÆ—¦T¶W’‡F—FÆR“°¢6öç7B7W'&VçBÒF÷–4ÖævWB†¶W’’ÇÂ°¢6öFRÀ¢F—FÆRÀ¢66÷&U7VÓ¢À¢Ö…7VÓ¢À¢6÷VçC¢À¢Ö…fÇVW3¢æWr6WCÆçVÖ&W#â‚’À¢Ó°¢7W'&VçBçF—FÆRÒ7W'&VçBçF—FÆRÇÂF—FÆS°¢7W'&VçBç66÷&U7VÒ³Ò66÷&S°¢7W'&VçBæÖ…7VÒ³ÒÖƒ°¢7W'&VçBæ6÷VçB³Ò°¢7W'&VçBæÖ…fÇVW2æFB†Ö‚“°¢F÷–4Öç6WB†¶W’Â7W'&VçB“°¢Ò“°¢Ò“° ¢6öç7BF÷–57FG2Ò'&’æg&öÒ‡F÷–4ÖçfÇVW2‚’¢æÖ‚†—FVÒ’Óâ°¢6öç7Bfu66÷&RÒ—FVÒæ6÷VçBò—FVÒç66÷&U7VÒò—FVÒæ6÷VçB¢çVÆÃ°¢6öç7BftÖ‚Ò—FVÒæ6÷VçBò—FVÒæÖ…7VÒò—FVÒæ6÷VçB¢°¢6öç7BÖ‚Ò—FVÒæÖ…fÇVW2ç6—¦RÓÓÒò'&’æg&öÒ†—FVÒæÖ…fÇVW2•³Ò¢ftÖƒ°¢6öç7BfuW&6VçBÒfu66÷&RÓÒçVÆÂbbftÖ‚âò†fu66÷&RòftÖ‚’¢¢çVÆÃ°¢&WGW&â°¢6öFS¢—FVÒæ6öFRÀ¢F—FÆS¢—FVÒçF—FÆRÀ¢fu66÷&RÀ¢Ö‚À¢fuW&6VçBÀ¢Ó°¢Ò¢ç6÷'B‚†Â"’Óà¢æ6öFRæÆö6ÆT6ö×&R†"æ6öFRÂVæFVf–æVBÂ²çVÖW&–3¢G'VRÂ6Vç6—F—f—G“¢&&6R"Ò’ÇÀ¢çF—FÆRæÆö6ÆT6ö×&R†"çF—FÆRÂ'F‚"¢“°¢6öç7BF÷–5&÷w5v—F…66÷&RÒF÷–57FG2æf–ÇFW"‚†—FVÒ’Óâ—FVÒæfuW&6VçBÓÒçVÆÂ“°¢6öç7B&W7EF÷–2ÒF÷–5&÷w5v—F…66÷&RæÆVæwF€¢ò²ââçF÷–5&÷w5v—F…66÷&UÒç6÷'B‚†Â"’ÓâçVÖ&W"†"æfuW&6VçB’ÒçVÖ&W"†æfuW&6VçB’•³Ğ¢¢çVÆÃ°¢6öç7BÆ÷vW7EF÷–2ÒF÷–5&÷w5v—F…66÷&RæÆVæwF€¢ò²ââçF÷–5&÷w5v—F…66÷&UÒç6÷'B‚†Â"’ÓâçVÖ&W"†æfuW&6VçB’ÒçVÖ&W"†"æfuW&6VçB’•³Ğ¢¢çVÆÃ° ¢6öç7B6–væVE&öÆW2Ò4”täEU$UôdÄõræf–ÇFW"‚‡&öÆR’Óâ&ööÆVâ†vWD6ö×ÆWFVDVçG'’†VçG&–W2Â&öÆR’’’æÆVæwFƒ°¢6öç7B7&—F–6Ä66W2Ò°¢6öç7BFö7VÖVçE7FGW2Ò—46ö×ÆWFRò$6ö×ÆWFVB6–væGW&R"¢$–æ6ö×ÆWFR6–væGW&R#°¢6öç7BFdFö7VÖVçE&VbÒvWDÖöçF†Ç”Fö7VÖVçE&Vb‡6VÆV7FVDFö7VÖVçBÂFö7VÖVçG2“°¢6öç7B–æ6VçF—fUFW‡BĞ¢çVÖ&W"†–æF—f–GVÄ–æ6VçF—fRç&öÖòÇÂ’â ¢òG¶–æF—f–GVÄ–æ6VçF—fRæÆ&VÂÇÂ$æò–æ6VçF—fR'ÕÆä66‚G¶f÷&ÖD&‡DÖ÷VçB†–æF—f–GVÄ–æ6VçF—fRæ66‚ÇÂ—Òò&öÖòG¶f÷&ÖD&‡DÖ÷VçB†–æF—f–GVÄ–æ6VçF—fRç&öÖòÇÂ—Ö ¢¢G¶–æF—f–GVÄ–æ6VçF—fRæÆ&VÂÇÂG¶f÷&ÖD&‡DÖ÷VçB†–æF—f–GVÄ–æ6VçF—fRæ66‚ÇÂ—ÒD„&Ö° ¢G&t†VFW"€¢$ÖöçF†Ç’F6†&ö&B"À¢$ÖöçF†Ç’F6†&ö&Bf÷"F†R6VÆV7FVBvVçBæB6VÆV7FVBÖöçF‚âfÇVW2&RvVæW&FVBg&öÒF†R7W'&VçB7—7FVÒâ ¢“° ¢G&u6V7F–öâ‚$7W'&VçBf–Wr"“°¢G&tÆ&VÅfÇVRƒÂÂÂ2Â$vVçB"Â6VÆV7FVDFö7VÖVçBævVçDæÖRÂ’ÂãÂ²Ö„Æ–æW3¢"Ò“°¢G&tÆ&VÅfÇVRƒ2ÂBÂBÂbÂ$ÖöçF‚"Â6VÆV7FVDFö7VÖVçBæÖöçF„Æ&VÂÂ’Âã“°¢G&tÆ&VÅfÇVRƒbÂrÂrÂ‚Â%&Wf–WvVB66W2"Â6VÆV7FVDFö7VÖVçBæ66T6÷VçBÂ’Âã“°¢G&tÆ&VÅfÇVRƒ‚Â’Â’ÂÂ$7&—F–6Â66W2"Â7&—F–6Ä66W2Â’Âã“°¢’³Òã° ¢G&t6VÆÄ6öÇ2ƒÂ2Â’ÂrãBÂ$66W2&Wf–WvVB"ÂW'ÆRÂ°¢&öÆC¢G'VRÀ¢6öÆ÷#¢³#SRÂ#SRÂ#SUÒÀ¢6—¦S¢‚ãrÀ¢Æ–vã¢&6VçFW""À¢Ò“°¢G&t6VÆÄ6öÇ2ƒ2ÂbÂ’ÂrãBÂ$æVVBÖ÷&RFò"ÂW'ÆRÂ°¢&öÆC¢G'VRÀ¢6öÆ÷#¢³#SRÂ#SRÂ#SUÒÀ¢6—¦S¢‚ãrÀ¢Æ–vã¢&6VçFW""À¢Ò“°¢G&t6VÆÄ6öÇ2ƒbÂ’Â’ÂrãBÂ$fW&vR66÷&R"ÂW'ÆRÂ°¢&öÆC¢G'VRÀ¢6öÆ÷#¢³#SRÂ#SRÂ#SUÒÀ¢6—¦S¢‚ãrÀ¢Æ–vã¢&6VçFW""À¢Ò“°¢G&t6VÆÄ6öÇ2ƒ’ÂÂ’ÂrãBÂ$ÖöçF†Ç’w&FR"ÂW'ÆRÂ°¢&öÆC¢G'VRÀ¢6öÆ÷#¢³#SRÂ#SRÂ#SUÒÀ¢6—¦S¢‚ãrÀ¢Æ–vã¢&6VçFW""À¢Ö„Æ–æW3¢"À¢Ò“°¢’³ÒrãC°¢G&t6VÆÄ6öÇ2ƒÂ2Â’Âã‚ÂG·6VÆV7FVDFö7VÖVçBæ66T6÷VçGÒòG´44UõD$tUGÖÂÆ–v‡EW'ÆRÂ°¢&öÆC¢G'VRÀ¢6—¦S¢2ãÀ¢Æ–vã¢&6VçFW""À¢Ö„Æ–æW3¢À¢Ò“°¢G&t6VÆÄ6öÇ2ƒ2ÂbÂ’Âã‚ÂæVVDÖ÷&UFõF&vWBÂÆ–v‡EW'ÆRÂ°¢&öÆC¢G'VRÀ¢6—¦S¢2ãÀ¢Æ–vã¢&6VçFW""À¢Ö„Æ–æW3¢À¢Ò“°¢G&t6VÆÄ6öÇ2ƒbÂ’Â’Âã‚Â6VÆV7FVDFö7VÖVçBæfW&vU66÷&RçFôf—†VBƒ"’ÂÆ–v‡EW'ÆRÂ°¢&öÆC¢G'VRÀ¢6—¦S¢2ãÀ¢Æ–vã¢&6VçFW""À¢6öÆ÷#¢6VÆV7FVDFö7VÖVçBæfW&vU66÷&RãÒƒòvööB¢v&âÀ¢Ö„Æ–æW3¢À¢Ò“°¢G&t6VÆÄ6öÇ2ƒ’ÂÂ’Âã‚Â6VÆV7FVDFö7VÖVçBæw&FRÂÆ–v‡EW'ÆRÂ°¢&öÆC¢G'VRÀ¢6—¦S¢2ãÀ¢Æ–vã¢&6VçFW""À¢Ö„Æ–æW3¢À¢Ò“°¢’³Ò2ã° ¢G&u6V7F–öâ‚$–æ6VçF—fR7VÖÖ'’"“°¢G&t6VÆÄ6öÇ2ƒÂ2Â’ÂrãBÂ$–æ6VçF—fR"ÂW'ÆRÂ°¢&öÆC¢G'VRÀ¢6öÆ÷#¢³#SRÂ#SRÂ#SUÒÀ¢6—¦S¢‚ãrÀ¢Æ–vã¢&6VçFW""À¢Ò“°¢G&t6VÆÄ6öÇ2ƒ2ÂbÂ’ÂrãBÂ$&W7BF÷–2"ÂW'ÆRÂ°¢&öÆC¢G'VRÀ¢6öÆ÷#¢³#SRÂ#SRÂ#SUÒÀ¢6—¦S¢‚ãrÀ¢Æ–vã¢&6VçFW""À¢Ò“°¢G&t6VÆÄ6öÇ2ƒbÂÂ’ÂrãBÂ$Æ÷vW7BF÷–2"ÂW'ÆRÂ°¢&öÆC¢G'VRÀ¢6öÆ÷#¢³#SRÂ#SRÂ#SUÒÀ¢6—¦S¢‚ãrÀ¢Æ–vã¢&6VçFW""À¢Ò“°¢’³ÒrãC°¢G&t6VÆÄ6öÇ2ƒÂ2Â’Â"ãÂ–æ6VçF—fUFW‡BÂÆ–v‡EW'ÆRÂ°¢&öÆC¢G'VRÀ¢6—¦S¢‚ã‚À¢Æ–vã¢&6VçFW""À¢Ö„Æ–æW3¢"À¢Ò“°¢G&t6VÆÄ6öÇ2ƒ2ÂbÂ’Â"ãÂ&W7EF÷–2òG¶&W7EF÷–2çF—FÆWÕÆâG´çVÖ&W"†&W7EF÷–2æfuW&6VçB’çFôf—†VBƒ"—ÒV¢"Ò"ÂÆ–v‡EW'ÆRÂ°¢&öÆC¢G'VRÀ¢6—¦S¢‚ã2À¢Æ–vã¢&6VçFW""À¢Ö„Æ–æW3¢"À¢Ò“°¢G&t6VÆÄ6öÇ2ƒbÂÂ’Â"ãÂÆ÷vW7EF÷–2òG¶Æ÷vW7EF÷–6Ú±î¸Â¸­yêë¢°k¢G§¦*^.title}\n${Number(lowestTopic.avgPercent).toFixed(2)}%` : "-", lightPurple, {
        bold: true,
        size: 8.3,
        align: "center",
        maxLines: 2,
      });
      y += 14.0;

      drawSection("Monthly Case List");
      const caseColWidths = [10, 23, 24, 96, 16, 8, 9];
      drawCellsByWidth(
        left,
        y,
        7.4,
        ["Seq", "Case Date", "Case ID", "Inquiry", "Score", "Grade", "Critical"].map((label, index) => ({
          value: label,
          width: caseColWidths[index],
          fill: purple,
          options: {
            bold: true,
            color: [255, 255, 255],
            size: 7.8,
            align: "center",
            maxLines: 1,
          },
        }))
      );
      y += 7.4;
      for (let index = 0; index < CASE_TARGET; index += 1) {
        const item = selectedDocument.cases[index];
        const rowH = 8.4;
        const fill: [number, number, number] = index % 2 === 0 ? [255, 255, 255] : [250, 247, 253];
        drawCellsByWidth(left, y, rowH, [
          { value: index + 1, width: caseColWidths[0], fill, options: { size: 7.5, align: "center", bold: true, maxLines: 1 } },
          { value: item?.auditDate || "-", width: caseColWidths[1], fill, options: { size: 7.1, align: "center", bold: true, maxLines: 1 } },
          { value: item?.caseId || "-", width: caseColWidths[2], fill, options: { size: 7.1, align: "center", bold: true, maxLines: 1 } },
          { value: item?.inquiry || "-", width: caseColWidths[3], fill, options: { size: 7.0, align: "left", bold: true, maxLines: 2, lineHeight: 3.55 } },
          { value: item ? item.finalScore.toFixed(2) : "-", width: caseColWidths[4], fill, options: { size: 7.5, align: "center", bold: true, maxLines: 1 } },
          { value: item?.grade || "-", width: caseColWidths[5], fill, options: { size: 7.5, align: "center", bold: true, maxLines: 1 } },
          { value: "NO", width: caseColWidths[6], fill, options: { size: 7.0, align: "center", bold: true, maxLines: 1 } },
        ]);
        y += rowH;
      }

      y += 3;
      drawSection("Monthly Topic Performance");
      const drawTopicHeader = () => {
        [
          [0, 1, "Topic"],
          [1, 4, "Description"],
          [4, 6, "Avg Score"],
          [6, 7, "Max"],
          [7, 10, "Avg %"],
        ].forEach(([start, end, label]) => {
          drawCellCols(Number(start), Number(end), y, 7.4, String(label), purple, {
            bold: true,
            color: [255, 255, 255],
            size: 8.0,
            align: "center",
            maxLines: 1,
          });
        });
        y += 7.4;
      };
      const formatMetric = (value: number | null) => (value === null || !Number.isFinite(value) ? "-" : value.toFixed(2));
      const formatTopicMax = (value: number) =>
        Number.isFinite(value) ? (Number.isInteger(value) ? String(value) : value.toFixed(2)) : "-";

      drawTopicHeader();
      if (!topicStats.length) {
        drawCell(left, y, tableW, 8.8, "No topic score data for this document", [250, 247, 253], {
          size: 8.2,
          align: "center",
          bold: true,
          color: muted,
          maxLines: 1,
        });
        y += 8.8;
      } else {
        topicStats.forEach((item, index) => {
          const topicRowH = 8.0;
          if (y + topicRowH > bottom - 4) {
            pdf.addPage();
            y = 10;
            drawSection("Monthly Topic Performance (continued)");
            drawTopicHeader();
          }
          const fill: [number, number, number] = index % 2 === 0 ? [255, 255, 255] : [250, 247, 253];
          drawCellCols(0, 1, y, topicRowH, item.code, fill, { size: 7.8, align: "center", bold: true, maxLines: 1 });
          drawCellCols(1, 4, y, topicRowH, item.title, fill, { size: 7.4, align: "left", bold: true, maxLines: 1 });
          drawCellCols(4, 6, y, topicRowH, formatMetric(item.avgScore), fill, { size: 7.8, align: "center", bold: true, maxLines: 1 });
          drawCellCols(6, 7, y, topicRowH, formatTopicMax(item.max), fill, { size: 7.8, align: "center", bold: true, maxLines: 1 });
          drawCellCols(7, 10, y, topicRowH, item.avgPercent === null ? "-" : `${item.avgPercent.toFixed(2)}%`, fill, {
            size: 7.8,
            align: "center",
            bold: true,
            maxLines: 1,
          });
          y += topicRowH;
        });
      }

      y += 3;
      drawSection("Acknowledgement / Signature");
      drawCell(left, y, tableW, 5.4, "à¸£à¸±à¸šà¸—à¸£à¸²à¸šà¸œà¸¥à¸à¸²à¸£à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¸›à¸£à¸°à¸ˆà¸³à¹€à¸”à¸·à¸­à¸™ à¹‚à¸”à¸¢à¸¥à¸‡à¸™à¸²à¸¡à¸•à¸²à¸¡à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¸”à¹‰à¸²à¸™à¸¥à¹ˆà¸²à¸‡", [255, 255, 255], {
        size: 7.2,
        align: "left",
        color: muted,
        maxLines: 1,
      });
      y += 6.2;

      const signerName = (role: SignRole) => {
        const signed = getSignedEntry(entries, role);
        return getRoleSigner(selectedDocument, role) || signed?.signerName || signed?.signedBy || "-";
      };
      const signerDate = (role: SignRole) => {
        const signed = getSignedEntry(entries, role);
        return signed ? formatDateTime(signed.signedAt) : "";
      };
      const signatureData = (role: SignRole) => getSignedEntry(entries, role)?.signatureDataUrl || "";
      const normalizedSignatures = new Map<SignRole, string>();
      for (const role of SIGNATURE_FLOW) {
        const signature = signatureData(role);
        normalizedSignatures.set(role, signature ? await normalizeSignatureDataUrl(signature) : "");
      }
      const signatureBlockHeight = 74;
      if (y + signatureBlockHeight > bottom - 5) {
        pdf.addPage();
        y = 12;
      }

      const drawDottedLine = (x1: number, lineY: number, x2: number) => {
        pdf.setDrawColor(108, 96, 128);
        pdf.setLineWidth(0.12);
        const dashedPdf = pdf as jsPDF & {
          setLineDashPattern?: (dashArray: number[], dashPhase: number) => jsPDF;
        };
        dashedPdf.setLineDashPattern?.([0.55, 0.65], 0);
        pdf.line(x1, lineY, x2, lineY);
        dashedPdf.setLineDashPattern?.([], 0);
      };

      const drawSignedLine = m«ëŒ+Š×®º+º$zzb¥â†Æ&VÃ¢7G&–ærÂ6VçFW%ƒ¢çVÖ&W"ÂÆ–æU“¢çVÖ&W"ÂfÇVRÒ""’Óâ°¢6öç7BÆ&VÅ‚Ò6VçFW%‚Ò#°¢6öç7BÆ–æU7F'BÒ6VçFW%‚Òƒ°¢6öç7BÆ–æTVæBÒ6VçFW%‚²#S°¢6WEFV×ÆFTföçBƒbãÂfÇ6RÂ×WFVB“°¢FbçFW‡B†Æ&VÂÂÆ&VÅ‚ÂÆ–æU’Òã#RÂ²Æ–vã¢'&–v‡B"Ò“°¢G&tF÷GFVDÆ–æR†Æ–æU7F'BÂÆ–æU’ÂÆ–æTVæB“°¢–b‡fÇVR’°¢6WEFV×ÆFTföçBƒRã’ÂG'VRÂ&Æ6²“°¢FbçFW‡B‡fÇVRÂ†Æ–æU7F'B²Æ–æTVæB’ò"ÂÆ–æU’Òã3RÂ²Æ–vã¢&6VçFW""Ò“°¢Ğ¢Ó° ¢6öç7BG&u6–væGW&UæVÂÒ€¢ƒ¢çVÖ&W"À¢æVÅ“¢çVÖ&W"À¢s¢çVÖ&W"À¢&öÆS¢6–vå&öÆRÀ¢&öÆUF—FÆS¢7G&–æp¢’Óâ°¢G&t6VÆÂ‡‚ÂæVÅ’ÂrÂRã"Â&öÆUF—FÆRÂW'ÆRÂ°¢&öÆC¢G'VRÀ¢6öÆ÷#¢³#SRÂ#SRÂ#SUÒÀ¢6—¦S¢rãÀ¢Æ–vã¢&6VçFW""À¢Ö„Æ–æW3¢À¢Ò“°¢6öç7B6–væGW&T&V’ÒæVÅ’²Rã#°¢6öç7B6–væGW&T&V‚ÒBã#°¢6öç7B6–väÆ–æU’Ò6–væGW&T&V’²’ã“°¢6öç7B6VçFW%‚Ò‚²rò#°¢G&t6VÆÂ‡‚Â6–væGW&T&V’ÂrÂ6–væGW&T&V‚Â""ÂÆUW'ÆRÂ²6—¦S¢bÂÆ–vã¢&6VçFW""Ò“°¢G&u6–væVDÆ–æR‚.Š^ˆ~ˆ®‹~˜ŠÒ"Â6VçFW%‚Â6–väÆ–æU’“°¢6öç7B6–væGW&RÒæ÷&ÖÆ—¦VE6–væGW&W2ævWB‡&öÆR’ÇÂ"#°¢–b‡6–væGW&R’°¢G'’°¢6öç7B–ÖvU&÷2ÒFbævWD–ÖvU&÷W'F–W2‡6–væGW&R“°¢6öç7B&F–òÒ–ÖvU&÷2çv–GF‚bb–ÖvU&÷2æ†V–v‡Bò–ÖvU&÷2çv–GF‚ò–ÖvU&÷2æ†V–v‡B¢C°¢6öç7BÖ„–ÖvUrÒÖF‚æÖ–â‡rÒ3‚ÂCb“°¢6öç7BÖ„–ÖvT‚Ò’ãc°¢ÆWB–ÖvUrÒÖ„–ÖvUs°¢ÆWB–ÖvT‚Ò–ÖvUrò&F–ó°¢–b†–ÖvT‚âÖ„–ÖvT‚’°¢–ÖvT‚ÒÖ„–ÖvTƒ°¢–ÖvUrÒ–ÖvT‚¢&F–ó°¢Ğ¢FbæFD–ÖvR‡6–væGW&RÂ%är"Â6VçFW%‚Ò–ÖvUrò"Â6–väÆ–æU’Ò–ÖvT‚²ã’Â–ÖvUrÂ–ÖvT‚“°¢Ò6F6‚°¢6WEFV×ÆFTföçBƒbãÂfÇ6RÂ×WFVB“°¢FbçFW‡B‚%6–væGW&R–ÖvRVæf–Æ&ÆR"Â6VçFW%‚Â6–väÆ–æU’ÒãRÂ²Æ–vã¢&6VçFW""Ò“°¢Ğ¢Ğ¢G&t6VÆÂ‡‚ÂæVÅ’²’ãBÂrÂBã"Â6–væW$æÖR‡&öÆR’Â³#SRÂ#SRÂ#SUÒÂ°¢&öÆC¢G'VRÀ¢6—¦S¢bãBÀ¢Æ–vã¢&6VçFW""À¢Ö„Æ–æW3¢À¢Ò“°¢G&t6VÆÂ‡‚ÂæVÅ’²#2ãbÂrÂ2ã‚Â&öÆUF—FÆRÂ³#SRÂ#SRÂ#SUÒÂ°¢6—¦S¢Rã‚À¢Æ–vã¢&6VçFW""À¢Ö„Æ–æW3¢À¢Ò“°¢G&t6VÆÂ‡‚ÂæVÅ’²#rãBÂrÂBãbÂ""Â³#SRÂ#SRÂ#SUÒÂ²6—¦S¢Rã‚ÂÆ–vã¢&6VçFW""Ò“°¢G&u6–væVDÆ–æR‚.Š~‹‰‰~‹^˜‚"Â6VçFW%‚ÂæVÅ’²3ã2Â6–væW$FFR‡&öÆR’“°¢Ó° ¢6öç7B†ÆerÒF&ÆUrò"Ò3°¢G&u6–væGW&UæVÂ†ÆVgBÂ’Â†ÆerÂ$vVçB"Â$vVçB‰Î‹˜‰n‹ˆ‰¾Š>‹˜Š‹N‰’"“°¢G&u6–væGW&UæVÂ†ÆVgB²†Æer²bÂ’Â†ÆerÂ%6Væ–÷""Â%6Væ–÷"Š¾‹Š~Š¾‰˜‹.‰~‹^Š‰Î‹˜‰n‹ˆ‰¾Š>‹˜Š‹N‰’"“°¢’³Ò3RãS°¢G&u6–væGW&UæVÂ†ÆVgBÂ’Â†ÆerÂ%7WW'f—6÷""Â%7WW'f—6÷"Š¾‹Š~Š¾‰˜‹.˜‰Î‰ˆ"“°¢G&u6–væGW&UæVÂ†ÆVgB²†Æer²bÂ’Â†ÆerÂ%"Â%‰Î‹˜‰^Š>Š~ˆŠ®ŠŞ‰¢"“° ¢6WEFV×ÆFTföçBƒrãÂfÇ6RÂ×WFVB“°¢FbçFW‡B€¢Fö7VÖVçB&VbâG·FdFö7VÖVçE&VgÒÂvVæW&FVC¢G¶f÷&ÖDFFUF–ÖR†æWrFFR‚’çFô•4õ7G&–ær‚’—ÒÂG¶Fö7VÖVçE7FGW7ÒÂ6–væVC¢G·6–væVE&öÆW7ÒòGµ4”täEU$UôdÄõræÆVæwF‡ÖÀ¢ÆVgB²F&ÆUrÀ¢vT‚ÒRãBÀ¢²Æ–vã¢'&–v‡B"Ğ¢“° ¢6öç7B6fTvVçDf–ÆTæÖRĞ¢6VÆV7FVDFö7VÖVçBævVçDæÖRç&WÆ6R‚õµæ×¤Õ£ÓˆŞ™•Ò²örÂ%ò"’ç&WÆ6R‚õåò·Åò²BörÂ""’ÇÂ$vVçB#°¢6öç7Bf–ÆTæÖRÒ66÷&RÖöçF†Ç’G·6VÆV7FVDFö7VÖVçBæÖöçF„Æ&VÇÕòG·6fTvVçDf–ÆTæÖWÕòG·FdFö7VÖVçE&VgÒçFf°¢F÷væÆöD&Æö"‡Fbæ÷WGWB‚&&Æö""’Âf–ÆTæÖR“°¢6WEFdÖW76vR†vVæW&FVBG¶f–ÆTæÖWÖ“°¢v–æF÷rç6WEF–ÖV÷WB‚‚’Óâ6WEFdÖW76vR‚""’Â3S“°¢&WGW&ã°¢Ğ ¢°¢6öç7Böff–6–ÅvUrÒ#°¢6öç7Böff–6–ÅvT‚Ò#“s°¢6öç7Böff–6–ÄÆVgBÒ#°¢6öç7Böff–6–Å&–v‡BÒ“ƒ°¢6öç7Böff–6–ÅF&ÆUrÒöff–6–Å&–v‡BÒöff–6–ÄÆVgC°¢6öç7Böff–6–Ä&÷GFöÒÒ#ƒ#°¢6öç7Böff–6–ÅW'ÆS¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³“RÂ3’ÂS•Ó°¢6öç7Böff–6–ÅW'ÆTF&³¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³ƒ‚Â#‚Â3UÓ°¢6öç7Böff–6–ÄÆ–v‡EW'ÆS¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³#bÂ“2Â#eÓ°¢6öç7Böff–6–Å6ögEW'ÆS¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³#CRÂ#CÂ#SÓ°¢6öç7Böff–6–Ä&÷&FW#¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³“ÂƒBÂ“…Ó°¢6öç7Böff–6–Ä&Æ6³¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³‚Â#BÂ3…Ó°¢6öç7Böff–6–Ä×WFVC¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³ƒ2Â“bÂ#EÓ°¢ÆWBöff–6–Å’Ò#° ¢6öç7B6WDöff–6–ÄföçBÒ€¢6—¦S¢çVÖ&W"À¢&öÆBÒfÇ6RÀ¢6öÆ÷#¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒöff–6–Ä&Æ6°¢’Óâ°¢G'’°¢Fbç6WDföçB‚%D…6&'VäæWr"Â&öÆBò&&öÆB"¢&æ÷&ÖÂ"“°¢Ò6F6‚·Ğ¢Fbç6WDföçE6—¦R‡6—¦R“°¢Fbç6WEFW‡D6öÆ÷"†6öÆ÷%³ÒÂ6öÆ÷%³ÒÂ6öÆ÷%³%Ò“°¢Ó° ¢6öç7BG&töff–6–ÅFW‡BÒ€¢fÇVS¢7G&–ærÀ¢ƒ¢çVÖ&W"À¢—“¢çVÖ&W"À¢6—¦RÒ’À¢&öÆBÒfÇ6RÀ¢6öÆ÷#¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒöff–6–Ä&Æ6²À¢÷F–öç3ó¢²Æ–vãó¢&ÆVgB"Â&6VçFW""Â'&–v‡B"Ğ¢’Óâ°¢6WDöff–6–ÄföçB‡6—¦RÂ&öÆBÂ6öÆ÷"“°¢FbçFW‡B…7G&–ær‡fÇVRóò""’Â‚Â—’Â÷F–öç2“°¢Ó° ¢6öç7B7Æ—Döff–6–ÅFW‡BÒ‡fÇVS¢Væ¶æ÷vâÂv–GFƒ¢çVÖ&W"Â6—¦RÒ‚’Óâ°¢6WDöff–6–ÄföçB‡6—¦R“°¢&WGW&âFbç7Æ—EFW‡EFõ6—¦R…7G&–ær‡fÇVRÇÂ"Ò"’ÂÖF‚æÖ‚ƒBÂv–GF‚’“°¢Ó° ¢6öç7BG&töff–6–Ä6VÆÂÒ€¢ƒ¢çVÖ&W"À¢—“¢çVÖ&W"À¢s¢çVÖ&W"À¢ƒ¢çVÖ&W"À¢fÇVS¢Væ¶æ÷vâÀ¢f–ÆÃ¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÀ¢÷F–öç3¢°¢&öÆCó¢&ööÆVã°¢6öÆ÷#ó¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%Ó°¢6—¦Só¢çVÖ&W#°¢Æ–vãó¢&ÆVgB"Â&6VçFW""Â'&–v‡B#°¢fÆ–vãó¢'F÷"Â&Ö–FFÆR#°¢Ö„Æ–æW3ó¢çVÖ&W#°¢ÒÒ·Ğ¢’Óâ°¢6öç7B6—¦RÒ÷F–öç2ç6—¦RóòrãS°¢6öç7BÆ–vâÒ÷F–öç2æÆ–vâóò&ÆVgB#°¢6öç7B6öÆ÷"Ò÷F–öç2æ6öÆ÷"óòöff–6–Ä&Æ6³°¢6öç7BÖ„Æ–æW2Ò÷F–öç2æÖ„Æ–æW2óò#°¢Fbç6WDG&t6öÆ÷"†öff–6–Ä&÷&FW%³ÒÂöff–6–Ä&÷&FW%³ÒÂöff–6–Ä&÷&FW%³%Ò“°¢Fbç6WDf–ÆÄ6öÆ÷"†f–ÆÅ³ÒÂf–ÆÅ³ÒÂf–ÆÅ¶Ú±î¸Â¸­yêë¢°k¢G§¦*^2]);
      pdf.rect(x, yy, w, h, "FD");
      setOfficialFont(size, options.bold ?? false, color);
      const lines = splitOfficialText(value, w - 4, size).slice(0, maxLines);
      const lineGap = size * 0.34 + 1.15;
      const textY =
        options.valign === "top"
          ? yy + 4
          : yy + h / 2 - ((lines.length - 1) * lineGap) / 2 + size * 0.22;
      const textX = align === "center" ? x + w / 2 : align === "right" ? x + w - 2 : x + 2;
      lines.forEach((lineText: string, index: number) => {
        pdf.text(lineText, textX, textY + index * lineGap, { align });
      });
    };

    const drawOfficialSection = (title: string, subtitle?: string) => {
      if (officialY + 12 > officialBottom) {
        pdf.addPage();
        officialY = 12;
      }
      pdf.setFillColor(officialPurple[0], officialPurple[1], officialPurple[2]);
      pdf.rect(officialLeft, officialY, officialTableW, 7, "F");
      drawOfficialText(title, officialLeft + 3, officialY + 5, 9, true, [255, 255, 255]);
      officialY += 7;
      if (subtitle) {
        pdf.setFillColor(officialSoftPurple[0], officialSoftPurple[1], officialSoftPurple[2]);
        pdf.rect(officialLeft, officialY, officialTableW, 7, "F");
        drawOfficialText(subtitle, officialLeft + 3, officialY + 5, 7.2, false, officialMuted);
        officialY += 9;
      } else {
        officialY += 3;
      }
    };

    const ensureOfficialSpace = (height: number) => {
      if (officialY + height > officialBottom) {
        pdf.addPage();
        officialY = 12;
      }
    };

    const drawOfficialInfoRow = (cells: Array<{ label: string; value: unknown; w?: number; maxLines?: number }>, height = 13) => {
      ensureOfficialSpace(height);
      let x = officialLeft;
      const labelW = 24;
      const valueWidths = cells.map((cell) => cell.w ?? (officialTableW - labelW * cells.length) / cells.length);
      cells.forEach((cell, index) => {
        drawOfficialCell(x, officialY, labelW, height, cell.label, officialPurpleDark, {
          color: [255, 255, 255],
          bold: true,
          size: 7.2,
          align: "center",
          maxLines: 2,
        });
        x += labelW;
        drawOfficialCell(x, officialY, valueWidths[index], height, cell.value, officialLightPurple, {
          bold: true,
          size: 7.5,
          align: "center",
          maxLines: cell.maxLines ?? 2,
        });
        x += valueWidths[index];
      });
      officialY += height;
    };

    const roleLabelForPdf = (role: SignRole) => {
      if (role === "QA") return "QA Reviewer";
      if (role === "Supervisor") return "Supervisor";
      if (role === "Senior") return "Senior / Team Lead";
      return "Agent";
    };

    const signedRoles = SIGNATURE_FLOW.filter((role) => Boolean(getCompletedEntry(entries, role))).length;
    const safePdfName = (role: SignRole) => {
      const signed = getSignedEntry(entries, role);
      return signed ? getRoleSigner(selectedDocument, role) || signed.signerName || signed.signedBy || "-" : "-";
    };
    const safePdfDate = (role: SignRole) => {
      const signed = getSignedEntry(entries, role);
      return signed ? formatDateTime(signed.signedAt) : "-";
    };
    const safePdfSignature = (role: SignRole) => getSignedEntry(entries, role)?.signatureDataUrl || "";

    pdf.setFillColor(officialPurple[0], officialPurple[1], officialPurple[2]);
    pdf.rect(0, 0, officialPageW, 22, "F");
    drawOfficialText("QA Score Monthly Report", officialLeft, 9, 16, true, [255, 255, 255]);
    drawOfficialText("Monthly QA acknowledgement and incentive document", officialLeft, 16, 9, false, [255, 255, 255]);
    drawOfficialText(`Generated: ${formatDateTime(new Date().toISOString())}`, officialRight, 16, 7.5, false, [255, 255, 255], { align: "right" });

    officialY = 31;
    drawOfficialSection("Current View", "Summary for selected Agent and Month");
    drawOfficialInfoRow([
      { label: "Agent", value: selectedDocument.agentName, w: 52, maxLines: 2 },
      { label: "Month", value: selectedDocument.monthLabel, w: 28 },
      { label: "Document Ref.", value: selectedDocument.documentHash || selectedDocument.id, w: 58, maxLines: 2 },
    ], 15);
    drawOfficialInfoRow([
      { label: "Reviewed Cases", value: selectedDocument.caseCount, w: 28 },
      { label: "Average Score", value: selectedDocument.averageScore.toFixed(2), w: 31 },
      { label: "Grade", value: selectedDocument.grade, w: 20 },
      { label: "Signed", value: `${signedRoles}/${SIGNATURE_FLOW.length}`, w: 11 },
    ], 12);
    drawOfficialInfoRow([
      { label: "Team", value: selectedDocument.teamName || "-", w: 48, maxLines: 2 },
      { label: "Supervisor", value: selectedDocument.supervisorName || "-", w: 34, maxLines: 2 },
      { label: "Team Lead", value: selectedDocument.seniorName || "-", w: 32, maxLines: 2 },
    ], 14);
    drawOfficialInfoRow([
      { label: "Status", value: isComplete ? "Completed Signature" : "Incomplete Signature", w: 52, maxLines: 2 },
      { label: "Need More", value: needMoreToTarget, w: 28 },
      { label: "Payment", value: readyForIncentive ? "Ready to Pay" : "Hold / Not Ready", w: 34, maxLines: 2 },
    ], 13);

    officialY += 5;
    drawOfficialSection("Incentive Summary");
    drawOfficialInfoRow([
      { label: "Incentive", value: individualIncentive.label || "No Incentive", w: 66, maxLines: 2 },
      { label: "Cash (THB)", value: formatBahtAmount(individualIncentive.cash || 0), w: 26 },
      { label: "RBH Promo", value: formatBahtAmount(individualIncentive.promo || 0), w: 22 },
    ], 13);
    drawOfficialInfoRow([
      { label: "Remark", value: individualIncentive.remark || "-", w: 66, maxLines: 2 },
      { label: "Condition", value: readyForIncentive ? "Signature completed" : "Waiting signature completion", w: 48, maxLines: 2 },
    ], 13);

    officialY += 5;
    drawOfficialSection("Monthly Case List", "Cases included in this monthly acknowledgement");
    const caseColWidths = [11, 25, 29, 74, 25, 22];
    const caseHeaders = ["Seq", "Audit Date", "Case ID", "Customer Inquiry", "Final Score", "Grade"];
    let caseX m«ëŒ+Š×®º+º$zzb¥ãÒöff–6–ÄÆVgC°¢66T†VFW'2æf÷$V6‚‚††VFW"Â–æFW‚’Óâ°¢G&töff–6–Ä6VÆÂ†66U‚Âöff–6–Å’Â66T6öÅv–GF‡5¶–æFW…ÒÂ‚Â†VFW"Âöff–6–ÅW'ÆTF&²Â°¢6öÆ÷#¢³#SRÂ#SRÂ#SUÒÀ¢&öÆC¢G'VRÀ¢6—¦S¢rÀ¢Æ–vã¢&6VçFW""À¢Ö„Æ–æW3¢À¢Ò“°¢66U‚³Ò66T6öÅv–GF‡5¶–æFW…Ó°¢Ò“°¢öff–6–Å’³Òƒ° ¢6VÆV7FVDFö7VÖVçBæ66W2ç6Æ–6RƒÂ’æf÷$V6‚‚†—FVÒÂ–æFW‚’Óâ°¢6öç7B&÷t‚Ò“°¢Vç7W&Töff–6–Å76R‡&÷t‚²2“°¢6öç7Bf–ÆÃ¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ–æFW‚R"ÓÓÒò³#SRÂ#SRÂ#SUÒ¢³#SÂ#CrÂ#S5Ó°¢66U‚Òöff–6–ÄÆVgC°¢6öç7B&÷ufÇVW2Ò°¢7G&–ær†–æFW‚²’À¢—FVÒæVF—DFFRÇÂ"Ò"À¢—FVÒæ66T–BÇÂ"Ò"À¢—FVÒæ–çV—'’ÇÂ"Ò"À¢—FVÒæf–æÅ66÷&RçFôf—†VBƒ"’À¢—FVÒæw&FRÇÂ"Ò"À¢Ó°¢&÷ufÇVW2æf÷$V6‚‚†6VÆÂÂ6VÆÄ–æFW‚’Óâ°¢G&töff–6–Ä6VÆÂ†66U‚Âöff–6–Å’Â66T6öÅv–GF‡5¶6VÆÄ–æFW…ÒÂ&÷t‚Â6VÆÂÂf–ÆÂÂ°¢&öÆC¢6VÆÄ–æFW‚ÓÓÒÇÂ6VÆÄ–æFW‚ÓÓÒ"ÇÂ6VÆÄ–æFW‚ÓÓÒBÇÂ6VÆÄ–æFW‚ÓÓÒRÀ¢6—¦S¢6VÆÄ–æFW‚ÓÓÒ2òbãr¢rÀ¢Æ–vã¢6VÆÄ–æFW‚ÓÓÒ2ò&ÆVgB"¢&6VçFW""À¢Ö„Æ–æW3¢6VÆÄ–æFW‚ÓÓÒ2ò"¢À¢Ò“°¢66U‚³Ò66T6öÅv–GF‡5¶6VÆÄ–æFW…Ó°¢Ò“°¢öff–6–Å’³Ò&÷tƒ°¢Ò“° ¢FbæFEvR‚“°¢öff–6–Å’Ò#°¢G&töff–6–Å6V7F–öâ‚$6¶æ÷vÆVFvVÖVçBò6–væGW&R"Â$öæÇ’6–væVB&öÆW2&R6†÷vâv—F‚6–væGW&R–ÖvRæB6–væVBFFR"“°¢G&töff–6–ÅFW‡B€¢%F†—2Fö7VÖVçB6öæf—&×26¶æ÷vÆVFvVÖVçBöbF†RÖöçF†Ç’66÷&RÂ66RÆ—7BÂ–æ6VçF—fR6öæF—F–öâÂæB6–væGW&R7FGW2â"À¢öff–6–ÄÆVgBÀ¢öff–6–Å’²À¢‚ãRÀ¢fÇ6RÀ¢öff–6–Ä×WFV@¢“°¢öff–6–Å’³Ò° ¢6öç7BG&u6–væGW&T&÷‚Ò‡ƒ¢çVÖ&W"Â—“¢çVÖ&W"Âs¢çVÖ&W"Âƒ¢çVÖ&W"Â&öÆS¢6–vå&öÆR’Óâ°¢6öç7B6–væVBÒvWE6–væVDVçG'’†VçG&–W2Â&öÆR“°¢Fbç6WDG&t6öÆ÷"†öff–6–Ä&÷&FW%³ÒÂöff–6–Ä&÷&FW%³ÒÂöff–6–Ä&÷&FW%³%Ò“°¢Fbç6WDf–ÆÄ6öÆ÷"ƒ#SRÂ#SRÂ#SR“°¢Fbç&÷VæFVE&V7B‡‚Â—’ÂrÂ‚Â"Â"Â$dB"“°¢Fbç6WDf–ÆÄ6öÆ÷"†öff–6–ÅW'ÆTF&µ³ÒÂöff–6–ÅW'ÆTF&µ³ÒÂöff–6–ÅW'ÆTF&µ³%Ò“°¢Fbç&V7B‡‚Â—’ÂrÂ‚Â$b"“°¢G&töff–6–ÅFW‡B‡&öÆTÆ&VÄf÷%Fb‡&öÆR’Â‚²2Â—’²RãrÂ‚ã"ÂG'VRÂ³#SRÂ#SRÂ#SUÒ“°¢6öç7B6–væGW&T–ÖvRÒ6fUFe6–væGW&R‡&öÆR“°¢–b‡6–væGW&T–ÖvR’°¢G'’°¢FbæFD–ÖvR‡6–væGW&T–ÖvRÂ%är"Â‚²rÂ—’²2ÂrÒBÂr“°¢Ò6F6‚°¢G&töff–6–ÅFW‡B‚%6–væGW&R–ÖvRVæf–Æ&ÆR"Â‚²rò"Â—’²#2Â‚ÂfÇ6RÂöff–6–Ä×WFVBÂ²Æ–vã¢&6VçFW""Ò“°¢Ğ¢ÒVÇ6R°¢Fbç6WDG&t6öÆ÷"ƒSÂCRÂc“°¢FbæÆ–æR‡‚²‚Â—’²#rÂ‚²rÒ‚Â—’²#r“°¢G&töff–6–ÅFW‡B‚%Vç6–væVB"Â‚²rò"Â—’²#BÂ‚ÂfÇ6RÂöff–6–Ä×WFVBÂ²Æ–vã¢&6VçFW""Ò“°¢Ğ¢G&töff–6–ÅFW‡B‡6fUFdæÖR‡&öÆR’Â‚²BÂ—’²3bÂ’ÂG'VR“°¢G&töff–6–ÅFW‡B†FFS¢G·6fUFdFFR‡&öÆR—ÖÂ‚²BÂ—’²C2Ârã‚ÂfÇ6RÂöff–6–Ä×WFVB“°¢G&töff–6–ÅFW‡B†7FGW3¢G·6–væVBò%6–væVB"¢%VæF–ær'ÖÂ‚²BÂ—’²SÂ‚ÂG'VRÂ6–væVBò³RÂSÂUÒ¢³ƒÂƒ2Â•Ò“°¢Ó° ¢6öç7B6–t&÷…rÒƒc°¢6öç7B6–t&÷„‚ÒSc°¢G&u6–væGW&T&÷‚†öff–6–ÄÆVgBÂöff–6–Å’Â6–t&÷…rÂ6–t&÷„‚Â%"“°¢G&u6–væGW&T&÷‚†öff–6–ÄÆVgB²Âöff–6–Å’Â6–t&÷…rÂ6–t&÷„‚Â%7WW'f—6÷""“°¢öff–6–Å’³Ò6–t&÷„‚²“°¢G&u6–væGW&T&÷‚†öff–6–ÄÆVgBÂöff–6–Å’Â6–t&÷…rÂ6–t&÷„‚Â%6Væ–÷""“°¢G&u6–væGW&T&÷‚†öff–6–ÄÆVgB²Âöff–6–Å’Â6–t&÷…rÂ6–t&÷„‚Â$vVçB"“°¢öff–6–Å’³Ò6–t&÷„‚²° ¢Fbç6WDf–ÆÄ6öÆ÷"ƒ#C‚Â#SÂ#S"“°¢Fbç&÷VæFVE&V7B†öff–6–ÄÆVgBÂöff–6–Å’Âöff–6–ÅF&ÆUrÂBÂ"Â"Â$b"“°¢G&töff–6–ÅFW‡B€¢Fö7VÖVçB&Vc¢G·6VÆV7FVDFö7VÖVçBæFö7VÖVçD†6‚ÇÂ6VÆV7FVDFö7VÖVçBæ–GÒÂ66W3¢G·6VÆV7FVDFö7VÖVçBæ66T6÷VçGÒÂfW&vS¢G·6VÆV7FVDFö7VÖVçBæfW&vU66÷&RçFôf—†VBƒ"—ÒÂw&FS¢G·6VÆV7FVDFö7VÖVçBæw&FWÖÀ¢öff–6–ÄÆVgB²BÀ¢öff–6–Å’²‚ãRÀ¢‚ã"À¢fÇ6RÀ¢öff–6–Ä×WFV@¢“° ¢Fbç6WEvRƒ“°¢G&töff–6–ÅFW‡B‚%vRó""Âöff–6–Å&–v‡BÂöff–6–ÅvT‚ÒrÂrãRÂfÇ6RÂöff–6–Ä×WFVBÂ²Æ–vã¢'&–v‡B"Ò“°¢Fbç6WEvRƒ"“°¢G&töff–6–ÅFW‡B‚%vR"ó""Âöff–6–Å&–v‡BÂöff–6–ÅvT‚ÒrÂrãRÂfÇ6RÂöff–6–Ä×WFVBÂ²Æ–vã¢'&–v‡B"Ò“° ¢6öç7B6fTvVçDf–ÆTæÖRĞ¢6VÆV7FVDFö7VÖVçBævVçDæÖRç&WÆ6R‚õµæ×¤Õ£ÓˆŞ™•Ò²örÂ%ò"’ç&WÆ6R‚õåò·Åò²BörÂ""’ÇÂ$vVçB#°¢6öç7Bf–ÆTæÖRÒ66÷&RÖöçF†Ç’G·6VÆV7FVDFö7VÖVçBæÖöçF„Æ&VÇÕòG·6fTvVçDf–ÆTæÖWÒçFf°¢F÷væÆöD&Æö"‡Fbæ÷WGWB‚&&Æö""’Âf–ÆTæÖR“°¢6WEFdÖW76vR†vVæW&FVBG¶f–ÆTæÖWÖ“°¢v–æF÷rç6WEF–ÖV÷WB‚‚’Óâ6WEFdÖW76vR‚""’Â3S“°¢&WGW&ã°¢Ğ ¢–b†fÇ6R’°¢6öç7BFö5rÒ#°¢6öç7BFö4‚Ò#“s°¢6öç7BFö2ÒæWr§5Db‡²Væ—C¢&ÖÒ"Âf÷&ÖC¢&B"Â÷&–VçFF–öã¢'÷'G&—B"Ò“°¢G'’°¢&Vv—7FW%D…6&'VäæWr‡Fö2“°¢Fö2ç6WDföçB‚%D…6&'VäæWr"Â&æ÷&ÖÂ"“°¢Ò6F6‚·Ğ ¢6öç7BvUrÒ#°¢6öç7BvT‚Ò#°¢6öç7B6–FV&%rÒ3c°¢6öç7BÆVgE‚Ò6–FV&%r²ƒ°¢6öç7B&–v‡E‚Ò#ƒƒ°¢6öç7B66VçC¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³’ÂCÂ#uÓ°¢6öç7BF&³¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³#Â‚ÂC•Ó°¢6öç7B×WFVC¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³ÂbÂ3•Ó° ¢6öç7B6WEFeFW‡BÒ€¢6—¦S¢çVÖ&W"À¢&öÆBÒfÇ6RÀ¢6öÆ÷#¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³3ÂCÂSUĞ¢’Óâ°¢G'’°¢Fö2ç6WDföçB‚%D…6&'VäæWr"Â&öÆBò&&öÆB"¢&æ÷&ÖÂ"“°¢Ò6F6‚·Ğ¢Fö2ç6WDföçE6—¦R‡6—¦R“°¢Fö2ç6WEFW‡D6öÆ÷"†6öÆ÷%³ÒÂ6öÆ÷%³ÒÂ6öÆ÷%³%Ò“°¢Ó° ¢6öç7BG&uFeFW‡BÒ€¢fÇVS¢7G&–ærÀ¢ƒ¢çVÖ&W"À¢—“¢çVÖ&W"À¢6—¦RÒÀ¢&öÆBÒfÇ6RÀ¢6öÆ÷#¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³3ÂCÂSUÒÀ¢÷F–öç3ó¢²Æ–vãó¢&ÆVgB"Â&6VçFW""Â'&–v‡B"Ğ¢’Óâ°¢6WEFeFW‡B‡6—¦RÂ&öÆBÂ6öÆ÷"“°¢Fö2çFW‡B…7G&–ær‡fÇVRóò""’Â‚Â—’Â÷F–öç2“°¢Ó° ¢6öç7BG&uw&VEFW‡BÒ€¢fÇVS¢7G&–ærÀ¢ƒ¢çVÖ&W"À¢—“¢çVÖ&W"À¢v–GFƒ¢çVÖ&W"À¢6—¦RÒ‚À¢&öÆBÒfÇ6RÀ¢6öÆ÷#¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³3ÂCÂSUÒÀ¢Ö„Æ–æW2Ò ¢’Óâ°¢6WEFeFW‡B‡6—¦RÂ&öÆBÂ6öÆ÷"“°¢6öç7BÆ–æW2ÒFö2ç7Æ—EFW‡EFõ6Ú±î¸Â¸­yêë¢°k¢G§¦*^ize(String(value ?? ""), width).slice(0, maxLines);
      lines.forEach((lineText: string, index: number) => qaDoc.text(lineText, x, yy + index * 3.4));
    };

    const drawBox = (
      x: number,
      yy: number,
      w: number,
      h: number,
      fill: [number, number, number] = [255, 255, 255],
      stroke: [number, number, number] = [226, 232, 240]
    ) => {
      qaDoc.setDrawColor(stroke[0], stroke[1], stroke[2]);
      qaDoc.setFillColor(fill[0], fill[1], fill[2]);
      qaDoc.roundedRect(x, yy, w, h, 3, 3, "FD");
    };

    const drawStatusBadge = (label: string, x: number, yy: number) => {
      const isReady = /complete|ready|signed/i.test(label);
      const bg: [number, number, number] = isReady ? [220, 252, 231] : [254, 243, 199];
      const fg: [number, number, number] = isReady ? [22, 101, 52] : [180, 83, 9];
      qaDoc.setFillColor(bg[0], bg[1], bg[2]);
      qaDoc.roundedRect(x, yy - 5, 26, 8, 3, 3, "F");
      drawPdfText(label, x + 13, yy + 0.2, 7.5, true, fg, { align: "center" });
    };

    const drawTopChrome = (pageNo: number) => {
      qaDoc.setFillColor(dark[0], dark[1], dark[2]);
      qaDoc.rect(0, 0, sidebarW, pageH, "F");
      qaDoc.setFillColor(accent[0], accent[1], accent[2]);
      qaDoc.roundedRect(6, 10, 24, 11, 2, 2, "F");
      drawPdfText("Robinhood QA", 8, 17.2, 9, true, [255, 255, 255]);
      ["Dashboard", "Signature", "Documents", "Reports"].forEach((item, index) => {
        const navY = 40 + index * 14;
        if (item === "Signature") {
          qaDoc.setFillColor(accent[0], accent[1], accent[2]);
          qaDoc.roundedRect(5, navY - 6, 26, 9, 2, 2, "F");
        }
        drawPdfText(item, 8, navY, 7.8, item === "Signature", [255, 255, 255]);
      });
      drawPdfText("Signature Workspace", leftX, 15, 20, true, [15, 23, 42]);
      drawPdfText("Monthly QA score acknowledgement", leftX, 22, 10, false, muted);
      drawPdfText(`Page ${pageNo}`, rightX, pageH - 6, 8, false, [148, 163, 184], { align: "right" });
    };

    const drawSummaryCard = (
      x: number,
      yy: number,
      w: number,
      label: string,
      value: string,
      tone: [number, number, number]
    ) => {
      drawBox(x, yy, w, 23);
      drawPdfText(label, x + 4, yy + 6, 8.2, true, muted);
      drawPdfText(value, x + 4, yy + 16, 16, true, tone);
    };

    const signedRoles = SIGNATURE_FLOW.filter((role) => Boolean(getCompletedEntry(entries, role))).length;
    const documentStatus = isComplete ? "Signed" : "Pending";

    drawTopChrome(1);
    drawBox(leftX, 32, 158, 24);
    drawPdfText("Document Ref.", leftX + 5, 40, 8, true, muted);
    drawPdfText(selectedDocument.documentHash || selectedDocument.id, leftX + 5, 50, 12, true, accent);
    drawPdfText("Agent", leftX + 55, 40, 8, true, muted);
    drawWrappedText(selectedDocument.agentName, leftX + 55, 49, 45, 9, true);
    drawPdfText("Month", leftX + 108, 40, 8, true, muted);
    drawPdfText(selectedDocument.monthLabel, leftX + 108, 50, 10, true);

    drawSummaryCard(leftX, 64, 42, "Cases", String(selectedDocument.caseCount), accent);
    drawSummaryCard(leftX + 48, 64, 42, "Average", selectedDocument.averageScore.toFixed(2), [22, 163, 74]);
    drawSummaryCard(leftX + 96, 64, 42, "Grade", selectedDocument.grade, [37, 99, 235]);
    drawSummaryCard(leftX + 144, 64, 48, "Cash THB", formatBahtAmount(individualIncentive.cash || 0), [217, 119, 6]);
    drawSummaryCard(leftX + 198, 64, 42, "Signed", `${signedRoles}/4`, isComplete ? [22, 163, 74] : [217, 119, 6]);

    const tableX = leftX;
    const tableY = 98;
    const tableWidths = [12, 28, 33, 72, 22, 18];
    const tableHeaders = ["No.", "Date", "Case ID", "Customer Inquiry", "Score", "Grade"];
    qaDoc.setFillColor(accent[0], accent[1], accent[2]);
    qaDoc.roundedRect(tableX, tableY, tableWidths.reduce((sum, width) => sum + width, 0), 9, 2, 2, "F");
    let cellX = tableX;
    tableHeaders.forEach((header, index) => {
      drawPdfText(header, cellX + 2, tableY + 6, 8, true, [255, 255, 255]);
      cellX += tableWidths[index];
    });
    let rowY = tableY + 9;
    selectedDocument.cases.slice(0, 10).forEach((item, index) => {
      qaDoc.setDrawColor(226, 232, 240);
      qaDoc.setFillColor(index % 2 === 0 ? 250 : 255, index % 2 === 0 ? 245 : 255, index % 2 === 0 ? 255 : 255);
      qaDoc.rect(tableX, rowY, tableWidths.reduce((sum, width) => sum + width, 0), 11, "FD");
      cellX = tableX;
      [
        String(index + 1),
        item.auditDate || "-",
        item.caseId || "-",
        item.inquiry || "-",
        item.finalScore.toFixed(2),
        item.grade || "-",
      ].forEach((cell, cellIndex) => {
        drawWrappedText(cell, cellX + 2, rowY + 5.4, tableWidths[cellIndex] - 4, cellIndex === 3 ? 7.4 : 7.8, cellIndex === 0 || cellIndex === 2, [31, 41, 55], 2);
        cellX += tableWidths[cellIndex];
      });
      rowY += 11;
    });

    const panelX = 238;
    drawBox(panelX, 32, 51, 150);
    drawPdfText("Case Detail", panelX + 5, 42, 12, true);
    drawStatusBadge(documentStatus, panelX + 21, 42);
    const panelRows: Array<[string, string]> = [
      ["Agent", selectedDocument.agentName],
      ["Team", selectedDocument.teamLeadName || selectedDocument.supervisorName || "-"],
      ["Reviewed", `${selectedDocument.caseCount}/${CASE_TARGET}`],
      ["Need More", String(needMoreToTarget)],
      ["Incentive", individualIncentive.label || "-"],
      ["Status", readyForIncentive ? "Ready to Pay" : "Hold"],
    ];
    let panelY = 56;
    panelRows.forEach(([label, value]) => {
      drawPdfText(label, panelX + 5, panelY, 7.5, true, muted);
      drawWrappedText(value, panelX + 22, panelY, 23, 7.8, true, [31, 41, 55], 2);
      panelY += 11;
    });
    drawPdfText("Signature Timeline", panelX + 5, panelY + 4, 9.5, true);
    panelY += 13;
    SIGNATURE_FLOW.forEach((role, index) => {
      const signed = getSignedEntry(entries, role);
      qaDoc.setFillColor(signed ? 220 : 241, signed ? 252 : 245, signed ? 231 : 249);
      qaDoc.circle(panelX + 7, panelY - 1, 2.5, "F");
      drawPdfText(String(index + 1), panelX + 7, panelY, 6.2, true, signed ? [22m«ëŒ+Š×®º+º$zzb¥âÂÂS%Ò¢66VçBÂ²Æ–vã¢&6VçFW""Ò“°¢G&uFeFW‡B‡&öÆUF†”Æ&VÂ‡&öÆR’ÂæVÅ‚²"ÂæVÅ’ÂrãBÂG'VR“°¢G&uFeFW‡B‡6–væVBò%6–væVB"¢%VæF–ær"ÂæVÅ‚²"ÂæVÅ’²Bã"Âbã‚ÂfÇ6RÂ6–væVBò³#"ÂÂS%Ò¢³ƒÂƒ2Â•Ò“°¢æVÅ’³Ò°¢Ò“° ¢6öç7Bf–ÆTæÖRÒ66÷&RÖöçF†Ç’G·6VÆV7FVDFö7VÖVçBæÖöçF„Æ&VÇÕó##eòG·6VÆV7FVDFö7VÖVçBævVçDæÖRç&WÆ6R‚õµæ×¤Õ£ÓˆŞ™•Ò²örÂ%ò"—ÒçFf°¢F÷væÆöD&Æö"‡Fö2æ÷WGWB‚&&Æö""’Âf–ÆTæÖR“°¢6WEFdÖW76vR†vVæW&FVBG·f–ÆTæÖWÖ“°¢v–æF÷rç6WEF–ÖV÷WB‚‚’Óâ6WEFdÖW76vR‚""’Â3S“°¢&WGW&ã°¢Ğ ¢6öç7BvUv–GF‚Ò#°¢6öç7BÆVgBÒ°¢6öç7B&–v‡BÒ“ƒ°¢ÆWB’Ò#° ¢6öç7B6WDföçBÒ‡6—¦S¢çVÖ&W"Â&öÆBÒfÇ6RÂ6öÆ÷#¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³3ÂCÂSUÒ’Óâ°¢G'’°¢Fbç6WDföçB‚%D…6&'VäæWr"Â&öÆBò&&öÆB"¢&æ÷&ÖÂ"“°¢Ò6F6‚·Ğ¢Fbç6WDföçE6—¦R‡6—¦R“°¢Fbç6WEFW‡D6öÆ÷"†6öÆ÷%³ÒÂ6öÆ÷%³ÒÂ6öÆ÷%³%Ò“°¢Ó° ¢6öç7BFW‡BÒ‡fÇVS¢7G&–ærÂƒ¢çVÖ&W"Â—“¢çVÖ&W"Â6—¦RÒ"Â&öÆBÒfÇ6RÂ6öÆ÷#¢¶çVÖ&W"ÂçVÖ&W"ÂçVÖ&W%ÒÒ³3ÂCÂSUÒ’Óâ°¢6WDföçB‡6—¦RÂ&öÆBÂ6öÆ÷"“°¢FbçFW‡B‡fÇVRÂ‚Â—’“°¢Ó° ¢6öç7BÆ–æRÒ‡fÇVS¢7G&–ærÂ6—¦RÒ"Â&öÆBÒfÇ6R’Óâ°¢FW‡B‡fÇVRÂÆVgBÂ’Â6—¦RÂ&öÆB“°¢’³Ò6—¦R¢ãC"²"ãS°¢Ó° ¢6öç7BG&u6V7F–öåF—FÆRÒ‡F—FÆS¢7G&–ær’Óâ°¢Fbç6WDf–ÆÄ6öÆ÷"ƒ’ÂCÂ#r“°¢Fbç&÷VæFVE&V7B†ÆVgBÂ’Â&–v‡BÒÆVgBÂ‚Â"Â"Â$b"“°¢FW‡B‡F—FÆRÂÆVgB²BÂ’²RãrÂ"ÂG'VRÂ³#SRÂ#SRÂ#SUÒ“°¢’³Ò#°¢Ó° ¢6öç7B6fUFdæÖRÒ‡&öÆS¢6–vå&öÆR’Óâ°¢6öç7B6–væVBÒvWE6–væVDVçG'’†VçG&–W2Â&öÆR“°¢&WGW&â6–væVBòvWE&öÆU6–væW"‡6VÆV7FVDFö7VÖVçBÂ&öÆR’ÇÂ6–væVBç6–væW$æÖRÇÂ6–væVBç6–væVD'’ÇÂ"Ò"¢"Ò#°¢Ó° ¢6öç7B6fUFdFFRÒ‡&öÆS¢6–vå&öÆR’Óâ°¢6öç7B6–væVBÒvWE6–væVDVçG'’†VçG&–W2Â&öÆR“°¢&WGW&â6–væVBòf÷&ÖDFFUF–ÖR‡6–væVBç6–væVDB’¢"Ò#°¢Ó° ¢6öç7B6fUFe7FGW2Ò‡&öÆS¢6–vå&öÆR’Óâ°¢6öç7B6–væVBÒvWE6–væVDVçG'’†VçG&–W2Â&öÆR“°¢&WGW&â6–væVBò%6–væVB"¢7FGW4f÷%&öÆR†VçG&–W2Â&öÆRÂ6VÆV7FVDFö7VÖVçBæÖöçF„¶W’“°¢Ó° ¢6öç7B6fUFe6–væGW&RÒ‡&öÆS¢6–vå&öÆR’Óâ°¢6öç7B6–væVBÒvWE6–væVDVçG'’†VçG&–W2Â&öÆR“°¢&WGW&â6–væVCòç6–væGW&TFFW&ÂÇÂ"#°¢Ó° ¢Fbç6WDf–ÆÄ6öÆ÷"ƒ“RÂ3’ÂS’“°¢Fbç&V7BƒÂÂvUv–GF‚Â#BÂ$b"“°¢FW‡B‚%66÷&RÖöçF†Ç’&W÷'B"ÂÆVgBÂÂrÂG'VRÂ³#SRÂ#SRÂ#SUÒ“°¢FW‡B‚$öff–6–ÂÖöçF†Ç’6¶æ÷vÆVFvVÖVçBf÷&Ò"ÂÆVgBÂrÂÂfÇ6RÂ³#SRÂ#SRÂ#SUÒ“° ¢’Ò33°¢G&u6V7F–öåF—FÆR‚$7W'&VçBf–Wr"“° ¢6öç7B–æfõ&÷w2Ò°¢²$vVçB"Â6VÆV7FVDFö7VÖVçBævVçDæÖRÂ$ÖöçF‚"Â6VÆV7FVDFö7VÖVçBæÖöçF„Æ&VÅÒÀ¢²%&Wf–WvVB66W2"ÂG·6VÆV7FVDFö7VÖVçBæ66T6÷VçGÖÂ$7&—F–6Â66W2"Â"Ò%ÒÀ¢²$66W2&Wf–WvVB"ÂG·6VÆV7FVDFö7VÖVçBæ66T6÷VçGÒòG´44UõD$tUGÖÂ$æVVBÖ÷&RFò"ÂG¶æVVDÖ÷&UFõF&vWGÖÒÀ¢²$fW&vR66÷&R"Â6VÆV7FVDFö7VÖVçBæfW&vU66÷&RçFôf—†VBƒ"’Â$ÖöçF†Ç’w&FR"Â6VÆV7FVDFö7VÖVçBæw&FUÒÀ¢²$Fö7VÖVçB7FGW2"Â—46ö×ÆWFRò$6ö×ÆWFVB"¢$–æ6ö×ÆWFR6–væGW&R"Â$Fö7VÖVçB&Vbâ"Â6VÆV7FVDFö7VÖVçBæFö7VÖVçD†6…ÒÀ¢Ó° ¢–æfõ&÷w2æf÷$V6‚‚‡&÷r’Óâ°¢6öç7B—’Ò“°¢Fbç6WDf–ÆÄ6öÆ÷"ƒ#C‚Â#SÂ#S"“°¢Fbç&V7B†ÆVgBÂ—’ÒRÂ&–v‡BÒÆVgBÂ‚Â$b"“°¢FW‡B‡&÷u³ÒÂÆVgB²2Â—’ÂÂG'VRÂ³ÂbÂ3•Ò“°¢FW‡B‡&÷u³ÒÂÆVgB²3BÂ—’ÂÂG'VRÂ³3ÂCÂSUÒ“°¢FW‡B‡&÷u³%ÒÂÆVgB²“‚Â—’ÂÂG'VRÂ³ÂbÂ3•Ò“°¢FW‡B‡&÷u³5ÒÂÆVgB²3"Â—’ÂÂG'VRÂ³3ÂCÂSUÒ“°¢’³Ò“°¢Ò“° ¢’³Ò#°¢G&u6V7F–öåF—FÆR‚$–æ6VçF—fR7VÖÖ'’"“°¢6öç7B–æ6VçF—fU&÷w2Ò°¢²$W7F–ÖFVB–æ6VçF—fR"Â–æF—f–GVÄ–æ6VçF—fRæÆ&VÂÇÂ$æò–æ6VçF—fR"Â%–ÖVçB7FGW2"Â&VG”f÷$–æ6VçF—fRò%&VG’Fò’"¢$†öÆBòæ÷B&VG’%ÒÀ¢²$66‚…D„"’"Âf÷&ÖD&‡DÖ÷VçB†–æF—f–GVÄ–æ6VçF—fRæ66‚ÇÂ’Â%$$‚&öÖò…D„"’"Âf÷&ÖD&‡DÖ÷VçB†–æF—f–GVÄ–æ6VçF—fRç&öÖòÇÂ•ÒÀ¢²%&VÖ&²"Â–æF—f–GVÄ–æ6VçF—fRç&VÖ&²ÇÂ"Ò"Â$6öæF—F–öâ"Â&VG”f÷$–æ6VçF—fRò%6–væGW&R6ö×ÆWFVB"¢%v—F–ær6–væGW&R6ö×ÆWF–öâ%ÒÀ¢Ó°¢–æ6VçF—fU&÷w2æf÷$V6‚‚‡&÷r’Óâ°¢6öç7B—’Ò“°¢Fbç6WDf–ÆÄ6öÆ÷"ƒ#C‚Â#SÂ#S"“°¢Fbç&V7B†ÆVgBÂ—’ÒRÂ&–v‡BÒÆVgBÂ‚Â$b"“°¢FW‡B‡&÷u³ÒÂÆVgB²2Â—’ÂÂG'VRÂ³ÂbÂ3•Ò“°¢FW‡B‡&÷u³ÒÂÆVgB²3BÂ—’ÂÂG'VRÂ³3ÂCÂSUÒ“°¢FW‡B‡&÷u³%ÒÂÆVgB²“‚Â—’ÂÂG'VRÂ³ÂbÂ3•Ò“°¢FW‡B‡&÷u³5ÒÂÆVgB²3"Â—’ÂÂG'VRÂ³3ÂCÂSUÒ“°¢’³Ò“°¢Ò“° ¢–b†—4†—7F÷&–6Å–EW&–öB‡6VÆV7FVDFö7VÖVçBæÖöçF„¶W’’’°¢Æ–æR‚.Š¾Š‹.Š.˜Š¾‰^‹ƒ¢˜‰N‹~ŠŞ‰’¦âÔ"˜‰¾˜~‰Š>ŠŞ‰®‰¾Š>‹Š~‹‰^‹Nˆ.ŠŞˆ~˜ŠŞˆŠ®‹.Š2Š>‹‰®‰®˜Š®‰Nˆ~Š®‰n‹.‰‹6ö×ÆWFVBŠŞ‹‰^˜.‰Š‹‰^‹B"Â“°¢Ğ¢–b††5VæF–ætVÂ’°¢Æ–æR†Š¾Š‹.Š.˜Š¾‰^‹ƒ¢Š‹RG·6VÆV7FVEVæF–ætVÇ2æÆVæwF‡Ò˜ˆNŠ®‰~‹^˜Š.‹~˜‰’VÂ˜Š^‹Š>ŠÒ&÷fVBˆ‹nˆ~Š.‹ˆ~˜NŠ˜Š®‹.Š‹.Š>‰nŠ.‹~‰Š.‹‰Š>‹‰®‰~Š>‹.‰®Š¾Š>‹~ŠŞ˜ˆ¾˜~‰˜N‰N˜–Â“°¢Ğ ¢’³Ò3°¢G&u6V7F–öåF—FÆR‚$ÖöçF†Ç’66RÆ—7B"“° ¢6öç7B†VFW%’Ò“°¢Fbç6WDf–ÆÄ6öÆ÷"ƒ#3rÂ#32Â#SB“°¢Fbç&V7B†ÆVgBÂ†VFW%’ÒRÂ&–v‡BÒÆVgBÂ‚Â$b"“°¢FW‡B‚%6W"ÂÆVgB²"Â†VFW%’ÂÂG'VRÂ³ƒ‚Â#‚Â3UÒ“°¢FW‡B‚$66RFFR"ÂÆVgB²RÂ†VFW%’ÂÂG'VRÂ³ƒ‚Â#‚Â3UÒ“°¢FW‡B‚$66R”B"ÂÆVgB²C2Â†VFW%’ÂÂG'VRÂ³ƒ‚Â#‚Â3UÒ“°¢FW‡B‚$–çV—'’"ÂÆVgB²s"Â†VFW%’ÂÂG'VRÂ³ƒ‚Â#‚Â3UÒ“°¢FW‡B‚$f–æÂ66÷&R"ÂÆVgB²C"Â†VFW%’ÂÂG'VRÂ³ƒ‚Â#‚Â3UÒ“°¢FW‡B‚$w&FR"ÂÆVgB²s"Â†VFW%’ÂÂG'VRÂ³ƒ‚Â#‚Â3UÒ“°¢’³Òƒ° ¢6öç7B66U&÷w2Ò6VÆV7FVDFö7VÖVçBæ66W2ç6Æ–6RƒÂ“°¢f÷"†ÆWB’Ò²’Â²’³Ò’°¢6öç7B—FVÒÒ66U&÷w5¶•Ó°¢6öç7B&÷u’Ò“°¢Fbç6WDG&t6öÆ÷"ƒ##bÂ#3"Â#C“°¢Fbç6WDf–ÆÄ6öÆ÷"†’R"ÓÓÒò#SR¢#C‚Â’R"ÓÓÒò#SR¢#SÂ’R"ÓÓÒò#SR¢#S"“°¢Fbç&V7B†ÆVgBÂ&÷u’ÒRÂ&–v‡BÒÆVgBÂÂ$dB"“° ¢FW‡B…7G&–ær†’²’ÂÆVgB²2Â&÷u’Â’ÂG'VR“°¢FW‡B†—FVÓòæVF—DFFRÇÂ"Ò"ÂÆVgB²RÂ&÷u’Â’“°¢FW‡B†—FVÓòæ66T–BÇÂ"Ò"ÂÆVgB²C2Â&÷u’Â’ÆÚ±î¸Â¸­yêë¢°k¢G§¦*^ true);
      const inquiryLines = pdf.splitTextToSize(item?.inquiry || "-", 66);
      text(Array.isArray(inquiryLines) ? inquiryLines[0] : String(inquiryLines), left + 72, rowY, 9);
      text(item ? item.finalScore.toFixed(2) : "-", left + 144, rowY, 9, true);
      text(item?.grade || "-", left + 174, rowY, 9, true);
      y += 10;
    }

    pdf.addPage();
    y = 18;
    drawSectionTitle("Acknowledgement / Signature");
    line("à¸£à¸±à¸šà¸—à¸£à¸²à¸šà¸œà¸¥à¸à¸²à¸£à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¸›à¸£à¸°à¸ˆà¸³à¹€à¸”à¸·à¸­à¸™ à¹‚à¸”à¸¢à¸¥à¸‡à¸™à¸²à¸¡à¸•à¸²à¸¡à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¸”à¹‰à¸²à¸™à¸¥à¹ˆà¸²à¸‡", 11);

    const drawSignatureBox = (x: number, yy: number, w: number, h: number, role: SignRole, label: string) => {
      pdf.setDrawColor(203, 213, 225);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(x, yy, w, h, 3, 3, "FD");

      text(label, x + 4, yy + 7, 11, true, [88, 28, 135]);
      const signatureImage = safePdfSignature(role);
      if (signatureImage) {
        try {
          pdf.addImage(signatureImage, "PNG", x + 4, yy + 10, 50, 15);
        } catch {
          text("à¸¥à¸‡à¸Šà¸·à¹ˆà¸­ ........................................................", x + 4, yy + 17, 11);
        }
      } else {
        text("à¸¥à¸‡à¸Šà¸·à¹ˆà¸­ ........................................................", x + 4, yy + 17, 11);
      }
      text(safePdfName(role), x + 4, yy + 29, 12, true, [31, 41, 55]);
      text(label, x + 4, yy + 37, 10, false, [100, 116, 139]);
      text(`à¸§à¸±à¸™à¸—à¸µà¹ˆ ${safePdfDate(role)}`, x + 4, yy + 45, 10);
      text(`Status: ${safePdfStatus(role)}`, x + 4, yy + 51, 10, true, safePdfStatus(role) === "Signed" ? [5, 150, 105] : [180, 83, 9]);
    };

    const boxW = 86;
    const boxH = 54;
    drawSignatureBox(left, y, boxW, boxH, "Agent", "Agent à¸œà¸¹à¹‰à¸–à¸¹à¸à¸›à¸£à¸°à¹€à¸¡à¸´à¸™");
    drawSignatureBox(left + 98, y, boxW, boxH, "Senior", "Senior à¸«à¸±à¸§à¸«à¸™à¹‰à¸²à¸—à¸µà¸¡à¸œà¸¹à¹‰à¸–à¸¹à¸à¸›à¸£à¸°à¹€à¸¡à¸´à¸™");
    y += boxH + 8;
    drawSignatureBox(left, y, boxW, boxH, "Supervisor", "Supervisor à¸«à¸±à¸§à¸«à¸™à¹‰à¸²à¹à¸œà¸™à¸");
    drawSignatureBox(left + 98, y, boxW, boxH, "QA", "QA à¸œà¸¹à¹‰à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸š");

    y += boxH + 8;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(left, y, right - left, 13, 3, 3, "F");
    text("PDF à¸ˆà¸°à¹à¸ªà¸”à¸‡à¸Šà¸·à¹ˆà¸­à¹€à¸‰à¸à¸²à¸°à¸œà¸¹à¹‰à¸—à¸µà¹ˆ Signed à¹à¸¥à¹‰à¸§à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™ à¸«à¸²à¸à¸¢à¸±à¸‡à¹„à¸¡à¹ˆ Signed à¸ˆà¸°à¹à¸ªà¸”à¸‡à¹€à¸›à¹‡à¸™ -", left + 4, y + 8, 10, false, [71, 85, 105]);

    const fileName = `QA Score Monthly ${selectedDocument.monthLabel}_${selectedDocument.agentName.replace(/[^a-zA-Z0-9à¸-à¹™]+/g, "_")}.pdf`;
    downloadBlob(pdf.output("blob"), fileName);
    setPdfMessage(`Generated ${fileName}`);
    window.setTimeout(() => setPdfMessage(""), 3500);
  };

  const generatePaymentExcel = () => {
    if (selectedMonth === "all") {
      window.alert("à¸à¸£à¸¸à¸“à¸²à¹€à¸¥à¸·à¸­à¸à¹€à¸”à¸·à¸­à¸™à¸à¹ˆà¸­à¸™ Generate Excel");
      return;
    }
    if (!selectedMonthPaymentExportDocs.length) {
      window.alert("à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µ Agent à¸—à¸µà¹ˆà¹€à¸‚à¹‰à¸²à¹€à¸‡à¸·à¹ˆà¸­à¸™à¹„à¸‚ Export à¹ƒà¸™à¹€à¸”à¸·à¸­à¸™à¸™à¸µà¹‰");
      return;
    }
    try {
      generatePaymentExcelFile(selectedMonth, selectedMonthPaymentExportDocs, signatures, selectedMonthAllDocs);
      setPaymentMessage(`Generated ${makePaymentFileName(selectedMonth)}`);
      window.setTimeout(() => setPaymentMessage(""), 3500);
    } catch (error) {
      console.error("Generate payment Excel failed", error);
      setPaymentMessage(error instanceof Error ? `Generate Excel failed: ${error.message}` : "Generate Excel failed");
    }
  };

  const generatePaymentPdf = () => {
    if (selectedMonth === "all") {
      window.alert("à¸à¸£à¸¸à¸“à¸²à¹€à¸¥à¸·à¸­à¸à¹€à¸”à¸·à¸­à¸™à¸à¹ˆà¸­à¸™ Generate Payment PDF");
      return;
    }
    if (!selectedMonthPaymentExportDocs.length) {
      window.alert("à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µ Agent à¸—à¸µà¹ˆà¹€à¸‚à¹‰à¸²à¹€à¸‡à¸·à¹ˆà¸­à¸™à¹„à¸‚ Export à¹ƒà¸™à¹€à¸”à¸·à¸­à¸™à¸™à¸µà¹‰");
      return;
    }
    try {
      const fileName = generatePaymentPdfFile(selectedMonth, selectedMonthPaymentExportDocs, signatures, selectedMonthAllDocs);
      setPaymentMessage(`Generated ${fileName}`);
      window.setTimeout(() => setPaymentMessage(""), 3500);
    } catch (error) {
      console.error("Generate payment PDF failed", error);
      setPaymentMessage(error instanceof Error ? `Generate PDF failed: ${error.message}` : "Generate PDF failed");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <div className="rounded-[28px] border border-violet-200 bg-white px-8 py-7 text-center shadow-[0_24px_70px_rgba(109,40,217,0.12)]">
          <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-violet-100 border-t-violet-700" />
          <div className="mt-3 text-lg font-black text-violet-800">à¸à¸³à¸¥à¸±à¸‡à¹‚à¸«à¸¥à¸” Signature Center</div>
          <div className="mt-1 text-sm text-slate-500">à¸£à¸°à¸šà¸šà¸à¸³à¸¥à¸±à¸‡à¹€à¸•à¸£à¸µà¸¢à¸¡à¹€à¸­à¸à¸ªà¸²à¸£à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸£à¸±à¸šà¸—à¸£à¸²à¸š</div>
        </div>
      </div>
    );
  }

  if (loadMessage) {
    return (
      <div className="rounded-[30px] border border-rose-200 bg-rose-50 p-6 text-rose-700">
        <div className="text-lg font-black">à¹‚à¸«à¸¥à¸”à¸‚à¹‰à¸­à¸¡à¸¹à¸¥ Signature à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ</div>
        <div className="mt-2 text-sm">{loadMessage}</div>
      </div>
    );
  }

  return (
    <div data-signature-ui-v26 className="-m-4 min-h-screen bg-[#f3f0fa] text-slate-950 sm:-m-6">
      <div className="min-h-screen bg-[#f3f0fa]">
        <style>{`
          @import url("https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap");
          [data-signature-ui-v26],
          [data-signature-ui-v26] button,
          [data-signature-ui-v26] input,
          [data-signature-ui-v26] select,
          [data-signature-ui-v26] textarea {
            font-family: "Kanit", "Noto Sans Thai", sans-sm«ëŒ+Š×®º+º$zzb¥æÚ±î¸Â¸­yêë¢°k¢G§¦*^erif;
          }
        `}</style>
        <PageHero
          eyebrow="Documents"
          title="Signatures"
          subtitle="à¸•à¸´à¸”à¸•à¸²à¸¡à¹€à¸­à¸à¸ªà¸²à¸£à¸¥à¸‡à¸™à¸²à¸¡ à¹à¸¢à¸à¸•à¸²à¸¡à¹€à¸”à¸·à¸­à¸™à¹à¸¥à¸°à¸ªà¸–à¸²à¸™à¸° à¸à¸£à¹‰à¸­à¸¡à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¸œà¸¹à¹‰à¸—à¸µà¹ˆà¸¢à¸±à¸‡à¸•à¹‰à¸­à¸‡à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£"
        />
        <main className="min-w-0 bg-[#f3f0fa] p-4 sm:p-6">
          <div
            className={`grid items-start gap-5 ${
              actionSidebarMode === "expanded"
                ? "lg:grid-cols-[200px_minmax(0,1fr)]"
                : actionSidebarMode === "collapsed"
                  ? "lg:grid-cols-[60px_minmax(0,1fr)]"
                  : "grid-cols-1"
            }`}
          >
            {actionSidebarMode === "hidden" ? (
              <div className="order-1 flex justify-start lg:col-span-full">
                <button
                  type="button"
                  onClick={() => setActionSidebarMode("expanded")}
                  className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-xs font-bold">DA</span>
                  Show Document Actions
                </button>
              </div>
            ) : (
              <aside className="order-1 sticky top-4 z-30 rounded-[20px] border border-violet-100 bg-white p-2.5 shadow-[0_14px_34px_rgba(88,28,135,0.10)]">
                <div className="flex items-center justify-between gap-2 px-1">
                  {actionSidebarMode === "expanded" ? (
                    <div className="min-w-0">
                      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-violet-500">
                        Signatures
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-slate-950">Document Actions</div>
                    </div>
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-100 to-fuchsia-100 text-[10px] font-bold text-violet-700">
                      DA
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title={actionSidebarMode === "expanded" ? "Collapse actions" : "Expand actions"}
                      aria-label={actionSidebarMode === "expanded" ? "Collapse Document Actions" : "Expand Document Actions"}
                      onClick={() =>
                        setActionSidebarMode((current) => (current === "expanded" ? "collapsed" : "expanded"))
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                    >
                      {actionSidebarMode === "expanded" ? "â€¹" : "â€º"}
                    </button>
                    <button
                      type="button"
                      title="Hide Document Actions"
                      aria-label="Hide Document Actions"
                      onClick={() => setActionSidebarMode("hidden")}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                    >
                      Ã—
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  <div className="group relative">
                    <button
                      type="button"
                      title="Monthly Payment PDF"
                      aria-label="Monthly Payment PDF"
                      onClick={generatePaymentPdf}
                      disabled={selectedMonth === "all" || !selectedMonthPaymentExportDocs.length}
                      className={`flex w-full items-center rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(124,58,237,0.20)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(124,58,237,0.28)] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none ${
                        actionSidebarMode === "expanded"
                          ? "gap-2.5 px-2.5 py-2.5 text-left"
                          : "justify-center px-2 py-2.5"
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/18 text-[9px] font-bold">
                        PDF
                      </span>
                      {actionSidebarMode === "expanded" ? <span>Monthly Payment PDF</span> : null}
                    </button>
                    <div
                      role="tooltip"
                      className="pointer-events-none invisible absolute left-full top-1/2 z-50 ml-3 w-64 -translate-y-1/2 rounded-xl border border-violet-100 bg-slate-950 px-3 py-2.5 text-left opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100"
                    >
                      <div className="text-xs font-semibold text-white">Monthly Payment PDF</div>
                      <div className="mt-1 text-[11px] font-normal leading-5 text-slate-300">
                        à¸ªà¹ˆà¸‡à¸­à¸­à¸à¸£à¸²à¸¢à¸‡à¸²à¸™à¸ªà¸£à¸¸à¸› Incentive à¸‚à¸­à¸‡à¹€à¸”à¸·à¸­à¸™à¸—à¸µà¹ˆà¹€à¸¥à¸·à¸­à¸à¹€à¸›à¹‡à¸™à¹„à¸Ÿà¸¥à¹Œ PDF
                      </div>
                    </div>
                  </div>

                  <div className="group relative">
                    <button
                      type="button"
                      title="Monthly Payment Excel"
                      aria-label="Monthly Payment Excel"
                      onClick={generatePaymentExcel}
                      disabled={selectedMonth === "all" || !selectedMonthPaymentExportDocs.length}
                      className={`flex w-full items-center rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 text-xs font-semibold text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_8px_18px_rgba(16,185,129,0.14)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:from-slate-100 disabled:to-slate-100 disabled:text-slate-400 disabled:shadow-none ${
                        actionSidebarMode === "expanded"
                          ? "gap-2.5 px-2.5 py-2.5 text-left"
                          : "justify-center px-2 py-2.5"
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-[9px] font-bold text-emerald-700">
                        XLS
                      </span>
                      {actionSidebarMode === "expanded" ? <span>Monthly Payment Excel</span> : null}
                    </button>
                    <div
                      role="tooltip"
                      className="pointer-events-none invisible absolute left-full top-1/2 z-50 ml-3 w-64 -translate-y-1/2 rounded-xl border border-emerald-100 bg-slate-950 px-3 py-2.5 text-left opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100"
                    >
                      <div className="text-xs font-semibold text-white">Monthly Payment Excel</div>
                      <div className="mt-1 text-[11px] font-normal leading-5 text-slate-300">
                        à¸ªà¹ˆà¸‡à¸­à¸­à¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥ Incentive à¸‚à¸­à¸‡à¹€à¸”à¸·à¸­à¸™à¸—à¸µà¹ˆà¹€à¸¥à¸·à¸­à¸à¹€à¸›à¹‡à¸™à¹„à¸Ÿà¸¥à¹Œ Excel
                      </div>
                    </div>
                  </div>

                  <div className="group relative">
                    <button
                      type="button"
                      title="Final Signed PDF"
                      aria-label="Final Signed PDF"
                      onClick={generatePdf}
                      disabled={!selectedDocument}
                      className={`flex w-full items-center rounded-xl bg-gradient-to-r from-slate-950 to-indigo-950 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(30,41,59,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(30,41,59,0.26)] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none ${
                        actionSidebarMode === "expanded"
                          ? "gap-2.5 px-2.5 py-2.5 text-left"
                          : "justify-center px-2 py-2.5"
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[8px] font-bold">
                        FINAL
                      </span>
                      {actionSidebarMode === "expanded" ? <span>Final Signed PDF</span> : null}
                    </button>
                    <div
                      role="tooltip"
                      className="pointer-events-none invisible absolute left-full top-1/2 z-50 ml-3 w-64 -translate-y-1/2 rounded-xl border border-indigo-100 bg-slate-950 px-3 py-2.5 text-left opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100"
                    >
                      <div className="text-xs font-semibold text-white">Final Signed PDF</div>
                      <div className="mt-1 text-[11px] font-normal leading-5 text-slate-300">
                        {selectedDocument
                          ? `à¸ªà¸£à¹‰à¸²à¸‡à¹€à¸­à¸à¸ªà¸²à¸£à¸‰à¸šà¸±à¸šà¸ªà¸¡à¸šà¸¹à¸£à¸“à¹Œà¸‚à¸­à¸‡ ${selectedDocument.agentName} à¸à¸£à¹‰à¸­à¸¡à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸à¸²à¸£à¸¥à¸‡à¸™à¸²à¸¡`
                          : "à¸à¸£à¸¸à¸“à¸²à¹€à¸¥à¸·à¸­à¸à¸£à¸²à¸¢à¸Šà¸·à¹ˆà¸­à¸«à¸£à¸·à¸­à¹€à¸¥à¸‚à¹€à¸­à¸à¸ªà¸²à¸£à¸ˆà¸²à¸ Document List à¸à¹ˆà¸­à¸™ Generate"}
                      </div>
                    </div>
                  </div>
                </div>

                {actionSidebarMode === "expanded" ? (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2 text-[10px] font-normal leading-4 text-slate-500">
                    Monthly Payment à¹ƒà¸«à¹‰à¹€à¸¥à¸·à¸­à¸à¹€à¸”à¸·à¸­à¸™ â€¢ Final Signed PDF à¹ƒà¸«à¹‰à¹€à¸¥à¸·à¸­à¸à¸£à¸²à¸¢à¸Šà¸·à¹ˆà¸­à¸«à¸£à¸·à¸­à¹€à¸¥à¸‚à¹€à¸­à¸à¸ªà¸²à¸£à¸à¹ˆà¸­à¸™
                  </div>
                ) : null}
              </aside>
            )}

            <div className="order-2 min-w-0 space-y-5">
              <section data-signature-redesign className="space-y-5">
        <header className="rounded-[28px] border border-violet-100 bg-white px-5 py-4 shadow-[0_18px_50px_rgba(88,28,135,0.08)] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-violet-600">Document View</div>
              <p className="mt-1 text-sm font-normal text-slate-500">à¹€à¸¥à¸·à¸­à¸à¸”à¸¹à¸„à¸´à¸§à¸‡à¸²à¸™à¸›à¸±à¸ˆà¸ˆà¸¸à¸šà¸±à¸™à¸«à¸£à¸·à¸­à¸›à¸£à¸°à¸§à¸±à¸•à¸´à¹€à¸­à¸à¸ªà¸²à¸£</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDocumentView("queue")}
                className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${
                  documentView === "queue"
                    ? "bg-violet-700 text-white shadow-[0_10px_24px_rgba(109,40,217,0.22)]"
                    : "border border-violet-100 bg-white text-violet-700 hover:bg-violet-50"
                }`}
              >
                My Queue ({filteredDocuments.length})
              </button>
              <button
                type="button"
                onClick={() => setDocumentView("history")}
        m«ëŒ+Š×®º+º$zzb¥â6Æ74æÖS×¶&÷VæFVB×†Â‚ÓB’Ó"ãRFW‡B×6ÒföçBÖ&Æ6²G&ç6—F–öâG°¢Fö7VÖVçEf–WrÓÓÒ&†—7F÷'’ ¢ò&&r×6ÆFRÓ“SFW‡B×v†—FR ¢¢&&÷&FW"&÷&FW"×6ÆFRÓ#&r×v†—FRFW‡B×6ÆFRÓs†÷fW#¦&r×6ÆFRÓS ¢ÖĞ¢à¢¶—5W6W"ò%G&6¶–ær"¢$†—7F÷'’'Ò‡¶†—7F÷'”f–ÇFW&VDFö7VÖVçG2æÆVæwF‡Ò¢Âö'WGFöãà¢ÂöF—cà¢ÂöF—cà¢Âö†VFW#à ¢Ç6V7F–öâ6Æ74æÖSÒ'&÷VæFVBÕ³#g…Ò&÷&FW"&÷&FW"×f–öÆWBÓ&r×v†—FRÓB6†F÷rÕ³óg…óC'…÷&v&ƒƒ‚Ã#‚Ã3RÃãb•Ò#à¢ÆF—b6Æ74æÖSÒ&w&–BvÓ2ÖC¦w&–BÖ6öÇ2Ó"†Ã¦w&–BÖ6öÇ2Õ¶Ö–æÖ‚ƒ#c‚Ã3c‚•ós…óC…ó#…öWFõÒ#à¢ÆF—b6Æ74æÖSÒ&&Æö6²#à¢Ç7â6Æ74æÖSÒ&Ö"ÓãR&Æö6²FW‡B×‡2föçBÖ&Æ6²FW‡B×6ÆFRÓS#å6V&6ƒÂ÷7ãà¢ÆF—b6Æ74æÖSÒ'&VÆF—fR#à¢Ç7fp¢&–Ö†–FFVãÒ'G'VR ¢f–Wt&÷ƒÒ##B#B ¢6Æ74æÖSÒ'ö–çFW"ÖWfVçG2ÖæöæR'6öÇWFRÆVgBÓ2ãRF÷Óó"‚ÓBrÓB×G&ç6ÆFR×’Óó"f–ÆÂÖæöæR7G&ö¶R×6ÆFRÓC ¢7G&ö¶Uv–GFƒÒ#" ¢à¢Æ6—&6ÆR7ƒÒ#"7“Ò#"#Ò#r"óà¢ÇF‚CÒ&Ó##Ó2ãRÓ2ãR"óà¢Â÷7fsà¢Æ–çW@¢fÇVS×·6V&6‡Ğ¢öä6†ævS×²†WfVçB’Óâ6WE6V&6‚†WfVçBçF&vWBçfÇVR—Ğ¢öä¶W”F÷vã×²†WfVçB’Óâ°¢–b†WfVçBæ¶W’ÓÓÒ$W66R"’6WE6V&6‚‚""“°¢×Ğ¢Æ6V†öÆFW#Ò%6V&6‚Fö7VÖVçB&VbâÂ66R”B÷"vVçB ¢6Æ74æÖSÒ'rÖgVÆÂ&÷VæFVB×†Â&÷&FW"&÷&FW"×6ÆFRÓ#&r×v†—FR’Ó2ÂÓ"ÓFW‡B×6ÒföçB×6VÖ–&öÆB÷WFÆ–æRÖæöæRG&ç6—F–öâ†÷fW#¦&÷&FW"×f–öÆWBÓ3fö7W3¦&÷&FW"×f–öÆWBÓCfö7W3§&–ærÓ"fö7W3§&–ær×f–öÆWBÓ ¢óà¢·6V&6‚ò€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ6WE6V&6‚‚""—Ğ¢F—FÆSÒ$6ÆV"6V&6‚ ¢&–ÖÆ&VÃÒ$6ÆV"6V&6‚ ¢6Æ74æÖSÒ&'6öÇWFR&–v‡BÓ"ãRF÷Óó"fÆW‚‚ÓrrÓr×G&ç6ÆFR×’Óó"—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖÆrFW‡BÖ&6RföçB×6VÖ–&öÆBFW‡B×6ÆFRÓCG&ç6—F–öâ†÷fW#¦&r×6ÆFRÓ†÷fW#§FW‡B×6ÆFRÓs ¢à¢9p¢Âö'WGFöãà¢’¢çVÆÇĞ¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&&Æö6²#à¢Ç7â6Æ74æÖSÒ&Ö"ÓãR&Æö6²FW‡B×‡2föçBÖ&Æ6²FW‡B×6ÆFRÓS#äÖöçFƒÂ÷7ãà¢ÆFWF–Ç0¢FF×6–væGW&RÖf–ÇFW"ÖG&÷F÷vãÒ'G'VR ¢6Æ74æÖSÒ&w&÷W&VÆF—fR ¢öåFövvÆS×²†WfVçB’Óâ°¢–b†WfVçBæ7W'&VçEF&vWBæ÷Vâ’°¢6Æ÷6T÷F†W%6–væGW&Tf–ÇFW$G&÷F÷vç2†WfVçBæ7W'&VçEF&vWB“°¢Ğ¢×Ğ¢öä&ÇW#×²†WfVçB’Óâ°¢6öç7BæW‡EF&vWBÒWfVçBç&VÆFVEF&vWB2æöFRÂçVÆÃ°¢–b‚æW‡EF&vWBÇÂWfVçBæ7W'&VçEF&vWBæ6öçF–ç2†æW‡EF&vWB’’°¢WfVçBæ7W'&VçEF&vWBç&VÖ÷fTGG&–'WFR‚&÷Vâ"“°¢Ğ¢×Ğ¢à¢Ç7VÖÖ'’6Æ74æÖSÒ&fÆW‚rÖgVÆÂ7W'6÷"×ö–çFW"Æ—7BÖæöæR—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâvÓ"&÷VæFVB×†Â&÷&FW"&÷&FW"×6ÆFRÓ#&r×v†—FR‚Ó2’Ó2FW‡B×6ÒföçBÖ&öÆBFW‡B×6ÆFRÓs÷WFÆ–æRÖæöæRG&ç6—F–öâ†÷fW#¦&÷&FW"×f–öÆWBÓ3†÷fW#¦&r×f–öÆWBÓSóCfö7W2×f—6–&ÆS¦&÷&FW"×f–öÆWBÓC²c£¢×vV&¶—BÖFWF–Ç2ÖÖ&¶W%Ó¦†–FFVâ#à¢Ç7â6Æ74æÖSÒ'G'Væ6FR#à¢·6VÆV7FVDÖöçF‚ÓÓÒ&ÆÂ"ò$ÆÂÖöçF‡2"¢vWDÖöçF„Æ&VÂ‡6VÆV7FVDÖöçF‚—Ğ¢Â÷7ãà¢Ç7â6Æ74æÖSÒ'6‡&–æ²ÓFW‡B×‡2FW‡B×f–öÆWBÓcG&ç6—F–öâw&÷WÖ÷Vã§&÷FFRÓƒ#î(ÈCÂ÷7ãà¢Â÷7VÖÖ'“à¢ÆF—b6Æ74æÖSÒ&'6öÇWFRÆVgBÓF÷Õ¶6Æ2ƒR³‡‚•Ò¢Õ³“ÒrÕ³#c…Ò÷fW&fÆ÷rÖ†–FFVâ&÷VæFVBÓ'†Â&÷&FW"&÷&FW"×f–öÆWBÓ&r×v†—FRÓ"6†F÷rÕ³ó#…óSW…÷&v&ƒ3ÃCÃS’Ãã#•Ò#à¢ÆF—b6Æ74æÖSÒ'‚Ó2"Ó"BÓ#à¢ÆF—b6Æ74æÖSÒ'FW‡BÕ³…ÒföçB×6VÖ–&öÆBWW&66RG&6¶–ærÕ³ã&VÕÒFW‡B×f–öÆWBÓS#äÖöçFƒÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓãRFW‡BÕ³…ÒföçBÖæ÷&ÖÂFW‡B×6ÆFRÓS#î˜Š^‹~ŠŞˆ˜‰N‹~ŠŞ‰ˆ.ŠŞˆ~˜ŠŞˆŠ®‹.Š>‰~‹^˜‰^˜ŠŞˆ~ˆ‹.Š>˜Š®‰NˆsÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&Ö‚Ö‚Õ³3…Ò76R×’Ó÷fW&fÆ÷r×’ÖWFò#à¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²†WfVçB’Óâ°¢6WE6VÆV7FVDÖöçF‚‚&ÆÂ"“°¢WfVçBæ7W'&VçEF&vWBæ6Æ÷6W7B‚&FWF–Ç2"“òç&VÖ÷fTGG&–'WFR‚&÷Vâ"“°¢×Ğ¢6Æ74æÖS×¶fÆW‚rÖgVÆÂ—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâ&÷VæFVB×†Â‚Ó2’Ó"ãRFW‡BÖÆVgBG&ç6—F–öâG°¢6VÆV7FVDÖöçF‚ÓÓÒ&ÆÂ"ò&&r×f–öÆWBÓFW‡B×f–öÆWBÓƒ"¢'FW‡B×6ÆFRÓs†÷fW#¦&r×6ÆFRÓS ¢ÖĞ¢à¢Ç7ãà¢Ç7â6Æ74æÖSÒ&&Æö6²FW‡B×‡2föçB×6VÖ–&öÆB#äÆÂÖöçF‡3Â÷7ãà¢Ç7â6Æ74æÖSÒ&×BÓãR&Æö6²FW‡BÕ³…ÒföçBÖæ÷&ÖÂFW‡B×6ÆFRÓS#î˜Š®‰Nˆ~˜ŠŞˆŠ®‹.Š>‰~‹ˆ˜‰N‹~ŠŞ‰“Â÷7ãà¢Â÷7ãà¢·6VÆV7FVDÖöçF‚ÓÓÒ&ÆÂ"ò€¢Ç7â6Æ74æÖSÒ&fÆW‚‚ÓRrÓR—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂ&r×f–öÆWBÓsFW‡BÕ³…ÒföçBÖ&öÆBFW‡B×v†—FR#î)É3Â÷7ãà¢’¢çVÆÇĞ¢Âö'WGFöãà¢¶ÖöçF„÷F–öç2æÖ‚†ÖöçF‚’Óâ°¢6öç7B6VÆV7FVBÒ6VÆV7FVDÖöçF‚ÓÓÒÖöçFƒ°¢&WGW&â€¢Æ'WGFöà¢¶W“×¶ÖöçF‡Ğ¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²†WfVçB’Óâ°¢6WE6VÆV7FVDÖöçF‚†ÖöçF‚“°¢WfVçBæ7W'&VçEF&vWBæ6Æ÷6W7B‚&FWF–Ç2"“òç&VÖ÷fTGG&–'WFR‚&÷Vâ"“°¢×Ğ¢6Æ74æÖS×¶fÆW‚rÖgVÆÂ—FV×2Ö6VçFW"Ú±î¸Â¸­yêë¢°k¢G§¦*^justify-between rounded-xl px-3 py-2.5 text-left transition ${
                            selected ? "bg-violet-100 text-violet-800" : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span className="text-xs font-semibold">{getMonthLabel(month)}</span>
                          {selected ? (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-700 text-[10px] font-bold text-white">âœ“</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </details>
            </div>
            <div className="block">
              <span className="mb-1.5 block text-xs font-black text-slate-500">Year</span>
              <details
                data-signature-filter-dropdown="true"
                className="group relative"
                onToggle={(event) => {
                  if (event.currentTarget.open) {
                    closeOtherSignatureFilterDropdowns(event.currentTarget);
                  }
                }}
                onBlur={(event) => {
                  const nextTarget = event.relatedTarget as Node | null;
                  if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
                    event.currentTarget.removeAttribute("open");
                  }
                }}
              >
                <summary className="flex w-full cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none transition hover:border-violet-300 hover:bg-violet-50/40 focus-visible:border-violet-400 [&::-webkit-details-marker]:hidden">
                  <span className="truncate">{selectedYear === "all" ? "All Years" : selectedYear}</span>
                  <span className="shrink-0 text-xs text-violet-600 transition group-open:rotate-180">âŒ„</span>
                </summary>
                <div className="absolute left-0 top-[calc(100%+8px)] z-[90] w-[220px] overflow-hidden rounded-2xl border border-violet-100 bg-white p-2 shadow-[0_20px_55px_rgba(30,41,59,0.20)]">
                  <div className="px-3 pb-2 pt-1">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-500">Year</div>
                    <div className="mt-0.5 text-[11px] font-normal text-slate-500">à¹€à¸¥à¸·à¸­à¸à¸›à¸µ à¸„.à¸¨. à¸‚à¸­à¸‡à¹€à¸­à¸à¸ªà¸²à¸£</div>
                  </div>
                  <div className="space-y-1">
                    {(["all", ...yearOptions] as string[]).map((year) => {
                      const selected = selectedYear === year;
                      return (
                        <button
                          key={year}
                          type="button"
                          onClick={(event) => {
                            setSelectedYear(year);
                            event.currentTarget.closest("details")?.removeAttribute("open");
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${
                            selected ? "bg-violet-100 text-violet-800" : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span className="text-xs font-semibold">{year === "all" ? "All Years" : year}</span>
                          {selected ? (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-700 text-[10px] font-bold text-white">âœ“</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </details>
            </div>
            <div className="block">
              <span className="mb-1.5 block text-xs font-black text-slate-500">Signing Stage</span>
              <details
                data-signature-filter-dropdown="true"
                className="group relative"
                onToggle={(event) => {
                  if (event.currentTarget.open) {
                    closeOtherSignatureFilterDropdowns(event.currentTarget);
                  }
                }}
                onBlur={(event) => {
                  const nextTarget = event.relatedTarget as Node | null;
                  if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
                    event.currentTarget.removeAttribute("open");
                  }
                }}
              >
                <summary
                  title={getSigningStageOption(statusFilter).description}
                  className="flex w-full cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none transition hover:border-violet-300 hover:bg-violet-50/40 focus-visible:border-violet-400 [&::-webkit-details-marker]:hidden"
                >
                  <span className="truncate">{getSigningStageOption(statusFilter).label}</span>
                  <span className="shrink-0 text-xs text-violet-600 transition group-open:rotate-180">âŒ„</span>
                </summary>

                <div className="absolute right-0 top-[calc(100%+8px)] z-[90] w-[310px] overflow-hidden rounded-2xl border border-violet-100 bg-white p-2 shadow-[0_20px_55px_rgba(30,41,59,0.20)]">
                  <div className="px-3 pb-2 pt-1">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-500">
                      Signing Stage
                    </div>
                    <div className="mt-0.5 text-[11px] font-normal text-slate-500">
                      à¹€à¸¥à¸·à¸­à¸à¸‚à¸±à¹‰à¸™à¸•à¸­à¸™à¸‚à¸­à¸‡à¹€à¸­à¸à¸ªà¸²à¸£à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¹à¸ªà¸”à¸‡
                    </div>
                  </div>

                  <div className="grid gam«ëŒ+Š×®º+º$zzb¥çÓ#à¢µ4”tä”äuõ5DtUôõD”ôå2æÖ‚†÷F–öâ’Óâ°¢6öç7B6VÆV7FVBÒ7FGW4f–ÇFW"ÓÓÒ÷F–öâçfÇVS°¢&WGW&â€¢Æ'WGFöà¢¶W“×¶÷F–öâçfÇVWĞ¢G—SÒ&'WGFöâ ¢F—FÆS×¶÷F–öâæFW67&—F–öçĞ¢öä6Æ–6³×²†WfVçB’Óâ°¢6WE7FGW4f–ÇFW"†÷F–öâçfÇVR“°¢WfVçBæ7W'&VçEF&vWBæ6Æ÷6W7B‚&FWF–Ç2"“òç&VÖ÷fTGG&–'WFR‚&÷Vâ"“°¢×Ğ¢6Æ74æÖS×¶&÷VæFVB×†Â‚Ó2’Ó"ãRFW‡BÖÆVgBG&ç6—F–öâG°¢6VÆV7FV@¢ò&&r×f–öÆWBÓFW‡B×f–öÆWBÓƒ ¢¢'FW‡B×6ÆFRÓs†÷fW#¦&r×6ÆFRÓS ¢ÖĞ¢à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâvÓ2#à¢Ç7â6Æ74æÖSÒ'FW‡B×‡2föçB×6VÖ–&öÆB#ç¶÷F–öâæÆ&VÇÓÂ÷7ãà¢·6VÆV7FVBò€¢Ç7â6Æ74æÖSÒ&fÆW‚‚ÓRrÓR—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂ&r×f–öÆWBÓsFW‡BÕ³…ÒföçBÖ&öÆBFW‡B×v†—FR#à¢)É0¢Â÷7ãà¢’¢çVÆÇĞ¢ÂöF—cà¢ÆF—`¢6Æ74æÖS×¶×BÓFW‡BÕ³…ÒföçBÖæ÷&ÖÂÆVF–ærÓBG°¢6VÆV7FVBò'FW‡B×f–öÆWBÓc"¢'FW‡B×6ÆFRÓS ¢ÖĞ¢à¢¶÷F–öâæFW67&—F–öçĞ¢ÂöF—cà¢Âö'WGFöãà¢“°¢Ò—Ğ¢ÂöF—cà¢ÂöF—cà¢ÂöFWF–Ç3à¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2ÖVæB§W7F–g’ÖVæB#à¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×¶6ÆV%v÷&·76Tf–ÇFW'7Ğ¢6Æ74æÖSÒ&–æÆ–æRÖfÆW‚‚Õ³Cg…ÒrÖWFòÖ–â×rÕ³‡…Ò—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"v†—FW76RÖæ÷w&&÷VæFVB×†Â&÷&FW"&÷&FW"×6ÆFRÓ#&r×v†—FR‚ÓBFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×6ÆFRÓsG&ç6—F–öâ†÷fW#¦&÷&FW"×f–öÆWBÓ#†÷fW#¦&r×f–öÆWBÓS†÷fW#§FW‡B×f–öÆWBÓs ¢à¢6ÆV"f–ÇFW'0¢Âö'WGFöãà¢ÂöF—cà¢ÂöF—cà ¢·V–6´f–ÇFW"ÓÒ&ÆÂ"ò€¢ÆF—b6Æ74æÖSÒ&×BÓ2fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâ&÷VæFVB×†Â&÷&FW"&÷&FW"×f–öÆWBÓ&r×f–öÆWBÓSóS‚Ó2’Ó"FW‡B×‡2#à¢Ç7â6Æ74æÖSÒ&föçBÖÖVF—VÒFW‡B×f–öÆWBÓs#à¢7F—fRFö7VÖVçB7FGW3¢·V–6´f–ÇFW"ÓÓÒ'VæF–ær ¢ò%VæF–ær ¢¢V–6´f–ÇFW"ÓÓÒ'6–væVB ¢ò%6–væVB ¢¢V–6´f–ÇFW"ÓÓÒ&–â×&öw&W72 ¢ò$–â&öw&W72 ¢¢$÷fW&GVR'Ğ¢Â÷7ãà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ6WEV–6´f–ÇFW"‚&ÆÂ"—Ğ¢6Æ74æÖSÒ&föçB×6VÖ–&öÆBFW‡B×f–öÆWBÓsVæFW&Æ–æRVæFW&Æ–æRÖöfg6WBÓ" ¢à¢6ÆV"7FGW0¢Âö'WGFöãà¢ÂöF—cà¢’¢çVÆÇĞ¢Â÷6V7F–öãà ¢Ç6V7F–öâ6Æ74æÖSÒ'&÷VæFVBÕ³#g…Ò&÷&FW"&÷&FW"×f–öÆWBÓ&r×v†—FR‚ÓR’ÓB6†F÷rÕ³óg…óC'…÷&v&ƒƒ‚Ã#‚Ã3RÃãb•Ò#à¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓBÆs¦fÆW‚×&÷rÆs¦—FV×2Ö6VçFW"Æs¦§W7F–g’Ö&WGvVVâ#à¢ÆF—cà¢ÆF—b6Æ74æÖSÒ'FW‡B×‡2föçBÖ&Æ6²WW&66RG&6¶–ærÕ³ãfVÕÒFW‡B×f–öÆWBÓc#äÖöçF†Ç’–æ6VçF—fRW‡÷'CÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓFW‡BÖÆrföçBÖ&Æ6²FW‡B×6ÆFRÓ“S#î˜ŠŞˆŠ®‹.Š>Š®˜ˆ~ˆ˜‹.Š"–æ6VçF—fRŠ>‹.Š.˜‰N‹~ŠŞ‰“ÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×6ÆFRÓS#à¢·6VÆV7FVDÖöçF‚ÓÓÒ&ÆÂ ¢ò.˜Š^‹~ŠŞˆ˜‰N‹~ŠŞ‰˜‰î‹~˜ŠŞŠ®Š>˜‹.ˆ~˜ŠŞˆŠ®‹.Š>Š®˜ˆ~ˆ˜‹.Š" ¢¢G¶vWDÖöçF„Æ&VÂ‡6VÆV7FVDÖöçF‚—Ò(
"‰îŠ>˜ŠŞŠŠ®˜ˆ~ŠŞŠŞˆG·6VÆV7FVDÖöçF…–ÖVçDW‡÷'DFö72æÆVæwF‡ÒˆN‰–Ğ¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ"#à  ¢ÂöF—cà¢ÂöF—cà¢·–ÖVçDÖW76vRò€¢ÆF—b6Æ74æÖSÒ&×BÓ2&÷VæFVB×†Â&÷&FW"&÷&FW"ÖVÖW&ÆBÓ#&rÖVÖW&ÆBÓS‚ÓB’Ó2FW‡B×6ÒföçBÖ&Æ6²FW‡BÖVÖW&ÆBÓs#à¢·–ÖVçDÖW76vWĞ¢ÂöF—cà¢’¢çVÆÇĞ¢Â÷6V7F–öãà ¢Ç6V7F–öâ6Æ74æÖSÒ&w&–B—FV×2×7F'BvÓR‚ÓãR†Ã¦w&–BÖ6öÇ2Õ¶Ö–æÖ‚ƒÃg"•ó33…Ò#à¢ÆF—bFFÖFö7VÖVçBÖÆ—7B×c#B6Æ74æÖSÒ&Ö–â×rÓ6VÆb×7F'B÷fW&fÆ÷rÖ†–FFVâ&÷VæFVBÕ³#'…Ò&÷&FW"&÷&FW"×f–öÆWBÓ&rÕ²6fc–fEÒ6†F÷rÕ³óg…óC'…÷&v&ƒƒ‚Ã#‚Ã3RÃã’•Ò#à¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓ2&÷&FW"Ö"&÷&FW"×6ÆFRÓ‚ÓR’ÓBÆs¦fÆW‚×&÷rÆs¦—FV×2Ö6VçFW"Æs¦§W7F–g’Ö&WGvVVâ#à¢ÆF—cà¢Æƒ"6Æ74æÖSÒ'FW‡BÖÆrföçB×6VÖ–&öÆBFW‡B×6ÆFRÓ“S#äFö7VÖVçBÆ—7CÂöƒ#à¢Ç6Æ74æÖSÒ&×BÓãRFW‡B×‡2föçBÖæ÷&ÖÂFW‡B×6ÆFRÓS#à¢ˆNŠ^‹Nˆ‰~‹^˜˜‰nŠ~˜‰î‹~˜ŠŞ‰N‹Š>‹.Š.Š^‹˜ŠŞ‹^Š.‰N˜Š^‹Š^‹>‰N‹‰®ˆ‹.Š>Š^ˆ~‰‹.Š¢Â÷à¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&—FV×2Ö6VçFW"vÓ"#à¢ÆFWF–Ç0¢FF×6–væGW&RÖf–ÇFW"ÖG&÷F÷vãÒ'G'VR ¢6Æ74æÖSÒ&w&÷W&VÆF—fR ¢öåFövvÆS×²†WfVçB’Óâ°¢–b†WfVçBæ7W'&VçEF&vWBæ÷Vâ’°¢6Æ÷6T÷F†W%6–væGW&Tf–ÇFW$G&÷F÷vç2†WfVçBæ7W'&VçEF&vWB“°¢Ğ¢×Ğ¢öä&ÇW#×²†WfVçB’Óâ°¢6öç7BæW‡EF&vWBÒWfVçBç&VÆFVEF&vWB2æöFRÂçVÆÃ°¢–b‚æW‡EF&vWBÇÂWfVçBæ7W'&VçEF&vWBæ6öçF–ç2†æW‡EF&vWB’’°¢WfVçBæ7W'&VçEF&vWBç&VÖ÷fTGG&–'WFR‚&÷Vâ"“°¢Ğ¢×Ğ¢à¢Ç7VÖÖ'’6Æ74æÖSÒ&fÆW‚Ö–â×rÕ³“…Ò7W'6÷&Ú±î¸Â¸­yêë¢°k¢G§¦*^-pointer list-none items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none transition hover:border-violet-300 hover:bg-violet-50/40 [&::-webkit-details-marker]:hidden">
                    <span>
                      <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">Document Status</span>
                      <span className="mt-0.5 block">
                        {quickFilter === "all" ? "All Status" : quickFilter === "pending" ? "Pending" : quickFilter === "signed" ? "Signed" : quickFilter === "in-progress" ? "In Progress" : "Overdue"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-violet-600 transition group-open:rotate-180">âŒ„</span>
                  </summary>
                  <div className="absolute right-0 top-[calc(100%+8px)] z-[90] w-[280px] overflow-hidden rounded-2xl border border-violet-100 bg-white p-2 shadow-[0_20px_55px_rgba(30,41,59,0.20)]">
                    <div className="px-3 pb-2 pt-1">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-500">Document Status</div>
                      <div className="mt-0.5 text-[11px] font-normal text-slate-500">à¹€à¸¥à¸·à¸­à¸à¸ªà¸–à¸²à¸™à¸°à¹‚à¸”à¸¢à¸£à¸§à¸¡à¸‚à¸­à¸‡à¹€à¸­à¸à¸ªà¸²à¸£</div>
                    </div>
                    {([
                      ["all", "All Status", "à¹à¸ªà¸”à¸‡à¹€à¸­à¸à¸ªà¸²à¸£à¸—à¸¸à¸à¸ªà¸–à¸²à¸™à¸°"],
                      ["pending", "Pending", "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸œà¸¹à¹‰à¸¥à¸‡à¸™à¸²à¸¡à¸«à¸£à¸·à¸­à¸à¸³à¸¥à¸±à¸‡à¸£à¸­à¹€à¸£à¸´à¹ˆà¸¡à¸¥à¸‡à¸™à¸²à¸¡"],
                      ["signed", "Signed", "à¸¥à¸‡à¸™à¸²à¸¡à¸„à¸£à¸šà¸—à¸¸à¸ Role à¹à¸¥à¹‰à¸§"],
                      ["in-progress", "In Progress", "à¸¥à¸‡à¸™à¸²à¸¡à¹à¸¥à¹‰à¸§à¸šà¸²à¸‡ Role à¹à¸¥à¸°à¸¢à¸±à¸‡à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£à¹„à¸¡à¹ˆà¸„à¸£à¸š"],
                      ["expired", "Overdue", "à¹€à¸¥à¸¢à¸à¸³à¸«à¸™à¸”à¸¥à¸‡à¸™à¸²à¸¡à¹à¸¥à¸°à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸„à¸£à¸š"],
                    ] as const).map(([value, label, description]) => {
                      const selected = quickFilter === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          title={description}
                          onClick={(event) => {
                            setQuickFilter(value as WorkspaceQuickFilter);
                            event.currentTarget.closest("details")?.removeAttribute("open");
                          }}
                          className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                            selected ? "bg-violet-100 text-violet-800" : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold">{label}</span>
                            {selected ? (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-700 text-[10px] font-bold text-white">âœ“</span>
                            ) : null}
                          </div>
                          <div className={`mt-1 text-[11px] font-normal leading-4 ${selected ? "text-violet-600" : "text-slate-500"}`}>
                            {description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </details>

                <span className="rounded-full bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">
                  {workspaceDocuments.length} Documents
                </span>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {groupedWorkspaceDocuments.map((group) => {
                const expanded = expandedMonths[group.monthKey] !== false;
                return (
                  <div key={group.monthKey}>
                    <button
                      type="button"
                      onClick={() => setExpandedMonths((previous) => ({ ...previous, [group.monthKey]: !expanded }))}
                      className="flex w-full items-center justify-between bg-gradient-to-r from-violet-50 to-indigo-50/60 px-5 py-2.5 text-left transition hover:from-violet-100/70 hover:to-indigo-50"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white">{group.monthLabel}</span>
                        <span className="text-sm font-medium text-slate-700">{group.items.length} Documents</span>
                      </span>
                      <span className="text-xs font-medium text-violet-700">{expanded ? "Hide" : "Show"}</span>
                    </button>

                    {expanded ? (
                      <>
                        <div className="mx-3 hidden grid-cols-[minmax(0,0.92fr)_minmax(0,1.6fr)_minmax(0,1.35fr)_minmax(0,0.68fr)_minmax(0,0.82fr)_minmax(0,0.92fr)] items-stretch gap-1 overflow-hidden rounded-xl border border-violet-100 bg-white p-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] shadow-sm md:grid">
                          <div className="flex min-w-0 items-center justify-center rounded-lg bg-violet-100/80 px-2 py-2 text-center text-violet-700">
                            Document Ref.
                          </div>
                          <div className="flex min-w-0 items-center justify-center rounded-lg bg-fuchsia-50 px-2 py-2 text-center text-fuchsia-700">
                            Assessed Agent
                          </div>
                          <div className="flex min-w-0 items-center justify-center rounded-lg bg-sky-50 px-2 py-2 text-center text-sky-700">
                            Document Type
     m«ëŒ+Š×®º+º$zzb¥âÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö–â×rÓ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖÆr&r×6ÆFRÓ‚Ó"’Ó"FW‡BÖ6VçFW"FW‡B×6ÆFRÓs#à¢7FGW0¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö–â×rÓ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖÆr&rÖÖ&W"ÓS‚Ó"’Ó"FW‡BÖ6VçFW"FW‡BÖÖ&W"Ós#à¢VæF–ær&öÆW0¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö–â×rÓ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖÆr&rÖ–æF–vòÓS‚Ó"’Ó"FW‡BÖ6VçFW"FW‡BÖ–æF–vòÓs#à¢VæF–ær6–væW'0¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&F—f–FR×’F—f–FR×6ÆFRÓ#à¢¶w&÷Wæ—FV×2æÖ‚†Fö2’Óâ°¢6öç7BVçG&–W2ÒVffV7F—fTVçG&–W4f÷$Fö2†Fö2Â6–væGW&W2“°¢6öç7B7FGW2ÒvWEv÷&·76U7FGW2†Fö2ÂVçG&–W2“°¢6öç7B6VÆV7FVBÒ6VÆV7FVDFö7VÖVçCòæ–BÓÓÒFö2æ–C°¢6öç7BFö7VÖVçE&VbÒvWDÖöçF†Ç”Fö7VÖVçE&Vb†Fö2ÂFö7VÖVçG2“°¢6öç7BFö5VæF–æu&öÆW2ÒvWEVæF–æu&öÆW2†VçG&–W2“°¢&WGW&â€¢Æ'WGFöà¢¶W“×¶Fö2æ–GĞ¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ÷Våv÷&·76TFWF–Â†Fö2æ–B—Ğ¢6Æ74æÖS×¶×‚Ó2×’ÓãRw&–BrÕ¶6Æ2ƒRÓãW&VÒ•Ò7W'6÷"×ö–çFW"vÓ"÷fW&fÆ÷rÖ†–FFVâ&÷VæFVB×†Â&÷&FW"‚ÓB’Ó"FW‡BÖÆVgBG&ç6—F–öâfö7W3¦÷WFÆ–æRÖæöæRfö7W2×f—6–&ÆS§&–ærÓ"fö7W2×f—6–&ÆS§&–ær×f–öÆWBÓSÖC¦w&–BÖ6öÇ2Õ¶Ö–æÖ‚ƒÃã“&g"•öÖ–æÖ‚ƒÃãfg"•öÖ–æÖ‚ƒÃã3Vg"•öÖ–æÖ‚ƒÃãc†g"•öÖ–æÖ‚ƒÃãƒ&g"•öÖ–æÖ‚ƒÃã“&g"•ÒÖC¦—FV×2Ö6VçFW"ÖC¦vÓG°¢6VÆV7FV@¢ò&&÷&FW"×f–öÆWBÓ3&r×f–öÆWBÓS6†F÷rÕ³ó‡…ó#…÷&v&ƒ#BÃS‚Ã#3rÃã"•Ò ¢¢&&÷&FW"×6ÆFRÓ&r×v†—FR6†F÷r×6Ò†÷fW#¦&÷&FW"×f–öÆWBÓ#†÷fW#¦&r×v†—FR†÷fW#§6†F÷rÕ³ó‡…ó‡…÷&v&ƒƒ‚Ã#‚Ã3RÃã‚•Ò ¢ÖĞ¢à¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓ#à¢ÆF—b6Æ74æÖSÒ'FW‡BÕ³…ÒföçBÖÖVF—VÒFW‡B×6ÆFRÓCÖC¦†–FFVâ#äFö7VÖVçB&VbãÂöF—cà¢ÆF—b6Æ74æÖSÒ'G'Væ6FRFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×f–öÆWBÓƒ"F—FÆS×¶Fö7VÖVçE&VgÓç¶Fö7VÖVçE&VgÓÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓ#à¢ÆF—b6Æ74æÖSÒ'G'Væ6FRFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×6ÆFRÓ“S#ç¶Fö2ævVçDæÖWÓÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓãRG'Væ6FRFW‡B×‡2föçBÖæ÷&ÖÂFW‡B×6ÆFRÓS#à¢¶Fö2çFVÔæÖRÇÂ"Ò'Ò(
"¶Fö2æ66T6÷VçGÒ˜ˆNŠ¢(
"¶Fö2æfW&vU66÷&RçFôf—†VBƒ"—Ğ¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓ÷fW&fÆ÷rÖ†–FFVâ#à¢ÆF—b6Æ74æÖSÒ&ÖC¦†–FFVâFW‡BÕ³…ÒföçBÖÖVF—VÒFW‡B×6ÆFRÓC#äFö7VÖVçBG—SÂöF—cà¢Ç7à¢6Æ74æÖSÒ&–æÆ–æRÖfÆW‚Ö‚×rÖgVÆÂ—FV×2Ö6VçFW"&÷VæFVBÖÆr&÷&FW"&÷&FW"×6·’Ó&r×6·’ÓS‚Ó"ãR’ÓFW‡BÕ³…ÒföçB×6VÖ–&öÆBÆVF–ærÓBFW‡B×6·’Óƒ ¢F—FÆS×¶vWDFö7VÖVçEG—TÆ&VÂ†Fö2—Ğ¢à¢Ç7â6Æ74æÖSÒ'G'Væ6FR#ç¶vWDFö7VÖVçEG—TÆ&VÂ†Fö2—ÓÂ÷7ãà¢Â÷7ãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö–â×rÓ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"FW‡BÖ6VçFW"ÖC¦§W7F–g’×6VÆbÖ6VçFW"#ãÅv÷&·76U7FGW4&FvR7FGW3×·7FGW7ÒóãÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö–â×rÓfÆW‚Ö6öÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓFW‡BÖ6VçFW"ÖC¦§W7F–g’×6VÆbÖ6VçFW"#à¢¶Fö5VæF–æu&öÆW2æÆVæwF‚ò€¢Fö5VæF–æu&öÆW2æÖ‚‡&öÆR’Óâ€¢Ç7à¢¶W“×¶G¶Fö2æ–GÒ×VæF–ær×&öÆRÒG·&öÆWÖĞ¢6Æ74æÖSÒ&–æÆ–æRÖfÆW‚rÖf—BÖ‚×rÖgVÆÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂ&÷&FW"&÷&FW"ÖÖ&W"Ó#&rÖÖ&W"ÓS‚Ó"ãR’ÓFW‡BÕ³…ÒföçB×6VÖ–&öÆBÆVF–ærÓBFW‡BÖÖ&W"Ós ¢F—FÆS×·&öÆRÓÓÒ%6Væ–÷""ò%6Væ–÷"òFVÒÆVB"¢&öÆWĞ¢à¢Ç7â6Æ74æÖSÒ&Ö‚×rÖgVÆÂG'Væ6FR#à¢·&öÆRÓÓÒ%6Væ–÷""ò%6Væ–÷"òFVÒÆVB"¢&öÆWĞ¢Â÷7ãà¢Â÷7ãà¢’¢’¢€¢Ç7â6Æ74æÖSÒ&–æÆ–æRÖfÆW‚rÖf—B—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂ&÷&FW"&÷&FW"ÖVÖW&ÆBÓ#&rÖVÖW&ÆBÓS‚Ó"ãR’ÓFW‡BÕ³…ÒföçB×6VÖ–&öÆBÆVF–ærÓBFW‡BÖVÖW&ÆBÓs#à¢6ö×ÆWFV@¢Â÷7ãà¢—Ğ¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö–â×rÓfÆW‚Ö6öÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ÷fW&fÆ÷rÖ†–FFVâFW‡BÖ6VçFW"ÖC¦§W7F–g’×6VÆbÖ6VçFW"#à¢¶Fö5VæF–æu&öÆW2æÆVæwF‚ò€¢Fö5VæF–æu&öÆW2æÖ‚‡&öÆR’Óâ°¢6öç7B6–væW$æÖRÒvWE&öÆU6–væW"†Fö2Â&öÆR’ÇÂ"Ò#°¢&WGW&â€¢Ç7à¢¶W“×¶G¶Fö2æ–GÒ×VæF–ær×6–væW"ÒG·&öÆWÖĞ¢6Æ74æÖSÒ&–æÆ–æRÖfÆW‚rÖf—BÖ–â×rÓÖ‚×rÖgVÆÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂ&÷&FW"Ú±î¸Â¸­yêë¢°k¢G§¦*^                     </div>
                          <div className="flex min-w-0 items-center justify-center rounded-lg bg-slate-100 px-2 py-2 text-center text-slate-700">
                            Status
                          </div>
                          <div className="flex min-w-0 items-center justify-center rounded-lg bg-amber-50 px-2 py-2 text-center text-amber-700">
                            Pending Roles
                          </div>
                          <div className="flex min-w-0 items-center justify-center rounded-lg bg-indigo-50 px-2 py-2 text-center text-indigo-700">
                            Pending Signers
                          </div>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {group.items.map((doc) => {
                            const entries = effectiveEntriesForDoc(doc, signatures);
                            const status = getWorkspaceStatus(doc, entries);
                            const selected = selectedDocument?.id === doc.id;
                            const documentRef = getMonthlyDocumentRef(doc, documents);
                            const docPendingRoles = getPendingRoles(entries);
                            return (
                              <button
                                key={doc.id}
                                type="button"
                                onClick={() => openWorkspaceDetail(doc.id)}
                                className={`mx-3 my-1.5 grid w-[calc(100%-1.5rem)] cursor-pointer gap-2 overflow-hidden rounded-xl border px-4 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.6fr)_minmax(0,1.35fr)_minmax(0,0.68fr)_minmax(0,0.82fr)_minmax(0,0.92fr)] md:items-center md:gap-1 ${
                                  selected
                                    ? "border-violet-300 bg-violet-50 shadow-[0_8px_20px_rgba(124,58,237,0.12)]"
                                    : "border-slate-100 bg-white shadow-sm hover:border-violet-200 hover:bg-white hover:shadow-[0_8px_18px_rgba(88,28,135,0.08)]"
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-[10px] font-medium text-slate-400 md:hidden">Document Ref.</div>
                                  <div className="truncate text-sm font-semibold text-violet-800" title={documentRef}>{documentRef}</div>
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-slate-950">{doc.agentName}</div>
                                  <div className="mt-0.5 truncate text-xs font-normal text-slate-500">
                                    {doc.teamName || "-"} â€¢ {doc.caseCount} à¹€à¸„à¸ª â€¢ {doc.averageScore.toFixed(2)}
                                  </div>
                                </div>
                                <div className="min-w-0 overflow-hidden">
                                  <div className="md:hidden text-[10px] font-medium text-slate-400">Document Type</div>
                                  <span
                                    className="inline-flex max-w-full items-center rounded-lg border border-sky-100 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold leading-4 text-sky-800"
                                    title={getDocumentTypeLabel(doc)}
                                  >
                                    <span className="truncate">{getDocumentTypeLabel(doc)}</span>
                                  </span>
                                </div>
                                <div className="flex min-w-0 items-center justify-center text-center md:justify-self-center"><WorkspaceStatusBadge status={status} /></div>
                                <div className="flex min-w-0 flex-col items-center justify-center gap-1 text-center md:justify-self-center">
                                  {docPendingRoles.length ? (
                                    docPendingRoles.map((role) => (
                                      <span
                                        key={`${doc.id}-pending-role-${role}`}
                                        className="inline-flex w-fit max-w-full items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold leading-4 text-amber-700"
                                        title={role === "Senior" ? "Senior / Team Lead" : role}
                                      >
                                        <span className="max-w-full truncate">
                                          {role === "Senior" ? "Senior / Team Lead" : role}
                                        </span>
                                      </span>
                                    ))
                                  ) : (
                                    <span className="inline-flex w-fit items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold leading-4 text-emerald-700">
                                      Completed
                                    </span>
                                  )}
                                </div>
                                <div className="flex min-w-0 flex-col items-center justify-center gap-1 overflow-hidden text-center md:justify-self-center">
                                  {docPendingRoles.length ? (
                                    docPendingRoles.map((role) => {
                                      const signerName = getRoleSigner(doc, role) || "-";
                                      return (
                                        <span
                                          key={`${doc.id}-pending-signer-${role}`}
                                          className="inline-flex w-fit min-w-0 max-w-full items-center justify-center rounded-full border m«ëŒ+Š×®º+º$zzb¥â—Ğ¢&–ÖÆ&VÃÒ$6Æ÷6RFö7VÖVçBFWF–Ç2 ¢6Æ74æÖSÒ&fÆW‚‚Ó’rÓ’6‡&–æ²Ó—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂ&÷&FW"&÷&FW"×6ÆFRÓ#FW‡B×†ÂföçBÖæ÷&ÖÂFW‡B×6ÆFRÓSG&ç6—F–öâ†÷fW#¦&r×6ÆFRÓS ¢à¢9p¢Âö'WGFöãà¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&×BÓ2fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâvÓ2#à¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓG'Væ6FRFW‡B×6ÒföçBÖÖVF—VÒFW‡B×6ÆFRÓs#ç·6VÆV7FVDFö7VÖVçBævVçDæÖWÓÂöF—cà¢Åv÷&·76U7FGW4&FvR7FGW3×¶vWEv÷&·76U7FGW2‡6VÆV7FVDFö7VÖVçBÂ6VÆV7FVDVçG&–W2—Òóà¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&×BÓB÷fW&fÆ÷rÖ†–FFVâ&÷VæFVBÓ'†Â&÷&FW"&÷&FW"×6ÆFRÓ##à¢µ°¢²$ÖöçF‚"Â6VÆV7FVDFö7VÖVçBæÖöçF„Æ&VÅÒÀ¢²%FVÒ"Â6VÆV7FVDFö7VÖVçBçFVÔæÖRÇÂ"Ò%ÒÀ¢²$Fö7VÖVçBG—R"ÂvWDFö7VÖVçEG—TÆ&VÂ‡6VÆV7FVDFö7VÖVçB•ÒÀ¢²$VF—BFFR"Âf÷&ÖDFFTöæÇ’†vWE6–væGW&T7&VFVDFFR‡6VÆV7FVDFö7VÖVçB’•ÒÀ¢²$GVRFFR"Âf÷&ÖDFFTöæÇ’†vWE6–væGW&TGVTFFR‡6VÆV7FVDFö7VÖVçBæÖöçF„¶W’’•ÒÀ¢²%VæF–ær&öÆW2"ÂvWEVæF–æu&öÆW2‡6VÆV7FVDVçG&–W2’æÆVæwF€¢òvWEVæF–æu&öÆW2‡6VÆV7FVDVçG&–W2¢æÖ‚‡&öÆR’Óâ‡&öÆRÓÓÒ%6Væ–÷""ò%6Væ–÷"òFVÒÆVB"¢&öÆR’¢æ¦ö–â‚"Â"¢¢$6ö×ÆWFVB%ÒÀ¢ÒæÖ‚…¶Æ&VÂÂfÇVUÒÂ–æFW‚Â&÷w2’Óâ€¢ÆF—`¢¶W“×¶Æ&VÇĞ¢6Æ74æÖS×¶w&–Bw&–BÖ6öÇ2Õ³G…öÖ–æÖ‚ƒÃg"•ÒvÓ2‚Ó2ãR’Ó"ãRFW‡B×6ÒG°¢–æFW‚Â&÷w2æÆVæwF‚Òò&&÷&FW"Ö"&÷&FW"×6ÆFRÓ"¢" ¢ÖĞ¢à¢ÆF—b6Æ74æÖSÒ&föçBÖæ÷&ÖÂFW‡B×6ÆFRÓS#ç¶Æ&VÇÓÂöF—cà¢ÆF—b6Æ74æÖSÒ&'&V²×v÷&G2föçBÖÖVF—VÒFW‡B×6ÆFRÓ“#ç·fÇVWÓÂöF—cà¢ÂöF—cà¢’—Ğ¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&×BÓR#à¢ÆF—b6Æ74æÖSÒ'FW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×6ÆFRÓ“S#å6–væGW&RF–ÖVÆ–æSÂöF—cà¢ÆF—b6Æ74æÖSÒ'&VÆF—fR×BÓ276R×’Ó"#à¢ÆF—b6Æ74æÖSÒ&'6öÇWFR&÷GFöÒÓRÆVgBÕ³W…ÒF÷ÓRr×‚&r×6ÆFRÓ#"óà¢µ4”täEU$UôdÄõræÖ‚‡&öÆRÂ–æFW‚’Óâ°¢6öç7B6–væVDVçG'’ÒvWE6–væVDVçG'’‡6VÆV7FVDVçG&–W2Â&öÆR“°¢6öç7Bv—fVDVçG'’ÒvWEv—fVDVçG'’‡6VÆV7FVDVçG&–W2Â&öÆR“°¢6öç7B6ö×ÆWFVDVçG'’Ò6–væVDVçG'’ÇÂv—fVDVçG'“°¢6öç7B7W'&VçE&öÆRÒvWEVæF–æu&öÆW2‡6VÆV7FVDVçG&–W2•³Ó°¢6öç7B—47W'&VçBÒ6ö×ÆWFVDVçG'’bb7W'&VçE&öÆRÓÓÒ&öÆS°¢6öç7B6–væW$æÖRÒv—fVDVçG'“òçv—fVD'’ÇÂ6–væVDVçG'“òç6–væVD'’ÇÂvWE&öÆU6–væW"‡6VÆV7FVDFö7VÖVçBÂ&öÆR“°¢&WGW&â€¢ÆF—`¢¶W“×·&öÆWĞ¢6Æ74æÖS×¶&VÆF—fRfÆW‚vÓ2&÷VæFVB×†Â‚Ó"’Ó"ãRG°¢—47W'&VçBò&&÷&FW"&÷&FW"×f–öÆWBÓ&r×f–öÆWBÓS"¢" ¢ÖĞ¢à¢ÆF—b6Æ74æÖS×¶&VÆF—fR¢ÓfÆW‚‚Ó‚rÓ‚6‡&–æ²Ó—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂFW‡B×‡2föçB×6VÖ–&öÆBG°¢6ö×ÆWFVDVçG'¢òv—fVDVçG'¢ò&&r×6·’ÓFW‡B×6·’Ós ¢¢&&rÖVÖW&ÆBÓFW‡BÖVÖW&ÆBÓs ¢¢—47W'&Vç@¢ò&&r×f–öÆWBÓsFW‡B×v†—FR ¢¢&&r×6ÆFRÓFW‡B×6ÆFRÓS ¢ÖÓà¢¶–æFW‚²Ğ¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓfÆW‚Ó#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2×7F'B§W7F–g’Ö&WGvVVâvÓ"#à¢ÆF—b6Æ74æÖSÒ'FW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×6ÆFRÓ“#ç·&öÆRÓÓÒ%6Væ–÷""ò%6Væ–÷"òFVÒÆVB"¢&öÆWÓÂöF—cà¢Ç7â6Æ74æÖS×¶6‡&–æ²Ó&÷VæFVBÖgVÆÂ‚Ó"’ÓFW‡BÕ³…ÒföçBÖÖVF—VÒG°¢6ö×ÆWFVDVçG'¢òv—fVDVçG'¢ò&&r×6·’ÓSFW‡B×6·’Ós ¢¢&&rÖVÖW&ÆBÓSFW‡BÖVÖW&ÆBÓs ¢¢—47W'&Vç@¢ò&&rÖÖ&W"ÓSFW‡BÖÖ&W"Ós ¢¢&&r×6ÆFRÓFW‡B×6ÆFRÓS ¢ÖÓà¢·v—fVDVçG'’ò%v—fVB"¢6–væVDVçG'’ò%6–væVB"¢—47W'&VçBò$7W'&VçB"¢%VæF–ær'Ğ¢Â÷7ãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓãRG'Væ6FRFW‡B×‡2föçBÖæ÷&ÖÂFW‡B×6ÆFRÓS#à¢·v—fVDVçG'¢ò&W6–væVBG·v—fVDVçG'’ç&W6–væF–öäFFRÇÂ"'Ò(
"6öæf—&ÖVB'’G·6–væW$æÖWÖ ¢¢6–væVDVçG'¢ò6–væVB'’G·6–væW$æÖWÖ ¢¢6–væW$æÖRÇÂ"Ò'Ğ¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢“°¢Ò—Ğ¢ÂöF—cà¢ÂöF—cà ¢²‚‚’Óâ°¢6öç7B7W'&VçE&öÆRÒvWEVæF–æu&öÆW2‡6VÆV7FVDVçG&–W2•³Ó°¢–b‚7W'&VçE&öÆR’°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ&×BÓB&÷VæFVBÓ'†Â&÷&FW"&÷&FW"ÖVÖW&ÆBÓ#&rÖVÖW&ÆBÓS‚ÓB’Ó2#à¢ÆF—b6Æ74æÖSÒ'FW‡B×‡2föçBÖæ÷&ÖÂFW‡BÖVÖW&ÆBÓs#ä7W'&VçB7FGW3ÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓFW‡B×6ÒföçB×6VÖ–&öÆBFW‡BÖVÖW&ÆBÓƒ#ä6ö×ÆWFVCÂöF—cà¢ÂöF—cà¢“°¢Ğ¢6öç7B7W'&VçE6–væW"ÒvWE&öÆU6–væW"‡6Ú±î¸Â¸­yêë¢°k¢G§¦*^electedDocument, currentRole) || "-";
                  return (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="text-xs font-normal text-slate-500">Current Signer</div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
                          {currentSigner.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-950">{currentRole === "Senior" ? "Senior / Team Lead" : currentRole}</div>
                          <div className="truncate text-xs font-normal text-slate-500">{currentSigner}</div>
                        </div>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1.5 text-[10px] font-medium text-amber-700">Waiting for Signature</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={() => document.getElementById("signature-workflow-detail")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="whitespace-nowrap rounded-xl bg-violet-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-800"
                  >
                    Open Signing Workspace
                  </button>

                </div>
              </>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center px-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-xl text-violet-600">âŒ•</div>
                <div className="mt-3 text-base font-semibold text-slate-800">à¹€à¸¥à¸·à¸­à¸à¸£à¸²à¸¢à¸à¸²à¸£à¹€à¸­à¸à¸ªà¸²à¸£</div>
                <div className="mt-1 text-sm font-normal leading-6 text-slate-500">
                  à¸„à¸¥à¸´à¸à¹à¸–à¸§à¸”à¹‰à¸²à¸™à¸‹à¹‰à¸²à¸¢à¹€à¸à¸·à¹ˆà¸­à¹à¸ªà¸”à¸‡à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”à¹à¸¥à¸°à¸¥à¸³à¸”à¸±à¸šà¸à¸²à¸£à¸¥à¸‡à¸™à¸²à¸¡
                </div>
              </div>
            )}
            </aside>
          </div>
        </section>
      </section>

      <div id="signature-workflow-detail" className="grid gap-6">
        <div className="hidden">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">
            {documentView === "history" ? (isQaUser ? "QA Signature Monitor" : "Signature History") : "Document Queue"}
          </div>
          <div className="mt-1 text-xl font-black text-slate-950">
            {documentView === "history" ? monitorTitle : "à¸„à¸´à¸§à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¹€à¸‹à¹‡à¸™à¸‚à¸­à¸‡à¸‰à¸±à¸™"}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDocumentView("queue")}
              className={`rounded-2xl px-4 py-3 text-xs font-black transition ${
                documentView === "queue"
                  ? "bg-violet-700 text-white"
                  : "border border-violet-100 bg-white text-violet-700 hover:bg-violet-50"
              }`}
            >
              My Queue ({filteredDocuments.length})
            </button>
            <button
              type="button"
              onClick={() => setDocumentView("history")}
              className={`rounded-2xl px-4 py-3 text-xs font-black transition ${
                documentView === "history"
                  ? "bg-slate-950 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {isQaUser ? "QA Monitor" : "à¸›à¸£à¸°à¸§à¸±à¸•à¸´"} ({historyFilteredDocuments.length})
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="à¸„à¹‰à¸™à¸«à¸² Agent / Senior / Supervisor"
              className="rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3 text-sm font-semibold outline-none transition focus:border-violet-400 focus:bg-white"
            />
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-violet-400"
            >
              <option value="all">All Months</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>{getMonthLabel(month)}</option>
              ))}
            </select>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">
              {documentView === "history"
                ? monitorDescription
                : "à¹à¸ªà¸”à¸‡à¹€à¸‰à¸à¸²à¸°à¹€à¸­à¸à¸ªà¸²à¸£à¸—à¸µà¹ˆ Role à¸‚à¸­à¸‡à¸„à¸¸à¸“à¸¢à¸±à¸‡à¸•à¹‰à¸­à¸‡à¸¥à¸‡à¸™à¸²à¸¡à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™"}
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">
              {isQaUser
                ? "QA Monitor à¹ƒà¸Šà¹‰à¹€à¸Šà¹‡à¸à¸ªà¸–à¸²à¸™à¸°à¸£à¸§à¸¡à¸‚à¸­à¸‡à¹€à¸­à¸à¸ªà¸²à¸£ QA à¸—à¸µà¹ˆà¸„à¸¸à¸“à¸£à¸±à¸šà¸œà¸´à¸”à¸Šà¸­à¸š à¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¸£à¸§à¸¡à¹€à¸­à¸à¸ªà¸²à¸£à¸‚à¸­à¸‡ QA à¸„à¸™à¸­à¸·à¹ˆà¸™"
                : "à¹à¸ªà¸”à¸‡à¹€à¸‰à¸à¸²à¸°à¹€à¸­à¸à¸ªà¸²à¸£à¸—à¸µà¹ˆ Role à¸‚à¸­à¸‡à¸„à¸¸à¸“à¸¢à¸±à¸‡à¸•à¹‰à¸­à¸‡à¸¥à¸‡à¸™à¸²à¸¡à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™"}
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rm«ëŒ+Š×®º+º$zzb¥æ÷VæFVBÓ'†Â&÷&FW"&÷&FW"×f–öÆWBÓ&r×v†—FR‚ÓB’Ó2FW‡B×6ÒföçBÖ&öÆBFW‡B×6ÆFRÓs÷WFÆ–æRÖæöæRG&ç6—F–öâfö7W3¦&÷&FW"×f–öÆWBÓC ¢à¢Æ÷F–öâfÇVSÒ&ÆÂ#äÆÂv÷&¶fÆ÷r7FGW6W3Âö÷F–öãà¢Æ÷F–öâfÇVSÒ'&Wf–Wr#îŠ>ŠÒ6öæf—&Ò&Wf–WsÂö÷F–öãà¢Æ÷F–öâfÇVSÒ&×’×GW&â#ä×’6–væGW&RVæF–æsÂö÷F–öãà¢Æ÷F–öâfÇVSÒ'VæF–ær#åVæF–ær6–væGW&SÂö÷F–öãà¢Æ÷F–öâfÇVSÒ'&VG’#å&VG’f÷"–æ6VçF—fR–ÖVçCÂö÷F–öãà¢Æ÷F–öâfÇVSÒ&VÂ×VæF–ær#îŠ‹RVÂŠ>ŠÒ&÷fVCÂö÷F–öãà¢Æ÷F–öâfÇVSÒ&W‡—&VB#î˜ˆ‹N‰Š~‹‰‰~‹^˜‚Rò˜NŠ˜ˆNŠ>‰£Âö÷F–öãà¢Â÷6VÆV7Cà¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&×BÓRÖ‚Ö‚Õ³c#…Ò76R×’Ó2÷fW&fÆ÷r×’ÖWFò"Ó#à¢¶7F—fTFö7VÖVçG2æÖ‚†Fö2’Óâ°¢6öç7BVçG&–W2ÒVffV7F—fTVçG&–W4f÷$Fö2†Fö2Â6–væGW&W2“°¢6öç7B6÷VçBÒ4”täEU$UôdÄõræf–ÇFW"‚‡&öÆR’Óâ&ööÆVâ†vWD6ö×ÆWFVDVçG'’†VçG&–W2Â&öÆR’’’æÆVæwFƒ°¢6öç7BFö5VæF–æu&öÆW2ÒvWEVæF–æu&öÆW2†VçG&–W2“°¢6öç7BFö56–væVE&öÆW2Ò4”täEU$UôdÄõræf–ÇFW"‚‡&öÆR’Óâ&ööÆVâ†vWE6–væVDVçG'’†VçG&–W2Â&öÆR’’“°¢6öç7B—4×•VæF–æuGW&âĞ¢Fö5VæF–æu&öÆW2ç6öÖR‚‡&öÆR’Óâ6å6–vä–FVçF—G’†7W'&VçEW6W"ÂFö2Â&öÆR’’b`¢—56–væ–ætÆÆ÷vVD'”FFR†Fö2æÖöçF„¶W’’b`¢Fö2æ66W2ç6öÖR‚†—FVÒ’ÓâVæF–ætVÄ66TÖæ†2†—FVÒæ66T–B’“°¢6öç7B6VÆV7FVBÒ6VÆV7FVDFö7VÖVçCòæ–BÓÓÒFö2æ–C°¢&WGW&â€¢Æ'WGFöà¢¶W“×¶Fö2æ–GĞ¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ÷Våv÷&·76TFWF–Â†Fö2æ–B—Ğ¢6Æ74æÖS×¶rÖgVÆÂ&÷VæFVBÕ³#G…Ò&÷&FW"ÓBFW‡BÖÆVgBG&ç6—F–öâG°¢6VÆV7FV@¢ò&&÷&FW"×f–öÆWBÓC&r×f–öÆWBÓS6†F÷rÕ³óg…ó3G…÷&v&ƒ’ÃCÃ#rÃãB•Ò ¢¢&&÷&FW"×6ÆFRÓ#&r×v†—FR†÷fW#¦&÷&FW"×f–öÆWBÓ#†÷fW#¦&r×f–öÆWBÓSóS ¢ÖĞ¢à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2×7F'B§W7F–g’Ö&WGvVVâvÓ2#à¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓ#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"#à¢¶—4×•VæF–æuGW&âòÇ7â6Æ74æÖSÒ&‚Ó"ãRrÓ"ãR&÷VæFVBÖgVÆÂ&r×&÷6RÓc"óâ¢çVÆÇĞ¢ÆF—b6Æ74æÖSÒ'G'Væ6FRFW‡B×6ÒföçBÖ&Æ6²FW‡B×6ÆFRÓ“S#ç¶Fö2ævVçDæÖWÓÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓFW‡B×‡2föçBÖ&öÆBFW‡B×6ÆFRÓS#ç¶Fö2æÖöçF„Æ&VÇÓÂöF—cà¢¶Fö5VæF–æu&öÆW2æÆVæwF‚ò€¢ÆF—b6Æ74æÖS×¶×BÓ"–æÆ–æRÖfÆW‚&÷VæFVBÖgVÆÂ‚Ó"ãR’ÓFW‡B×‡2föçBÖ&Æ6²G°¢—4×•VæF–æuGW&âò&&r×&÷6RÓFW‡B×&÷6RÓs"¢&&r×6ÆFRÓFW‡B×6ÆFRÓS ¢ÖÓà¢Š>ŠŞ˜ˆ¾˜~‰’¶Fö5VæF–æu&öÆW2æÆVæwF‡Ò&öÆP¢ÂöF—cà¢’¢çVÆÇĞ¢ÂöF—cà¢Å6–væGW&U–ÆÂ7FGW3×¶6÷VçBÓÓÒ4”täEU$UôdÄõræÆVæwF‚ò%6–væVB"¢%VæF–ær'Òóà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓ2fÆW‚fÆW‚×w&vÓ"FW‡B×‡2föçBÖ&öÆB#à¢Ç7â6Æ74æÖSÒ'&÷VæFVBÖgVÆÂ&r×6ÆFRÓ‚Ó"ãR’ÓFW‡B×6ÆFRÓc#ç¶6÷VçGÒóB6–væVCÂ÷7ãà¢Ç7â6Æ74æÖSÒ'&÷VæFVBÖgVÆÂ&r×f–öÆWBÓ‚Ó"ãR’ÓFW‡B×f–öÆWBÓs#å66÷&R¶Fö2æfW&vU66÷&RçFôf—†VBƒ"—ÓÂ÷7ãà¢Ç7â6Æ74æÖSÒ'&÷VæFVBÖgVÆÂ&r×6ÆFRÓ‚Ó"ãR’ÓFW‡B×6ÆFRÓc#ç¶vWEF–ÖVÆ–æU7FGW2†Fö2æÖöçF„¶W’—ÓÂ÷7ãà¢ÂöF—cà¢¶Fö7VÖVçEf–WrÓÓÒ&†—7F÷'’"ò€¢ÆF—b6Æ74æÖSÒ&×BÓ276R×’ÓFW‡B×‡2föçBÖ&öÆBÆVF–ærÓR#à¢ÆF—b6Æ74æÖSÒ'FW‡BÖVÖW&ÆBÓs#à¢˜ˆ¾˜~‰˜Š^˜Šs¢¶Fö56–væVE&öÆW2æÆVæwF‚òFö56–væVE&öÆW2æÖ‡&öÆUF†”Æ&VÂ’æ¦ö–â‚"Â"’¢"Ò'Ğ¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ'FW‡B×&÷6RÓs#à¢Š.‹ˆ~˜Š¾Š^‹~ŠÓ¢¶Fö5VæF–æu&öÆW2æÆVæwF‚òFö5VæF–æu&öÆW2æÖ‚‡&öÆR’ÓâG·&öÆUF†”Æ&VÂ‡&öÆR—Ò‚G¶vWE&öÆU6–væW"†Fö2Â&öÆR—Ò–’æ¦ö–â‚"Â"’¢.ˆNŠ>‰®˜Š^˜Šr'Ğ¢ÂöF—cà¢ÂöF—cà¢’¢çVÆÇĞ¢Âö'WGFöãà¢“°¢Ò—Ğ ¢²7F—fTFö7VÖVçG2æÆVæwF‚ò€¢ÆF—b6Æ74æÖSÒ'&÷VæFVBÕ³#G…Ò&÷&FW"&÷&FW"ÖF6†VB&÷&FW"×6ÆFRÓ#&r×6ÆFRÓS‚ÓB’Ó‚FW‡BÖ6VçFW"FW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×6ÆFRÓS#à¢¶Fö7VÖVçEf–WrÓÓÒ&†—7F÷'’ ¢ò.Š.‹ˆ~˜NŠ˜Š‹^‰¾Š>‹Š~‹‰^‹N˜ŠŞˆŠ®‹.Š>‰^‹.Š˜ˆ~‹~˜ŠŞ‰˜Nˆ.‰~‹^˜˜Š^‹~ŠŞˆ ¢¢.Š.‹ˆ~˜NŠ˜Š‹^ˆN‹NŠ~˜ˆ¾˜~‰ˆ.ŠŞˆ~ˆN‹‰>‰^‹.Š˜ˆ~‹~˜ŠŞ‰˜Nˆ.‰~‹^˜˜Š^‹~ŠŞˆ'Ğ¢ÂöF—cà¢’¢çVÆÇĞ¢ÂöF—cà¢ÂöF—cà ¢·6VÆV7FVDFö7VÖVçBbb†Fö7VÖVçEf–WrÓÓÒ&†—7F÷'’"ÇÂ‡VWVU&Wf–WtFö7VÖVçD–BÓÓÒ6VÆV7FVDFö7VÖVçBæ–Bbbf–ÇFW&VDFö7VÖVçG2ç6öÖR‚†Fö2’ÓâFö2æ–BÓÓÒ6VÆV7FVDFö7VÖVçBæ–B’’’ò€¢ÆF—b6Æ74æÖSÒ'76R×’ÓR#à¢ÆF—b6Æ74æÖSÒ'&÷VæFVBÕ³3…Ò&÷&FW"&÷&FW"×f–öÆWBÓ&r×v†—FRÓb6†F÷rÕ³ó#…óSG…÷&v&ƒƒ‚Ã#‚Ã3RÃã‚•Ò#à¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓBÆs¦fÆW‚×&÷rÆs¦—FV×2×7F'BÆs¦§W7F–g’Ö&WGvVVâ#à¢ÆF—cà¢ÆF—b6Æ74æÖSÒ'FW‡B×‡2föçBÖ&Æ6²WW&66RG&6¶–ærÕ³ã†VÕÒFW‡B×f–öÆWBÓS#å&Wf–Wr&Vf÷&R6–væGW&SÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓFW‡BÓ'†ÂföçBÖ&Æ6²FW‡B×6ÆFRÓ“S#ç·6VÆV7FVDFö7VÖVçBævVçDæÖWÓÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×6ÆFRÓS#à¢·6VÆV7FVDFö7VÖVçBæÖöçF„Æ&VÇÒ(
"FVÓ¢·6VÆV7FVDFö7VÖVçBçFVÔæÖWÒ(
"FVÒÆVC¢·6VÆV7FVDFö7VÖVçBç6Væ–÷$æÖWĞ¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓ"6Ó¦fÆW‚×&÷r#à¢¶Fö7VÖVçEf–WrÓÓÒ&†—7F÷'’"bb7W'&VçEW6W"ç&öÆRÓÓÒ%VÆ—G’77W&æ6R"bb6VÆV7FVDFö7VÖVçBbb—4†—7FÚ±î¸Â¸­yêë¢°k¢G§¦*^oricalPaidPeriod(selectedDocument.monthKey) ? (
                    <button
                      type="button"
                      onClick={resetDocument}
                      className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-black text-rose-700 transition hover:bg-rose-100"
                    >
                      Reset Document
                    </button>
                  ) : null}

                </div>
              </div>

              {pdfMessage ? <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{pdfMessage}</div> : null}

              <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${
                mySignedRoles.length
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}>
                {mySignedRoles.length
                  ? `à¹€à¸Šà¹‡à¸à¹à¸¥à¹‰à¸§: à¸„à¸¸à¸“à¹€à¸‹à¹‡à¸™à¹€à¸­à¸à¸ªà¸²à¸£à¸™à¸µà¹‰à¹à¸¥à¹‰à¸§à¹ƒà¸™ Role ${mySignedRoles.map(roleThaiLabel).join(", ")}`
                  : "à¹€à¸Šà¹‡à¸à¹à¸¥à¹‰à¸§: à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸à¸šà¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™à¸‚à¸­à¸‡à¸„à¸¸à¸“à¹ƒà¸™à¹€à¸­à¸à¸ªà¸²à¸£à¸™à¸µà¹‰"}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Average Score</div>
                  <div className="mt-1 text-2xl font-black text-violet-700">{selectedDocument.averageScore.toFixed(2)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Grade</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">{selectedDocument.grade}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Timeline</div>
                  <div className="mt-1 text-base font-black text-slate-950">{timeline}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Incentive</div>
                  <div className={`mt-1 text-base font-black ${readyForIncentive ? "text-emerald-700" : "text-amber-700"}`}>
                    {readyForIncentive ? "Ready to Pay" : "Hold / Not Ready"}
                  </div>
                </div>
              </div>
            </div>

            {hasPendingAppeal ? (
              <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-5 text-rose-800 shadow-[0_18px_40px_rgba(225,29,72,0.08)]">
                <div className="text-base font-black">à¸¡à¸µà¹€à¸„à¸ª Appeal à¸£à¸­ Approved</div>
                <div className="mt-1 text-sm font-semibold leading-6">
                  à¹€à¸­à¸à¸ªà¸²à¸£à¸¢à¸±à¸‡à¹‚à¸Šà¸§à¹Œà¹„à¸”à¹‰à¹à¸¥à¸° Generate PDF à¹„à¸”à¹‰ à¹à¸•à¹ˆà¸¢à¸±à¸‡à¸¢à¸·à¸™à¸¢à¸±à¸™à¸£à¸±à¸šà¸—à¸£à¸²à¸šà¹„à¸¡à¹ˆà¹„à¸”à¹‰ à¹à¸¥à¸°à¸¢à¸±à¸‡à¹€à¸‹à¹‡à¸™à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸ˆà¸™à¸à¸§à¹ˆà¸² Appeal à¸ˆà¸°à¸–à¸¹à¸ Approved à¸«à¸£à¸·à¸­ Rejected à¸„à¸£à¸šà¸—à¸¸à¸à¹€à¸„à¸ª
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedPendingAppeals.map((item) => (
                    <span key={item.caseId} className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-black text-rose-700">
                      {item.caseId}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-[30px] border border-violet-100 bg-white p-6 shadow-[0_20px_54px_rgba(88,28,135,0.08)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">Case Detail Preview</div>
                  <div className="mt-1 text-xl font-semibold text-slate-950">Preview 10 à¹€à¸„à¸ªà¸à¹ˆà¸­à¸™à¹€à¸‹à¹‡à¸™</div>
                  <div className="mt-1 text-xs font-normal text-slate-500">à¸„à¸¥à¸´à¸ Case ID à¹€à¸à¸·à¹ˆà¸­à¹€à¸›à¸´à¸”à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”à¹ƒà¸™ Popup à¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¸­à¸­à¸à¸ˆà¸²à¸à¸«à¸™à¹‰à¸²à¸™à¸µà¹‰</div>
                </div>
                {!previewConfirmed ? (
                  <div className="flex max-w-[430px] shrink-0 flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={confirmPreview}
                      disabled={!confirmAvailable}
                      className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      à¸¢à¸·à¸™à¸¢à¸±à¸™à¸£à¸±à¸šà¸—à¸£à¸²à¸šà¸‚à¹‰à¸­à¸¡à¸¹à¸¥
                    </button>
                    {confirmBlockedReason ? (
                      <div className="max-w-[360px] break-words text-right text-xs font-semibold leading-5 text-amber-600 sm:max-w-none sm:whitespace-nowrap">{confirmBlockedReason}</div>
                    ) : null}
                  </div>
                ) : (
                  <span className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700">Preview Confirmed</span>
                )}
              </div>

              {(() => {
                const previewCases = selectedDocument.cases.slice(0, 10);
                const topicMap = new Map<
                  string,
                  { code: string; title: string; label: string; max: number }
                >();

                previewCases.forEach((caseItem) => {
            m«ëŒ+Š×®º+º$zzb¥â†66T—FVÒçF÷–72ÇÂµÒ’æf÷$V6‚‚‡F÷–2’Óâ°¢6öç7B6öFRÒæ÷&ÖÆ—¦UFW‡B‡F÷–2æ6öFR“°¢6öç7BF—FÆRÒæ÷&ÖÆ—¦UFW‡B‡F÷–2çF—FÆR“°¢6öç7B¶W’Ò6öFRÇÂæ÷&ÖÆ—¦T¶W’‡F—FÆR“°¢–b‚¶W’’&WGW&ã°¢6öç7BÖ‚ÒçVÖ&W"‡F÷–2æÖ‚’ÇÂ°¢6öç7B7W'&VçBÒF÷–4ÖævWB†¶W’“°¢–b‚7W'&VçB’°¢F÷–4Öç6WB†¶W’Â°¢6öFRÀ¢F—FÆRÀ¢Æ&VÃ¢vWE6–væGW&UF÷–4VævÆ—6„Æ&VÂ‡F÷–2Â6VÆV7FVDFö7VÖVçBæÖöçF„¶W’’À¢Ö‚À¢Ò“°¢ÒVÇ6R–b†Ö‚â7W'&VçBæÖ‚’°¢7W'&VçBæÖ‚ÒÖƒ°¢Ğ¢Ò“°¢Ò“° ¢6öç7BG–æÖ–5F÷–72Ò'&’æg&öÒ‡F÷–4ÖæVçG&–W2‚’’æÖ‚…¶¶W’ÂF÷–5Ò’Óâ‡°¢¶W’À¢ââçF÷–2À¢Ò’“° ¢6öç7B7FæF&Df÷W%F÷–4Æ&VÇ2Ò°¢%&ö6W726ö×Æ–æ6R"À¢$ç7vW"67W&7’bfW&–f–6F–öâ"À¢$66R†æFÆ–ærbföÆÆ÷r×W"À¢$6öÖ×Væ–6F–öâ6¶–ÆÇ2"À¢Ó°¢6öç7B7FæF&Df÷W%F÷–4Ö…66÷&W2Ò³3Â#Â#RÂ#UÓ°¢6öç7B—4§VæT÷$§VÇ’Ğ¢ö§VæWÆ§VÇ’ö’çFW7B†æ÷&ÖÆ—¦UFW‡B‡6VÆV7FVDFö7VÖVçBæÖöçF„Æ&VÂ’’ÇÀ¢òƒó¥çÅ²ÒõÒ’ƒógÃór’ƒó¢GÅ²ÒõÒ’òçFW7B†æ÷&ÖÆ—¦UFW‡B‡6VÆV7FVDFö7VÖVçBæÖöçF„¶W’’“°¢6öç7BÖF6†W57FæF&Df÷W%F÷–566÷&W2Ğ¢G–æÖ–5F÷–72æÆVæwF‚ÓÓÒBb`¢G–æÖ–5F÷–72æWfW'’€¢‡F÷–2ÂF÷–4–æFW‚’Óà¢çVÖ&W"‡F÷–2æÖ‚’ÓÓÒ7FæF&Df÷W%F÷–4Ö…66÷&W5·F÷–4–æFW…Ğ¢“°¢6öç7BW6U7FæF&Df÷W%F÷–4Æ&VÇ2Ğ¢G–æÖ–5F÷–72æÆVæwF‚ÓÓÒBb`¢†—4§VæT÷$§VÇ’ÇÂÖF6†W57FæF&Df÷W%F÷–566÷&W2“° ¢&WGW&â€¢ÆF—`¢FF×&Wf–Wr×F&ÆR×c#P¢6Æ74æÖSÒ&×BÓR÷fW&fÆ÷r×‚ÖWFò&÷VæFVBÕ³g…Ò&÷&FW"&÷&FW"×6ÆFRÓ#&r×v†—FR6†F÷rÕ³ó‡…ó#G…÷&v&ƒRÃ#2ÃC"ÃãR•Ò ¢à¢ÇF&ÆR6Æ74æÖSÒ'rÖgVÆÂÖ–â×rÕ³ƒ…ÒF&ÆRÖf—†VB&÷&FW"Ö6öÆÆ6R#à¢Æ6öÆw&÷Wà¢Æ6öÂ7G–ÆS×·²v–GFƒ¢#2R"×Òóà¢Æ6öÂ7G–ÆS×·²v–GFƒ¢#’R"×Òóà¢Æ6öÂ7G–ÆS×·²v–GFƒ¢#‚R"×Òóà¢Æ6öÂ7G–ÆS×·²v–GFƒ¢##‚R"×Òóà¢¶G–æÖ–5F÷–72æÖ‚‡F÷–2’Óâ€¢Æ6öÀ¢¶W“×¶&Wf–WrÖ6öÂÒG·F÷–2æ¶W—ÖĞ¢7G–ÆS×·²v–GFƒ¢G³C"òÖF‚æÖ‚†G–æÖ–5F÷–72æÆVæwF‚Â—ÒV×Ğ¢óà¢’—Ğ¢Æ6öÂ7G–ÆS×·²v–GFƒ¢#R"×Òóà¢Âö6öÆw&÷Wà¢ÇF†VB6Æ74æÖSÒ'7F–6·’F÷Ó¢Ó#à¢ÇG"6Æ74æÖSÒ&&rÖw&F–VçB×Fò×"g&öÒÕ²36#scEÒf–×f–öÆWBÓƒFòÕ²3fC#†C•ÒFW‡B×v†—FR#à¢ÇF‚6Æ74æÖSÒ'v†—FW76RÖæ÷w&‚Ó2’Ó"ãRFW‡BÖ6VçFW"FW‡BÕ³…ÒföçB×6VÖ–&öÆB#â3Â÷Fƒà¢ÇF‚6Æ74æÖSÒ'v†—FW76RÖæ÷w&‚Ó2’Ó"ãRFW‡BÖ6VçFW"FW‡BÕ³…ÒföçB×6VÖ–&öÆB#ä66R”CÂ÷Fƒà¢ÇF‚6Æ74æÖSÒ'v†—FW76RÖæ÷w&‚Ó2’Ó"ãRFW‡BÖ6VçFW"FW‡BÕ³…ÒföçB×6VÖ–&öÆB#äFFSÂ÷Fƒà¢ÇF‚6Æ74æÖSÒ'‚Ó2’Ó"ãRFW‡BÖ6VçFW"FW‡BÕ³…ÒföçB×6VÖ–&öÆB#ä–çFVçCÂ÷Fƒà¢¶G–æÖ–5F÷–72æÖ‚‡F÷–2ÂF÷–4–æFW‚’Óâ€¢ÇF€¢¶W“×¶&Wf–WrÖ†VBÒG·F÷–2æ¶W—ÖĞ¢6Æ74æÖSÒ'‚Ó"’Ó"ãRFW‡BÖ6VçFW"Æ–vâÖÖ–FFÆR ¢à¢ÆF—b6Æ74æÖSÒ&×‚ÖWFòÖ‚×rÕ³c…Òv†—FW76RÖæ÷&ÖÂFW‡BÕ³…ÒföçB×6VÖ–&öÆBÆVF–ærÓB#à¢·W6U7FæF&Df÷W%F÷–4Æ&VÇ0¢ò7FæF&Df÷W%F÷–4Æ&VÇ5·F÷–4–æFW…Ğ¢¢F÷–2æÆ&VÇĞ¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓFW‡BÕ³—…ÒföçBÖÖVF—VÒFW‡B×f–öÆWBÓ#à¢Ö‚66÷&S¢·F÷–2æÖ‚ÇÂ"Ò'Ğ¢ÂöF—cà¢Â÷Fƒà¢’—Ğ¢ÇF‚6Æ74æÖSÒ'v†—FW76RÖæ÷w&‚Ó2’Ó"ãRFW‡BÖ6VçFW"FW‡BÕ³…ÒföçB×6VÖ–&öÆB#å66÷&SÂ÷Fƒà¢Â÷G#à¢Â÷F†VCà ¢ÇF&öG“à¢·&Wf–Wt66W2æÖ‚†—FVÒÂ–æFW‚’Óâ°¢6öç7B–çFVçE'G2Ò7Æ—E6–væGW&T–çFVçB†—FVÒæ–çV—'’“°¢6öç7B&÷uF÷–72ÒæWrÖ€¢†—FVÒçF÷–72ÇÂµÒ’æÖ‚‡F÷–2’Óâ°¢æ÷&ÖÆ—¦UFW‡B‡F÷–2æ6öFR’ÇÂæ÷&ÖÆ—¦T¶W’‡F÷–2çF—FÆR’À¢F÷–2À¢Ò¢“° ¢6öç7Bf–æÅ66÷&UFöæRĞ¢—FVÒæf–æÅ66÷&RãÒƒP¢ò&&r×f–öÆWBÓFW‡B×f–öÆWBÓs ¢¢—FVÒæf–æÅ66÷&RãÒsP¢ò&&rÖÖ&W"ÓFW‡BÖÖ&W"Ós ¢¢&&r×&÷6RÓFW‡B×&÷6RÓs#° ¢&WGW&â€¢ÇG ¢¶W“×¶G¶—FVÒæ66T–GÒÒG¶–æFW‡ÖĞ¢6Æ74æÖSÒ&&÷&FW"×B&÷&FW"×6ÆFRÓöFC¦&r×v†—FRWfVã¦&r×6ÆFRÓSóCRG&ç6—F–öâ†÷fW#¦&r×f–öÆWBÓSóSR ¢à¢ÇFB6Æ74æÖSÒ'‚Ó2’Ó"ãRFW‡BÖ6VçFW"Æ–vâÖÖ–FFÆRFW‡B×‡2föçBÖÖVF—VÒFW‡B×6ÆFRÓC#à¢¶–æFW‚²Ğ¢Â÷FCà ¢ÇFB6Æ74æÖSÒ'‚Ó2’Ó"ãRFW‡BÖ6VçFW"Æ–vâÖÖ–FFÆR#à¢Æ'WGFöà¢G–Ú±î¸Â¸­yêë¢°k¢G§¦*^      (caseItem.topics || []).forEach((topic) => {
                    const code = normalizeText(topic.code);
                    const title = normalizeText(topic.title);
                    const key = code || normalizeKey(title);
                    if (!key) return;
                    const max = Number(topic.max) || 0;
                    const current = topicMap.get(key);
                    if (!current) {
                      topicMap.set(key, {
                        code,
                        title,
                        label: getSignatureTopicEnglishLabel(topic, selectedDocument.monthKey),
                        max,
                      });
                    } else if (max > current.max) {
                      current.max = max;
                    }
                  });
                });

                const dynamicTopics = Array.from(topicMap.entries()).map(([key, topic]) => ({
                  key,
                  ...topic,
                }));

                const standardFourTopicLabels = [
                  "Process Compliance",
                  "Answer Accuracy & Verification",
                  "Case Handling & Follow-up",
                  "Communication Skills",
                ];
                const standardFourTopicMaxScores = [30, 20, 25, 25];
                const isJuneOrJuly =
                  /june|july/i.test(normalizeText(selectedDocument.monthLabel)) ||
                  /(?:^|[-/])(0?6|0?7)(?:$|[-/])/.test(normalizeText(selectedDocument.monthKey));
                const matchesStandardFourTopicScores =
                  dynamicTopics.length === 4 &&
                  dynamicTopics.every(
                    (topic, topicIndex) =>
                      Number(topic.max) === standardFourTopicMaxScores[topicIndex]
                  );
                const useStandardFourTopicLabels =
                  dynamicTopics.length === 4 &&
                  (isJuneOrJuly || matchesStandardFourTopicScores);

                return (
                  <div
                    data-preview-table-v25
                    className="mt-5 overflow-x-auto rounded-[16px] border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
                  >
                    <table className="w-full min-w-[1180px] table-fixed border-collapse">
                      <colgroup>
                        <col style={{ width: "3%" }} />
                        <col style={{ width: "9%" }} />
                        <col style={{ width: "8%" }} />
                        <col style={{ width: "28%" }} />
                        {dynamicTopics.map((topic) => (
                          <col
                            key={`preview-col-${topic.key}`}
                            style={{ width: `${42 / Math.max(dynamicTopics.length, 1)}%` }}
                          />
                        ))}
                        <col style={{ width: "10%" }} />
                      </colgroup>
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-gradient-to-r from-[#3b0764] via-violet-800 to-[#6d28d9] text-white">
                          <th className="whitespace-nowrap px-3 py-2.5 text-center text-[11px] font-semibold">#</th>
                          <th className="whitespace-nowrap px-3 py-2.5 text-center text-[11px] font-semibold">Case ID</th>
                          <th className="whitespace-nowrap px-3 py-2.5 text-center text-[11px] font-semibold">Date</th>
                          <th className="px-3 py-2.5 text-center text-[11px] font-semibold">Intent</th>
                          {dynamicTopics.map((topic, topicIndex) => (
                            <th
                              key={`preview-head-${topic.key}`}
                              className="px-2 py-2.5 text-center align-middle"
                            >
                              <div className="mx-auto max-w-[160px] whitespace-normal text-[10px] font-semibold leading-4">
                                {useStandardFourTopicLabels
                                  ? standardFourTopicLabels[topicIndex]
                                  : topic.label}
                              </div>
                              <div className="mt-1 text-[9px] font-medium text-violet-100">
                                Max Score: {topic.max || "-"}
                              </div>
                            </th>
                          ))}
                          <th className="whitespace-nowrap px-3 py-2.5 text-center text-[11px] font-semibold">Score</th>
                        </tr>
                      </thead>

                      <tbody>
                        {previewCases.map((item, index) => {
                          const intentParts = splitSignatureIntent(item.inquiry);
                          const rowTopics = new Map(
                            (item.topics || []).map((topic) => [
                              normalizeText(topic.code) || normalizeKey(topic.title),
                              topic,
                            ])
                          );

                          const finalScoreTone =
                            item.finalScore >= 85
                              ? "bg-violet-100 text-violet-700"
                              : item.finalScore >= 75
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-700";

                          return (
                            <tr
                              key={`${item.caseId}-${index}`}
                              className="border-t border-slate-100 odd:bg-white even:bg-slate-50/45 transition hover:bg-violet-50/55"
                            >
                              <td className="px-3 py-2.5 text-center align-middle text-xs font-medium text-slate-400">
                                {index + 1}
                              </td>

                              <td className="px-3 py-2.5 text-center align-middle">
                                <button
                                  tym«ëŒ+Š×®º+º$zzb¥â’¢çVÆÇĞ¢ÂöF—cà¢ÂöF—cà ¢ÆF—b6Æ74æÖS×¶×BÓB&÷VæFVBÕ³#G…Ò&÷&FW"‚ÓR’ÓB6†F÷rÕ³óG…ó3G…÷&v&ƒƒ‚Ã#‚Ã3RÃã‚•ÒG°¢VæF–æu&öÆW2æÆVæwF€¢ò&&÷&FW"×f–öÆWBÓ#&r×f–öÆWBÓS ¢¢&&÷&FW"ÖVÖW&ÆBÓ#&rÖVÖW&ÆBÓS ¢ÖÓà¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓ2Æs¦fÆW‚×&÷rÆs¦—FV×2Ö6VçFW"Æs¦§W7F–g’Ö&WGvVVâ#à¢ÆF—cà¢ÆF—b6Æ74æÖS×¶FW‡B×‡2föçBÖ&Æ6²WW&66RG&6¶–ærÕ³ã†VÕÒG°¢VæF–æu&öÆW2æÆVæwF‚ò'FW‡B×f–öÆWBÓc"¢'FW‡BÖVÖW&ÆBÓs ¢ÖÓà¢VæF–ær6–væW'0¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓFW‡BÖÆrföçBÖ&Æ6²FW‡B×6ÆFRÓ“S#à¢·VæF–æu&öÆW2æÆVæwF€¢òŠ.‹ˆ~Š>ŠŞŠ^ˆ~‰‹.ŠG·VæF–æu&öÆW2æÆVæwF‡Ò&öÆV ¢¢.˜ŠŞˆŠ®‹.Š>Š^ˆ~‰‹.ŠˆNŠ>‰®˜Š^˜Šr'Ğ¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓFW‡B×6ÒföçBÖ&öÆBFW‡B×6ÆFRÓc#à¢·VæF–æu&öÆW2æÆVæwF€¢òVæF–æu&öÆW2æÖ‚‡&öÆR’ÓâG·&öÆUF†”Æ&VÂ‡&öÆR—Ó¢G¶vWE&öÆU6–væW"‡6VÆV7FVDFö7VÖVçBÂ&öÆR—Ö’æ¦ö–â‚"ò"¢¢.˜NŠ˜˜Š¾Š^‹~ŠÒ&öÆR‰~‹^˜‰^˜ŠŞˆ~˜ˆ¾˜~‰‰^˜ŠÒ'Ğ¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓ"6Ó¦fÆW‚×&÷r#à¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×¶6÷•6VÆV7FVDFö7VÖVçE6†&TÆ–æ·Ğ¢6Æ74æÖSÒ'v†—FW76RÖæ÷w&&÷VæFVBÓ'†Â&÷&FW"&÷&FW"×f–öÆWBÓ#&r×v†—FR‚ÓR’Ó2FW‡B×6ÒföçBÖ&Æ6²FW‡B×f–öÆWBÓsG&ç6—F–öâ†÷fW#¦&r×f–öÆWBÓS ¢à¢6÷’6†&RÆ–æ°¢Âö'WGFöãà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×¶6÷”æW‡E6–væW$ÆW'GĞ¢6Æ74æÖSÒ'v†—FW76RÖæ÷w&&÷VæFVBÓ'†Â&r×6ÆFRÓ“S‚ÓR’Ó2FW‡B×6ÒföçBÖ&Æ6²FW‡B×v†—FRG&ç6—F–öâ†÷fW#¦&r×6ÆFRÓƒ ¢à¢ˆN‹‰NŠ^ŠŞˆˆ.˜ŠŞˆNŠ~‹.Š˜ˆ˜ˆ~˜‰^‹~ŠŞ‰¢Âö'WGFöãà¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà ¢·6†&TÖW76vRò€¢ÆF—b6Æ74æÖSÒ&×BÓB&÷VæFVBÓ'†Â&÷&FW"&÷&FW"ÖVÖW&ÆBÓ#&rÖVÖW&ÆBÓS‚ÓB’Ó2FW‡B×6ÒföçBÖ&Æ6²FW‡BÖVÖW&ÆBÓs#à¢·6†&TÖW76vWĞ¢ÂöF—cà¢’¢çVÆÇĞ ¢ÆF—b6Æ74æÖSÒ&×BÓR÷fW&fÆ÷rÖ†–FFVâ&÷VæFVBÕ³#G…Ò&÷&FW"&÷&FW"×6ÆFRÓ##à¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2Õ³“…ó##…öÖ–æÖ‚ƒÃg"•óS…ó#…Ò&r×f–öÆWBÓs‚ÓB’Ó2FW‡B×‡2föçBÖ&Æ6²WW&66RG&6¶–ærÕ³ãFVÕÒFW‡B×v†—FR#à¢ÆF—cå7FWÂöF—cà¢ÆF—cå&öÆSÂöF—cà¢ÆF—cå6–væW#ÂöF—cà¢ÆF—cå7FGW3ÂöF—cà¢ÆF—cä7F–öãÂöF—cà¢ÂöF—cà ¢µ4”täEU$UôdÄõræÖ‚‡&öÆRÂ–æFW‚’Óâ°¢6öç7B6–væVBÒvWE6–væVDVçG'’‡6VÆV7FVDVçG&–W2Â&öÆR“°¢6öç7Bv—fVBÒvWEv—fVDVçG'’‡6VÆV7FVDVçG&–W2Â&öÆR“°¢6öç7B6ö×ÆWFVBÒ6–væVBÇÂv—fVC°¢6öç7B&W6WDgFW$FVFÆ–æRÒvWDFVFÆ–æU&W6WDVçG'’‡6VÆV7FVDVçG&–W2Â&öÆR“°¢6öç7B7F—fU&W6WDgFW$FVFÆ–æRÒvWD7F—fTFVFÆ–æU&W6WDVçG'’‡6VÆV7FVDVçG&–W2Â&öÆR“°¢6öç7B&W6WDW‡—&W4BÒvWDFVFÆ–æU&W6WDW‡—&W4B‡&W6WDgFW$FVFÆ–æR“°¢6öç7B&W6WEv–æF÷tW‡—&VBÒ&ööÆVâ‡&W6WDgFW$FVFÆ–æRbb7F—fU&W6WDgFW$FVFÆ–æR“°¢6öç7B7FGW2Ò7FGW4f÷%&öÆR‡6VÆV7FVDVçG&–W2Â&öÆRÂ6VÆV7FVDFö7VÖVçBæÖöçF„¶W’“°¢6öç7B6–væW$æÖRÒvWE&öÆU6–væW"‡6VÆV7FVDFö7VÖVçBÂ&öÆR“°¢6öç7B—4vVçD&Æö6¶VD'”6öæf—&ÒÒ&öÆRÓÓÒ$vVçB"bb&Wf–Wt6öæf—&ÖVBbb6ö×ÆWFVC°¢6öç7BÆÆ÷u6–vâĞ¢v—fVBb`¢6å6–vä–FVçF—G’†7W'&VçEW6W"Â6VÆV7FVDFö7VÖVçBÂ&öÆR’b`¢6å6–vå&öÆT'”FFR‡6VÆV7FVDFö7VÖVçBæÖöçF„¶W’Â6VÆV7FVDVçG&–W2Â&öÆR“°¢6öç7B6äFDf—'7DG&vå6–væGW&RĞ¢&ööÆVâ‡6–væVB’b`¢6–væVCòç6–væGW&TFFW&Âb`¢6å6–vä–FVçF—G’†7W'&VçEW6W"Â6VÆV7FVDFö7VÖVçBÂ&öÆR“°¢6öç7B6å&W6WE&öÆTgFW$FVFÆ–æRĞ¢7W'&VçEW6W"ç&öÆRÓÓÒ%VÆ—G’77W&æ6R"b`¢—4†—7F÷&–6Å–EW&–öB‡6VÆV7FVDFö7VÖVçBæÖöçF„¶W’’b`¢vWEF–ÖVÆ–æU7FGW2‡6VÆV7FVDFö7VÖVçBæÖöçF„¶W’’ÓÓÒ%6–væGW&RFVFÆ–æR76VB"b`¢6ö×ÆWFVBb`¢7F—fU&W6WDgFW$FVFÆ–æS°¢6öç7B6ä÷Vå6–væGW&UBÒ‚6ö×ÆWFVBbbÆÆ÷u6–vâ’ÇÂ6äFDf—'7DG&vå6–væGW&S°¢6öç7Bv—F–ætf÷$WFöÖF–5v—fW"Ğ¢&öÆRÓÓÒ$vVçB"b`¢6ö×ÆWFVBb`¢6VÆV7FVDvVçEW6W4WFõv—fW"b`¢—4†—7F÷&–6Å–EW&–öB‡6VÆV7FVDFö7VÖVçBæÖöçF„¶W’“°¢6öç7B6fVE6–væGW&TFFW&ÂÒ6–væGW&TÆ–'&'•¶vWE6fVE6–væGW&T¶W’‡&öÆR•Ó°¢&WGW&â€¢ÆF—b¶W“×·&öÆWÒ6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2Õ³“…ó##…öÖ–æÖ‚ƒÃg"•óS…ó#…Ò—FV×2Ö6VçFW"vÓ2&÷&FW"×B&÷&FW"×6ÆFRÓ#‚ÓB’ÓBFW‡B×6Ò#à¢ÆF—cà¢Ç7â6Æ74æÖS×¶–æÆ–æRÖfÆW‚‚Ó‚rÓ‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂFW‡B×‡2föçBÖ&Æ6²G°¢v—fVBò&&r×6·’ÓFW‡B×6·’Ós"¢6–væVBò&&rÖVÖW&ÆBÓFW‡BÖVÖW&ÆBÓs"¢ÆÆ÷u6–vâò&&r×f–öÆWBÓsFW‡B×v†—FR"¢&&r×6ÆFRÓFW‡B×6ÆFRÓS ¢ÖÓà¢¶–æFW‚²Ğ¢Â÷7ãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&föçBÖ&Æ6²FW‡B×6ÆFRÓ“S#ç·&öÆRÓÓÒ%6Væ–÷""ò%6Væ–÷"òFVÒÆVB"¢&öÆWÓÂöF—cà¢ÆF—cà¢ÆF—b6Æ74æÖSÒ&föçBÖ&öÆBFW‡B×6ÆFRÓ“#ç¶6ö×ÆWFVBò6ö×ÆWFVBç6–væW$æÖR¢6–væW$æÖWÓÂöF—cà¢·v—fVBò€¢ÆF—b6Æ74æÖSÒ&×BÓFW‡B×‡2föçB×6VÖ–&öÆBFW‡B×6·’Ós#à¢6–væGW&Rv—fVB(	2&W6–væVB(
"Š~‹‰‰~‹^˜Š^‹.ŠŞŠŞˆ·v—fVBç&W6–væF–öäFFRÇÂ"Ò'Ò(
"ˆ¾‹Nˆ~ˆ˜Îˆ‹.ˆˆ.˜ŠŞŠ‹ŠRW6W ¢ÂöF—cà¢’¢6–væVBò€¢ÆF—b6Æ74æÖSÒ&×BÓFW‡B×‡2föçB×6VÖ–&öÆBFW‡B×6ÆFRÓC#à¢6–væVB'’·6–væVBç6–væVD'—Ò(
"¶f÷&ÖDFFUF–ÖR‡6–væVBç6–væVDB—Ğ¢ÂöF—cà¢’¢—4vVçD&Æö6¶VD'”6öæf—&Òò€¢ÆF—b6Æ74æÖSÒ&×BÓFW‡B×‡2föçB×6VÖ–&öÆBFW‡BÖÖ&W"Óc#ävVçB‰^˜ŠŞˆ~ˆ‰NŠ.‹~‰Š.‹‰Š>‹‰®‰~Š>‹.‰®ˆ˜ŠŞ‰Š^ˆ~‰‹.ŠÂöF—cà¢’¢7FGW2ÓÓÒ$Æö6¶VB"ò€¢ÆF—b6Æ74æÖSÒ&×BÓFW‡B×‡2föçB×6VÖ–&öÆBFW‡B×6ÆFRÓC#î˜‰¾‹N‰N˜ˆ¾˜~‰Š¾Š^‹ˆ~Š~‹‰‰~‹^˜‚ˆ.ŠŞˆ~˜‰N‹~ŠŞ‰‰n‹‰N˜N‰³ÂöF—cà¢’¢7F—fU&W6WDgFW$FVFÆ–æRò€¢ÆF—b6Æ74æÖSÒ&×BÓFW‡B×‡2föçB×6VÖ–&öÆBFW‡B×f–öÆWBÓc#à¢Š>‹^˜ˆ¾˜~‰^˜Š^˜Šr˜ˆ¾˜~‰˜N‰N˜‰n‹nˆr·&W6WDW‡—&W4Bòf÷&ÖDFFUF–ÖR‡&W6WDW‡—&W4BçFô•4õ7G&–ær‚’’¢Gµ4”täEU$Uõ$U4UEõt”äDõuôD•7ÒŠ~‹‰–Ğ¢ÂöF—cà¢’¢&W6WEv–æF÷tW‡—&VBò€¢ÆF—b6Æ74æÖSÒ&×BÓFW‡B×‡2föçB×6VÖ–&öÆBFW‡B×&÷6RÓc#à¢Š>ŠŞ‰®Š>‹^˜ˆ¾˜~‰^Š¾Š‰NŠŞ‹.Š.‹˜Š^˜Šrˆ‰B&W6WB˜>Š¾Š˜˜N‰N˜¢ÂöF—cà¢’¢çVÆÇĞ¢ÂöF—cà¢ÆF—cãÅ6–væGW&U–ÆÂ7FGW3×·7FGW7ÒóãÂöF—cà¢ÆF—cà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ÷Vå6–væGW&UB‡&öÆR—Ğ¢F—6&ÆVC×²6ä÷Vå6–væGW&UGĞ¢6Æ74æÖS×¶rÖgVÆÂ&÷VæFVBÓ'†Â‚ÓB’Ó"FW‡B×‡2föçBÖ&Æ6²G&ç6—F–öâG°¢6ä÷Vå6–væGW&U@¢ò&&r×f–öÆWBÓsFW‡B×v†—FR†÷fW#¦&r×f–öÆWBÓƒ ¢¢&7W'6÷"Öæ÷BÖÆÆ÷vVB&r×6ÆFRÓ#FW‡B×6ÆFRÓS ¢ÖĞ¢à¢·v—fV@¢ò.Š.ˆ˜Š~˜‰Š^‹.Š.˜ˆ¾˜~‰˜Š^˜Šr ¢¢6–væV@¢ò6–væVBç6–væGW&TFFW&À¢ò.˜ŠŞˆŠ®‹.Š>Š^ˆ~‰‹.Š˜Š^˜Šr ¢¢6äFDf—'7DG&vå6–væGW&P¢ò6fVE6–væGW&TFFW&À¢ò.‰^Š>Š~ˆŠ®ŠŞ‰®Š^‹.Š.˜ˆ¾˜~‰˜‰N‹NŠ ¢¢.˜‰î‹N˜ŠŠ^‹.Š.˜ˆ¾˜~‰ˆŠ>‹Nˆr ¢¢.˜ˆ‰î‹.‹˜ˆ˜‹.ˆ.ŠŞˆ~Š^‹.Š.˜ˆ¾˜~‰’ ¢¢ÆÆ÷u6–và¢ò—4vVçD&Æö6¶VD'”6öæf—&Ğ¢ò.ˆ‰NŠ.‹~‰Š.‹‰ˆ˜ŠŞ‰˜ˆ¾˜~‰’ ¢¢6fVE6–væGW&TFFW&À¢ò.‰^Š>Š~ˆŠ®ŠŞ‰®Š^‹.Š.˜ˆ¾˜~‰˜‰N‹NŠ ¢¢F–ÖVÆ–æRÓÓÒ%6–væGW&RFVFÆ–æR76VB ¢ò.Š~‹.‰N˜Š^‹Š^ˆ~‰‹.ŠŠ^˜‹.ˆ®˜‹" ¢¢.Š~‹.‰N˜Š^‹Š^ˆ~‰‹.Š ¢¢7FGW2ÓÓÒ$Æö6¶VB ¢ò.Š.‹ˆ~˜NŠ˜˜‰¾‹N‰N˜>Š¾˜˜ˆ¾˜~‰’ ¢¢7FGW2ÓÓÒ$W‡—&VB ¢ò.˜ˆ‹N‰ˆ‹>Š¾‰‰B ¢¢.Š>ŠŞ‰Î‹˜˜ˆ‹^˜Š.Š~ˆ.˜ŠŞˆr'Ğ¢Âö'WGFöãà¢¶6å&W6WE&öÆTgFW$FVFÆ–æRò€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâfö–B&W6WE6–væGW&U&öÆR‡&öÆR—Ğ¢6Æ74æÖSÒ&×BÓ"rÖgVÆÂ&÷VæFVBÓ'†Â&÷&FW"&÷&FW"×&÷6RÓ#&r×&÷6RÓS‚ÓB’Ó"FW‡B×‡2föçBÖ&Æ6²FW‡B×&÷6RÓsG&ç6—F–öâ†÷fW#¦&r×&÷6RÓ ¢à¢&W6WBˆN‰‰‹^˜¢Âö'WGFöãà¢’¢çVÆÇĞ¢·v—F–ætf÷$WFöÖF–5v—fW"ò€¢ÆF—b6Æ74æÖSÒ&×BÓ"&÷VæFVBÓ'†Â&÷&FW"&÷&FW"×6·’Ó#&r×6·’ÓS‚Ó2’Ó"FW‡BÖ6VçFW"FW‡B×‡2föçBÖ&Æ6²ÆVF–ærÓRFW‡B×6·’Ós#à¢Š>‹‰®‰®ˆ‹v—fRŠŞ‹‰^˜.‰Š‹‰^‹NŠ¾Š^‹ˆrÂ7WW'f—6÷"˜Š^‹6Væ–÷"˜ˆ¾˜~‰ˆNŠ>‰ ¢ÂöF—cà¢’¢çVÆÇĞ¢ÂöF—cà¢ÂöF—cà¢“°¢Ò—Ğ¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&×BÓB&÷VæFVBÓ'†Â&÷&FW"&÷&FW"ÖÖ&W"Ó#&rÖÖ&W"ÓS‚ÓB’Ó2FW‡B×6ÒÆVF–ærÓbFW‡BÖÖ&W"Óƒ#à¢DbŠŞŠŞˆ˜N‰N˜‰~‹ˆŠ®‰n‹.‰‹˜‰^˜Š^‹.Š.˜ˆ¾˜~‰ˆŠ>‹Nˆ~‰^˜ŠŞˆ~˜>Š¾˜˜ˆ˜‹.ˆ.ŠŞˆr&öÆR˜ˆ¾˜~‰˜ŠŞˆ~˜‰~˜‹.‰‹˜‰’˜Š‹~˜ŠŞ‰®‹‰‰~‹nˆŠ^‹.Š.˜ˆ¾˜~‰ˆŠ>‹Nˆ~˜Š^˜Š~ˆ‹ˆŠ^‹‰®Š‹.˜ˆ˜˜ŠŞˆ~˜NŠ˜˜N‰N˜¢ÂöF—cà¢ÂöF—cà¢’¢çVÆÇĞ¢ÂöF—cà¢’¢çVÆÇĞ¢ÂöF—cà ¢ÂöF—cà¢ÂöF—cà¢ÂöÖ–ãà¢ÂöF—cà ¢·&Wf–Wt66Rò€¢ÆF—`¢6Æ74æÖSÒ&f—†VB–ç6WBÓ¢Õ³“ÒfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&r×6ÆFRÓ“SóSR‚ÓB’Ób&6¶G&÷Ö&ÇW"×6Ò ¢öäÖ÷W6TF÷vã×²‚’Óâ6WE&Wf–Wt66R†çVÆÂ—Ğ¢à¢ÆF—`¢&öÆSÒ&F–Æör ¢&–ÖÖöFÃÒ'G'VR ¢&–ÖÆ&VÆÆVF'“Ò'6–væGW&RÖ66R×&Wf–Wr×F—FÆR ¢öäÖ÷W6TF÷vã×²†WfVçB’ÓâWfVçBç7F÷&÷vF–öâ‚—Ğ¢6Æ74æÖSÒ&Ö‚Ö‚Õ³ƒ‡f…ÒrÖgVÆÂÖ‚×rÓ7†Â÷fW&fÆ÷r×’ÖWFò&÷VæFVBÕ³#G…Ò&÷&FW"&÷&FW"×f–öÆWBÓ&r×v†—FR6†F÷rÕ³ó3…ó“…÷&v&ƒRÃ#2ÃC"Ãã3"•Ò ¢à¢ÆF—b6Æ74æÖSÒ'7F–6·’F÷Ó¢ÓfÆW‚—FV×2×7F'B§W7F–g’Ö&WGvVVâvÓB&÷&FW"Ö"&÷&FW"×6ÆFRÓ&r×v†—FR‚ÓR’ÓB#à¢ÆF—cà¢ÆF—b6Æ74æÖSÒ'FW‡B×‡2föçBÖÖVF—VÒFW‡B×f–öÆWBÓc#îŠ>‹.Š.Š^‹˜ŠŞ‹^Š.‰N˜ˆNŠ£ÂöF—cà¢Æƒ2–CÒ'6–væGW&RÖ66R×&Wf–Wr×F—FÆR"6Æ74æÖSÒ&×BÓFW‡BÓ'†ÂföçB×6VÖ–&öÆBFW‡B×6ÆFRÓ“S#à¢·&Wf–Wt66Ræ66T–GĞ¢Âöƒ3à¢ÂöF—cà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ6WE&Wf–Wt66R†çVÆÂ—Ğ¢&–ÖÆ&VÃÒ.‰¾‹N‰NŠ>‹.Š.Š^‹˜ŠŞ‹^Š.‰N˜ˆNŠ¢ ¢6Æ74æÖSÒ&fÆW‚‚ÓrÓ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂ&÷&FW"&÷&FW"×6ÆFRÓ#FW‡BÓ'†ÂföçBÖæ÷&ÖÂFW‡B×6ÆFRÓSG&ç6—F–öâ†÷fW#¦&r×6ÆFRÓS ¢à¢9p¢Âö'WGFöãà¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ'ÓR#à¢ÆF—b6Æ74æÖSÒ&w&–BvÓ26Ó¦w&–BÖ6öÇ2Ó2#à¢µ°¢².Š~‹‰‰~‹^˜‚"Â&Wf–Wt66RæVF—DFFRÇÂ"Ò%ÒÀ¢².ˆN‹˜‰‰’"Â&Wf–Wt66Ræf–æÅ66÷&RçFôf—†VBƒ"•ÒÀ¢²$w&FR"Â&Wf–Wt66Ræw&FRÇÂ"Ò%ÒÀ¢ÒæÖ‚…¶Æ&VÂÂfÇVUÒ’Óâ€¢ÆF—b¶W“×¶Æ&VÇÒ6Æ74æÖSÒ'&÷VæFVBÓ'†Â&÷&FW"&÷&FW"×6ÆFRÓ#&r×6ÆFRÓS‚ÓB’Ó2#à¢ÆF—b6Æ74æÖSÒ'FW‡B×‡2föçBÖæ÷&ÖÂFW‡B×6ÆFRÓS#ç¶Æ&VÇÓÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓFW‡BÖ&6RföçB×6VÖ–&öÆBFW‡B×6ÆFRÓ“#ç·fÇVWÓÂöF—cà¢ÂöF—cà¢’—Ğ¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&×BÓB&÷VæFVBÓ'†Â&÷&FW"&÷&FW"×f–öÆWBÓ&r×f–öÆWBÓSóSÓB#à¢ÆF—b6Æ74æÖSÒ'FW‡B×‡2föçBÖÖVF—VÒFW‡B×f–öÆWBÓc#ä–çFVçCÂöF—cà¢²‚‚’Óâ°¢6öç7B–çFVçE'G2Ò7Æ—E6–væGW&T–çFVçB‡&Wf–Wt66Ræ–çV—'’“°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ&×BÓ"#à¢ÆF—b6Æ74æÖSÒ'FW‡BÖ&6RföçB×6VÖ–&öÆBÆVF–ærÓrFW‡B×6ÆFRÓ“#ç¶–çFVçE'G2ç&–Ö'’ÇÂ"Ò'ÓÂöF—cà¢¶–çFVçE'G2ç6V6öæF'’ò€¢ÆF—b6Æ74æÖSÒ&×BÓFW‡B×6ÒföçBÖæ÷&ÖÂÆVF–ærÓbFW‡B×6ÆFRÓS#ç¶–çFVçE'G2ç6V6öæF'—ÓÂöF—cà¢’¢çVÆÇĞ¢ÂöF—cà¢“°¢Ò’‚—Ğ¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&×BÓB&÷VæFVBÓ'†Â&÷&FW"&÷&FW"×6ÆFRÓ#&r×v†—FRÓB#à¢ÆF—b6Æ74æÖSÒ'FW‡B×‡2föçBÖÖVF—VÒFW‡B×6ÆFRÓS#ä6öÖÖVçBòŠ>‹.Š.Š^‹˜ŠŞ‹^Š.‰NŠ®Š>‹‰³ÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓ"v†—FW76R×&R×w&FW‡B×6ÒföçBÖæ÷&ÖÂÆVF–ærÓrFW‡B×6ÆFRÓs#à¢·&Wf–Wt66Ræ6öÖÖVçBÇÂ"Ò'Ğ¢ÂöF—cà¢ÂöF—cà ¢·&Wf–Wt66RçF÷–73òæÆVæwF‚ò€¢ÆF—b6Æ74æÖSÒ&×BÓB&÷VæFVBÓ'†Â&÷&FW"&÷&FW"×6ÆFRÓ#&r×6ÆFRÓSÓB#à¢ÆF—b6Æ74æÖSÒ'FW‡B×‡2föçBÖÖVF—VÒFW‡B×6ÆFRÓS#îˆN‹˜‰‰Š>‹.Š.Š¾‹Š~ˆ.˜ŠÓÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓ2w&–BvÓ"6Ó¦w&–BÖ6öÇ2Ó"#à¢·&Wf–Wt66RçF÷–72æÖ‚‡F÷–2’Óâ°¢6öç7B66÷&RÒçVÖ&W"‡F÷–2ç66÷&R’ÇÂ°¢6öç7BÖ‚ÒçVÖ&W"‡F÷–2æÖ‚’ÇÂ°¢6öç7BW&6VçBÒÖ‚âòÖF‚æÖ‚ƒÂÖF‚æÖ–âƒÂ‡66÷&RòÖ‚’¢’’¢°¢6öç7B&%FöæRĞ¢W&6VçBãÒƒP¢ò&&rÖVÖW&ÆBÓS ¢¢W&6VçBãÒsP¢ò&&rÖÖ&W"ÓS ¢¢&&r×&÷6RÓS#°¢&WGW&â€¢ÆF—b¶W“×¶G·F÷–2æ6öFWÒÒG·F÷–2çF—FÆWÖÒ6Æ74æÖSÒ'&÷VæFVB×†Â&r×v†—FR‚Ó2’Ó"ãR#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâvÓ2#à¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓG'Væ6FRFW‡B×6ÒföçBÖæ÷&ÖÂFW‡B×6ÆFRÓs#ç·F÷–2çF—FÆWÓÂöF—cà¢ÆF—b6Æ74æÖSÒ'6‡&–æ²ÓFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×f–öÆWBÓs#ç·66÷&WÒ÷¶Ö‚ÇÂ"Ò'ÓÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓ"‚Ó"÷fW&fÆ÷rÖ†–FFVâ&÷VæFVBÖgVÆÂ&r×6ÆFRÓ##à¢ÆF—b6Æ74æÖS×¶‚ÖgVÆÂ&÷VæFVBÖgVÆÂG¶&%FöæWÖÒ7G–ÆS×·²v–GFƒ¢G·W&6VçGÒV×Òóà¢ÂöF—cà¢ÂöF—cà¢“°¢Ò—Ğ¢ÂöF—cà¢ÂöF—cà¢’¢çVÆÇĞ ¢ÆF—b6Æ74æÖSÒ&×BÓRfÆW‚§W7F–g’ÖVæB#à¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ6WE&Wf–Wt66R†çVÆÂ—Ğ¢6Æ74æÖSÒ'&÷VæFVB×†Â&r×f–öÆWBÓs‚ÓR’Ó2FW‡B×6ÒföçBÖÖVF—VÒFW‡B×v†—FRG&ç6—F–öâ†÷fW#¦&r×f–öÆWBÓƒ ¢à¢‰¾‹N‰@¢Âö'WGFöãà¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢’¢çVÆÇĞ ¢·6–væ–æu&öÆRbb6VÆV7FVDFö7VÖVçBò€¢Å6–væGW&UDÖöFÀ¢&öÆTÆ&VÃ×·&öÆUF†”Æ&VÂ‡6–væ–æu&öÆR—Ğ¢6–væW$æÖS×¶vWE&öÆU6–væW"‡6VÆV7FVDFö7VÖVçBÂ6–væ–æu&öÆR—Ğ¢6fVE6–væGW&TFFW&Ã×·6–væGW&TÆ–'&'•¶vWE6fVE6–væGW&T¶W’‡6–væ–æu&öÆR•×Ğ¢öä6æ6VÃ×²‚’Óâ6WE6–væ–æu&öÆR†çVÆÂ—Ğ¢öäFVÆWFU6fVE6–væGW&S×¶7–æ2‚’Óâ°¢6öç7BÆ–'&'”¶W’ÒvWE6fVE6–væGW&T¶W’‡6–væ–æu&öÆR“°¢–b‚v–æF÷ræ6öæf—&Ò‚.Š^‰®Š^‹.Š.˜ˆ¾˜~‰‰~‹^˜‰®‹‰‰~‹nˆ˜NŠ~˜Š¾Š>‹~ŠŞ˜NŠ˜ƒò˜ŠŞˆŠ®‹.Š>˜ˆ˜‹.‰~‹^˜˜ˆNŠ.˜ˆ¾˜~‰˜Š^˜Š~ˆ‹˜NŠ˜‰n‹ˆ˜‰¾Š^‹^˜Š.‰˜‰¾Š^ˆr"’’&WGW&ã°¢G'’°¢v—BFVÆWFU7F÷&VE6–væGW&TÆ–'&'”VçG'’†Æ–'&'”¶W’“°¢Ò6F6‚†W'&÷"’°¢6öç6öÆRçv&â‚$FVÆWFR&VÖ÷FR6–væGW&RÆ–'&'’f–ÆVB"ÂW'&÷"“°¢v–æF÷ræÆW'B‚.Š^‰®Š^‹.Š.˜ˆ¾˜~‰‰~‹^˜‰®‹‰‰~‹nˆ˜NŠ˜Š®‹>˜Š>˜~ˆ‚ˆŠ>‹‰>‹.Š^ŠŞˆ~˜>Š¾Š˜ŠŞ‹^ˆˆNŠ>‹˜ˆr"“°¢&WGW&ã°¢Ğ¢6WE6–væGW&TÆ–'&'’‚‡&Wf–÷W2’Óâ°¢6öç7BæW‡BÒ²ââç&Wf–÷W2Ó°¢FVÆWFRæW‡E¶Æ–'&'”¶W•Ó°¢&WGW&âæW‡C°¢Ò“°¢×Ğ¢öåW6U6fVE6–væGW&S×¶7–æ2‚’Óâ°¢6öç7B6fVE6–væGW&TFFW&ÂÒ6–væGW&TÆ–'&'•¶vWE6fVE6–væGW&T¶W’‡6–væ–æu&öÆR•Ó°¢–b‚6fVE6–væGW&TFFW&Â’&WGW&ã°¢–b‚6å6–vä–FVçF—G’†7W'&VçEW6W"Â6VÆV7FVDFö7VÖVçBÂ6–væ–æu&öÆR’’°¢v–æF÷ræÆW'B‚.˜ˆ¾˜~‰˜‰~‰ˆ‹‰˜NŠ˜˜N‰N˜’ˆŠ>‹‰>‹.˜>Š¾˜˜ˆ˜‹.ˆ.ŠŞˆ~Š^‹.Š.˜ˆ¾˜~‰‰^‹.Š&öÆR˜‰¾˜~‰‰Î‹˜Š^ˆ~‰‹.Š˜ŠŞˆr"“°¢6WE6–væ–æu&öÆR†çVÆÂ“°¢&WGW&ã°¢Ğ¢6öç7BW†—7F–æu6–væVBÒvWE6–væVDVçG'’†VffV7F—fTVçG&–W4f÷$Fö2‡6VÆV7FVDFö7VÖVçBÂ6–væGW&W2’Â6–væ–æu&öÆR“°¢ÆWB6fVBÒfÇ6S°¢–b†W†—7F–æu6–væVB’°¢6fVBÒv—B6fTG&vå6–væGW&R‡6–væ–æu&öÆRÂ6fVE6–væGW&TFFW&ÂÂfÇ6R“°¢ÒVÇ6R°¢6fVBÒv—B6–vå&öÆR‡6–væ–æu&öÆRÂ6fVE6–væGW&TFFW&ÂÂfÇ6R“°¢Ğ¢–b‡6fVB’6WE6–væ–æu&öÆR†çVÆÂ“°¢×Ğ¢öå6fS×¶7–æ2†FFW&ÂÂ6fUFõ6fVDÆ–'&'’’Óâ°¢–b‚6å6–vä–FVçF—G’†7W'&VçEW6W"Â6VÆV7FVDFö7VÖVçBÂ6–væ–æu&öÆR’’°¢v–æF÷ræÆW'B‚.˜ˆ¾˜~‰˜‰~‰ˆ‹‰˜NŠ˜˜N‰N˜’ˆŠ>‹‰>‹.˜>Š¾˜˜ˆ˜‹.ˆ.ŠŞˆ~Š^‹.Š.˜ˆ¾˜~‰‰^‹.Š&öÆR˜‰¾˜~‰‰Î‹˜Š^ˆ~‰‹.Š˜ŠŞˆr"“°¢6WE6–væ–æu&öÆR†çVÆÂ“°¢&WGW&ã°¢Ğ¢6öç7BÆ–'&'”¶W’ÒvWE6fVE6–væGW&T¶W’‡6–væ–æu&öÆR“°¢6öç7B&WÆ6–æu6fVE6–væGW&RÒ&ööÆVâ‡6–væGW&TÆ–'&'•¶Æ–'&'”¶W•Ò“°¢6öç7BW†—7F–æu6–væVBÒvWE6–væVDVçG'’†VffV7F—fTVçG&–W4f÷$Fö2‡6VÆV7FVDFö7VÖVçBÂ6–væGW&W2’Â6–væ–æu&öÆR“°¢ÆWB6fVBÒfÇ6S°¢–b†W†—7F–æu6–væVB’°¢6fVBÒv—B6fTG&vå6–væGW&R‡6–væ–æu&öÆRÂFFW&ÂÂ6fUFõ6fVDÆ–'&'’“°¢ÒVÇ6R°¢6fVBÒv—B6–vå&öÆR‡6–væ–æu&öÆRÂFFW&ÂÂ6fUFõ6fVDÆ–'&'’“°¢Ğ¢–b‡6fVB’°¢–b‡6fUFõ6fVDÆ–'&'’’°¢v–æF÷ræÆW'B‡&WÆ6–æu6fVE6–væGW&P¢ò.ŠŞ‹‰¾˜‰N‰^Š^‹.Š.˜ˆ¾˜~‰‰~‹^˜‰®‹‰‰~‹nˆ˜Š>‹^Š.‰®Š>˜ŠŞŠ.˜Š^˜Šr ¢¢.‰®‹‰‰~‹nˆŠ^‹.Š.˜ˆ¾˜~‰˜NŠ~˜˜>ˆ®˜ˆNŠ>‹˜ˆ~‰^˜ŠŞ˜N‰¾˜Š>‹^Š.‰®Š>˜