# V13 Cloud Excel Sync

GitHub Actions workflow: `.github/workflows/daily-v13-excel-sync.yml`

Schedule: every day at `10:00 UTC`, which is `17:00 Asia/Bangkok`.

## What It Does

- Reads QA evaluations from Firestore.
- Reads approved/rejected Appeal events from Firestore.
- Downloads `QA_Score_Dashboard_byDao_V13.xlsx` from OneDrive or SharePoint through Microsoft Graph.
- Appends only new `Case ID` rows into `Raw_Data`.
- Appends only new `Case ID` rows into `Effective_Data`.
- Appends only new Appeal records into `Appeal_Data`.
- Uploads the workbook back through Microsoft Graph.

The workflow does not need the user's computer to be on.

## Required GitHub Secrets

Set these in GitHub repository settings:

- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_USER_ID`
- `MS_WORKBOOK_PATH`

Optional alternative to `MS_USER_ID` + `MS_WORKBOOK_PATH`:

- `MS_DRIVE_ID`
- `MS_ITEM_ID`

If `MS_DRIVE_ID` and `MS_ITEM_ID` are present, the script uses them directly.

## Microsoft Graph App Permissions

Create an Azure App Registration and grant application permissions such as:

- `Files.ReadWrite.All`
- or a more restricted SharePoint/OneDrive permission if configured by the tenant admin.

Admin consent is required for application permissions.

## Workbook Path Example

For the current file, `MS_WORKBOOK_PATH` should be the OneDrive path under the account drive, for example:

```text
Documents/Report QA/ROWDATA/QA_Score_Dashboard_byDao_V13.xlsx
```

Use the account email or user id for:

```text
MS_USER_ID=songpon_robinhood_co_th
```

If that user id does not resolve, use the Microsoft 365 user principal name/email instead.

## Manual Run

Open GitHub Actions, choose `Daily V13 Excel Sync`, then click `Run workflow`.

Use `dry_run=true` to check pending rows without writing the workbook.

## Notes

- Close the workbook when the workflow is scheduled, because OneDrive/Excel Online can still block cloud writes when the file is actively edited.
- Dashboard formulas are preserved in the workbook, but this cloud job appends values without running Excel desktop COM.
- Excel/Excel Online recalculates workbook formulas when the file is opened.
