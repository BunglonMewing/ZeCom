import os
import json
from playwright.sync_api import sync_playwright, expect

# Data tiruan untuk pengujian yang andal dan terisolasi
mock_posts = [
    {
        "id": "mock-1",
        "created_at": "2025-09-28T12:00:00Z",
        "content": "Ini adalah postingan Zen pertama untuk pengujian.",
        "image_url": "https://picsum.photos/seed/test1/600/400",
        "profiles": {"id": "user-1", "name": "Penguji Coba", "username": "tester", "avatar_url": "https://i.pravatar.cc/150?u=tester"},
        "likes": [{"count": 5}],
        "comments": [{"count": 2}]
    },
    {
        "id": "mock-2",
        "created_at": "2025-09-28T12:05:00Z",
        "content": "Postingan kedua tanpa gambar.",
        "image_url": None, # Akan dikonversi menjadi null oleh json.dumps()
        "profiles": {"id": "user-2", "name": "Jules Engineer", "username": "jules", "avatar_url": "https://i.pravatar.cc/150?u=jules"},
        "likes": [{"count": 10}],
        "comments": [{"count": 3}]
    }
]

def run_verification(page):
    file_path = f"file://{os.path.abspath('index.html')}"
    page.goto(file_path)

    # --- Cegah Race Condition & Injeksi Data Tiruan ---
    # 1. Ganti fungsi loadPosts asli agar tidak melakukan panggilan jaringan dan menimpa data kita.
    # 2. Suntikkan data tiruan kita ke dalam variabel global `posts`.
    # 3. Panggil renderPosts() secara manual untuk menampilkan data tiruan.
    mock_posts_json = json.dumps(mock_posts)
    page.evaluate(f"""
        window.loadPosts = async () => {{ console.log('Original loadPosts has been neutered.'); }};
        window.posts = {mock_posts_json};
        window.renderPosts();
    """)

    # Pastikan data tiruan berhasil di-render
    expect(page.locator(".zen-card").first).to_be_visible(timeout=5000)

    # --- Verifikasi 1: Modal Syarat dan Ketentuan ---
    page.click("#authBtn")
    page.get_by_role("link", name="Daftar").click()
    page.get_by_role("link", name="Syarat dan Ketentuan").click()

    terms_modal = page.locator("#termsModal")
    expect(terms_modal).to_be_visible()
    page.screenshot(path="jules-scratch/verification/01_terms_modal.png")

    page.click("#termsModal .close-button")
    expect(terms_modal).not_to_be_visible()
    page.click("#authModal .close-button")

    # --- Verifikasi 2: Fitur Pencarian ---
    search_input = page.locator("#searchInput")
    search_input.type("Zen")

    expect(page.locator(".zen-card")).to_have_count(1)
    expect(page.get_by_text("Ini adalah postingan Zen pertama untuk pengujian.")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/02_search_result.png")

    # --- Verifikasi 3: Menu Bagikan ---
    search_input.fill("")
    expect(page.locator(".zen-card")).to_have_count(2)

    first_post = page.locator(".zen-card").first
    share_button = first_post.locator(".post-footer").get_by_role("button", name="Bagikan")
    share_button.click()

    share_menu = first_post.locator("[id^=share-menu-]")
    expect(share_menu).to_be_visible()
    expect(share_menu.get_by_text("Download foto")).to_be_visible()
    expect(share_menu.get_by_text("Bagikan Tautan Postingan")).to_be_visible()

    page.screenshot(path="jules-scratch/verification/final_verification.png")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    run_verification(page)
    browser.close()

print("Verification script with neutered load and mock data executed successfully.")