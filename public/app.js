const params = new URLSearchParams(window.location.search);
const id = params.get('id');
const page = document.body.dataset.page;
const firebaseConfig = {
  apiKey: "AIzaSyBKtJVQClxDyNkFS-s9lv3uwsB8TeCt3wQ",
  authDomain: "project-pobox.firebaseapp.com",
  projectId: "project-pobox",
  storageBucket: "project-pobox.firebasestorage.app",
  messagingSenderId: "125617937560",
  appId: "1:125617937560:web:e7991894190fcda88e04ed"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// router
if (page === 'letter') {
    requireAuth(user => loadLetter(id, user));
} else if (page === 'inbox') {
    requireAuth(user => loadInbox(user));
} else if (page === 'compose') {
    requireAuth(user => loadCompose(user));
} else if (page === 'partner') {
    requireAuth(user => loadPartner(user));
}

function requireAuth(onLoggedIn) {
    firebase.auth().onAuthStateChanged(user => {
        if (!user) {
            window.location.href = 'index.html';
        } else {
            onLoggedIn(user);
        }
    });
}

function redirectIfLoggedIn() {
    firebase.auth().onAuthStateChanged(user => {
        if (user) window.location.href = 'inbox.html';
    });
}

async function login() {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;

    try {
        await auth.signInWithEmailAndPassword(email, pass);
        window.location.href = 'inbox.html';
    }
    catch (error) {
        alert('Login Failed: ' + error.message);
    }

}

async function register() {
    const email = document.getElementById('registerEmail').value;
    const pass = document.getElementById('registerPassword').value;
    const user = document.getElementById('registerUser').value;

    if (!email || !pass || !user) return;

    try {
        const credential = await auth.createUserWithEmailAndPassword(email, pass);
        const uid = credential.user.uid;

        await db.collection('users').doc(uid).set({
            email: email,
            displayName: user,
            partnerUID: null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });

        window.location.href = 'inbox.html';
    }
    catch (error) {
        switch (error.code) {
            case 'auth/email-already-in-use':
                alert ('An account with this email already exists.');
                break;
            case 'auth/invalid-email-address':
                alert ('Please enter a valid email address.');
                break;
            default: 
                alert (error.message);
        }
    } 
}

async function loadLogin() {
    document.getElementById('register-section').style.display = 'none';
    document.getElementById('login-section').style.display = 'block';
}

async function loadRegister() {
    document.getElementById('register-section').style.display = 'block';
    document.getElementById('login-section').style.display = 'none';
}

async function getPartnerUID(partnerEmail) {
    const query = await db.collection('users').where('email', '==', partnerEmail).get();
    if (query.empty) return null;
    return query.docs[0].id;
}

async function getCurrentUserData() {
    const uid = auth.currentUser.uid;
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return null;
    return doc.data();   // BUG FIX: was doc.data (missing parentheses)
}

// ── loadInbox ────────────────────────────────────────────
async function loadInbox(user) {
    const list     = document.getElementById('letter-list');
    const empty    = document.getElementById('empty-state');
    const badge    = document.getElementById('unread-count');
    const subtitle = document.getElementById('inbox-subtitle');
    const letterCont = document.getElementById('letter-list');

    const snapshot = await db.collection('letters')
        .where('toUID', '==', user.uid)
        .orderBy('timeStamp', 'desc')
        .get();

    if (snapshot.empty) return;  // keep empty state visible

    empty.style.display = 'none';

    let unreadCount = 0; 
    const letters = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        if (!data.read) unreadCount++;

        // const row = document.createElement('a');
        // row.classList.add('inbox-row');
        // if (!data.read) row.classList.add('unread');
        // row.href = `letter.html?id=${doc.id}`;

        // row.innerHTML = `
        //     <span class="row-icon">${data.read ? '✉' : '📩'}</span>
        //     <div class="row-body">
        //         <span class="row-from">${data.from || 'Anonymous'}</span>
        //         <span class="row-subject">${data.subject || '(no subject)'}</span>
        //         <span class="row-date">${formatDate(data.timeStamp)}</span>
        //     </div>
        // `;

        // list.appendChild(row);
        letters.push({ id: doc.id, data:doc.data() }); 
    });

    letters.forEach((letter, index) => {
        const envelope = createEnvelopeElement(letter, index);
    })

    if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.classList.add('visible');
    }
}

async function loadLetter(id, user) {
    if (!id) {
        window.location.href = 'inbox.html';
        return;
    }

    const loading  = document.getElementById('letter-loading');
    const envScene = document.getElementById('envelope-scene');
    const envelope = document.getElementById('envelope');
    const paper    = document.getElementById('letter-paper');
    const unreadDot = document.getElementById('unread-dot');
    const senderData = document.getElementById('envelope-sender');

    const doc = await db.collection('letters').doc(id).get();

    if (!doc.exists) {
        window.location.href = 'inbox.html';
        return;
    }

    const data = doc.data();

    // get recipient display name
    const recipientDoc = await db.collection('users').doc(data.toUID).get();
    const recipientName = recipientDoc.exists ? recipientDoc.data().displayName : 'you';

    // populate letter fields
    document.getElementById('letter-to').textContent        = recipientName;
    document.getElementById('letter-from').textContent      = data.from || 'Anonymous';
    document.getElementById('letter-date').textContent      = formatDate(data.timeStamp);
    document.getElementById('letter-subject').textContent   = data.subject || '';
    document.getElementById('letter-body').textContent      = data.body || '';
    document.getElementById('letter-signature').textContent = data.from || '';

    // populate envelope face
    document.getElementById('env-sender-name').textContent = data.from || 'Anonymous';
    document.getElementById('env-sender-date').textContent = formatDate(data.timeStamp);

    // hide unread dot if already read
    if (data.read && unreadDot) unreadDot.style.display = 'none';

    // mark as read
    if (!data.read) {
        await db.collection('letters').doc(id).update({ read: true });
    }

    // swap loading → envelope
    loading.style.display  = 'none';
    envScene.style.display = 'flex';

    // wire the open button
    document.getElementById('openEnvelope').addEventListener('click', () => {
        envelope.classList.add('open');
        senderData.style.display = 'none';
        setTimeout(() => {
            envScene.style.display = 'none';
            paper.style.display    = 'block';
        }, 700);
    });
}

async function loadCompose(user) {
    const userData = await getCurrentUserData();

    if (!userData || !userData.partnerUID) {
        document.getElementById('compose-hint').textContent = 'No partner linked yet.';
        document.getElementById('btn-seal').disabled = true;
        return;
    }

    const partnerDoc = await db.collection('users').doc(userData.partnerUID).get();
    const partnerName = partnerDoc.exists ? partnerDoc.data().displayName : 'your person';
    document.getElementById('compose-to-name').textContent = partnerName;
}

async function saveLetter() {
    const from    = document.getElementById('composeFrom').value.trim();
    const subject = document.getElementById('composeSubject').value.trim();
    const body    = document.getElementById('composeBody').value.trim();

    if (!body) {
        document.getElementById('compose-hint').textContent = 'The letter is empty.';
        return;
    }

    const btn   = document.getElementById('btn-seal');
    const label = document.getElementById('seal-label');

    btn.disabled = true;
    btn.classList.add('sending');
    label.textContent = 'Sealing…';

    try {
        const userData = await getCurrentUserData();

        await db.collection('letters').add({
            from:      from || 'Anonymous',
            fromUID:   auth.currentUser.uid,
            toUID:     userData.partnerUID,
            subject:   subject || '(no subject)',
            body:      body,
            read:      false,
            timeStamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        showSentOverlay();

    } catch (error) {
        document.getElementById('compose-hint').textContent = 'Something went wrong. Try again.';
        btn.disabled = false;
        btn.classList.remove('sending');
        label.textContent = 'Seal & Send ✦';
    }
}

function discardLetter() {
    const body = document.getElementById('composeBody').value.trim();
    if (!body || confirm('Discard this letter?')) {
        window.location.href = 'inbox.html';
    }
}

function showSentOverlay() {
    const paper = document.querySelector('.compose-paper');
    const overlay = document.createElement('div');
    overlay.classList.add('sent-overlay');
    overlay.innerHTML = `
        <div class="sent-seal">✦</div>
        <p class="sent-title">Letter sent</p>
        <p class="sent-sub">It will be received soon!</p>
        <button class="sent-back" onclick="window.location.href='inbox.html'">← Back to Inbox</button>
    `;
    paper.appendChild(overlay);
}

async function logout() {
    await auth.signOut();
    window.location.href = 'index.html';
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function createEnvelopeElement(letter, stackIndex) {
    const {id, data} = letter;
    const container = document.getElementById('letter-list');
    const env = document.createElement('div');

    env.classList.add('envelope-stack');
    env.style.setProperty('--stack-index', stackIndex);
    env.dataset.letterID = id;
    
    if (!data.read) env.classList.add('unread');

    env.innerHTML = `
                    <div class="envelope-flap">
                        <div class="envelope-stack-sender" id="envelope-sender">
                        <span class="envelope-stack-sender-name" id="env-sender-name">${data.from || 'Anonymous'}</span>
                        <span class="envelope-stack-sender-date" id="env-sender-date">${formatDate(data.timeStamp)}</span>
                        </div>
                    </div>
                    <div class="envelope-folds">
                        <div class="envelope-left"></div>
                        <div class="envelope-right"></div>
                        <div class="envelope-bottom"></div>
                    </div>
                    <div class="envelope-stack-stamp">✦</div>
                    ${!data.read ? '<div class="envelope-unread-dot" id="unread-dot"></div>' : ''}
                    <button class="envelope-stack-open-btn" id="openEnvelope" aria-label="Open letter">
                    </button>
                </div>
        `;

    env.addEventListener('click', () => {
        window.location.href = `letter.html?id=${id}`;
    })

    container.appendChild(env);
}

async function loadPartner(user) {
    const userData = await getCurrentUserData();
    renderPartnerStatus(userData);
    loadIncomingRequests(user);

    if(userData.partnerUID) {
        document.getElementById('request-section').style.display = 'none';
    }
}

async function renderPartnerStatus(userData) {
    const card = document.getElementById('partner-status');

    if (userData.partnerUID) {
        const partnerDoc = await db.collection('users').doc(userData.partnerUID).get(); // get partner data 
        // const partner = partnerDoc.exists ? partnerDoc.data : null;
        const partner = partnerDoc.data();

        card.innerHTML = `
            <div class="partner-paired">
                <div class="partner-seal">♡</div>
                <div class="partner-info">
                    <span class="partner-name">${partner?.displayName || 'Your Partner'}</span>
                    <span class="partner-email">${partner?.email || ''}</span>
                </div>
            </div>
            <button class="btn-unpair" onclick="unpairPartner()">— unpair</button>
        `;

        document.getElementById('partner-subtitle').textContent = 'currently paired';
    }
    else {
        card.innerHTML = `
          <div class="partner-none">
                <span class="partner-none-title">No partner yet</span>
                <span class="partner-none-sub">Send a request below or wait for one to arrive.</span>
            </div>
        `
    }
}

async function loadIncomingRequests(user) {
    const list = document.getElementById('requests-list');
    const empty = document.getElementById('empty-requests');

    const snapshot = await db.collection('partnerRequests')
    .where('toUID', '==', user.uid)
    .where('status', '==', 'pending')
    .get();

    if (snapshot.empty) return;
    snapshot.forEach(doc => {
        const data = doc.data();
        const card = document.createElement('div');
        card.classList.add('request-card');
        card.innerHTML = `
            <div class="request-info">
                <span class="request-from-name">${data.fromName || 'Someone'}</span>
                <span class="request-from-email">${data.fromEmail || ''}</span>
            </div>
            <div class="request-actions">
                <button class="btn-approve" onclick="approveRequest('${doc.id}', '${data.fromUID}')">
                    Accept
                </button>
                <button class="btn-decline" onclick="declineRequest('${doc.id}')">
                    Decline
                </button>
            </div>
        `;
        list.appendChild(card);
    });
}

async function sendPartnerRequest(btn) {
    const input = document.getElementById('partnerEmailInput');
    const hint = document.getElementById('request-hint');
    const email = input.value.trim();

    hint.className = 'request-hint';
    hint.textContent = '';

    if (!email) {
        hint.textContent = 'Please enter an email address';
        hint.classList.add('error');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
        const userData = await getCurrentUserData();

        const targetQuery = await db.collection('users')
        .where('email', '==', email).get();
       
        if (targetQuery.empty) {
            hint.textContent = 'No partner found.';
            hint.classList.add ('error');
            btn.disabled = false;
            btn.textContent = 'Send';
            return;
        }

        const targetDoc = targetQuery.docs[0];
        const targetUID = targetDoc.id;
        const targetData = targetDoc.data();

        // check if target is user themselves
        if (targetUID == auth.currentUser.uid) {
            hint.textContent = 'Cannot send request to yourself.';
            hint.classList.add('error');
            btn.disabled = false;
            btn.textContent = 'Send';
            return;
        }
        // check if target user already has a partner
        if (targetData.partnerUID) {
            hint.textContent = 'Target user already has a partner.';
            hint.classList.add('error');
            btn.disabled = false;
            btn.textContent = 'Send';
            return;
        }
        // check if request already sent
        const existing = await db.collection('partnerRequests')
        .where('fromUID', '==', auth.currentUser.uid)
        .where('toUID', '==', targetUID)
        .where('status', '==', 'pending')
        .get();

        if (!existing.empty) {
            hint.textContent = 'Already sent a request! Wait for them to accept.';
            hint.classList.add('error');
            btn.disabled = false;
            btn.textContent = 'Send';
            return
        }
        // send request
        await db.collection('partnerRequests').add({
            fromUID: auth.currentUser.uid,
            fromEmail: userData.email,
            fromName: userData.displayName,
            toUID: targetUID,
            toEmail: email,
            status: 'pending',
            timeStamp: firebase.firestore.FieldValue.serverTimestamp()
        })

        hint.textContent = 'Request sent. Waiting for them to accept.';
        hint.classList.add('success');
        input.value = '';

    } catch (error) {
        hint.textContent = 'Something went wrong.';
        alert(error);
        hint.classList.add('error');
    }

    btn.disabled = false;
    btn.textContent = 'Send';
}

async function approveRequest(requestId, fromId) {
    try {
        const currentUID = auth.currentUser.uid;

        await db.collection('users').doc(currentUID).update({
            partnerUID: fromId
        })
        await db.collection('users').doc(fromId).update({
            partnerUID: currentUID
        })

        await db.collection('partnerRequests').doc(requestId).update({
            status: 'accepted'
        })

        const otherRequests = await db.collection('partnerRequests')
        .where('toUID', '==', currentUID)
        .where('status', '==', 'pending')
        .get();
        otherRequests.forEach(doc => {
            if (doc.id != requestId) doc.ref.update({status: 'declined'});
        })
        window.location.reload();
    }
    catch (error) {
        alert('Something went wrong: ' + error.message);
    }
}

async function declineRequest(requestId) {
    await db.collection('partnerRequests').doc(requestId).update({status: 'decline'});
    window.location.reload();
}

async function unpairPartner() {
    if (!confirm('Are you sure you want to unpair your partner?')) return;

    try {
        const userData = await getCurrentUserData();
        const partnerUID = userData.partnerUID;
        const currentUID = auth.currentUser.uid;

        await db.collection('users').doc(currentUID).update({partnerUID: null});
        await db.collection('users').doc(partnerUID).update({partnerUID: null});

        window.location.reload();
    }
    catch (error) {
        alert('Something went wrong: ', alert.message);
    }
}