import asyncio
from playwright.async_api import async_playwright, expect
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Get the absolute path of the index.html file
        file_path = os.path.abspath('index.html')

        # 1. Go to the application page and wait for the main button to be ready
        await page.goto(f'file://{file_path}')
        await expect(page.get_by_role("button", name="Masuk")).to_be_visible(timeout=10000) # Wait up to 10s

        # --- Registration ---
        # 2. Open the auth modal
        await page.get_by_role("button", name="Masuk").click()

        # 3. Switch to the registration form
        await page.get_by_role("link", name="Daftar").click()

        # 4. Fill out the registration form
        await page.get_by_placeholder("Nama Lengkap").fill("Test User")
        await page.get_by_placeholder("Username").fill("testuser")
        # Use a unique email to avoid conflicts on re-runs
        import time
        timestamp = int(time.time())
        await page.get_by_placeholder("Email").fill(f"test.user.{timestamp}@example.com")
        await page.get_by_placeholder("Password").fill("password123")
        await page.get_by_label("Saya setuju dengan Syarat dan Ketentuan").check()

        # 5. Submit registration
        await page.get_by_role("button", name="Daftar").click()

        # Wait for registration notification
        await expect(page.locator("#notificationToast")).to_contain_text("Registrasi berhasil!")

        # --- Create a Post ---
        # 6. Fill in the post content
        await page.get_by_placeholder("Bagikan zen Anda...").fill("This is a test post from a Playwright script!")

        # 7. Click the "Zen" button to create the post
        await page.get_by_role("button", name="Zen", exact=True).click()
        await expect(page.locator("#notificationToast")).to_contain_text("Zen Anda telah dibagikan!")

        # Wait for the post to appear in the feed
        await expect(page.locator(".zen-card").first).to_contain_text("This is a test post")

        # --- Like and Comment ---
        first_post = page.locator(".zen-card").first

        # 8. Like the post
        like_button = first_post.get_by_role("button", name="0")
        await like_button.click()
        await expect(like_button).to_have_class("liked")
        await expect(like_button.get_by_text("1")).to_be_visible()

        # 9. Open the post detail view (comments)
        await first_post.get_by_role("button", name="0").nth(0).click() # Click the comment button

        # 10. Wait for the modal to appear and add a comment
        await expect(page.locator("#postDetailModal")).to_be_visible()
        comment_textarea = page.locator("#postDetailContent textarea")
        await comment_textarea.fill("This is a test comment!")
        await page.get_by_role("button", name="Kirim").click()

        # 11. Verify the comment appears
        await expect(page.locator(".comment-card")).to_contain_text("This is a test comment!")

        # 12. Take a screenshot of the post detail modal
        await page.screenshot(path="jules-scratch/verification/verification.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())