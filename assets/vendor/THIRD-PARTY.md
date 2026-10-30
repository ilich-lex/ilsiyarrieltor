# Signature motion adaptation

Magic UI **Text Animate** is adapted in `animateEditorialText()` in `script.js`, used by the two-word accessible hero name (`data-magic-text="word-slide-up"`).

Transferred mechanisms: split by whitespace into word segments; duration/segment stagger; slide-up item variant (y=20 to 0); one accessible name on the parent, visual segments aria-hidden. React/AnimatePresence are replaced with the existing vanilla Motion.animate. Initial opacity is kept above zero and the portrait is never hidden while waiting for a library.

Source: https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/text-animate.tsx

Retrieved 2026-10-31, source SHA-256: `0ebece79c412661f57bc0489416b55a376e9f006e0f558162bb6e91f814a99a6`. MIT copyright notice is retained in [MAGIC-UI-LICENSE.md](MAGIC-UI-LICENSE.md). No Magic UI Pro material or React dependency is included.

Motion 14.7.1 remains the existing local animation runtime. The property carousel is custom: Motion interpolates one phase, and each frame derives x/y/rotation/depth from sin/cos of the category angle. Pointer Events implement horizontal drag; no Embla dependency or paid path API is used.
