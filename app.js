// Initialize Supabase
        const supabaseUrl = 'https://ovirqmxklhhbmxqbbxsz.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92aXJxbXhrbGhoYm14cWJieHN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NjM0ODIsImV4cCI6MjA3NDUzOTQ4Mn0.4ipBgvya5CXAC4phkkskaxnJvFoVDsaQO0Lt0p9Rd0k';
        const supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true
            }
        });

        // Global state
        let currentUser = null;
        let posts = [];
        let selectedFile = null;
        let searchTimeout;
        let trendingTopics = [
            { topic: '#ZenCom', count: 15420 },
            { topic: '#Mindfulness', count: 8932 },
            { topic: '#Meditasi', count: 5678 },
            { topic: '#Keseimbangan', count: 3456 },
            { topic: '#InnerPeace', count: 2345 }
        ];

        // Initialize app
        document.addEventListener('DOMContentLoaded', async () => {
            await checkAuth();

            // Check if we are loading a specific post
            const urlParams = new URLSearchParams(window.location.search);
            const postId = urlParams.get('post');

            if (postId) {
                // If a post ID is present, load only that post first and show the detail view.
                // The full feed will load in the background.
                await showPostFromQuery(postId);
                loadPosts(); // Load the rest of the posts in the background
            } else {
                // If no specific post, load the main feed.
                await loadPosts();
            }

            loadTrendingTopics();
            loadSuggestedUsers();

            // Set up real-time subscriptions
            setupRealtimeSubscriptions();
        });

        // Authentication functions
        async function checkAuth() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                currentUser = user;
                updateUserUI();
                loadUserData();
            }
        }

        function toggleAuth() {
            const modal = document.getElementById('authModal');
            modal.classList.toggle('active');
        }

        function toggleTermsModal() {
            const modal = document.getElementById('termsModal');
            modal.classList.toggle('active');
        }

        function showLogin() {
            document.getElementById('loginForm').classList.remove('hidden');
            document.getElementById('registerForm').classList.add('hidden');
        }

        function showRegister() {
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('registerForm').classList.remove('hidden');
        }

        async function login() {
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            if (!email || !password) {
                showNotification('Mohon isi semua field', 'error');
                return;
            }

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                showNotification('Login gagal: ' + error.message, 'error');
            } else {
                currentUser = data.user;
                updateUserUI();
                loadUserData();
                toggleAuth();
                showNotification('Selamat datang di ZenCom! 🧘‍♀️');
            }
        }

        async function loginWithGitHub() {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'github'
            });

            if (error) {
                showNotification('Gagal masuk dengan GitHub: ' + error.message, 'error');
            }
        }

        async function register() {
            const name = document.getElementById('registerName').value;
            const username = document.getElementById('registerUsername').value;
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            const termsCheckbox = document.getElementById('termsCheckbox');

            if (!termsCheckbox.checked) {
                showNotification('Anda harus menyetujui Syarat dan Ketentuan untuk mendaftar.', 'error');
                return;
            }

            if (!name || !username || !email || !password) {
                showNotification('Mohon isi semua field', 'error');
                return;
            }

            try {
                // Register user
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password
                });

                if (error) throw error;

                const avatarUrl = createAvatarPlaceholder(name);

                // Create user profile
                const { error: profileError } = await supabase.from('profiles').insert([
                    {
                        id: data.user.id,
                        name: name,
                        username: username,
                        avatar_url: avatarUrl
                    }
                ]);

                if (profileError) throw profileError;

                // Log in the user directly after registration
                currentUser = data.user;
                updateUserUI();
                loadUserData();
                toggleAuth();
                showNotification('Registrasi berhasil! Selamat datang di ZenCom! 🧘‍♀️');
            } catch (error) {
                showNotification('Registrasi gagal: ' + error.message, 'error');
            }
        }

        async function logout() {
            await supabase.auth.signOut();
            currentUser = null;
            updateUserUI();
            showNotification('Anda telah keluar. Sampai jumpa! 👋');
        }

        function updateUserUI() {
            const authBtn = document.getElementById('authBtn');
            const userCard = document.getElementById('userCard');
            const createPostSection = document.getElementById('createPostSection');

            if (currentUser) {
                authBtn.textContent = 'Keluar';
                authBtn.onclick = logout;
                userCard.style.display = 'block';
                createPostSection.style.display = 'block';
            } else {
                authBtn.textContent = 'Masuk';
                authBtn.onclick = toggleAuth;
                userCard.style.display = 'none';
                createPostSection.style.display = 'none';
            }
        }

        async function loadUserData() {
            if (!currentUser) return;

            let { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', currentUser.id)
                .single();

            if (error) {
                console.error('Error loading user data:', error);
                return;
            }

            if (profile) {
                if (profile.avatar_url.includes('picsum.photos')) {
                    const newAvatarUrl = createAvatarPlaceholder(profile.name);
                    const { data: updatedProfile, error: updateError } = await supabase
                        .from('profiles')
                        .update({ avatar_url: newAvatarUrl })
                        .eq('id', currentUser.id)
                        .select()
                        .single();

                    if (updateError) {
                        console.error('Error updating avatar:', updateError);
                    } else {
                        profile = updatedProfile;
                    }
                }

                const verifiedBadge = getVerifiedBadge(profile.username);
                document.getElementById('userName').innerHTML = `${profile.name} ${verifiedBadge}`;
                document.getElementById('userHandle').textContent = '@' + profile.username;
                document.getElementById('userAvatar').src = profile.avatar_url;
                document.getElementById('currentUserAvatar').src = profile.avatar_url;
                document.getElementById('userFollowing').textContent = profile.following_count || 0;
                document.getElementById('userFollowers').textContent = profile.followers_count || 0;

                // Load post count
                const { count } = await supabase
                    .from('posts')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', currentUser.id);

                document.getElementById('userPosts').textContent = count || 0;
            }
        }

        // Post functions
        function handleImageSelection(event) {
            const file = event.target.files[0];
            if (!file) {
                selectedFile = null;
                document.getElementById('imagePreview').classList.add('hidden');
                return;
            }
            selectedFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('imagePreview');
                preview.src = e.target.result;
                preview.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }

        async function uploadImage(file) {
            if (!file) return null;

            const fileName = `${currentUser.id}/${Date.now()}-${file.name}`;
            const { data, error } = await supabase.storage
                .from('post-images')
                .upload(fileName, file);

            if (error) {
                console.error('Error uploading image:', error);
                showNotification('Gagal mengunggah gambar: ' + error.message, 'error');
                return null;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('post-images')
                .getPublicUrl(data.path);

            return publicUrl;
        }

        async function createPost() {
            if (!currentUser) {
                toggleAuth();
                return;
            }

            const content = document.getElementById('postContent').value.trim();
            if (!content && !selectedFile) {
                showNotification('Mohon tulis zen atau pilih gambar', 'error');
                return;
            }

            try {
                let imageUrl = null;
                if (selectedFile) {
                    imageUrl = await uploadImage(selectedFile);
                    if (!imageUrl) return; // Upload failed
                }

                const { data, error } = await supabase
                    .from('posts')
                    .insert([
                        {
                            user_id: currentUser.id,
                            content: content,
                            image_url: imageUrl
                        }
                    ])
                    .select()
                    .single();

                if (error) throw error;

                // Reset form
                document.getElementById('postContent').value = '';
                document.getElementById('imageUpload').value = '';
                selectedFile = null;
                const preview = document.getElementById('imagePreview');
                preview.src = '';
                preview.classList.add('hidden');

                await loadPosts();
                showNotification('Zen Anda telah dibagikan! ✨');
            } catch (error) {
                showNotification('Gagal membuat zen: ' + error.message, 'error');
            }
        }

        async function loadPosts() {
            try {
                const { data, error } = await supabase
                    .from('posts')
                    .select(`
                        *,
                        profiles!posts_user_id_fkey (*),
                        likes (*),
                        comments (count)
                    `)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                posts = data || [];
                renderPosts();
            } catch (error) {
                console.error('Error loading posts:', error);
                showNotification('Gagal memuat zen', 'error');
            }
        }

        function renderPosts(postsToRender = posts) {
            const feed = document.getElementById('postsFeed');
            feed.innerHTML = '';

            const searchInput = document.getElementById('searchInput');
            const isSearching = searchInput && searchInput.value.length > 0;

            if (postsToRender.length === 0) {
                const message = isSearching
                    ? 'Tidak ada hasil pencarian ditemukan. Coba kata kunci lain. 🧐'
                    : 'Belum ada zen. Jadilah yang pertama berbagi! 🌸';

                const icon = isSearching ? 'fa-search' : 'fa-spa';

                feed.innerHTML = `
                    <div style="text-align: center; padding: 3rem 0;">
                        <i class="fas ${icon}" style="font-size: 4rem; color: #d1d5db; margin-bottom: 1rem;"></i>
                        <p style="color: #6b7280; font-size: 1.125rem;">${message}</p>
                    </div>
                `;
                return;
            }

            postsToRender.forEach(post => {
                const postElement = createPostElement(post);
                feed.appendChild(postElement);
            });
        }

        function getVerifiedBadge(username) {
            if (username === 'viodevin1') {
                return '<i class="fas fa-check-circle verified-badge"></i>';
            }
            return '';
        }

        function linkifyHashtags(content) {
            return content.replace(/#(\w+)/g, '<a href="#" class="hashtag-link" onclick="searchHashtag(\'$1\')">#$1</a>');
        }

        function searchHashtag(hashtag) {
            const searchInput = document.getElementById('searchInputModal');
            searchInput.value = `#${hashtag}`;
            handleSearch();
        }

        function createPostElement(post) {
            const div = document.createElement('div');
            div.className = 'zen-card';
            div.id = `post-${post.id}`; // Add unique ID to the post card

            const timeAgo = getTimeAgo(new Date(post.created_at));
            const isLiked = post.likes && post.likes.some(like => like.user_id === currentUser?.id);
            const verifiedBadge = getVerifiedBadge(post.profiles.username);

            div.innerHTML = `
                <div class="post-header">
                    <img src="${post.profiles.avatar_url}" alt="${post.profiles.name}" class="post-avatar-large" onclick="showUserProfile('${post.profiles.id}')">
                    <div class="post-meta">
                        <div class="post-meta-header">
                            <div class="post-user-info">
                                <h4 class="post-username" onclick="showUserProfile('${post.profiles.id}')">${post.profiles.name} ${verifiedBadge}</h4>
                                <span class="post-tag">@${post.profiles.username}</span>
                                <span class="post-time">${timeAgo}</span>
                            </div>
                            <button class="close-button">
                                <i class="fas fa-ellipsis-h"></i>
                            </button>
                        </div>
                        <p class="post-content">${linkifyHashtags(post.content)}</p>
                        ${
                            post.image_url ?
                            `<img src="${post.image_url}" alt="Post image" style="width: 100%; border-radius: 0.75rem; margin-top: 1rem; cursor: pointer;" onclick="showImageDetail('${post.image_url}')">`
                            : ''
                        }
                        <div class="post-footer">
                            <button onclick="showComments('${post.id}')" class="post-action">
                                <i class="far fa-comment action-icon"></i>
                                <span class="action-count">${post.comments?.[0]?.count || 0}</span>
                            </button>
                            <button onclick="toggleLike('${post.id}')" class="post-action ${isLiked ? 'liked' : ''}">
                                <i class="${isLiked ? 'fas' : 'far'} fa-heart action-icon"></i>
                                <span class="action-count">${post.likes.length || 0}</span>
                            </button>
                            <div class="post-action" style="position: relative;">
                                <button onclick="toggleShareMenu('${post.id}')" class="post-action" style="padding: 0; background: transparent;">
                                    <i class="fas fa-share action-icon"></i>
                                    <span class="action-count">Bagikan</span>
                                </button>
                                <div id="share-menu-${post.id}" class="hidden" style="position: absolute; bottom: 100%; left: 0; background: white; border-radius: 0.75rem; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 10; width: 200px; overflow: hidden;">
                                    ${post.image_url ? `<div class="share-option" onclick="downloadImage('${post.image_url}', 'zencom-post-${post.id}.jpg')"><i class="fas fa-download" style="margin-right: 0.5rem;"></i>Download foto</div>` : ''}
                                    <div class="share-option" onclick="sharePostLink('${post.id}')"><i class="fas fa-link" style="margin-right: 0.5rem;"></i>Bagikan Tautan Postingan</div>
                                </div>
                            </div>
                            <button class="post-action">
                                <i class="far fa-bookmark action-icon"></i>
                                <span class="action-count">Simpan</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            return div;
        }

        async function toggleLike(postId) {
            if (!currentUser) {
                toggleAuth();
                return;
            }

            const postCard = document.getElementById(`post-${postId}`);
            if (!postCard) return;

            const likeButton = postCard.querySelector('button[onclick^="toggleLike"]');
            const likeIcon = likeButton.querySelector('i.fa-heart');
            const likeCountSpan = likeButton.querySelector('.action-count');

            if (!likeButton || !likeIcon || !likeCountSpan) {
                console.error('Like elements not found for post', postId);
                return;
            }

            // --- Optimistic UI Update ---
            const isCurrentlyLiked = likeButton.classList.contains('liked');
            const originalLikeCount = parseInt(likeCountSpan.textContent, 10);

            likeButton.classList.toggle('liked');
            likeIcon.classList.toggle('fas');
            likeIcon.classList.toggle('far');
            likeCountSpan.textContent = isCurrentlyLiked ? originalLikeCount - 1 : originalLikeCount + 1;
            // --- End of Optimistic UI Update ---

            try {
                // Find the post in the local state to update it too.
                // This prevents UI flicker if a re-render happens before the realtime event arrives.
                const postIndex = posts.findIndex(p => p.id === postId);

                if (isCurrentlyLiked) {
                    // UNLIKE
                    const { error } = await supabase
                        .from('likes')
                        .delete()
                        .match({ post_id: postId, user_id: currentUser.id });
                    if (error) throw error;

                    if (postIndex !== -1) {
                        const likeIndex = posts[postIndex].likes.findIndex(l => l.user_id === currentUser.id);
                        if (likeIndex !== -1) posts[postIndex].likes.splice(likeIndex, 1);
                    }

                } else {
                    // LIKE
                    const { data, error } = await supabase
                        .from('likes')
                        .insert({ post_id: postId, user_id: currentUser.id })
                        .select()
                        .single();
                    if (error) throw error;

                    if (postIndex !== -1) {
                        posts[postIndex].likes.push(data);
                    }
                }

            } catch (error) {
                showNotification('Gagal menyukai zen: ' + error.message, 'error');

                // --- Revert UI on Failure ---
                likeButton.classList.toggle('liked');
                likeIcon.classList.toggle('fas');
                likeIcon.classList.toggle('far');
                likeCountSpan.textContent = originalLikeCount;
                // --- End of Revert ---
            }
        }

        function toggleShareMenu(postId) {
            const menu = document.getElementById(`share-menu-${postId}`);
            if (menu) {
                menu.classList.toggle('hidden');
            }
        }

        async function downloadImage(imageUrl, fileName) {
            try {
                // To bypass CORS issues, we fetch the image via a server-side proxy if needed,
                // but for Supabase Storage, direct fetch should work if configured correctly.
                // Let's try a direct fetch first.
                const response = await fetch(imageUrl);
                if (!response.ok) throw new Error('Network response was not ok.');
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                showNotification('Gambar berhasil diunduh! 🖼️');
            } catch (error) {
                console.error('Download error:', error);
                showNotification('Gagal mengunduh gambar. Coba klik kanan dan "Simpan Gambar Sebagai...".', 'error');
            }
        }

        async function sharePostLink(postId) {
            const post = posts.find(p => p.id === postId);
            if (!post) return;

            const url = `${window.location.origin}/?post=${postId}`;
            const shareData = {
                title: `Zen by ${post.profiles.name} on ZenCom`,
                text: post.content,
                url: url,
            };

            // Use Web Share API if available
            if (navigator.share) {
                try {
                    await navigator.share(shareData);
                    showNotification('Zen berhasil dibagikan! 🚀');
                } catch (err) {
                    // User cancelled the share action, do nothing.
                    if (err.name !== 'AbortError') {
                        console.error('Share API error:', err);
                        showNotification('Gagal membagikan: ' + err.message, 'error');
                    }
                }
            } else {
                // Fallback to copying the link
                navigator.clipboard.writeText(url).then(() => {
                    showNotification('Tautan postingan disalin ke clipboard! 🔗');
                }, (err) => {
                    console.error('Could not copy text: ', err);
                    showNotification('Gagal menyalin tautan.', 'error');
                });
            }
        }

        // Navigation functions
        function showFeed() {
            document.getElementById('feedTitle').textContent = 'Beranda';
            loadPosts();
        }

        function showExplore() {
            document.getElementById('feedTitle').textContent = 'Jelajahi';
            // Load explore content
        }

        function showNotifications() {
            document.getElementById('feedTitle').textContent = 'Notifikasi';
            // Load notifications
        }

        function showMessages() {
            document.getElementById('feedTitle').textContent = 'Pesan';
            // Load messages
        }

        function showProfile() {
            if (!currentUser) {
                toggleAuth();
                return;
            }
            showUserProfile(currentUser.id);
        }

        function showCreatePost() {
            if (!currentUser) {
                toggleAuth();
                return;
            }
            document.getElementById('postContent').focus();
        }

        function showSearch() {
            document.getElementById('searchModal').classList.add('active');
            document.getElementById('searchInputModal').focus();
        }

        function closeSearch() {
            document.getElementById('searchModal').classList.remove('active');
        }

        async function handleSearch() {
            clearTimeout(searchTimeout);
            const query = document.getElementById('searchInputModal').value.trim();
            const searchResultsContainer = document.getElementById('searchResults');

            if (query.length === 0) {
                searchResultsContainer.innerHTML = '';
                return;
            }

            if (query.length < 2) {
                searchResultsContainer.innerHTML = '<p style="text-align:center; color:#6b7280; padding: 2rem 0;">Ketik minimal 2 karakter untuk memulai pencarian...</p>';
                return;
            }

            searchResultsContainer.innerHTML = '<p style="text-align:center; color:#6b7280; padding: 2rem 0;">Mencari...</p>';

            searchTimeout = setTimeout(async () => {
                try {
                    const [usersRes, postsRes] = await Promise.all([
                        supabase
                            .from('profiles')
                            .select('*')
                            .or(`name.ilike.%${query}%,username.ilike.%${query}%`)
                            .limit(5),
                        supabase
                            .from('posts')
                            .select('*, profiles!posts_user_id_fkey (*), likes(count), comments(count)')
                            .ilike('content', `%${query}%`)
                            .order('created_at', { ascending: false })
                            .limit(10)
                    ]);

                    if (usersRes.error) throw usersRes.error;
                    if (postsRes.error) throw postsRes.error;

                    renderSearchResults(usersRes.data, postsRes.data);
                } catch (error) {
                    console.error('Search error:', error);
                    searchResultsContainer.innerHTML = '<p style="text-align:center; color:red; padding: 2rem 0;">Terjadi kesalahan saat mencari.</p>';
                }
            }, 300);
        }

        function renderSearchResults(users, posts) {
            const resultsContainer = document.getElementById('searchResults');
            resultsContainer.innerHTML = '';

            if (users.length === 0 && posts.length === 0) {
                resultsContainer.innerHTML = '<p style="text-align:center; color:#6b7280; padding: 2rem 0;">Tidak ada hasil yang ditemukan. Coba kata kunci lain. 🧐</p>';
                return;
            }

            if (users.length > 0) {
                const usersHeader = document.createElement('h4');
                usersHeader.className = 'section-title';
                usersHeader.textContent = 'Pengguna';
                usersHeader.style.padding = '0 0.75rem';
                resultsContainer.appendChild(usersHeader);

                users.forEach(user => {
                    const userElement = document.createElement('div');
                    userElement.className = 'search-result-item';
                    userElement.onclick = () => {
                        showUserProfile(user.id);
                        closeSearch();
                    };
                    const verifiedBadge = getVerifiedBadge(user.username);
                    userElement.innerHTML = `
                        <img src="${user.avatar_url}" alt="${user.name}" class="search-result-avatar">
                        <div class="search-result-details">
                            <h5>${user.name} ${verifiedBadge}</h5>
                            <p>@${user.username}</p>
                        </div>
                    `;
                    resultsContainer.appendChild(userElement);
                });
            }

            if (posts.length > 0) {
                const postsHeader = document.createElement('h4');
                postsHeader.className = 'section-title';
                postsHeader.textContent = 'Zen';
                postsHeader.style.padding = '0 0.75rem';
                postsHeader.style.marginTop = '1rem';
                resultsContainer.appendChild(postsHeader);

                posts.forEach(post => {
                    const postElement = document.createElement('div');
                    postElement.className = 'search-result-item';
                    postElement.onclick = () => {
                        showPostDetail(post.id);
                        closeSearch();
                    };
                    const postContent = post.content.length > 100 ? post.content.substring(0, 100) + '...' : post.content;
                    postElement.innerHTML = `
                        <img src="${post.profiles.avatar_url}" alt="${post.profiles.name}" class="search-result-avatar">
                        <div class="search-result-details">
                            <h5>${post.profiles.name} <span style="font-weight: normal; color: #6b7280;">@${post.profiles.username}</span></h5>
                            <p>${postContent}</p>
                        </div>
                    `;
                    resultsContainer.appendChild(postElement);
                });
            }
        }

        function createAvatarPlaceholder(name) {
            const getInitials = (name) => {
                const names = name.split(' ');
                let initials = names[0].substring(0, 1).toUpperCase();
                if (names.length > 1) {
                    initials += names[names.length - 1].substring(0, 1).toUpperCase();
                }
                return initials;
            };

            const initials = getInitials(name);
            const width = 200;
            const height = 200;
            const backgroundColor = `
                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:rgb(102,126,234);stop-opacity:1" />
                    <stop offset="100%" style="stop-color:rgb(118,75,162);stop-opacity:1" />
                </linearGradient>
            `;

            const svg = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    <defs>${backgroundColor}</defs>
                    <rect width="100%" height="100%" fill="url(#grad1)"/>
                    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="80" font-family="Arial, sans-serif" font-weight="bold">
                        ${initials}
                    </text>
                </svg>
            `;

            return `data:image/svg+xml;base64,${btoa(svg)}`;
        }

        // Utility functions
        function getTimeAgo(date) {
            const seconds = Math.floor((new Date() - date) / 1000);

            if (seconds < 60) return 'baru saja';
            if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
            if (seconds < 86400) return Math.floor(seconds / 3600) + 'j';
            if (seconds < 2592000) return Math.floor(seconds / 86400) + 'h';
            if (seconds < 31536000) return Math.floor(seconds / 2592000) + 'b';
            return Math.floor(seconds / 31536000) + 't';
        }

        function showNotification(message, type = 'success') {
            const toast = document.getElementById('notificationToast');
            const text = document.getElementById('notificationText');

            text.textContent = message;
            toast.classList.add('active');

            setTimeout(() => {
                toast.classList.remove('active');
            }, 3000);
        }

        // Load trending topics
        function loadTrendingTopics() {
            const trendingList = document.getElementById('trendingList');
            trendingList.innerHTML = '';

            trendingTopics.forEach(topic => {
                const div = document.createElement('div');
                div.className = 'trending-item';
                div.innerHTML = `
                    <p class="trending-topic">${topic.topic}</p>
                    <p class="trending-count">${topic.count.toLocaleString()} zen</p>
                `;
                trendingList.appendChild(div);
            });
        }

        // Load suggested users
        async function loadSuggestedUsers() {
            try {
                const { data: users, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .limit(5);

                if (error) throw error;

                const suggestedUsers = document.getElementById('suggestedUsers');
                suggestedUsers.innerHTML = '';

                if (users) {
                    users.forEach(user => {
                        const div = document.createElement('div');
                        div.className = 'user-suggestion';
                        const verifiedBadge = getVerifiedBadge(user.username);
                        div.innerHTML = `
                            <div class="suggested-user">
                                <div class="user-suggestion-info">
                                    <img src="${user.avatar_url}" alt="${user.name}" class="suggestion-avatar">
                                    <div class="suggestion-details">
                                        <h5>${user.name} ${verifiedBadge}</h5>
                                        <p>@${user.username}</p>
                                    </div>
                                </div>
                                <button onclick="followUser('${user.id}')" class="zen-button" style="font-size: 0.875rem; padding: 0.5rem 1rem;">
                                    Ikuti
                                </button>
                            </div>
                        `;
                        suggestedUsers.appendChild(div);
                    });
                }
            } catch (error) {
                console.error('Error loading suggested users:', error);
            }
        }

        async function followUser(userId) {
            if (!currentUser) {
                toggleAuth();
                return;
            }

            try {
                // Implement follow functionality
                showNotification('Mengikuti pengguna...');
            } catch (error) {
                showNotification('Gagal mengikuti pengguna', 'error');
            }
        }

        function showUserProfile(userId) {
            // Show user profile
            document.getElementById('feedTitle').textContent = 'Profil Zen Master';
        }

        function showComments(postId) {
            showPostDetail(postId);
        }

        async function addComment(postId) {
            if (!currentUser) {
                toggleAuth();
                return;
            }

            const contentEl = document.querySelector(`#postDetailContent textarea`);
            const content = contentEl.value.trim();

            if (!content) {
                showNotification('Komentar tidak boleh kosong', 'error');
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('comments')
                    .insert({
                        post_id: postId,
                        user_id: currentUser.id,
                        content: content
                    })
                    .select()
                    .single();

                if (error) throw error;

                contentEl.value = ''; // Clear textarea
                showNotification('Komentar berhasil ditambahkan! 💬');
                await loadComments(postId); // Refresh comments list
                await updatePostInState(postId); // Update comment count on the main feed post
            } catch (error) {
                showNotification('Gagal menambahkan komentar: ' + error.message, 'error');
            }
        }

        async function loadComments(postId) {
            const commentsContainer = document.getElementById(`comments-list-${postId}`);
            if (!commentsContainer) return;

            commentsContainer.innerHTML = '<p style="text-align:center; color:#6b7280; padding: 1rem 0;">Memuat komentar...</p>';

            try {
                const { data: comments, error } = await supabase
                    .from('comments')
                    .select(`
                        *,
                        profiles (*)
                    `)
                    .eq('post_id', postId)
                    .order('created_at', { ascending: true });

                if (error) throw error;

                if (comments.length === 0) {
                    commentsContainer.innerHTML = '<p style="text-align:center; color:#6b7280; padding: 1rem 0;">Belum ada komentar. Jadilah yang pertama! ✍️</p>';
                    return;
                }

                commentsContainer.innerHTML = ''; // Clear container
                comments.forEach(comment => {
                    const commentEl = document.createElement('div');
                    commentEl.className = 'zen-card comment-card'; // Add a specific class for comment styling
                    const verifiedBadge = getVerifiedBadge(comment.profiles.username);

                    commentEl.innerHTML = `
                        <div class="post-header">
                            <img src="${comment.profiles.avatar_url}" alt="${comment.profiles.name}" class="post-avatar-large">
                            <div class="post-meta">
                                <div class="post-meta-header">
                                    <div class="post-user-info">
                                        <h4 class="post-username">${comment.profiles.name} ${verifiedBadge}</h4>
                                        <span class="post-tag">@${comment.profiles.username}</span>
                                        <span class="post-time">${getTimeAgo(new Date(comment.created_at))}</span>
                                    </div>
                                </div>
                                <p class="post-content">${linkifyHashtags(comment.content)}</p>
                            </div>
                        </div>
                    `;
                    commentsContainer.appendChild(commentEl);
                });

            } catch (error) {
                console.error("Error loading comments:", error);
                commentsContainer.innerHTML = '<p style="text-align:center; color:red; padding: 1rem 0;">Gagal memuat komentar.</p>';
            }
        }


        async function showPostDetail(postId) {
            const modal = document.getElementById('postDetailModal');
            const content = document.getElementById('postDetailContent');

            // Find post
            const post = posts.find(p => p.id === postId);
            if (!post) return;

            const isLiked = post.likes && post.likes.some(like => like.user_id === currentUser?.id);

            content.innerHTML = `
                <div class="zen-card" id="detail-post-${post.id}">
                     <div class="post-header">
                        <img src="${post.profiles.avatar_url}" alt="${post.profiles.name}" class="post-avatar-large">
                        <div class="post-meta">
                            <div class="post-meta-header">
                                <div class="post-user-info">
                                    <h4 class="post-username">${post.profiles.name} ${getVerifiedBadge(post.profiles.username)}</h4>
                                    <span class="post-tag">@${post.profiles.username}</span>
                                    <span class="post-time">${getTimeAgo(new Date(post.created_at))}</span>
                                </div>
                            </div>
                            <p class="post-content">${linkifyHashtags(post.content)}</p>
                            ${
                                post.image_url ?
                                `<img src="${post.image_url}" alt="Post image" style="width: 100%; border-radius: 0.75rem; margin-top: 1rem;" onclick="showImageDetail('${post.image_url}')">`
                                : ''
                            }
                            <div class="post-footer">
                                 <button onclick="showComments('${post.id}')" class="post-action">
                                    <i class="far fa-comment action-icon"></i>
                                    <span class="action-count">${post.comments?.[0]?.count || 0}</span>
                                </button>
                                <button onclick="toggleLike('${post.id}')" class="post-action ${isLiked ? 'liked' : ''}">
                                    <i class="${isLiked ? 'fas' : 'far'} fa-heart action-icon"></i>
                                    <span class="action-count">${post.likes.length || 0}</span>
                                </button>
                                <button class="post-action">
                                    <i class="fas fa-share action-icon"></i>
                                </button>
                                <button class="post-action">
                                    <i class="far fa-bookmark action-icon"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div style="margin-top: 1.5rem;">
                    <h3 class="section-title">Komentar Zen</h3>
                    ${currentUser ? `
                    <div class="zen-card">
                        <div class="post-form">
                            <img src="${document.getElementById('currentUserAvatar').src}" alt="User" class="post-avatar">
                            <div class="post-input-container">
                                <textarea placeholder="Tulis komentar zen..." class="post-textarea" rows="3"></textarea>
                                <button class="zen-button" style="margin-top: 0.75rem;" onclick="addComment('${post.id}')">
                                    <i class="fas fa-paper-plane mr-2"></i>Kirim
                                </button>
                            </div>
                        </div>
                    </div>
                    ` : `
                    <p style="text-align:center; color:#6b7280; padding: 1rem 0;">
                        <a href="#" onclick="toggleAuth(); return false;" class="form-link" style="text-decoration: underline;">Masuk</a> untuk menulis komentar.
                    </p>
                    `}
                    <div id="comments-list-${post.id}" class="comments-list-container">
                        <!-- Comments will be loaded here -->
                    </div>
                </div>
            `;

            modal.classList.add('active');
            await loadComments(postId);
        }

        function closePostDetail() {
            document.getElementById('postDetailModal').classList.remove('active');
        }

        function showImageDetail(imageUrl) {
            document.getElementById('imageDetailContent').src = imageUrl;
            document.getElementById('imageDetailModal').classList.add('active');
        }

        function closeImageDetail() {
            document.getElementById('imageDetailModal').classList.remove('active');
        }

        async function showPostFromQuery(postId) {
            try {
                const { data: post, error } = await supabase
                    .from('posts')
                    .select(`
                        *,
                        profiles!posts_user_id_fkey (*),
                        likes (*),
                        comments (count)
                    `)
                    .eq('id', postId)
                    .single();

                if (error) throw error;
                if (!post) {
                    showNotification('Post tidak ditemukan atau telah dihapus.', 'error');
                    return;
                }

                // Add the post to the local state if it's not already there,
                // so that showPostDetail can find it.
                if (!posts.some(p => p.id === post.id)) {
                    posts.unshift(post); // Add to the beginning
                }

                showPostDetail(post.id);

            } catch (error) {
                console.error('Error fetching shared post:', error);
                showNotification('Gagal memuat post yang dibagikan.', 'error');
            }
        }

        async function updatePostInState(postId) {
            try {
                const { data: updatedPost, error } = await supabase
                    .from('posts')
                    .select(`
                        *,
                        profiles!posts_user_id_fkey (*),
                        likes (*),
                        comments (count)
                    `)
                    .eq('id', postId)
                    .single();

                if (error) throw error;
                if (!updatedPost) return; // Post might have been deleted

                // Find the index of the post in the local 'posts' array
                const postIndex = posts.findIndex(p => p.id === postId);
                if (postIndex !== -1) {
                    // Replace the old post data with the updated data
                    posts[postIndex] = updatedPost;

                    // Find the post element in the DOM
                    const postElement = document.getElementById(`post-${postId}`);
                    if (postElement) {
                        // Create a new element with the updated data
                        const newPostElement = createPostElement(updatedPost);
                        // Replace the old element with the new one
                        postElement.parentNode.replaceChild(newPostElement, postElement);
                    }
                }
            } catch (error) {
                console.error(`Error updating post ${postId} in real-time:`, error);
            }
        }

        // Real-time subscriptions
        function setupRealtimeSubscriptions() {
            // Subscribe to new posts
            supabase
                .channel('posts')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => {
                    loadPosts();
                })
                .subscribe();

            // Subscribe to likes for real-time updates
            supabase
                .channel('likes')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, payload => {
                    // Instead of a full reload, find the affected post and update it.
                    // This is more efficient and prevents the whole feed from re-rendering.
                    const postId = payload.new?.post_id || payload.old?.post_id;
                    if (postId) {
                        updatePostInState(postId);
                    }
                })
                .subscribe();

            // Subscribe to comments for real-time updates
            supabase
                .channel('comments')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, payload => {
                    const postId = payload.new?.post_id;
                    if (postId) {
                        // If the post detail modal is open, refresh the comments
                        const modal = document.getElementById('postDetailModal');
                        if (modal.classList.contains('active')) {
                            const commentsList = document.getElementById(`comments-list-${postId}`);
                            if (commentsList) {
                                loadComments(postId);
                            }
                        }
                        // Always update the post in the main feed (for comment count)
                        updatePostInState(postId);
                    }
                })
                .subscribe();
        }