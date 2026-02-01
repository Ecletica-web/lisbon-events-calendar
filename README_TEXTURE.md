# Adding Concrete Texture Image

## Steps to Add Your Concrete Texture Image

1. **Place your image file** in the `public` folder:
   - Name it: `concrete-texture.jpg` (or update the CSS if you use a different name)
   - Supported formats: `.jpg`, `.jpeg`, `.png`, `.webp`

2. **Recommended image specs:**
   - Format: JPG or PNG
   - Size: At least 1920x1080px (larger is better for high-DPI displays)
   - File size: Optimize to keep it under 500KB for fast loading

3. **If you want to use a different filename:**
   - Update `src/app/globals.css`
   - Change `url('/concrete-texture.jpg')` to your filename

4. **Adjust the texture appearance:**
   - In `src/app/globals.css`, you can modify:
     - `opacity: 0.4` - Lower = more subtle, Higher = more visible
     - `filter: brightness(1.1) contrast(0.95)` - Adjust brightness/contrast
     - `background-size: cover` - Change to `contain` or specific size
     - `background-position: center` - Adjust positioning

## Current Setup

The texture is applied as a fixed background that:
- Covers the entire viewport
- Stays fixed when scrolling
- Appears behind all content with 40% opacity
- Can be adjusted via CSS filters
