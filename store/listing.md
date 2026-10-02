# Google Play listing: 1TapPDF

Ready-to-paste text and answers for Play Console. Graphics are in this folder:

| Play Console field | File | Spec |
|---|---|---|
| App icon | `play-icon-512.png` | 512 × 512 PNG, no transparency |
| Feature graphic | `feature-graphic-1024x500.png` | 1024 × 500 PNG, no transparency |
| Phone screenshots | *take these on a device* | 2–8 images, portrait 9:16 (e.g. 1080 × 1920) |

Screenshot ideas, in this order: the home screen (tool grid), the scanner with its
frame guide, Edit text changing a line on a real page, placing a signature,
Convert with a Word file picked, Split with pages selected, and the result screen
showing compression savings.

## Release basics

| Field | Value |
|---|---|
| Package name | `com.kinngshishupal.onetappdf` (permanent after first upload) |
| Version name | `1.0.0` (from `app.json` → `version`) |
| Version code | Managed by EAS (`appVersionSource: remote`, auto-incremented) |
| Build | `npm run build:aab`, then upload the `.aab` (or `npm run submit:android`) |
| Release track | Start with **Internal testing**, then Closed testing, then Production |

## App name (max 30)

1TapPDF: PDF Scanner & Editor

## Short description (max 80)

Scan, edit, sign, merge, compress & convert PDFs. Every PDF tool in one tap.

## Full description (max 4000)

1TapPDF puts every PDF tool you need in one beautiful app. Scan a contract, fix a typo, sign it, shrink it and send it, all in a few taps and without an account.

SCAN
• Turn paper into crisp PDFs with your camera
• Capture many pages in a row; a frame guide crops each page neatly
• Rotate or remove pages before saving, and choose Sharp or Compact output
• Import photos from your gallery instead of the camera

EDIT
• Edit text that is already in the PDF: tap a line, type, done. Size, colour and style are matched to the original
• Add new text, draw freehand, highlight, or white out anything
• Rotate, duplicate, delete or insert blank pages
• Reorder pages by holding and dragging them

SIGN
• Draw your signature once and reuse it anywhere
• Four ink colours and three pen widths
• Drag it into place on the real page, resize it, add today's date, and sign one page or every page

CONVERT TO PDF
• Word (.docx, and the text of older .doc files)
• Excel and spreadsheets (.xlsx, .xls, .ods, .csv)
• PowerPoint (.pptx): slide text and pictures
• Text, Markdown, Rich Text, web pages, OpenDocument, code and data files
• Photos to PDF with A4, Letter or fit-to-photo pages
• Write a note and turn it into a PDF, or dictate it with voice typing
• Convert many files at once, or combine them into one PDF

MERGE, SPLIT & COMPRESS
• Merge PDFs and photos into one file in any order
• Split by tapping the pages you want, or pick odd/even pages in one tap
• Extract pages, save each page separately, or remove pages
• Compress scanned and photo-heavy PDFs and see exactly how much you saved

YOUR FILES, YOUR PHONE
• A built-in library to search, sort, rename, share and print your documents
• Your documents are processed on your phone. They are never uploaded to us
• No account, no ads, no subscriptions

Note: page previews and text detection in the editor load a document viewer component from the internet, so those parts need a connection. Voice typing uses your phone's speech recognition service. 
## What's new (release notes, max 500)

Welcome to 1TapPDF! This first release includes:
• Document scanner with multi-page capture
• Edit existing PDF text, add text, draw, highlight and white out
• Sign PDFs with a saved signature
• Convert Word, Excel, PowerPoint, text and photos to PDF
• Merge, split and compress PDFs
• Voice typing for notes
• A library to keep all your PDFs in one place

## Category and tags

- App or game: **App**
- Category: **Productivity** (alternative: Business)
- Tags (pick up to 5 in Play Console): Document scanner, PDF editor, Productivity,
  Office, File converter
- Contains ads: **No**
- In-app purchases: **No**

## Store contact details

- Email: *your support email* (required, shown publicly)
- Website: optional
- Phone: optional

## App access

All functionality is available without special access (no login or account).

## Content rating questionnaire (IARC)

Category: **Utility, Productivity, Communication, or Other**. Answer **No** to all
content questions: no violence, sexual content, profanity, drugs, gambling, or
user-generated content shared with others. The app does not let users chat or
exchange content with each other (the system share sheet doesn't count), doesn't
share location, and has no digital purchases. Expect an **Everyone / PEGI 3** rating.

## Target audience

Suggested: **18 and over** (or 13 and over). It's a general productivity tool, not
designed for children; choosing under-13 age groups brings in the Families policy
and extra requirements.

## Permissions used

The build requests only these (storage permissions are explicitly removed in
`app.json` → `android.blockedPermissions`; files and photos are picked through
Android's system pickers, which need no permission):

| Permission | Why |
|---|---|
| `CAMERA` | Scanning documents |
| `RECORD_AUDIO` | Voice typing in Convert → Write |
| `INTERNET` | Loading the page-preview component (pdf.js) |
| `VIBRATE` | Haptic feedback |

None of these need a special Play declaration form.

## Data safety form

Your documents, photos and scans are processed on the device and never sent to
you or anyone else, and the app has no analytics, ads or accounts. The one
judgement call is **voice typing**: the app uses Android's speech recognizer
(Google's speech service), which may send the audio to Google to turn it into text.

Recommended, conservative answers:

- Does your app collect or share any of the required user data types? **Yes**
- Data type: **Audio → Voice or sound recordings**
  - Collected: **Yes**. Shared: **No** (sent to a service provider on your behalf)
  - Processed ephemerally: **Yes** (not stored)
  - Required or optional: **Optional** (users can just type)
  - Purpose: **App functionality**
- Is all user data encrypted in transit? **Yes**
- Do you provide a way for users to request that their data is deleted? **No data
  is retained**, so answer per the form's guidance (audio isn't stored)

Everything else (files, photos, camera images, signatures, library) stays on the
device and is **not** collected. If you'd rather declare no data at all, the app
can be changed to on-device-only speech recognition, at the cost of voice typing
not working on phones without an offline speech model.

## Privacy policy

Play requires a public URL. Host the text below (for example as a GitHub Pages
page or a GitHub Gist) and paste its link into Play Console.

> **1TapPDF: Privacy Policy**
>
> 1TapPDF is a PDF toolkit. We do not run servers that receive your documents,
> and we do not collect, sell or share your personal information.
>
> **Your documents stay on your device.** Files you open, photos you pick, pages
> you scan, signatures you draw and the PDFs you create are processed and stored
> only on your device. You can delete them in the app's Files tab, or remove
> everything by clearing the app's storage or uninstalling it.
>
> **Camera.** Used only to scan documents when you choose to. Images stay on
> your device.
>
> **Microphone (voice typing).** Used only while you are dictating. Your speech is
> converted to text by your phone's speech recognition service (on most Android
> phones, Google's speech service), which may process the audio on its servers
> under its own privacy policy. 1TapPDF does not record or store the audio.
>
> **Internet.** Used to load an open-source document viewer component (pdf.js)
> that shows page previews. Your documents are not uploaded; like any web
> request, the content-delivery network receives standard technical information
> such as your IP address.
>
> **No ads, analytics or accounts.** The app contains no advertising, no
> analytics or tracking, and no sign-in.
>
> **Children.** The app is not directed at children under 13.
>
> If this policy changes, the updated version will be posted at this address.
>
> Contact: *your-support-email@example.com*

## Release checklist

1. `npm run build:aab` (first run: log in to Expo and let EAS create the signing key).
2. Play Console → Create app → fill in the sections above (App access, Ads, Content
   rating, Target audience, Data safety, Privacy policy, Store listing).
3. Upload the `.aab` to **Internal testing**, add yourself as a tester, install and
   check every tool, especially voice typing, scanning and Edit text.
4. **New personal developer accounts** must run a **Closed test with at least 12
   testers for 14 days** before production access is granted (check Play Console
   for the current requirement).
5. Promote the build to **Production** and submit for review.
