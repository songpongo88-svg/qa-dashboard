# QA Evidence Capture

Browser extension for Chrome / Microsoft Edge that captures a selected area from any normal web page and sends it back to the active case in QA Dashboard > Evidence Attachment.

## Install once

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Microsoft Edge.
2. Turn on **Developer mode**.
3. Download this folder from the repository and keep `manifest.json`, `background.js`, and `content.js` together.
4. Click **Load unpacked** and select the `qa-evidence-capture` folder.
5. Pin **QA Evidence Capture** if you want the toolbar button visible.

## Use

1. Open the case in QA Dashboard and enter the Case ID.
2. In **Evidence Attachment**, click **Capture Evidence**. The page should show `Extension Ready` when the extension is connected.
3. Go to any normal website/tab that contains the evidence.
4. Press **Alt + Shift + S** or click the extension icon.
5. Drag the mouse around the area you want to capture.
6. The image is returned to the active QA case automatically and uses the existing Evidence Attachment flow.
7. Repeat as many times as needed. Existing image/PDF attachment remains available through **Attach Files**.

## Notes

- Works on normal web pages. Browsers intentionally block extensions on protected pages such as `chrome://`, `edge://`, browser settings, and extension stores.
- The extension stores pending captures locally in the browser only until QA Dashboard acknowledges them.
- The Case ID is used as the safety key so captures are not silently attached to a different open case.
