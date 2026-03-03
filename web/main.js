// AI Artifact Manager - Core Logic
let artifacts = [];
let currentFilter = 'all';

// DOM Elements
const gallery = document.getElementById('gallery');
const modal = document.getElementById('modal');
const addNewBtn = document.getElementById('add-new-btn');
const closeModalBtn = document.getElementById('close-modal');
const artifactForm = document.getElementById('artifact-form');
const navItems = document.querySelectorAll('.nav-item');
const searchInput = document.getElementById('search-input');

// Initialize
async function init() {
    console.log('AI Studio Initialized');
    artifacts = await eel.load_data()();
    // Sort by file creation date (descending)
    artifacts.sort((a, b) => (b.file_ctime || 0) - (a.file_ctime || 0));
    render();
    loadPlayerState();
}

window.onload = init;

// --- Functions ---
let editingId = null;

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
    document.getElementById('artifact-form').reset();
    document.querySelector('#modal h2').textContent = 'Add New Job';
    editingId = null;
}

function openEditModal(id) {
    const artifact = artifacts.find(a => a.id === id);
    if (!artifact) return;

    document.getElementById('title').value = artifact.title;
    document.getElementById('prompt').value = artifact.prompt;
    document.getElementById('type').value = artifact.type;
    document.getElementById('content').value = artifact.content;
    document.getElementById('tags').value = artifact.tags.join(', ');
    document.getElementById('thumbnail').value = artifact.thumbnail || '';

    document.querySelector('#modal h2').textContent = 'Edit Job';
    editingId = id;
    document.getElementById('modal').classList.remove('hidden');
}

async function deleteArtifact(id) {
    if (confirm('本当にこのアーティファクトを削除しますか？🗑️')) {
        artifacts = artifacts.filter(a => a.id !== id);
        await eel.save_data(artifacts)();
        render();
    }
}

async function saveArtifact() {
    const title = document.getElementById('title').value;
    const content = document.getElementById('content').value;

    if (!title || !content) {
        alert('「Title」と「Content」は入力必須です！✨');
        return;
    }

    const tagsArray = document.getElementById('tags').value.split(',').map(t => t.trim()).filter(t => t);
    const thumbnail = document.getElementById('thumbnail').value;

    if (editingId) {
        // Update existing
        artifacts = artifacts.map(a => {
            if (a.id === editingId) {
                return {
                    ...a,
                    title: title,
                    prompt: document.getElementById('prompt').value || 'No prompt provided',
                    type: document.getElementById('type').value,
                    content: content,
                    thumbnail: thumbnail,
                    tags: tagsArray,
                    // keep original timestamp or update? let's keep original
                };
            }
            return a;
        });
    } else {
        // Create new
        const newArtifact = {
            id: Date.now(),
            title: title,
            prompt: document.getElementById('prompt').value || 'No prompt provided',
            type: document.getElementById('type').value,
            content: content,
            thumbnail: thumbnail,
            tags: tagsArray,
            timestamp: new Date().toISOString()
        };
        artifacts.unshift(newArtifact);
    }

    await eel.save_data(artifacts)();
    // Re-load to get server-calculated file_ctime and sort
    await init();
    closeModal();
}

async function clearAllJobs() {
    if (confirm('⚠️ すべてのジョブ（データ）を完全に削除します。この操作は取り消せません。\n本当によろしいですか？🗑️💥')) {
        artifacts = [];
        await eel.save_data(artifacts)();
        render();
    }
}

async function copyPrompt(id) {
    const artifact = artifacts.find(a => a.id === id);
    if (artifact && artifact.prompt) {
        try {
            await navigator.clipboard.writeText(artifact.prompt);
            alert('プロンプトをクリップボードにコピーしました！📋✨');
        } catch (err) {
            alert('コピーに失敗しました。😭');
            console.error('Failed to copy text: ', err);
        }
    } else {
        alert('コピーするプロンプトがありません。😅');
    }
}

async function runApp(id) {
    const artifact = artifacts.find(a => a.id === id);
    if (artifact && artifact.content) {
        const success = await eel.run_app(artifact.content)();
        if (!success) {
            alert('実行に失敗しました。パスやURLが正しいか確認してください。😥');
        }
    }
}

// browse functions moved to the end of file for consolidation

// --- Drag and Drop Logic ---
function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('drop-overlay').classList.remove('hidden');
}

function handleDragLeave(e) {
    e.preventDefault();
    document.getElementById('drop-overlay').classList.add('hidden');
}

function handleDrop(e) {
    e.preventDefault();
    document.getElementById('drop-overlay').classList.add('hidden');

    // Check if files were dropped
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        // Chromiumの制限でフルパスが取得できないための通知
        alert("ブラウザのセキュリティ制限により、ドラッグ＆ドロップからは絶対パスが取得できません。ローカル画像のフルパスを取得するには「Browse...」ボタンをご利用ください！📁");
    } else {
        // Fallback for text drop (e.g., dragging an image from another webpage)
        const text = e.dataTransfer.getData('text');
        const html = e.dataTransfer.getData('text/html');

        if (html) {
            // 別のブラウザタブから画像をドラッグした場合、imgタグのsrcを抽出できるか試す
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const img = tempDiv.querySelector('img');
            if (img && img.src) {
                document.getElementById('content').value = img.src;
                document.getElementById('type').value = 'image';
                return;
            }
        }

        if (text) {
            document.getElementById('content').value = text;
            if (text.startsWith('http')) {
                document.getElementById('type').value = 'url';
            } else {
                document.getElementById('type').value = 'document';
            }
        }
    }
}

// Navigation
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        currentFilter = item.id.replace('nav-', '');
        render();
    });
});

// Search
searchInput.addEventListener('input', () => render());

// --- Playlist & Global Player Logic ---
let playlist = [];
let currentTrackIndex = -1;
const globalAudio = document.getElementById('global-audio-element');
const playerBar = document.getElementById('global-player');
const playerPlayBtn = document.getElementById('player-play-pause');
const progressBar = document.getElementById('player-progress');

// --- Functions ---

function savePlayerState() {
    const state = {
        playlist: playlist,
        currentTrackIndex: currentTrackIndex,
        volume: globalAudio.volume,
        muted: globalAudio.muted
    };
    localStorage.setItem('artifact_manager_player_state', JSON.stringify(state));
}

function loadPlayerState() {
    const saved = localStorage.getItem('artifact_manager_player_state');
    if (saved) {
        try {
            const state = JSON.parse(saved);
            playlist = state.playlist || [];
            currentTrackIndex = state.currentTrackIndex !== undefined ? state.currentTrackIndex : -1;

            if (state.volume !== undefined) {
                globalAudio.volume = state.volume;
                document.getElementById('player-volume').value = state.volume;
            }

            if (state.muted !== undefined) {
                globalAudio.muted = state.muted;
                const volumeBtn = document.getElementById('player-volume-btn');
                if (volumeBtn) {
                    volumeBtn.textContent = state.muted ? '🔇' : (globalAudio.volume > 0.5 ? '🔊' : '🔉');
                }
                const volSlider = document.getElementById('player-volume');
                if (volSlider && state.muted) volSlider.value = 0;
            }

            if (playlist.length > 0 && currentTrackIndex >= 0) {
                const track = playlist[currentTrackIndex];
                if (track) {
                    document.getElementById('player-title').textContent = track.title;
                    document.getElementById('player-artist').textContent = track.tags.join(', ') || 'No tags';

                    let thumbUrl = track.thumbnail || '';
                    if (thumbUrl) {
                        if (thumbUrl.match(/^[a-zA-Z]:[\\/]/) || thumbUrl.startsWith('/')) {
                            thumbUrl = '/local/' + thumbUrl.replace(/\\/g, '/');
                        }
                    } else if (track.type === 'audio' && (track.content.match(/^[a-zA-Z]:[\\/]/) || track.content.startsWith('/'))) {
                        thumbUrl = `/thumb/${encodeURIComponent(track.content)}`;
                    }
                    document.getElementById('player-cover').src = thumbUrl || 'https://via.placeholder.com/48?text=🎵';

                    let src = track.content;
                    if (src.match(/^[a-zA-Z]:[\\/]/) || src.startsWith('/') || src.startsWith('\\')) {
                        src = '/local/' + src.replace(/\\/g, '/');
                    }
                    globalAudio.src = encodeURI(src);
                }
            }
            renderPlaylistItems();
        } catch (e) {
            console.error("Error loading player state:", e);
        }
    }
}

function playAllAudio() {
    // Get all currently filtered artifacts that are of type 'audio'
    const audioArtifacts = artifacts.filter(item => item.type === 'audio');
    if (audioArtifacts.length === 0) {
        alert('再生できるオーディオがありません。😅');
        return;
    }
    playlist = [...audioArtifacts];
    currentTrackIndex = 0;
    playTrack(currentTrackIndex);
    playerBar.classList.remove('hidden');
    savePlayerState();
}

function playTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    currentTrackIndex = index;
    const track = playlist[index];

    let src = track.content;
    if (src.match(/^[a-zA-Z]:[\\/]/) || src.startsWith('/') || src.startsWith('\\')) {
        src = '/local/' + src.replace(/\\/g, '/');
    }

    globalAudio.src = encodeURI(src);
    globalAudio.play();

    // Update UI
    document.getElementById('player-title').textContent = track.title;
    document.getElementById('player-artist').textContent = track.tags.join(', ') || 'No tags';

    let thumbUrl = track.thumbnail || '';
    if (thumbUrl) {
        if (thumbUrl.match(/^[a-zA-Z]:[\\/]/) || thumbUrl.startsWith('/')) {
            thumbUrl = '/thumb/' + thumbUrl.replace(/\\/g, '/');
        }
    } else if (track.type === 'audio' && (track.content.match(/^[a-zA-Z]:[\\/]/) || track.content.startsWith('/'))) {
        // Use the dedicated thumbnail route for local audio
        thumbUrl = `/thumb/${encodeURIComponent(track.content)}`;
    }
    document.getElementById('player-cover').src = thumbUrl || 'https://via.placeholder.com/48?text=🎵';

    playerPlayBtn.textContent = '⏸️';
    renderPlaylistItems();
    savePlayerState();
}

function togglePlayPause() {
    if (globalAudio.paused) {
        globalAudio.play();
        playerPlayBtn.textContent = '⏸️';
    } else {
        globalAudio.pause();
        playerPlayBtn.textContent = '▶️';
    }
}

function playNext() {
    if (playlist.length === 0) return;
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    playTrack(currentTrackIndex);
}

function playPrev() {
    if (playlist.length === 0) return;
    currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    playTrack(currentTrackIndex);
}

function seekAudio(value) {
    if (globalAudio.duration) {
        globalAudio.currentTime = (value / 100) * globalAudio.duration;
    }
}

function toggleMute() {
    globalAudio.muted = !globalAudio.muted;
    const volumeBtn = document.getElementById('player-volume-btn');
    const volumeSlider = document.getElementById('player-volume');

    if (globalAudio.muted) {
        volumeBtn.textContent = '🔇';
        volumeSlider.value = 0;
    } else {
        volumeBtn.textContent = globalAudio.volume > 0.5 ? '🔊' : '🔉';
        volumeSlider.value = globalAudio.volume;
    }
    savePlayerState();
}

function setVolume(value) {
    globalAudio.volume = value;
    globalAudio.muted = false;
    const volumeBtn = document.getElementById('player-volume-btn');
    volumeBtn.textContent = value > 0.5 ? '🔊' : (value > 0 ? '🔉' : '🔇');
    savePlayerState();
}

globalAudio.addEventListener('timeupdate', () => {
    if (globalAudio.duration) {
        const progress = (globalAudio.currentTime / globalAudio.duration) * 100;
        progressBar.value = progress;

        document.getElementById('player-current-time').textContent = formatTime(globalAudio.currentTime);
        document.getElementById('player-total-time').textContent = formatTime(globalAudio.duration);
    }
});

globalAudio.addEventListener('ended', () => {
    playNext();
});

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

// --- Playlist Manager Logic ---
function openPlaylistManager() {
    renderPlaylistItems();
    document.getElementById('playlist-modal').classList.remove('hidden');
}

function closePlaylistManager() {
    document.getElementById('playlist-modal').classList.add('hidden');
}

function renderPlaylistItems() {
    const list = document.getElementById('playlist-items');
    list.innerHTML = '';

    playlist.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = `playlist-item ${index === currentTrackIndex ? 'active' : ''}`;

        let thumbUrl = track.thumbnail || '';
        if (thumbUrl) {
            if (thumbUrl.match(/^[a-zA-Z]:[\\/]/) || thumbUrl.startsWith('/')) {
                thumbUrl = '/local/' + thumbUrl.replace(/\\/g, '/');
            }
        } else if (track.type === 'audio' && (track.content.match(/^[a-zA-Z]:[\\/]/) || track.content.startsWith('/'))) {
            thumbUrl = `/thumb/${encodeURIComponent(track.content)}`;
        }

        item.innerHTML = `
            <span class="reorder-handle" draggable="true">≡</span>
            <span class="item-index">${index + 1}</span>
            <img src="${thumbUrl || 'https://via.placeholder.com/38?text=🎵'}" class="item-thumb" onerror="this.src='https://via.placeholder.com/38?text=🎵'">
            <span class="item-title">${track.title}</span>
            <div class="item-actions">
                <button class="play-btn-list" onclick="playTrack(${index})">▶️</button>
                <button class="remove-btn" onclick="removeFromPlaylist(${index})">✕</button>
            </div>
        `;

        // Reordering logic
        const handle = item.querySelector('.reorder-handle');
        handle.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', index);
            item.classList.add('dragging');
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            item.classList.add('drag-over');
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const toIndex = index;
            if (fromIndex !== toIndex) {
                movePlaylistItem(fromIndex, toIndex);
            }
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });

        list.appendChild(item);
    });
}

function movePlaylistItem(from, to) {
    const item = playlist.splice(from, 1)[0];
    playlist.splice(to, 0, item);

    // Update currentTrackIndex if necessary
    if (currentTrackIndex === from) {
        currentTrackIndex = to;
    } else if (currentTrackIndex > from && currentTrackIndex <= to) {
        currentTrackIndex--;
    } else if (currentTrackIndex < from && currentTrackIndex >= to) {
        currentTrackIndex++;
    }

    renderPlaylistItems();
    savePlayerState();
}

function shufflePlaylist() {
    if (playlist.length < 2) return;
    const currentTrack = playlist[currentTrackIndex];

    // Fisher-Yates shuffle
    for (let i = playlist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
    }

    // Find new index of previously playing track
    if (currentTrack) {
        currentTrackIndex = playlist.findIndex(p => p.id === currentTrack.id);
    }
    renderPlaylistItems();
    savePlayerState();
}

function clearPlaylist() {
    if (confirm('プレイリストをクリアしますか？')) {
        playlist = [];
        currentTrackIndex = -1;
        globalAudio.pause();
        globalAudio.src = '';
        playerBar.classList.add('hidden');
        closePlaylistManager();
        savePlayerState();
    }
}

function removeFromPlaylist(index) {
    playlist.splice(index, 1);
    if (index === currentTrackIndex) {
        if (playlist.length > 0) {
            playTrack(index % playlist.length);
        } else {
            clearPlaylist();
        }
    } else if (index < currentTrackIndex) {
        currentTrackIndex--;
    }
    renderPlaylistItems();
    savePlayerState();
}


function playNow(id) {
    const item = artifacts.find(a => a.id === id);
    if (!item) return;

    // Add to playlist if not already there, or just jump to it
    const index = playlist.findIndex(p => p.id === id);
    if (index === -1) {
        playlist.push(item);
        playTrack(playlist.length - 1);
    } else {
        playTrack(index);
    }
    playerBar.classList.remove('hidden');
    savePlayerState();
}

function enqueueTrack(id) {
    const item = artifacts.find(a => a.id === id);
    if (!item) return;

    const index = playlist.findIndex(p => p.id === id);
    if (index === -1) {
        playlist.push(item);
        alert(`「${item.title}」をプレイリストに追加しました！➕`);
    } else {
        alert('この曲はすでにプレイリストに含まれています。✨');
    }
    playerBar.classList.remove('hidden');
    renderPlaylistItems();
    savePlayerState();
}

// --- Functions ---

function render() {
    const searchTerm = searchInput.value.toLowerCase();

    const filtered = artifacts.filter(item => {
        let currentTypeStr = currentFilter;
        if (currentFilter !== 'all') {
            // map nav IDs to actual types
            if (currentFilter === 'images') currentTypeStr = 'image';
            if (currentFilter === 'audio') currentTypeStr = 'audio';
            if (currentFilter === 'document') currentTypeStr = 'document'; // actually 'documents' in ID but we strip 's' via logic later, wait let's be explicit
            if (currentFilter === 'urls') currentTypeStr = 'url';
            if (currentFilter === 'movies') currentTypeStr = 'movie';
            if (currentFilter === 'apps') currentTypeStr = 'app';
        }

        const matchesFilter = currentFilter === 'all' || item.type === currentTypeStr || item.type === currentFilter.slice(0, -1);
        const matchesSearch = item.title.toLowerCase().includes(searchTerm) ||
            item.prompt.toLowerCase().includes(searchTerm) ||
            item.tags.some(t => t.toLowerCase().includes(searchTerm));
        return matchesFilter && matchesSearch;
    });

    // Show/Hide filter specific controls
    const filterControls = document.getElementById('filter-controls');
    if (currentFilter === 'audio') {
        filterControls.classList.remove('hidden');
    } else {
        filterControls.classList.add('hidden');
    }

    gallery.innerHTML = filtered.length ? '' : '<div class="no-results">No artifacts found. Start by creating one! ✨</div>';

    filtered.forEach(item => {
        const card = createCard(item);
        gallery.appendChild(card);
    });
}

function createCard(item) {
    const card = document.createElement('div');
    card.className = 'card';

    let previewHTML = '';
    const typeClass = `${item.type}-type`;

    // Convert absolute windows/linux paths to eel local route for display
    // URL for actual playback/full-size viewing
    let localFileUrl = item.content;
    if (item.type === 'image' || item.type === 'audio' || item.type === 'movie') {
        if (localFileUrl.match(/^[a-zA-Z]:[\\/]/) || localFileUrl.startsWith('/') || localFileUrl.startsWith('\\')) {
            localFileUrl = '/local/' + localFileUrl.replace(/\\/g, '/');
        }
    }

    // URL for high-quality thumbnail preview
    let thumbUrl = item.content;
    if (thumbUrl.match(/^[a-zA-Z]:[\\/]/) || thumbUrl.startsWith('/') || thumbUrl.startsWith('\\')) {
        thumbUrl = '/thumb/' + thumbUrl.replace(/\\/g, '/');
    }

    let customThumbnailHTML = '';
    if (item.thumbnail) {
        let customThumb = item.thumbnail;
        if (customThumb.match(/^[a-zA-Z]:[\\/]/) || customThumb.startsWith('/')) {
            customThumb = '/thumb/' + customThumb.replace(/\\/g, '/');
        }
        customThumbnailHTML = `<img src="${customThumb}" alt="${item.title}" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; z-index: 1;" onerror="this.onerror=null; this.src='https://via.placeholder.com/300x200?text=Image+Not+Found'">`;
    }

    if (item.type === 'image') {
        previewHTML = `<img src="${thumbUrl}" alt="${item.title}" onerror="this.onerror=null; this.src='https://via.placeholder.com/300x200?text=Image+Not+Found'">`;
    } else if (item.type === 'movie') {
        const bgIcon = item.thumbnail ? '' : `<span class="icon movie-icon-bounce" style="font-size:3.5rem; margin-bottom:10px; z-index: 2; position: relative; filter: drop-shadow(0 0 15px rgba(255,255,255,0.3));">🎬</span>`;
        // Use video for preview if no thumbnail is provided - but source must be the video file!
        const videoPreviewHTML = item.thumbnail ? '' : `<video class="video-preview-element" preload="metadata" muted playsinline loop style="width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0; z-index:0;" src="${encodeURI(localFileUrl)}#t=1.0"></video>`;
        previewHTML = `<div class="movie-card-bg" style="width:100%; height:100%; position:absolute; top:0; left:0; background: linear-gradient(135deg, #1a1a1a 0%, #333 100%); z-index:0;"></div>
                       ${videoPreviewHTML}
                       <img src="${thumbUrl}" style="width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0; z-index:1;" class="movie-static-thumb">
                       ${customThumbnailHTML}
                       ${bgIcon}
                       <div class="video-preview-overlay" style="position: absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.3); z-index: 5;">
                           <div class="play-button-outer">
                               <span class="play-icon">▶️</span>
                           </div>
                       </div>`;
    } else if (item.type === 'audio') {
        const bgIcon = item.thumbnail ? '' : `<span class="icon" style="font-size:2rem; margin-bottom:10px; z-index: 2; position: relative;" id="audio-icon-${item.id}">🎵</span>`;
        // Audio card visual
        previewHTML = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; position: relative;">
                         ${customThumbnailHTML}
                         ${bgIcon}
                         <img id="audio-cover-${item.id}" style="display:none; width: 100%; max-height: 120px; object-fit: cover; border-radius: 8px; margin-bottom: 8px; z-index: 2; position: relative;">
                         <div class="audio-play-overlay" style="position: absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; gap: 15px; background:rgba(0,0,0,0.2); z-index: 5; opacity: 0; transition: opacity 0.3s;">
                            <button class="player-btn main-play" onclick="playNow(${item.id})" style="color: white; filter: drop-shadow(0 2px 10px rgba(0,0,0,0.5));" title="Play Now">▶️</button>
                            <button class="player-btn" onclick="enqueueTrack(${item.id})" style="color: white; font-size: 1.5rem; filter: drop-shadow(0 2px 10px rgba(0,0,0,0.5));" title="Add to Playlist">➕</button>
                         </div>
                       </div>`;
    } else if (item.type === 'url') {
        const bgIcon = item.thumbnail ? '' : `<span class="icon" style="font-size:3rem; margin-bottom:10px; z-index: 2; position: relative;">🔗</span>`;
        previewHTML = `${customThumbnailHTML}
                       ${bgIcon}
                       <div style="font-size: 0.8rem; color: ${item.thumbnail ? '#fff' : '#888'}; max-width:80%; word-break:break-all; text-align:center; z-index: 2; position: relative; text-shadow: ${item.thumbnail ? '0 1px 3px rgba(0,0,0,0.8)' : 'none'};">URL Link</div>`;
    } else if (item.type === 'app') {
        const bgIcon = item.thumbnail ? '' : `<span class="icon" style="font-size:3rem; margin-bottom:10px; z-index: 2; position: relative;">⚡</span>`;
        previewHTML = `${customThumbnailHTML}
                       ${bgIcon}
                       <div style="font-size: 0.8rem; color: ${item.thumbnail ? '#fff' : '#888'}; max-width:80%; word-break:break-all; text-align:center; z-index: 2; position: relative; text-shadow: ${item.thumbnail ? '0 1px 3px rgba(0,0,0,0.8)' : 'none'};">${item.content}</div>`;
    } else {
        const bgIcon = item.thumbnail ? '' : `<span class="icon" style="font-size:3rem; margin-bottom:10px; z-index: 2; position: relative;">📄</span>`;
        previewHTML = `${customThumbnailHTML}
                       ${bgIcon}
                       <div style="font-size: 0.8rem; padding: 10px; max-height: 150px; overflow: hidden; color:${item.thumbnail ? '#fff' : '#ccc'}; z-index: 2; position: relative; text-shadow: ${item.thumbnail ? '0 1px 3px rgba(0,0,0,0.8)' : 'none'};">${item.content}</div>`;
    }

    let overlayExtra = '';
    let audioControlsHTML = '';

    if (item.type === 'app' || item.type === 'url' || item.type === 'document') {
        let btnText = item.type === 'app' ? 'Run App 🚀' : 'Open URL 🚀';
        if (item.type === 'document') btnText = 'Open Document 📄';
        overlayExtra = `<button class="primary-btn" onclick="runApp(${item.id})" style="margin-top: auto; padding: 0.6rem; font-size: 0.9rem; position: relative;">${btnText}</button>`;
    }

    if (item.type === 'audio') {
        // The play button is already in previewHTML from the previous block
    }

    card.innerHTML = `
        <div class="card-preview ${typeClass}">
            ${previewHTML}
            <div class="card-type-icon">${item.type.toUpperCase()}</div>
        </div>
        
        ${audioControlsHTML}
        
        <div class="card-actions">
            <button class="action-btn copy-btn" onclick="copyPrompt(${item.id})" title="Copy Prompt">📋</button>
            <button class="action-btn edit-btn" onclick="openEditModal(${item.id})" title="Edit">✏️</button>
            <button class="action-btn delete-btn" onclick="deleteArtifact(${item.id})" title="Delete">🗑️</button>
        </div>

        
        <div class="card-overlay">
            <h3 class="card-title">${item.title}</h3>
            <p class="card-prompt">${item.prompt}</p>
            <div class="card-tags">
                ${item.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
            ${overlayExtra}
        </div>
    `;

    // Fetch cover art asynchronously via HTTP route
    if (item.type === 'audio' && !item.thumbnail && (item.content.match(/^[a-zA-Z]:[\\/]/) || item.content.startsWith('/'))) {
        const coverImg = card.querySelector(`#audio-cover-${item.id}`);
        const icon = card.querySelector(`#audio-icon-${item.id}`);
        if (coverImg && icon) {
            coverImg.src = `/thumb/${encodeURIComponent(item.content)}`;
            coverImg.onload = () => {
                coverImg.style.display = 'block';
                icon.style.display = 'none';
            };
            coverImg.onerror = () => {
                // If no cover is found or error, keep the icon
                coverImg.style.display = 'none';
                icon.style.display = 'block';
            };
        }
    }

    // --- Media Viewer Logic ---
    function openImageViewer(src, type = 'image') {
        const viewer = document.getElementById('image-viewer-modal');
        const img = document.getElementById('viewer-img');
        const video = document.getElementById('viewer-video');

        if (type === 'movie' || src.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/)) {
            img.classList.add('hidden');
            video.classList.remove('hidden');
            video.src = encodeURI(src);
            video.play().catch(e => console.log("Autoplay blocked or load failed:", e));
        } else {
            video.classList.add('hidden');
            video.pause();
            img.classList.remove('hidden');
            img.src = encodeURI(src);
        }
        viewer.classList.remove('hidden');
    }

    window.closeImageViewer = function () {
        const video = document.getElementById('viewer-video');
        video.pause();
        video.src = "";
        document.getElementById('image-viewer-modal').classList.add('hidden');
    }

    const preview = card.querySelector('.card-preview');
    if (item.type === 'movie' && !item.thumbnail) {
        const v = card.querySelector('.video-preview-element');
        if (v) {
            preview.addEventListener('mouseenter', () => v.play().catch(e => { }));
            preview.addEventListener('mouseleave', () => {
                v.pause();
                v.currentTime = 1.0;
            });
        }
    }

    // Add click listener to the card preview for images, movies, and documents
    if (item.type === 'image' || item.type === 'movie' || item.thumbnail || item.type === 'document') {
        const preview = card.querySelector('.card-preview');
        preview.style.cursor = item.type === 'image' || item.type === 'movie' || item.thumbnail ? 'zoom-in' : 'pointer';
        preview.addEventListener('click', (e) => {
            // Don't open if clicking action buttons, run button, or audio controls
            if (e.target.closest('.card-actions') || e.target.closest('.primary-btn') || e.target.closest('audio')) return;

            if (item.type === 'document') {
                runApp(item.id);
            } else {
                // Viewer shows high quality thumb for custom thumbnails, but actual content for others
                let src = localFileUrl;
                if (item.thumbnail) {
                    src = item.thumbnail.match(/^[a-zA-Z]:[\\/]/) || item.thumbnail.startsWith('/') ? '/thumb/' + item.thumbnail.replace(/\\/g, '/') : item.thumbnail;
                }
                openImageViewer(src, item.type);
            }
        });
    }



    return card;
}

// --- In-App File Explorer Logic ---
let currentPath = '';
let selectedFilePath = null;
let explorerTargetId = null;

async function updateExplorerSort() {
    await refreshExplorer();
}

async function openExplorer(targetId) {
    explorerTargetId = targetId;
    selectedFilePath = null;
    document.getElementById('explorer-select-btn').disabled = true;

    // Initial load: Home or current path
    if (!currentPath) {
        currentPath = await eel.get_user_home()();
    }

    await refreshExplorer();
    await loadDrives();

    document.getElementById('explorer-modal').classList.remove('hidden');
}

function closeExplorer() {
    document.getElementById('explorer-modal').classList.add('hidden');
}

async function loadDrives() {
    const drives = await eel.get_system_drives()();
    const driveList = document.getElementById('explorer-drives');
    driveList.innerHTML = drives.map(drive => `
        <button class="nav-item" onclick="navigateTo('${drive.replace(/\\/g, '\\\\')}')">📂 ${drive}</button>
    `).join('');
}

async function refreshExplorer() {
    const data = await eel.get_directory_contents(currentPath)();
    const list = document.getElementById('explorer-list');
    const pathDisplay = document.getElementById('current-path-display');

    if (!data.success) {
        alert("Cannot access folder: " + data.error);
        return;
    }

    currentPath = data.path;
    pathDisplay.textContent = currentPath;

    const sortMode = document.getElementById('explorer-sort-select').value;

    // Sorting logic
    data.items.sort((a, b) => {
        // Always directories first
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;

        let result = 0;
        if (sortMode.startsWith('name')) {
            result = a.name.localeCompare(b.name);
            if (sortMode === 'name_desc') result *= -1;
        } else if (sortMode.startsWith('date')) {
            // Use ctime (created) or mtime (modified). Let's use ctime as requested but mtime is often more useful. 
            // We'll fall back to name if dates are the same.
            result = (a.ctime || 0) - (b.ctime || 0);
            if (sortMode === 'date_desc') result *= -1;
        }

        // Fallback to name for stable view
        return result === 0 ? a.name.localeCompare(b.name) : result;
    });

    list.innerHTML = '';

    data.items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'explorer-item';

        // Format date for display
        let dateStr = '';
        if (item.mtime || item.ctime) {
            const dateObj = new Date((item.mtime || item.ctime) * 1000);
            dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.getHours().toString().padStart(2, '0') + ':' + dateObj.getMinutes().toString().padStart(2, '0');
        }

        let iconContent = '';
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(item.ext);
        const isVideo = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'].includes(item.ext);

        if (item.is_dir) {
            iconContent = '📁';
        } else if (isImage) {
            iconContent = `<img src="/local/${encodeURIComponent(item.path.replace(/\\/g, '/'))}" alt="${item.name}" loading="lazy">`;
        } else if (isVideo) {
            iconContent = `<video class="explorer-video-preview" preload="metadata" src="/local/${encodeURIComponent(item.path.replace(/\\/g, '/'))}#t=0.5" style="width: 100%; height: 100%; object-fit: cover;"></video>`;
        } else if (['.mp3', '.wav', '.flac', '.m4a'].includes(item.ext)) {
            iconContent = '🎵'; // Added icon for audio files
        } else {
            iconContent = getFileIcon(item.ext);
        }

        div.innerHTML = `
            <div class="icon">${iconContent}</div>
            <div class="name">${item.name}</div>
            ${dateStr ? `<div class="item-meta" style="font-size: 0.7rem; color: #888; margin-top: 4px;">${dateStr}</div>` : ''}
        `;

        div.onclick = () => {
            if (item.is_dir) {
                navigateTo(item.path);
            } else {
                selectFile(item.path, div);
            }
        };

        list.appendChild(div);
    });
}

function getFileIcon(ext) {
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return '🖼️';
    if (['.mp3', '.wav', '.ogg'].includes(ext)) return '🎵';
    if (['.bat', '.exe', '.py', '.sh'].includes(ext)) return '⚡';
    return '📄';
}

function navigateTo(path) {
    currentPath = path;
    selectedFilePath = null;
    document.getElementById('explorer-select-btn').disabled = true;
    refreshExplorer();
}

async function navigateParent() {
    const parent = await eel.get_parent_dir(currentPath)();
    if (parent && parent !== currentPath) {
        navigateTo(parent);
    }
}

function navigateHome() {
    eel.get_user_home()().then(path => navigateTo(path));
}

function selectFile(path, element) {
    // Clear previous selection
    document.querySelectorAll('.explorer-item').forEach(el => el.classList.remove('selected'));

    element.classList.add('selected');
    selectedFilePath = path;
    document.getElementById('explorer-select-btn').disabled = false;

    // Handle "Select" button click
    document.getElementById('explorer-select-btn').onclick = () => {
        if (selectedFilePath) {
            confirmSelection(selectedFilePath);
        }
    };
}

function confirmSelection(path) {
    if (explorerTargetId) {
        document.getElementById(explorerTargetId).value = path;

        // If it's the main content, try to infer title and type
        if (explorerTargetId === 'content') {
            const fileName = path.split(/[/\\]/).pop();
            const titleInput = document.getElementById('title');
            if (!titleInput.value) {
                titleInput.value = fileName.split('.')[0];
            }

            // Basic type inference
            const ext = fileName.split('.').pop().toLowerCase();
            const typeSelect = document.getElementById('type');
            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) typeSelect.value = 'image';
            else if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) typeSelect.value = 'audio';
            else if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) typeSelect.value = 'movie';
            else if (['bat', 'exe', 'ps1', 'py'].includes(ext)) typeSelect.value = 'app';
        }
    }
    closeExplorer();
}

// Redirect old browse functions to use the new explorer
async function browseFile() {
    openExplorer('content');
}

async function browseThumbnail() {
    openExplorer('thumbnail');
}
