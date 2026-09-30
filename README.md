# VirtualSwins

VirtualSwins is a Vercel-ready virtual-football screenshot analysis frontend with a server-side Gemini image-analysis endpoint.

## Deploy

1. Import this project into Vercel.
2. Add `GEMINI_API_KEY` as a Vercel Environment Variable.
3. Optional: add `GEMINI_MODEL` (default: `gemini-3.8-flash`).
4. Redeploy.

## Analysis flow

Screenshot -> `/api/analyze` -> Gemini multimodal analysis -> structured JSON -> VirtualSwins prediction cards.

The Gemini key is never placed in browser code. The API route sends the image to Gemini server-side using the Interactions API and requests a JSON schema so the frontend receives predictable fields.

The percentages shown by VirtualSwins are AI-generated estimates and are not guaranteed outcomes or independently validated statistical probabilities.

## Notes

The 500-diamond balance and demo Buy button are client-side placeholders. Real accounts, persistent balances, payments and admin verification require a production database/auth/payment backend.
