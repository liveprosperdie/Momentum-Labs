const canvas = document.getElementById("hero-lightpass");
const context = canvas.getContext("2d");

const frameCount = 92;
const currentFrame = index => (
    `./New folder/frames${(index + 1).toString().padStart(5, '0')}.png`
);

const images = [];
const imageObj = {
    frame: 0
};

// Preload all 92 frames in the opening sequence
for (let i = 0; i < frameCount; i++) {
    const img = new Image();
    img.src = currentFrame(i);
    images.push(img);
}

function setCanvasSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    render();
}

images[0].onload = setCanvasSize;

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
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const scrollFraction = maxScroll > 0 ? Math.max(0, Math.min(1, scrollTop / maxScroll)) : 0;

    // Linear scroll progress mapped across all 234 frames
    const frameIndex = Math.min(
        frameCount - 1,
        Math.floor(scrollFraction * frameCount)
    );

    imageObj.frame = frameIndex;
    render();

    // InteractiveTrial mounts and becomes interactive only after Video 2 final frame is reached (scrollFraction >= 1.0)
    const trialContainer = document.getElementById('interactive-trial');
    if (trialContainer) {
        if (scrollFraction >= 0.999 || scrollTop >= maxScroll - 4) {
            trialContainer.classList.add('scroll-complete');
        } else {
            trialContainer.classList.remove('scroll-complete');
            if (globalResetTrial) {
                globalResetTrial();
            }
        }
    }
}
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

    /* ---------------------------------------------------- */
    /* Waitlist Form Submission & Live Counter (Real API)   */
    /* ---------------------------------------------------- */
    const waitlistForm = document.getElementById('waitlist-form');
    const waitlistEmailInput = document.getElementById('waitlist-email-input');
    const waitlistInputWrapper = document.getElementById('waitlist-input-wrapper');
    const waitlistSubmitBtn = document.getElementById('waitlist-submit-btn');
    const waitlistErrorMessage = document.getElementById('waitlist-error-message');
    const waitlistSuccessState = document.getElementById('waitlist-success-state');
    const successPositionDisplay = document.getElementById('success-position-display');
    const successMessageDisplay = document.getElementById('success-message-display');
    const waitlistCountDisplay = document.getElementById('waitlist-count-display');

    // Fetch live waitlist count from /api/waitlist-count
    async function fetchLiveWaitlistCount() {
        try {
            const res = await fetch('/api/waitlist-count');
            if (res.ok) {
                const data = await res.json();
                const total = data.total || 0;
                const displayNum = Math.max(100, total);
                if (waitlistCountDisplay) {
                    waitlistCountDisplay.textContent = `${displayNum}+`;
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

            // Set loading state
            setFormLoading(true);

            try {
                const response = await fetch('/api/waitlist', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email })
                });

                const data = await response.json().catch(() => ({}));

                if (response.ok) {
                    // Success state: Reveal position number and calm message
                    const position = data.position || 1;
                    if (waitlistForm) waitlistForm.style.display = 'none';
                    if (waitlistSuccessState) {
                        waitlistSuccessState.removeAttribute('hidden');
                        if (successPositionDisplay) successPositionDisplay.textContent = `#${position}`;
                        if (successMessageDisplay) successMessageDisplay.textContent = `You're number ${position}. We'll be in touch.`;
                    }
                    fetchLiveWaitlistCount();
                } else if (response.status === 409) {
                    showInlineError("You're already on the waitlist.");
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

    // Card Waitlist CTA Button -> Closes modal and smoothly scrolls to #waitlist input
    if (cardWaitlistBtn) {
        cardWaitlistBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal();
            const targetSection = document.getElementById('waitlist');
            if (targetSection) {
                targetSection.scrollIntoView({ behavior: 'smooth' });
                setTimeout(() => {
                    if (waitlistEmailInput) waitlistEmailInput.focus();
                }, 500);
            } else {
                window.location.hash = '#waitlist';
            }
        });
    }

    // Observe waitlist section to dynamically adjust header and clear background
    const waitlistSection = document.getElementById('waitlist');
    if (waitlistSection && 'IntersectionObserver' in window) {
        const waitlistObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                document.body.classList.toggle('waitlist-in-view', entry.isIntersecting);
            });
        }, { threshold: 0.1 });
        waitlistObserver.observe(waitlistSection);
    }

    // Logo / Home icon click -> Reset trial to idle
    if (logoLink) {
        logoLink.addEventListener('click', () => {
            resetTrial();
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

    // Reset button
    resetBtn.addEventListener('click', resetTrial);
});




