const canvas = document.getElementById("hero-lightpass");
const context = canvas ? canvas.getContext("2d") : null;

const frameCount = 92;
const currentFrame = index => (
    `./New folder/frames${(index + 1).toString().padStart(5, '0')}.png`
);

const images = [];
const imageObj = {
    frame: 0
};

if (canvas) {
    // Preload all 92 frames in the opening sequence
    for (let i = 0; i < frameCount; i++) {
        const img = new Image();
        img.src = currentFrame(i);
        images.push(img);
    }
}

function setCanvasSize() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    render();
}

if (canvas && images[0]) {
    images[0].onload = setCanvasSize;
}

function render() {
    let img = images[imageObj.frame];
    
    // Smooth fallback search if a frame is missing or loading
    if (!img || !img.complete || img.naturalWidth === 0) {
        for (let offset = 1; offset < frameCount; offset++) {
            const prev = imageObj.frame - offset;
            const next = imageObj.frame + offset;
            if (prev >= 0 && images[prev] && images[prev].complete && images[prev].naturalWidth !== 0) {
                img = images[prev];
                break;
            }
            if (next < frameCount && images[next] && images[next].complete && images[next].naturalWidth !== 0) {
                img = images[next];
                break;
            }
        }
    }

    if (img && img.complete && img.naturalWidth !== 0) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Calculate cover-fit dimensions into full viewport DPR buffer
        const imgW = img.naturalWidth || img.width;
        const imgH = img.naturalHeight || img.height;
        const scale = Math.max(canvas.width / imgW, canvas.height / imgH);
        const dWidth = imgW * scale;
        const dHeight = imgH * scale;
        const dx = (canvas.width - dWidth) / 2;
        const dy = (canvas.height - dHeight) / 2;
        
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(img, dx, dy, dWidth, dHeight);
    }
}

let lastScrollTop = 0;
let ticking = false;

// Reference to resetTrial to allow scroll & logo triggers to call reset
let globalResetTrial = null;

window.addEventListener('scroll', () => {
    lastScrollTop = window.scrollY;
    if (!ticking) {
        window.requestAnimationFrame(() => {
            updateImage(lastScrollTop);
            ticking = false;
        });
        ticking = true;
    }
});

function updateImage(scrollTop) {
    const scrollContainer = document.querySelector('.scroll-container');
    const containerHeight = scrollContainer ? scrollContainer.offsetHeight : window.innerHeight * 5.0;
    
    // Allocate ~72% of the scroll track for the 234 video opening frames
    const animScrollLimit = containerHeight * 0.72;
    const animFraction = Math.max(0, Math.min(1, scrollTop / animScrollLimit));

    // Linear scroll progress mapped across all 234 frames
    const frameIndex = Math.min(
        frameCount - 1,
        Math.floor(animFraction * frameCount)
    );

    imageObj.frame = frameIndex;
    render();

    // InteractiveTrial mounts and becomes interactive once laptop is open
    const trialContainer = document.getElementById('interactive-trial');
    if (trialContainer) {
        if (animFraction >= 0.98) {
            trialContainer.classList.add('scroll-complete');
        } else {
            trialContainer.classList.remove('scroll-complete');
            if (globalResetTrial) {
                globalResetTrial();
            }
        }
    }
}

// Nav DEMO and ABOUT button handlers
document.addEventListener('DOMContentLoaded', () => {
    const demoLinks = document.querySelectorAll('a[href="#demo"], a[href="index.html#demo"]');
    demoLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const scrollContainer = document.querySelector('.scroll-container');
            const target = scrollContainer ? scrollContainer.offsetHeight * 0.78 : window.innerHeight * 3.8;
            window.scrollTo({ top: target, behavior: 'smooth' });
        });
    });

    const aboutLinks = document.querySelectorAll('a[href="#about-masthead"], a[href="index.html#about-masthead"]');
    aboutLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const masthead = document.getElementById('about-masthead');
            if (masthead) {
                e.preventDefault();
                masthead.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // Observe about masthead to hide floating demo controls when footer is in view
    const aboutMasthead = document.getElementById('about-masthead');
    if (aboutMasthead && 'IntersectionObserver' in window) {
        const mastheadObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                document.body.classList.toggle('in-masthead-view', entry.isIntersecting);
            });
        }, { threshold: 0.15 });
        mastheadObserver.observe(aboutMasthead);
    }
});

window.addEventListener('resize', () => {
    setCanvasSize();
});

/* ---------------------------------------------------- */
/* InteractiveTrial Component State Machine             */
/* ---------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('interactive-trial');
    if (!container) return;

    const triggerBtn = document.getElementById('trial-trigger-btn');
    const resetBtn = document.getElementById('trial-reset-btn');
    const yesBtn = document.getElementById('akira-yes-btn');
    const micBtn = document.getElementById('akira-mic-btn');
    const akiraAvatar = document.getElementById('akira-avatar-wrapper');
    const akiraImg = document.getElementById('akira-img');
    const captionText = document.getElementById('akira-caption-text');
    const optionBtns = document.querySelectorAll('.option-btn');

    const modal = document.getElementById('akira-modal');
    const modalClose = document.getElementById('akira-modal-close');
    const modalBackdrop = document.getElementById('akira-modal-backdrop');
    const cardWaitlistBtn = document.querySelector('.akira-waitlist-btn');
    const logoLink = document.querySelector('.logo-link');

    // Preloaded Audio instances for scripted audio demo
    const userAudio = new Audio('user.mp3');
    userAudio.preload = 'auto';

    const akiraAudio = new Audio('Akira.mp3');
    akiraAudio.preload = 'auto';

    const chillMusicAudio = new Audio('chill work music.mp3');
    chillMusicAudio.preload = 'auto';
    chillMusicAudio.loop = true;

    // State definition & order enforcement
    const STATES = {
        IDLE: 'idle',
        PROMPT: 'prompt',
        LISTENING: 'listening',
        RESPONDING: 'responding',
        PLAYING: 'playing'
    };

    const STATE_SEQUENCE = [
        STATES.IDLE,
        STATES.PROMPT,
        STATES.LISTENING,
        STATES.RESPONDING,
        STATES.PLAYING
    ];

    let currentState = STATES.IDLE;
    let isPromptStepB = false; // Tracks Step A ("Wanna hear something?") vs Step B ("Just say it...")
    let audioFallbackTimer = null;
    let startAudioTimer = null;
    let thinkingTimer = null;
    let akiraStartTimer = null;
    let respondingInterval = null;
    let optionsTimer = null;

    function stopAllAudio() {
        if (userAudio) {
            userAudio.pause();
            userAudio.currentTime = 0;
            userAudio.onended = null;
            userAudio.onerror = null;
        }
        if (akiraAudio) {
            akiraAudio.pause();
            akiraAudio.currentTime = 0;
            akiraAudio.onended = null;
            akiraAudio.onerror = null;
        }
        if (chillMusicAudio) {
            chillMusicAudio.pause();
            chillMusicAudio.currentTime = 0;
        }
    }

    function clearAllTimers() {
        stopAllAudio();
        if (audioFallbackTimer) { clearTimeout(audioFallbackTimer); audioFallbackTimer = null; }
        if (startAudioTimer) { clearTimeout(startAudioTimer); startAudioTimer = null; }
        if (thinkingTimer) { clearTimeout(thinkingTimer); thinkingTimer = null; }
        if (akiraStartTimer) { clearTimeout(akiraStartTimer); akiraStartTimer = null; }
        if (respondingInterval) { clearInterval(respondingInterval); respondingInterval = null; }
        if (optionsTimer) { clearTimeout(optionsTimer); optionsTimer = null; }
    }

    function setState(nextState) {
        // Enforce strict sequential order: cannot skip states
        const currentIndex = STATE_SEQUENCE.indexOf(currentState);
        const nextIndex = STATE_SEQUENCE.indexOf(nextState);

        if (nextIndex === -1) return;
        if (nextState !== STATES.IDLE && nextIndex !== currentIndex + 1) {
            console.warn(`Blocked invalid transition from ${currentState} to ${nextState}`);
            return;
        }

        currentState = nextState;
        container.setAttribute('data-state', currentState);
        handleStateEnter(currentState);
    }

    function handleStateEnter(state) {
        switch (state) {
            case STATES.PROMPT:
                // Step A: "Wanna hear something?" + Yes button
                isPromptStepB = false;
                captionText.textContent = "Wanna hear something?";
                if (yesBtn) yesBtn.style.display = 'inline-flex';
                if (micBtn) micBtn.style.display = 'none';
                akiraImg.src = 'idle.png';
                break;

            case STATES.LISTENING:
                if (yesBtn) yesBtn.style.display = 'none';
                if (micBtn) micBtn.style.display = 'inline-flex';

                // Setup user.mp3 ("Akira, play...") ended event to drive transition
                userAudio.currentTime = 0;
                userAudio.onended = () => {
                    userAudio.onended = null;
                    userAudio.onerror = null;
                    // Add a ~700ms thinking beat delay after user finishes speaking before Akira responds
                    thinkingTimer = setTimeout(() => {
                        setState(STATES.RESPONDING);
                    }, 700);
                };

                userAudio.onerror = (err) => {
                    console.warn('user.mp3 playback error or blocked, proceeding with fallback delay', err);
                    audioFallbackTimer = setTimeout(() => {
                        setState(STATES.RESPONDING);
                    }, 1500);
                };

                // Play user voice immediately upon mic click!
                const userPlayPromise = userAudio.play();
                if (userPlayPromise !== undefined) {
                    userPlayPromise.catch(err => {
                        console.warn('user.mp3 play blocked by browser, skipping to responding state', err);
                        audioFallbackTimer = setTimeout(() => {
                            setState(STATES.RESPONDING);
                        }, 1200);
                    });
                }
                break;

            case STATES.RESPONDING:
                captionText.textContent = "Here you go.";
                if (yesBtn) yesBtn.style.display = 'none';
                if (micBtn) micBtn.style.display = 'none';

                // Short pre-speech delay (~400ms) after caption appears before Akira starts speaking
                akiraStartTimer = setTimeout(() => {
                    // Start Akira lip-sync animation (talk_open.png <-> idle.png) while akira.mp3 plays
                    let isTalking = false;
                    respondingInterval = setInterval(() => {
                        isTalking = !isTalking;
                        akiraImg.src = isTalking ? 'talk_open.png' : 'idle.png';
                    }, 175);

                    akiraAudio.currentTime = 0;
                    akiraAudio.onended = () => {
                        akiraAudio.onended = null;
                        akiraAudio.onerror = null;
                        if (respondingInterval) { clearInterval(respondingInterval); respondingInterval = null; }
                        akiraImg.src = 'idle.png'; // Lock back to idle portrait
                        setState(STATES.PLAYING);
                    };

                    akiraAudio.onerror = (err) => {
                        console.warn('Akira.mp3 playback error, proceeding with fallback delay', err);
                        audioFallbackTimer = setTimeout(() => {
                            if (respondingInterval) { clearInterval(respondingInterval); respondingInterval = null; }
                            akiraImg.src = 'idle.png';
                            setState(STATES.PLAYING);
                        }, 1500);
                    };

                    const akiraPlayPromise = akiraAudio.play();
                    if (akiraPlayPromise !== undefined) {
                        akiraPlayPromise.catch(err => {
                            console.warn('Akira.mp3 play blocked by browser, continuing sequence gracefully', err);
                            audioFallbackTimer = setTimeout(() => {
                                if (respondingInterval) { clearInterval(respondingInterval); respondingInterval = null; }
                                akiraImg.src = 'idle.png';
                                setState(STATES.PLAYING);
                            }, 1200);
                        });
                    }
                }, 400);
                break;

            case STATES.PLAYING:
                /* PACING CHOICE: ~800ms delay after akira.mp3 finishes before option buttons and now-playing reveal */
                akiraImg.src = 'idle.png';
                if (chillMusicAudio) {
                    chillMusicAudio.currentTime = 0;
                    chillMusicAudio.loop = true;
                    const playPromise = chillMusicAudio.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(err => {
                            console.warn('chill work music playback error or user interaction required:', err);
                        });
                    }
                }
                optionsTimer = setTimeout(() => {
                    container.classList.add('options-active');
                }, 800);
                break;

            case STATES.IDLE:
                clearAllTimers();
                isPromptStepB = false;
                container.classList.remove('options-active');
                container.classList.remove('step-b-active');
                akiraImg.src = 'idle.png';
                captionText.textContent = "Wanna hear something?";
                if (yesBtn) yesBtn.style.display = 'inline-flex';
                if (micBtn) micBtn.style.display = 'none';
                break;
        }
    }

    function resetTrial() {
        if (currentState === STATES.IDLE) return; // Already idle
        currentState = STATES.IDLE;
        container.setAttribute('data-state', STATES.IDLE);
        clearAllTimers();
        isPromptStepB = false;
        container.classList.remove('options-active');
        container.classList.remove('step-b-active');
        akiraImg.src = 'idle.png';
        captionText.textContent = "Wanna hear something?";
        if (yesBtn) yesBtn.style.display = 'inline-flex';
        if (micBtn) micBtn.style.display = 'none';
        closeModal();
    }

    // Assign to global variable so scroll handler can trigger reset
    globalResetTrial = resetTrial;

    // Trigger button -> prompt (Step A)
    triggerBtn.addEventListener('click', () => {
        if (currentState === STATES.IDLE) {
            setState(STATES.PROMPT);
        }
    });

    // Step A: Yes button click -> Advance to Step B ("Just say it...") & Slide Akira UP inside laptop screen
    if (yesBtn) {
        yesBtn.addEventListener('click', () => {
            if (currentState === STATES.PROMPT && !isPromptStepB) {
                isPromptStepB = true;
                captionText.textContent = "Just say it: Akira, play something.";
                yesBtn.style.display = 'none';
                micBtn.style.display = 'inline-flex';
                container.classList.add('step-b-active'); // Triggers Akira slide up inside laptop screen!
            }
        });
    }

    // Step B: Mic button -> Triggers user voice playback in LISTENING state!
    if (micBtn) {
        micBtn.addEventListener('click', () => {
            if (currentState === STATES.PROMPT && isPromptStepB) {
                setState(STATES.LISTENING);
            }
        });
    }

    // Option buttons click handler - Routes to real external URLs in a new tab
    optionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const optionVal = e.currentTarget.getAttribute('data-option');
            if (optionVal === 'Play Believer on YouTube') {
                window.open('https://www.youtube.com/watch?v=7wtfhZwyrcc&list=RD7wtfhZwyrcc&start_radio=1', '_blank', 'noopener,noreferrer');
            } else if (optionVal === 'Open Amazon') {
                window.open('https://www.amazon.in/', '_blank', 'noopener,noreferrer');
            }
        });
    });

    // Akira Avatar Click -> Open Spec Modal ONLY when in playing state
    function openModal() {
        if (currentState !== STATES.PLAYING) return; // Unclickable until playing state begins
        container.classList.add('modal-open');
        modal.removeAttribute('hidden');
        modal.style.display = 'flex';
        if (modalClose) modalClose.focus();
    }

    function closeModal(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        container.classList.remove('modal-open');
        modal.setAttribute('hidden', '');
        modal.style.display = 'none';
    }

    akiraAvatar.addEventListener('click', openModal);
    akiraAvatar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openModal();
        }
    });

    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hasAttribute('hidden')) {
            closeModal(e);
        }
    });

    // Akira Spec Card Dropdown Details Toggle
    const dropdownToggle = document.getElementById('akira-card-dropdown-toggle');
    const dropdownPanel = document.getElementById('akira-card-dropdown-panel');

    const akiraModalTitle = document.getElementById('akira-modal-title');
    if (akiraModalTitle) {
        akiraModalTitle.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = 'products.html?showcase=true';
        });
    }

    if (dropdownToggle && dropdownPanel) {
        dropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = dropdownToggle.getAttribute('aria-expanded') === 'true';
            if (isExpanded) {
                dropdownToggle.setAttribute('aria-expanded', 'false');
                dropdownPanel.setAttribute('hidden', '');
            } else {
                dropdownToggle.setAttribute('aria-expanded', 'true');
                dropdownPanel.removeAttribute('hidden');
            }
        });
    }

    // Reset button
    if (resetBtn) resetBtn.addEventListener('click', resetTrial);
});

/* ---------------------------------------------------- */
/* Global Modals, Waitlist & Contact Form Handlers       */
/* ---------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    const waitlistForm = document.getElementById('waitlist-form');
    const waitlistEmailInput = document.getElementById('waitlist-email-input');
    const waitlistInputWrapper = document.getElementById('waitlist-input-wrapper');
    const waitlistSubmitBtn = document.getElementById('waitlist-submit-btn');
    const waitlistErrorMessage = document.getElementById('waitlist-error-message');
    const waitlistSuccessState = document.getElementById('waitlist-success-state');
    const successPositionDisplay = document.getElementById('success-position-display');
    const successMessageDisplay = document.getElementById('success-message-display');
    const waitlistCountDisplay = document.getElementById('waitlist-count-display');

    // Intentional public display offset constant (+100) added at display read time
    const DISPLAY_OFFSET = 100;

    // Fetch live waitlist count from /api/waitlist-count
    async function fetchLiveWaitlistCount() {
        try {
            const res = await fetch('/api/waitlist-count');
            if (res.ok) {
                const data = await res.json();
                const total = data.total !== undefined ? data.total : ((data.count || 0) + DISPLAY_OFFSET);
                if (waitlistCountDisplay) {
                    waitlistCountDisplay.textContent = `${total}+`;
                }
            }
        } catch (err) {
            console.warn('Could not fetch live waitlist count:', err);
        }
    }
    fetchLiveWaitlistCount();

    if (waitlistEmailInput) {
        waitlistEmailInput.addEventListener('input', () => {
            if (waitlistErrorMessage) {
                waitlistErrorMessage.setAttribute('hidden', '');
                waitlistErrorMessage.textContent = '';
            }
            if (waitlistInputWrapper) {
                waitlistInputWrapper.classList.remove('has-error');
            }
        });
    }

    if (waitlistForm) {
        waitlistForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = (waitlistEmailInput?.value || '').trim();

            if (!email) {
                showInlineError('Please enter your email address.');
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showInlineError('Please enter a valid email address.');
                return;
            }

            const hpValue = document.getElementById('waitlist-hp')?.value || '';

            // Set loading state
            setFormLoading(true);

            try {
                const response = await fetch('/api/waitlist', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, company_website: hpValue })
                });

                const data = await response.json().catch(() => ({}));

                if (response.ok) {
                    // Success state: Generic calm confirmation message without position number
                    if (waitlistForm) waitlistForm.style.display = 'none';
                    if (waitlistSuccessState) {
                        waitlistSuccessState.removeAttribute('hidden');
                        if (successMessageDisplay) {
                            successMessageDisplay.textContent = "We'll email you directly when your spot opens.";
                        }
                    }
                    fetchLiveWaitlistCount();
                } else if (response.status === 409) {
                    showInlineError("You're already on the waitlist.");
                } else if (response.status === 429) {
                    showInlineError(data.error || 'Too many requests, please try again later.');
                } else {
                    showInlineError(data.error || 'Unable to join waitlist. Please try again.');
                }
            } catch (err) {
                console.error('Waitlist submission network error:', err);
                showInlineError('Network connection issue. Please try again.');
            } finally {
                setFormLoading(false);
            }
        });
    }

    function setFormLoading(isLoading) {
        if (!waitlistSubmitBtn || !waitlistEmailInput) return;
        const btnText = waitlistSubmitBtn.querySelector('.btn-text');
        if (isLoading) {
            waitlistSubmitBtn.setAttribute('disabled', 'true');
            waitlistEmailInput.setAttribute('disabled', 'true');
            if (btnText) btnText.textContent = 'Joining...';
        } else {
            waitlistSubmitBtn.removeAttribute('disabled');
            waitlistEmailInput.removeAttribute('disabled');
            if (btnText) btnText.textContent = 'Join Waitlist';
        }
    }

    function showInlineError(message) {
        if (waitlistErrorMessage) {
            waitlistErrorMessage.textContent = message;
            waitlistErrorMessage.removeAttribute('hidden');
        }
        if (waitlistInputWrapper) {
            waitlistInputWrapper.classList.add('has-error');
        }
        if (waitlistEmailInput) {
            waitlistEmailInput.focus();
        }
    }

    /* ---------------------------------------------------- */
    /* Waitlist Modal Open/Close Controls (On-Click Only)   */
    /* ---------------------------------------------------- */
    const waitlistModal = document.getElementById('waitlist-modal');
    const waitlistModalClose = document.getElementById('waitlist-modal-close');
    const waitlistModalBackdrop = document.getElementById('waitlist-modal-backdrop');
    const headerWaitlistLinks = document.querySelectorAll('.nav-right a[href="#waitlist"], a[href="#waitlist"], a[href="index.html#waitlist"]');

    function openWaitlistModal() {
        if (!waitlistModal) return;
        waitlistModal.removeAttribute('hidden');
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
            if (waitlistEmailInput) waitlistEmailInput.focus();
        }, 120);
    }

    function closeWaitlistModal() {
        if (!waitlistModal) return;
        waitlistModal.setAttribute('hidden', '');
        document.body.style.overflow = '';
    }

    // Header nav WAITLIST links -> Open modal on click
    headerWaitlistLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            openWaitlistModal();
        });
    });

    if (waitlistModalClose) {
        waitlistModalClose.addEventListener('click', (e) => {
            e.preventDefault();
            closeWaitlistModal();
        });
    }

    if (waitlistModalBackdrop) {
        waitlistModalBackdrop.addEventListener('click', closeWaitlistModal);
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && waitlistModal && !waitlistModal.hasAttribute('hidden')) {
            closeWaitlistModal();
        }
    });

    // Card Waitlist CTA Button -> Closes card modal and opens waitlist modal directly
    const cardWaitlistBtn = document.querySelector('.akira-waitlist-btn');
    if (cardWaitlistBtn) {
        cardWaitlistBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const akiraModal = document.getElementById('akira-modal');
            if (akiraModal) {
                akiraModal.setAttribute('hidden', '');
                akiraModal.style.display = 'none';
            }
            openWaitlistModal();
        });
    }

    // Logo / Home icon click -> Reset trial if available
    const logoLink = document.querySelector('.logo-link');
    if (logoLink && typeof globalResetTrial === 'function') {
        logoLink.addEventListener('click', () => {
            globalResetTrial();
        });
    }

    /* ---------------------------------------------------- */
    /* Interactive Like Button & Real-Time Simulation (Base 60) */
    /* ---------------------------------------------------- */
    const savedLikeCount = parseInt(localStorage.getItem('akira_like_count'), 10);
    let likeCount = !isNaN(savedLikeCount) && savedLikeCount >= 60 ? savedLikeCount : 60;
    let userHasLiked = localStorage.getItem('akira_user_liked') === 'true';

    const likeBtn = document.getElementById('akira-like-btn');
    const likeCountDisplay = document.getElementById('like-count-display');
    const cardFrame = document.querySelector('.akira-card-frame');
    const cardHero = document.getElementById('akira-card-hero');

    function triggerInstaHeartPop() {
        if (!cardFrame) return;
        const popHeart = document.createElement('div');
        popHeart.className = 'insta-pop-heart';
        popHeart.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.78-8.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
        `;
        cardFrame.appendChild(popHeart);
        setTimeout(() => {
            popHeart.remove();
        }, 850);
    }

    function updateLikeDisplay() {
        if (likeCountDisplay) {
            likeCountDisplay.textContent = likeCount;
        }
        if (likeBtn) {
            if (userHasLiked) {
                likeBtn.classList.add('liked');
            } else {
                likeBtn.classList.remove('liked');
            }
        }
        localStorage.setItem('akira_like_count', likeCount);
        localStorage.setItem('akira_user_liked', userHasLiked);
    }
    updateLikeDisplay(); // Initialize state from localStorage on load

    if (likeBtn) {
        likeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userHasLiked = !userHasLiked;
            if (userHasLiked) {
                likeCount++;
                triggerInstaHeartPop();
            } else {
                likeCount = Math.max(60, likeCount - 1);
            }
            updateLikeDisplay();
        });
    }

    // Double-click card hero image -> Trigger Instagram Pop Heart & Like!
    if (cardHero) {
        cardHero.addEventListener('dblclick', (e) => {
            e.preventDefault();
            triggerInstaHeartPop();
            if (!userHasLiked) {
                userHasLiked = true;
                likeCount++;
                updateLikeDisplay();
            }
        });
    }

    // Real-Time Simulated Likes (Periodically increments likes every 14-24s to simulate live users)
    setInterval(() => {
        likeCount++;
        updateLikeDisplay();
        if (likeBtn) {
            likeBtn.style.transform = 'scale(1.15)';
            setTimeout(() => {
                likeBtn.style.transform = '';
            }, 300);
        }
    }, Math.floor(Math.random() * 8000) + 14000);

    // Cross-tab / Cross-page storage event sync
    window.addEventListener('storage', (e) => {
        if (e.key === 'akira_like_count' || e.key === 'akira_user_liked') {
            likeCount = parseInt(localStorage.getItem('akira_like_count'), 10) || 60;
            userHasLiked = localStorage.getItem('akira_user_liked') === 'true';
            updateLikeDisplay();
        }
        if (e.key === 'akira_waitlist_count') {
            waitlistApplicationCount = parseInt(localStorage.getItem('akira_waitlist_count'), 10) || 100;
            updateWaitlistCountDisplay();
        }
    });

    /* ---------------------------------------------------- */
    /* Contact Form & Contact Modal Handling                */
    /* ---------------------------------------------------- */
    const contactModal = document.getElementById('contact-modal');
    const contactModalClose = document.getElementById('contact-modal-close');
    const contactModalBackdrop = document.getElementById('contact-modal-backdrop');
    const contactTriggers = document.querySelectorAll('.nav-contact-btn, a[href="#contact-modal"]');

    function openContactModal() {
        if (!contactModal) return;
        contactModal.removeAttribute('hidden');
        document.body.style.overflow = 'hidden';
        const nameInp = document.getElementById('modal-contact-name');
        setTimeout(() => {
            if (nameInp) nameInp.focus();
        }, 120);
    }

    function closeContactModal() {
        if (!contactModal) return;
        contactModal.setAttribute('hidden', '');
        document.body.style.overflow = '';
    }

    contactTriggers.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (contactModal) {
                e.preventDefault();
                openContactModal();
            }
        });
    });

    if (contactModalClose) contactModalClose.addEventListener('click', closeContactModal);
    if (contactModalBackdrop) contactModalBackdrop.addEventListener('click', closeContactModal);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && contactModal && !contactModal.hasAttribute('hidden')) {
            closeContactModal();
        }
    });

    // Helper to wire up any contact form instance (embedded or modal)
    function wireContactForm({ formId, nameId, emailId, messageId, errorId, successId, submitBtnId }) {
        const form = document.getElementById(formId);
        if (!form) return;

        const nameInput = document.getElementById(nameId);
        const emailInput = document.getElementById(emailId);
        const messageInput = document.getElementById(messageId);
        const errorEl = document.getElementById(errorId);
        const successEl = document.getElementById(successId);
        const submitBtn = document.getElementById(submitBtnId);

        function showError(msg) {
            if (errorEl) {
                errorEl.textContent = msg;
                errorEl.classList.add('is-visible');
            }
            if (successEl) {
                successEl.classList.remove('is-visible');
                successEl.textContent = '';
            }
        }

        function showSuccess(msg) {
            if (successEl) {
                successEl.textContent = msg;
                successEl.classList.add('is-visible');
            }
            if (errorEl) {
                errorEl.classList.remove('is-visible');
                errorEl.textContent = '';
            }
        }

        function clearErrors() {
            if (errorEl) {
                errorEl.classList.remove('is-visible');
                errorEl.textContent = '';
            }
        }

        [nameInput, emailInput, messageInput].forEach(input => {
            if (input) input.addEventListener('input', clearErrors);
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearErrors();

            const name = (nameInput?.value || '').trim();
            const email = (emailInput?.value || '').trim();
            const message = (messageInput?.value || '').trim();

            // Client-side validation
            if (!name) {
                showError('Please enter your name.');
                if (nameInput) nameInput.focus();
                return;
            }
            if (name.length > 100) {
                showError('Name must not exceed 100 characters.');
                if (nameInput) nameInput.focus();
                return;
            }

            if (!email) {
                showError('Please enter your email address.');
                if (emailInput) emailInput.focus();
                return;
            }
            if (email.length > 254) {
                showError('Email address must not exceed 254 characters.');
                if (emailInput) emailInput.focus();
                return;
            }
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showError('Please enter a valid email address.');
                if (emailInput) emailInput.focus();
                return;
            }

            if (!message) {
                showError('Please enter your message.');
                if (messageInput) messageInput.focus();
                return;
            }
            if (message.length > 5000) {
                showError('Message must not exceed 5000 characters.');
                if (messageInput) messageInput.focus();
                return;
            }

            // Set loading state
            if (submitBtn) {
                submitBtn.disabled = true;
                const btnText = submitBtn.querySelector('.btn-text');
                if (btnText) btnText.textContent = 'Sending...';
            }
            if (nameInput) nameInput.disabled = true;
            if (emailInput) emailInput.disabled = true;
            if (messageInput) messageInput.disabled = true;

            try {
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, message })
                });

                const data = await response.json().catch(() => ({}));

                if (response.ok) {
                    showSuccess(data.message || "Thank you for reaching out! We've received your note and will get back to you shortly.");
                    form.reset();
                } else {
                    showError(data.error || 'Failed to send your message. Please try again.');
                }
            } catch (err) {
                console.error('Contact submission error:', err);
                showError('Network error. Please check your connection and try again.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    const btnText = submitBtn.querySelector('.btn-text');
                    if (btnText) btnText.innerHTML = 'Send Message &rarr;';
                }
                if (nameInput) nameInput.disabled = false;
                if (emailInput) emailInput.disabled = false;
                if (messageInput) messageInput.disabled = false;
            }
        });
    }

    // Initialize both modal and on-page contact forms
    wireContactForm({
        formId: 'modal-contact-form',
        nameId: 'modal-contact-name',
        emailId: 'modal-contact-email',
        messageId: 'modal-contact-message',
        errorId: 'modal-contact-error',
        successId: 'modal-contact-success',
        submitBtnId: 'modal-contact-submit-btn'
    });

    wireContactForm({
        formId: 'contact-form',
        nameId: 'contact-name',
        emailId: 'contact-email',
        messageId: 'contact-message',
        errorId: 'contact-error',
        successId: 'contact-success',
        submitBtnId: 'contact-submit-btn'
    });
});




